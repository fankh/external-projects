from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.schemas.drawing import DrawingDocument
from app.services import ai_generator

router = APIRouter(tags=["drawings"])


class GenerateDrawingRequest(BaseModel):
    promptText: str


@router.post("/drawings/generate", response_model=DrawingDocument)
def generate_drawing(request: GenerateDrawingRequest) -> DrawingDocument:
    if not request.promptText.strip():
        raise HTTPException(status_code=422, detail="promptText가 비어 있습니다.")
    return ai_generator.generate_drawing_from_prompt(request.promptText)
