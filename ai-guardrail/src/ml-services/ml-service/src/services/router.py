from dataclasses import dataclass

from src.config import settings
from src.models.schemas import ModelInfo
from src.providers.anthropic_provider import AnthropicProvider
from src.providers.azure_provider import AzureOpenAIProvider
from src.providers.base import LLMProvider
from src.providers.openai_provider import OpenAIProvider


@dataclass
class ModelEntry:
    """Registry entry for a supported model."""

    provider: str
    model_id: str
    max_context: int
    cost_input: float   # USD per 1M tokens
    cost_output: float  # USD per 1M tokens
    supports_vision: bool = False
    supports_streaming: bool = True


# Canonical model registry
MODEL_REGISTRY: dict[str, ModelEntry] = {
    "gpt-4o": ModelEntry(
        provider="openai",
        model_id="gpt-4o",
        max_context=128_000,
        cost_input=2.50,
        cost_output=10.00,
        supports_vision=True,
    ),
    "gpt-4o-mini": ModelEntry(
        provider="openai",
        model_id="gpt-4o-mini",
        max_context=128_000,
        cost_input=0.15,
        cost_output=0.60,
        supports_vision=True,
    ),
    "gpt-4-turbo": ModelEntry(
        provider="openai",
        model_id="gpt-4-turbo",
        max_context=128_000,
        cost_input=10.00,
        cost_output=30.00,
        supports_vision=True,
    ),
    "claude-3-5-sonnet": ModelEntry(
        provider="anthropic",
        model_id="claude-3-5-sonnet-20241022",
        max_context=200_000,
        cost_input=3.00,
        cost_output=15.00,
        supports_vision=True,
    ),
    "claude-3-opus": ModelEntry(
        provider="anthropic",
        model_id="claude-3-opus-20240229",
        max_context=200_000,
        cost_input=15.00,
        cost_output=75.00,
        supports_vision=True,
    ),
    "azure-gpt-4": ModelEntry(
        provider="azure",
        model_id="gpt-4",
        max_context=128_000,
        cost_input=10.00,
        cost_output=30.00,
        supports_vision=False,
    ),
}

# Fallback chain: if primary fails, try fallback
_FALLBACK_MAP: dict[str, str] = {
    "gpt-4o": "claude-3-5-sonnet",
    "gpt-4-turbo": "gpt-4o",
    "claude-3-5-sonnet": "gpt-4o",
    "claude-3-opus": "claude-3-5-sonnet",
    "azure-gpt-4": "gpt-4o",
    "gpt-4o-mini": "gpt-4o",
}


class ModelRouter:
    """Routes model requests to the correct provider."""

    def __init__(self) -> None:
        self._providers: dict[str, LLMProvider] = {}

    def route(self, model_name: str) -> tuple[str, str]:
        """Return (provider_name, actual_model_id) for a given model name."""
        entry = MODEL_REGISTRY.get(model_name)
        if entry is None:
            raise ValueError(f"Unknown model: {model_name}")
        return entry.provider, entry.model_id

    def get_provider(self, provider_name: str) -> LLMProvider:
        """Return a configured provider instance, creating lazily."""
        if provider_name not in self._providers:
            self._providers[provider_name] = self._create_provider(provider_name)
        return self._providers[provider_name]

    def get_fallback(self, model_name: str) -> str | None:
        """Return the fallback model name, or None."""
        return _FALLBACK_MAP.get(model_name)

    def list_models(self) -> list[ModelInfo]:
        """List all available models."""
        return [
            ModelInfo(
                id=name,
                provider=entry.provider,
                max_context=entry.max_context,
                supports_vision=entry.supports_vision,
                supports_streaming=entry.supports_streaming,
            )
            for name, entry in MODEL_REGISTRY.items()
        ]

    @staticmethod
    def _create_provider(provider_name: str) -> LLMProvider:
        if provider_name == "openai":
            return OpenAIProvider(api_key=settings.OPENAI_API_KEY)
        elif provider_name == "anthropic":
            return AnthropicProvider(api_key=settings.ANTHROPIC_API_KEY)
        elif provider_name == "azure":
            return AzureOpenAIProvider(
                api_key=settings.AZURE_OPENAI_API_KEY,
                endpoint=settings.AZURE_OPENAI_ENDPOINT,
            )
        else:
            raise ValueError(f"Unknown provider: {provider_name}")
