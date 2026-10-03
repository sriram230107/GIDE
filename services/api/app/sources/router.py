import uuid
from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from arq import create_pool
from arq.connections import RedisSettings

from app.core.config import settings
from app.core.database import get_db
from app.core.storage import save_uploaded_source
from app.database.models import Course, Source, ProcessingJob, ContentUnit

router = APIRouter(prefix="/api", tags=["sources"])

# Schemas
class CourseCreate(BaseModel):
    title: str
    code: Optional[str] = None
    description: Optional[str] = None

class CourseResponse(BaseModel):
    id: UUID
    title: str
    code: Optional[str] = None
    description: Optional[str] = None

    class Config:
        from_attributes = True

class ProcessingJobResponse(BaseModel):
    id: UUID
    state: str
    stage: str
    progress_percent: int
    attempt_number: int
    error_detail: Optional[dict] = None

    class Config:
        from_attributes = True

class SourceResponse(BaseModel):
    id: UUID
    course_id: UUID
    title: str
    source_type: str
    file_path: str
    file_size_bytes: int
    status: str
    error_message: Optional[str] = None
    source_metadata: dict
    processing_jobs: List[ProcessingJobResponse] = []

    class Config:
        from_attributes = True

class ContentUnitResponse(BaseModel):
    id: UUID
    source_id: UUID
    source_type: str
    unit_type: str
    content: str
    vision_caption: Optional[str] = None
    ocr_text: Optional[str] = None
    page_number: Optional[int] = None
    slide_number: Optional[int] = None
    time_start: Optional[float] = None
    time_end: Optional[float] = None
    image_path: Optional[str] = None
    bounding_box: Optional[dict] = None
    sequence_index: int
    unit_metadata: dict

    class Config:
        from_attributes = True


# Courses
@router.post("/courses", response_model=CourseResponse)
async def create_course(payload: CourseCreate, db: AsyncSession = Depends(get_db)):
    course = Course(title=payload.title, code=payload.code, description=payload.description)
    db.add(course)
    await db.commit()
    await db.refresh(course)
    return course

@router.get("/courses", response_model=List[CourseResponse])
async def list_courses(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Course).order_by(Course.created_at.desc()))
    return res.scalars().all()


# Sources
@router.post("/sources/upload", response_model=SourceResponse)
async def upload_source(
    file: UploadFile = File(...),
    course_id: Optional[UUID] = Form(None),
    title: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db)
):
    filename = file.filename or "uploaded_document.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Step 0 only supports PDF documents (.pdf)"
        )

    # Resolve or create default Course
    if not course_id:
        res = await db.execute(select(Course).limit(1))
        course = res.scalar_one_or_none()
        if not course:
            course = Course(title="Default Course", code="DEF101", description="Default learning space")
            db.add(course)
            await db.commit()
            await db.refresh(course)
        course_id = course.id
    else:
        course = await db.get(Course, course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")

    source_id = uuid.uuid4()
    saved_path = save_uploaded_source(source_id, filename, file.file)
    file_size = file.size or 0

    source = Source(
        id=source_id,
        course_id=course_id,
        title=title or filename,
        source_type="pdf",
        file_path=saved_path,
        mime_type="application/pdf",
        file_size_bytes=file_size,
        status="queued",
        source_metadata={"original_filename": filename}
    )
    db.add(source)

    job = ProcessingJob(
        source_id=source_id,
        state="queued",
        stage="upload_validated",
        progress_percent=0
    )
    db.add(job)
    await db.commit()
    await db.refresh(source)

    # Enqueue job in Arq
    try:
        redis_pool = await create_pool(RedisSettings(host=settings.REDIS_HOST, port=settings.REDIS_PORT))
        await redis_pool.enqueue_job("process_pdf_source", str(source_id))
        await redis_pool.close()
    except Exception as e:
        print(f"[Upload] Warning: Could not enqueue to Redis: {e}")

    # Re-fetch with processing_jobs relationship
    res = await db.execute(
        select(Source)
        .options(selectinload(Source.processing_jobs))
        .where(Source.id == source_id)
    )
    return res.scalar_one()


@router.get("/sources", response_model=List[SourceResponse])
async def list_sources(course_id: Optional[UUID] = None, db: AsyncSession = Depends(get_db)):
    query = select(Source).options(selectinload(Source.processing_jobs)).order_by(Source.created_at.desc())
    if course_id:
        query = query.where(Source.course_id == course_id)
    res = await db.execute(query)
    return res.scalars().all()


@router.get("/sources/{source_id}", response_model=SourceResponse)
async def get_source(source_id: UUID, db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(Source)
        .options(selectinload(Source.processing_jobs))
        .where(Source.id == source_id)
    )
    source = res.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    return source


@router.get("/sources/{source_id}/units", response_model=List[ContentUnitResponse])
async def get_source_content_units(source_id: UUID, db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(ContentUnit)
        .where(ContentUnit.source_id == source_id)
        .order_by(ContentUnit.sequence_index.asc())
    )
    return res.scalars().all()
