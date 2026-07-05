from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import model_catalog
from app.schemas.drawing import DrawingDocument
from app.services import ai_generator

router = APIRouter(tags=["drawings"])


class GenerateDrawingRequest(BaseModel):
    promptText: str
    modelId: str | None = None


@router.post("/drawings/generate", response_model=DrawingDocument)
def generate_drawing(request: GenerateDrawingRequest) -> DrawingDocument:
    if not request.promptText.strip():
        raise HTTPException(status_code=422, detail="promptText가 비어 있습니다.")
    if request.modelId is not None and not model_catalog.is_allowed(request.modelId):
        raise HTTPException(status_code=422, detail="지원하지 않는 모델입니다.")
    return ai_generator.generate_drawing_from_prompt(request.promptText, request.modelId)
