import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from app.config import settings
from app.schemas.drawing import DrawingDocument
from app.services import dwg_converter, dxf_importer, ifc_importer

router = APIRouter(tags=["drawings"])

SUPPORTED_UPLOAD_EXTENSIONS = {".dxf", ".dwg", ".ifc"}


@router.post("/drawings/upload", response_model=DrawingDocument)
async def upload_drawing_file(
    uploadedFile: UploadFile = File(...),
    storeyIndex: int = Query(0, description="IFC 파일에서 추출할 층 인덱스"),
) -> DrawingDocument:
    file_extension = Path(uploadedFile.filename or "").suffix.lower()
    if file_extension not in SUPPORTED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"지원하지 않는 파일 형식입니다: {file_extension or '(없음)'}. "
                   f"지원 형식: DXF, DWG, IFC",
        )

    uploaded_bytes = await uploadedFile.read()
    if len(uploaded_bytes) > settings.max_upload_size_bytes:
        raise HTTPException(status_code=413, detail="파일이 최대 업로드 크기를 초과했습니다.")

    drawing_name = Path(uploadedFile.filename or "uploaded").stem

    with tempfile.NamedTemporaryFile(delete=False, suffix=file_extension) as temp_file:
        temp_file.write(uploaded_bytes)
        temp_file_path = temp_file.name

    try:
        if file_extension == ".dxf":
            return dxf_importer.convert_dxf_to_drawing_document(temp_file_path, drawing_name)
        if file_extension == ".dwg":
            converter = dwg_converter.get_configured_dwg_converter()
            converted_dxf_path = converter.convert(temp_file_path)
            return dxf_importer.convert_dxf_to_drawing_document(
                converted_dxf_path, drawing_name, source_format="dwg")
        return ifc_importer.extract_floor_plan_drawing(
            temp_file_path, drawing_name, storey_index=storeyIndex)
    finally:
        Path(temp_file_path).unlink(missing_ok=True)
