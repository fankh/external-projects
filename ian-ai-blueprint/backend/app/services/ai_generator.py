"""AI prompt -> DrawingDocument generation via the Anthropic API.

Without an API key the module returns a canned stub floor plan so the
end-to-end flow works keyless.
"""

import json

from fastapi import HTTPException

from app.config import settings
from app.schemas.drawing import DrawingDocument, compute_bounds_from_entities

GENERATION_SYSTEM_PROMPT = """\
You are a CAD drafting assistant. Given a description of a drawing, produce a
2D blueprint as JSON matching the provided schema exactly.

Rules:
- Units are millimeters. Keep all geometry within a sensible bounds box
  (e.g. a small house plan fits in roughly 15000 x 12000 mm).
- Use meaningful layer names such as WALLS, DOORS, WINDOWS, FIXTURES,
  ANNOTATIONS, and give each entity a unique entityId (e1, e2, ...).
- Walls are polylines or lines, door swings are arcs, room labels are text
  entities with textHeight around 250.
- sourceFormat must be "ai-generated".
Respond with ONLY the JSON object, no explanations or code fences.
"""


def _build_stub_floor_plan(prompt_text: str) -> DrawingDocument:
    """Small canned house plan used when no API key is configured."""
    stub_drawing = DrawingDocument.model_validate({
        "drawingName": "ai-stub-floorplan",
        "sourceFormat": "ai-generated",
        "units": "millimeters",
        "bounds": {"minX": 0, "minY": 0, "maxX": 12000, "maxY": 9000},
        "layers": [
            {"layerName": "WALLS", "colorHex": "#e8e8e8", "isVisible": True},
            {"layerName": "DOORS", "colorHex": "#4a90d9", "isVisible": True},
            {"layerName": "FIXTURES", "colorHex": "#f5a623", "isVisible": True},
            {"layerName": "ANNOTATIONS", "colorHex": "#7ed6c4", "isVisible": True},
        ],
        "entities": [
            {"entityId": "e1", "entityType": "polyline", "layerName": "WALLS",
             "vertexPoints": [{"x": 0, "y": 0}, {"x": 12000, "y": 0},
                              {"x": 12000, "y": 9000}, {"x": 0, "y": 9000}],
             "isClosed": True},
            {"entityId": "e2", "entityType": "line", "layerName": "WALLS",
             "startPoint": {"x": 7000, "y": 0}, "endPoint": {"x": 7000, "y": 5500}},
            {"entityId": "e3", "entityType": "line", "layerName": "WALLS",
             "startPoint": {"x": 7000, "y": 7000}, "endPoint": {"x": 7000, "y": 9000}},
            {"entityId": "e4", "entityType": "arc", "layerName": "DOORS",
             "centerPoint": {"x": 7000, "y": 7000}, "radius": 1500,
             "startAngleDegrees": 180, "endAngleDegrees": 270},
            {"entityId": "e5", "entityType": "circle", "layerName": "FIXTURES",
             "centerPoint": {"x": 10500, "y": 7500}, "radius": 600},
            {"entityId": "e6", "entityType": "text", "layerName": "ANNOTATIONS",
             "insertionPoint": {"x": 3000, "y": 4500}, "textContent": "거실",
             "textHeight": 300},
            {"entityId": "e7", "entityType": "text", "layerName": "ANNOTATIONS",
             "insertionPoint": {"x": 9000, "y": 3000}, "textContent": "침실",
             "textHeight": 300},
            {"entityId": "e8", "entityType": "text", "layerName": "ANNOTATIONS",
             "insertionPoint": {"x": 1000, "y": 8400},
             "textContent": f"요청: {prompt_text[:40]}", "textHeight": 250},
        ],
    })
    return stub_drawing


def generate_drawing_from_prompt(
    prompt_text: str, model_id: str | None = None
) -> DrawingDocument:
    if not settings.anthropic_api_key:
        return _build_stub_floor_plan(prompt_text)

    import anthropic

    resolved_model_id = model_id or settings.anthropic_model_id
    anthropic_client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    schema_json = json.dumps(DrawingDocument.model_json_schema(), ensure_ascii=False)

    api_response = anthropic_client.messages.create(
        model=resolved_model_id,
        max_tokens=8192,
        system=GENERATION_SYSTEM_PROMPT + "\n\nJSON schema:\n" + schema_json,
        messages=[{"role": "user", "content": prompt_text}],
    )

    response_text = "".join(
        content_block.text for content_block in api_response.content
        if content_block.type == "text"
    ).strip()
    if response_text.startswith("```"):
        response_text = response_text.strip("`")
        response_text = response_text[response_text.index("{"):]
        response_text = response_text[:response_text.rindex("}") + 1]

    try:
        generated_drawing = DrawingDocument.model_validate_json(response_text)
    except Exception as validation_error:
        raise HTTPException(
            status_code=502,
            detail=f"AI 응답을 도면 형식으로 해석하지 못했습니다: {validation_error}",
        )

    generated_drawing.bounds = compute_bounds_from_entities(generated_drawing.entities)
    return generated_drawing
