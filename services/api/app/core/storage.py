import os
import shutil
from pathlib import Path
from uuid import UUID
from app.core.config import settings

def get_storage_path() -> Path:
    p = Path(settings.STORAGE_DIR)
    p.mkdir(parents=True, exist_ok=True)
    (p / "sources").mkdir(parents=True, exist_ok=True)
    (p / "images").mkdir(parents=True, exist_ok=True)
    return p

def save_uploaded_source(source_id: UUID, filename: str, file_obj) -> str:
    storage = get_storage_path()
    ext = Path(filename).suffix
    dest_path = storage / "sources" / f"{source_id}{ext}"
    with open(dest_path, "wb") as f:
        shutil.copyfileobj(file_obj, f)
    return str(dest_path)

def get_source_file_path(relative_or_abs: str) -> Path:
    p = Path(relative_or_abs)
    if p.is_absolute():
        return p
    return get_storage_path() / relative_or_abs
