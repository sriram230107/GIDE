import traceback
import uuid
from uuid import UUID
from arq.connections import RedisSettings
from sqlalchemy import select, update
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.database.models import Source, ProcessingJob, ContentUnit
from app.ingestion.pdf_parser import extract_pdf_pages

async def process_pdf_source(ctx, source_id_str: str):
    source_id = UUID(source_id_str)
    
    async with AsyncSessionLocal() as session:
        # 1. Fetch Source
        result = await session.execute(select(Source).where(Source.id == source_id))
        source = result.scalar_one_or_none()
        if not source:
            print(f"[Worker] Source {source_id} not found!")
            return

        # 2. Update ProcessingJob to processing / extracting_pages
        await session.execute(
            update(ProcessingJob)
            .where(ProcessingJob.source_id == source_id)
            .values(state="processing", stage="extracting_pages", progress_percent=25)
        )
        source.status = "processing"
        await session.commit()

        try:
            # 3. Extract content units from PDF
            units_data = extract_pdf_pages(source.file_path, source.id)

            # 4. Insert ContentUnits into Database
            await session.execute(
                update(ProcessingJob)
                .where(ProcessingJob.source_id == source_id)
                .values(stage="storing_units", progress_percent=75)
            )
            await session.commit()

            content_units = [ContentUnit(**u) for u in units_data]
            session.add_all(content_units)

            # 5. Mark Completed
            page_numbers = {u["page_number"] for u in units_data if u.get("page_number")}
            source.status = "completed"
            source.source_metadata = {
                **source.source_metadata,
                "page_count": len(page_numbers),
                "unit_count": len(content_units)
            }
            await session.execute(
                update(ProcessingJob)
                .where(ProcessingJob.source_id == source_id)
                .values(state="completed", stage="done", progress_percent=100)
            )
            await session.commit()
            print(f"[Worker] Successfully ingested {len(content_units)} ContentUnits for source {source.title} ({source.id})")

        except Exception as e:
            tb = traceback.format_exc()
            print(f"[Worker] Ingestion failed for source {source_id}: {e}\n{tb}")
            await session.rollback()

            source.status = "failed"
            source.error_message = str(e)
            await session.execute(
                update(ProcessingJob)
                .where(ProcessingJob.source_id == source_id)
                .values(state="failed", stage="failed", error_detail={"error": str(e), "traceback": tb})
            )
            await session.commit()


class WorkerSettings:
    functions = [process_pdf_source]
    redis_settings = RedisSettings(host=settings.REDIS_HOST, port=settings.REDIS_PORT)
