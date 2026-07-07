"""AI prompt -> DrawingDocument generation via the Anthropic API.

Without an API key the module returns a canned product-outline sample so the
end-to-end flow works keyless (the sample ignores the prompt text and is
clearly labelled 샘플).
"""

import json

from fastapi import HTTPException

from app.config import settings
from app.schemas.drawing import DrawingDocument, compute_bounds_from_entities

GENERATION_SYSTEM_PROMPT = """\
You are a product/industrial design drafting assistant. Given a description of a
product (e.g. a phone, button, gadget, enclosure, connector), produce a 2D
outline drawing as JSON matching the provided schema exactly.

Rules:
- Units are millimeters. Keep geometry to real product scale and within a
  sensible bounds box (e.g. a smartphone fits roughly 75 x 150 mm; a button a
  few mm across).
- Use meaningful layer names such as OUTLINE, CUTOUT, COMPONENT, SILKSCREEN,
  DIMENSION, ANNOTATION. Give each entity a unique entityId (e1, e2, ...).
- Body / enclosure outlines are polylines or lines; rounded corners and fillets
  are arcs; holes, buttons and camera lenses are circles; ports and slots are
  small rectangles (closed polylines); labels are text entities with a small
  textHeight (about 3-6).
- sourceFormat must be "ai-generated".
Respond with ONLY the JSON object, no explanations or code fences.
"""


def _build_stub_product_drawing(prompt_text: str) -> DrawingDocument:
    """Canned smartphone front-outline sample used when no API key is set.

    The geometry is fixed (it does not reflect the prompt); the prompt is only
    echoed into a 샘플 label so the output is clearly a placeholder.
    """
    entities = [
        # ---- Body outline: rounded rectangle (72 x 148 mm, corner r=10) ----
        {"entityId": "e1", "entityType": "line", "layerName": "OUTLINE",
         "startPoint": {"x": 10, "y": 0}, "endPoint": {"x": 62, "y": 0}},
        {"entityId": "e2", "entityType": "line", "layerName": "OUTLINE",
         "startPoint": {"x": 72, "y": 10}, "endPoint": {"x": 72, "y": 138}},
        {"entityId": "e3", "entityType": "line", "layerName": "OUTLINE",
         "startPoint": {"x": 62, "y": 148}, "endPoint": {"x": 10, "y": 148}},
        {"entityId": "e4", "entityType": "line", "layerName": "OUTLINE",
         "startPoint": {"x": 0, "y": 138}, "endPoint": {"x": 0, "y": 10}},
        {"entityId": "e5", "entityType": "arc", "layerName": "OUTLINE",
         "centerPoint": {"x": 10, "y": 10}, "radius": 10,
         "startAngleDegrees": 180, "endAngleDegrees": 270},
        {"entityId": "e6", "entityType": "arc", "layerName": "OUTLINE",
         "centerPoint": {"x": 62, "y": 10}, "radius": 10,
         "startAngleDegrees": 270, "endAngleDegrees": 360},
        {"entityId": "e7", "entityType": "arc", "layerName": "OUTLINE",
         "centerPoint": {"x": 62, "y": 138}, "radius": 10,
         "startAngleDegrees": 0, "endAngleDegrees": 90},
        {"entityId": "e8", "entityType": "arc", "layerName": "OUTLINE",
         "centerPoint": {"x": 10, "y": 138}, "radius": 10,
         "startAngleDegrees": 90, "endAngleDegrees": 180},
        # ---- Screen (inner rectangle) ----
        {"entityId": "e9", "entityType": "polyline", "layerName": "OUTLINE",
         "vertexPoints": [{"x": 5, "y": 14}, {"x": 67, "y": 14},
                          {"x": 67, "y": 134}, {"x": 5, "y": 134}],
         "isClosed": True},
        # ---- Earpiece slot + front camera ----
        {"entityId": "e10", "entityType": "line", "layerName": "CUTOUT",
         "startPoint": {"x": 31, "y": 141}, "endPoint": {"x": 41, "y": 141}},
        {"entityId": "e11", "entityType": "circle", "layerName": "COMPONENT",
         "centerPoint": {"x": 50, "y": 141}, "radius": 1.6},
        # ---- Side buttons (power + volume) ----
        {"entityId": "e12", "entityType": "polyline", "layerName": "CUTOUT",
         "vertexPoints": [{"x": 72, "y": 100}, {"x": 74, "y": 100},
                          {"x": 74, "y": 122}, {"x": 72, "y": 122}],
         "isClosed": True},
        {"entityId": "e13", "entityType": "polyline", "layerName": "CUTOUT",
         "vertexPoints": [{"x": -2, "y": 106}, {"x": 0, "y": 106},
                          {"x": 0, "y": 140}, {"x": -2, "y": 140}],
         "isClosed": True},
        # ---- USB-C port (bottom slot) ----
        {"entityId": "e14", "entityType": "polyline", "layerName": "CUTOUT",
         "vertexPoints": [{"x": 30, "y": -2}, {"x": 42, "y": -2},
                          {"x": 42, "y": 0}, {"x": 30, "y": 0}],
         "isClosed": True},
        # ---- Labels ----
        {"entityId": "e15", "entityType": "text", "layerName": "ANNOTATION",
         "insertionPoint": {"x": 20, "y": 74}, "textContent": "SCREEN",
         "textHeight": 5},
        {"entityId": "e16", "entityType": "text", "layerName": "ANNOTATION",
         "insertionPoint": {"x": -2, "y": 154},
         "textContent": f"샘플 · 요청: {prompt_text[:40]}", "textHeight": 4},
    ]
    return DrawingDocument.model_validate({
        "drawingName": "ai-sample-phone",
        "sourceFormat": "ai-generated",
        "units": "millimeters",
        "bounds": {"minX": -2, "minY": -2, "maxX": 74, "maxY": 160},
        "layers": [
            {"layerName": "OUTLINE", "colorHex": "#e6edf3", "isVisible": True},
            {"layerName": "CUTOUT", "colorHex": "#f59e0b", "isVisible": True},
            {"layerName": "COMPONENT", "colorHex": "#38bdf8", "isVisible": True},
            {"layerName": "ANNOTATION", "colorHex": "#7ed6c4", "isVisible": True},
        ],
        "entities": entities,
    })


def generate_drawing_from_prompt(
    prompt_text: str, model_id: str | None = None
) -> DrawingDocument:
    if not settings.anthropic_api_key:
        return _build_stub_product_drawing(prompt_text)

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
