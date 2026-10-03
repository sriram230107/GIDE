import uuid
from pathlib import Path
from app.ingestion.pdf_parser import extract_pdf_pages

def test_extract_pdf_pages_real_fixture():
    fixture_path = "d:/gide/services/api/tests/fixtures/sample_textbook.pdf"
    assert Path(fixture_path).exists(), "Fixture file must exist"

    source_id = uuid.uuid4()
    units = extract_pdf_pages(fixture_path, source_id)

    # Must extract units
    assert len(units) >= 4, f"Expected at least 4 units, got {len(units)}"

    # Check provenance invariants on every single extracted unit
    for u in units:
        assert u["source_id"] == source_id
        assert u["source_type"] == "pdf"
        assert u["page_number"] in [1, 2, 3]
        assert u["page_number"] > 0
        assert u["sequence_index"] is not None
        assert u["unit_metadata"] is not None

    # Check headings extracted
    headings = [u for u in units if u["unit_type"] == "heading"]
    assert len(headings) >= 1, "Must detect headings"
    assert any("CHAPTER 1" in h["content"] for h in headings)

    # Check vector diagram fallback extraction (Condition 7)
    diagrams = [u for u in units if u["unit_type"] == "diagram"]
    assert len(diagrams) >= 1, "Must extract rendered vector diagram on page 3"
    diag = diagrams[0]
    assert diag["page_number"] == 3
    assert diag["image_path"] is not None
    assert Path("d:/gide/storage/" + diag["image_path"]).exists() or Path("d:/gide/storage").joinpath(diag["image_path"]).exists()
