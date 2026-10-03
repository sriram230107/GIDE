import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Text, Integer, Float, BigInteger, DateTime, ForeignKey, CheckConstraint
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

def utcnow():
    return datetime.now(timezone.utc)

class Course(Base):
    __tablename__ = "courses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), nullable=False)
    code = Column(String(50), nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    sources = relationship("Source", back_populates="course", cascade="all, delete-orphan")


class Source(Base):
    __tablename__ = "sources"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    source_type = Column(String(20), nullable=False)  # 'pdf', 'pptx', 'video', 'image'
    file_path = Column(String(1024), nullable=False)
    mime_type = Column(String(100), nullable=False)
    file_size_bytes = Column(BigInteger, nullable=False)
    status = Column(String(30), default="queued", nullable=False, index=True)  # queued, processing, completed, failed
    error_message = Column(Text, nullable=True)
    source_metadata = Column("metadata", JSONB, default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    course = relationship("Course", back_populates="sources")
    processing_jobs = relationship("ProcessingJob", back_populates="source", cascade="all, delete-orphan", order_by="desc(ProcessingJob.created_at)")
    content_units = relationship("ContentUnit", back_populates="source", cascade="all, delete-orphan", order_by="ContentUnit.sequence_index")


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_id = Column(UUID(as_uuid=True), ForeignKey("sources.id", ondelete="CASCADE"), nullable=False, index=True)
    state = Column(String(30), default="queued", nullable=False)  # queued, processing, completed, failed
    stage = Column(String(50), default="upload_validated", nullable=False)
    progress_percent = Column(Integer, default=0, nullable=False)
    error_detail = Column(JSONB, nullable=True)
    attempt_number = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    source = relationship("Source", back_populates="processing_jobs")


class ContentUnit(Base):
    __tablename__ = "content_units"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_id = Column(UUID(as_uuid=True), ForeignKey("sources.id", ondelete="CASCADE"), nullable=False, index=True)
    source_type = Column(String(20), nullable=False)  # 'pdf', 'pptx', 'video', 'image'
    unit_type = Column(String(30), nullable=False)  # 'text', 'caption', 'slide', 'keyframe', 'diagram', 'image', 'heading'
    content = Column(Text, nullable=False)
    vision_caption = Column(Text, nullable=True)
    ocr_text = Column(Text, nullable=True)
    page_number = Column(Integer, nullable=True)
    slide_number = Column(Integer, nullable=True)
    time_start = Column(Float, nullable=True)
    time_end = Column(Float, nullable=True)
    image_path = Column(String(1024), nullable=True)
    bounding_box = Column(JSONB, nullable=True)
    sequence_index = Column(Integer, default=0, nullable=False)
    unit_metadata = Column("metadata", JSONB, default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    source = relationship("Source", back_populates="content_units")

    __table_args__ = (
        CheckConstraint(
            """(source_type = 'pdf' AND page_number IS NOT NULL AND page_number > 0) OR
               (source_type = 'pptx' AND slide_number IS NOT NULL AND slide_number > 0) OR
               (source_type = 'video' AND time_start IS NOT NULL AND time_end IS NOT NULL AND time_end >= time_start) OR
               (source_type = 'image' AND image_path IS NOT NULL AND length(image_path) > 0)""",
            name="ck_content_unit_provenance_by_source_type"
        ),
    )
