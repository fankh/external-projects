import io
import re

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.schemas.drawing import DrawingDocument
from app.services import dxf_exporter

router = APIRouter(tags=["drawings"])


@router.post("/drawings/export/dxf")
def export_drawing_as_dxf(drawing_document: DrawingDocument) -> StreamingResponse:
    dxf_bytes = dxf_exporter.convert_drawing_document_to_dxf_bytes(drawing_document)
    safe_file_name = re.sub(r"[^\w\-.]", "_", drawing_document.drawingName) or "drawing"
    return StreamingResponse(
        io.BytesIO(dxf_bytes),
        media_type="application/dxf",
        headers={"Content-Disposition": f'attachment; filename="{safe_file_name}.dxf"'},
    )
