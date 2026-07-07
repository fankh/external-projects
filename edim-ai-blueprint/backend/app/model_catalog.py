"""Catalog of Claude models selectable for AI drawing generation.

The frontend fetches this list to populate the model picker; the generate
endpoint validates the requested model against it before calling the API.
"""

# Default when the client does not request a specific model.
DEFAULT_MODEL_ID = "claude-opus-4-8"

# Selectable models, ordered most-capable first.
AVAILABLE_MODELS = [
    {
        "id": "claude-opus-4-8",
        "label": "Claude Opus 4.8",
        "description": "가장 강력한 모델 (기본값)",
    },
    {
        "id": "claude-opus-4-7",
        "label": "Claude Opus 4.7",
        "description": "고성능 · 장기 작업에 강함",
    },
    {
        "id": "claude-sonnet-4-6",
        "label": "Claude Sonnet 4.6",
        "description": "속도와 지능의 균형",
    },
    {
        "id": "claude-haiku-4-5",
        "label": "Claude Haiku 4.5",
        "description": "가장 빠르고 경제적",
    },
]

ALLOWED_MODEL_IDS = frozenset(model["id"] for model in AVAILABLE_MODELS)


def is_allowed(model_id: str) -> bool:
    return model_id in ALLOWED_MODEL_IDS
