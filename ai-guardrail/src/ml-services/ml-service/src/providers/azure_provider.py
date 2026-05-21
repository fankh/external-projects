from typing import AsyncGenerator

from openai import AsyncAzureOpenAI

from src.providers.base import LLMProvider, LLMResponse


class AzureOpenAIProvider(LLMProvider):
    """Azure OpenAI API provider."""

    def __init__(self, api_key: str, endpoint: str, api_version: str = "2024-02-01") -> None:
        self.client = AsyncAzureOpenAI(
            api_key=api_key,
            azure_endpoint=endpoint,
            api_version=api_version,
        )

    async def complete(
        self,
        messages: list[dict],
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        top_p: float = 1.0,
        stop: list[str] | None = None,
    ) -> LLMResponse:
        response = await self.client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            top_p=top_p,
            stop=stop,
        )
        choice = response.choices[0]
        usage = response.usage

        return LLMResponse(
            content=choice.message.content or "",
            model=response.model or model,
            prompt_tokens=usage.prompt_tokens if usage else 0,
            completion_tokens=usage.completion_tokens if usage else 0,
            finish_reason=choice.finish_reason or "stop",
        )

    async def stream(
        self,
        messages: list[dict],
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        top_p: float = 1.0,
        stop: list[str] | None = None,
    ) -> AsyncGenerator[dict, None]:
        response = await self.client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            top_p=top_p,
            stop=stop,
            stream=True,
            stream_options={"include_usage": True},
        )

        async for chunk in response:
            if chunk.choices:
                delta = chunk.choices[0].delta
                if delta.content:
                    yield {
                        "type": "content",
                        "content": delta.content,
                    }
                if chunk.choices[0].finish_reason:
                    finish_reason = chunk.choices[0].finish_reason
                    tokens: dict | None = None
                    if chunk.usage:
                        tokens = {
                            "prompt": chunk.usage.prompt_tokens,
                            "completion": chunk.usage.completion_tokens,
                        }
                    yield {
                        "type": "done",
                        "finish_reason": finish_reason,
                        "tokens": tokens,
                    }
            elif chunk.usage:
                yield {
                    "type": "done",
                    "finish_reason": "stop",
                    "tokens": {
                        "prompt": chunk.usage.prompt_tokens,
                        "completion": chunk.usage.completion_tokens,
                    },
                }
