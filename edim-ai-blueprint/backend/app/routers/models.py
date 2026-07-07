from fastapi import APIRouter

from app import model_catalog
from app.config import settings

router = APIRouter(tags=["models"])


@router.get("/models")
def list_models() -> dict:
    """Return the selectable models and the configured default."""
    configured_default = settings.anthropic_model_id
    default_model_id = (
        configured_default
        if model_catalog.is_allowed(configured_default)
        else model_catalog.DEFAULT_MODEL_ID
    )
    return {
        "models": model_catalog.AVAILABLE_MODELS,
        "defaultModelId": default_model_id,
        "aiEnabled": bool(settings.anthropic_api_key),
    }
