import pymupdf
from pathlib import Path
from uuid import UUID
from typing import List, Dict, Any
from app.core.storage import get_storage_path

def extract_pdf_pages(file_path: str, source_id: UUID) -> List[Dict[str, Any]]:
    """
    Extracts structured content units from a PDF document.
    Every single unit is mapped to a 1-indexed page_number, bounding box, and sequence index.
    """
    doc = pymupdf.open(file_path)
    storage = get_storage_path()
    images_dir = storage / "images" / str(source_id)
    images_dir.mkdir(parents=True, exist_ok=True)

    content_units: List[Dict[str, Any]] = []
    global_seq = 0

    for page_idx in range(len(doc)):
        page_num = page_idx + 1  # 1-indexed page
        page = doc[page_idx]
        pw = page.rect.width or 1.0
        ph = page.rect.height or 1.0

        # 1. Structured text extraction
        blocks = page.get_text("blocks")  # (x0, y0, x1, y1, text, block_no, block_type)
        page_has_text = False

        for b in blocks:
            x0, y0, x1, y1, text, block_no, b_type = b[:7]
            clean_text = text.strip()
            if not clean_text:
                continue

            page_has_text = True
            norm_bbox = {
                "x0": round(x0 / pw, 4),
                "y0": round(y0 / ph, 4),
                "x1": round(x1 / pw, 4),
                "y1": round(y1 / ph, 4),
            }

            # Heuristic for headings
            is_heading = len(clean_text) < 120 and (clean_text.isupper() or "\n" not in clean_text and clean_text.endswith(("", ":", ".")))
            unit_type = "heading" if is_heading else "text"

            content_units.append({
                "source_id": source_id,
                "source_type": "pdf",
                "unit_type": unit_type,
                "content": clean_text,
                "page_number": page_num,
                "slide_number": None,
                "time_start": None,
                "time_end": None,
                "image_path": None,
                "bounding_box": norm_bbox,
                "sequence_index": global_seq,
                "unit_metadata": {
                    "block_no": block_no,
                    "char_count": len(clean_text),
                    "page": page_num
                }
            })
            global_seq += 1

        # 2. Vector / drawing diagram check or embedded image check
        images = page.get_images(full=True)
        drawings = page.get_drawings()

        # If page has diagrams or figures
        if images:
            for img_idx, img_info in enumerate(images):
                xref = img_info[0]
                base_img = doc.extract_image(xref)
                if not base_img:
                    continue
                
                # Filter out tiny icon artifacts
                if base_img["width"] < 80 or base_img["height"] < 80:
                    continue

                img_bytes = base_img["image"]
                img_ext = base_img["ext"]
                img_rel = f"images/{source_id}/page_{page_num}_img_{img_idx}.{img_ext}"
                img_abs = storage / img_rel
                
                with open(img_abs, "wb") as f:
                    f.write(img_bytes)

                content_units.append({
                    "source_id": source_id,
                    "source_type": "pdf",
                    "unit_type": "diagram",
                    "content": f"[Figure on Page {page_num}: Dimensions {base_img['width']}x{base_img['height']}]",
                    "page_number": page_num,
                    "slide_number": None,
                    "time_start": None,
                    "time_end": None,
                    "image_path": img_rel,
                    "bounding_box": None,
                    "sequence_index": global_seq,
                    "unit_metadata": {
                        "format": img_ext,
                        "width": base_img["width"],
                        "height": base_img["height"],
                        "is_diagram": True
                    }
                })
                global_seq += 1

        # Fallback for pages with vector drawings but no raster images (Condition 7)
        elif drawings:
            pix = page.get_pixmap(dpi=150)
            img_rel = f"images/{source_id}/page_{page_num}_vector_render.png"
            img_abs = storage / img_rel
            pix.save(str(img_abs))

            content_units.append({
                "source_id": source_id,
                "source_type": "pdf",
                "unit_type": "diagram",
                "content": f"[Rendered Vector Diagram on Page {page_num}]",
                "page_number": page_num,
                "slide_number": None,
                "time_start": None,
                "time_end": None,
                "image_path": img_rel,
                "bounding_box": {"x0": 0.0, "y0": 0.0, "x1": 1.0, "y1": 1.0},
                "sequence_index": global_seq,
                "unit_metadata": {
                    "is_vector_diagram_render": True,
                    "drawing_paths_count": len(drawings)
                }
            })
            global_seq += 1

    doc.close()
    return content_units
