from typing import AsyncGenerator

from anthropic import AsyncAnthropic

from src.providers.base import LLMProvider, LLMResponse

# Map Anthropic stop reasons to OpenAI-compatible format
_STOP_REASON_MAP: dict[str, str] = {
    "end_turn": "stop",
    "stop_sequence": "stop",
    "max_tokens": "length",
}


def _convert_messages(messages: list[dict]) -> tuple[str | None, list[dict]]:
    """Separate system message from user/assistant messages for Anthropic API."""
    system: str | None = None
    converted: list[dict] = []

    for msg in messages:
        if msg.get("role") == "system":
            system = msg.get("content", "")
        else:
            converted.append({"role": msg["role"], "content": msg.get("content", "")})

    return system, converted


class AnthropicProvider(LLMProvider):
    """Anthropic Claude API provider."""

    def __init__(self, api_key: str) -> None:
        self.client = AsyncAnthropic(api_key=api_key)

    async def complete(
        self,
        messages: list[dict],
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        top_p: float = 1.0,
        stop: list[str] | None = None,
    ) -> LLMResponse:
        system, converted = _convert_messages(messages)

        kwargs: dict = {
            "model": model,
            "messages": converted,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "top_p": top_p,
        }
        if system:
            kwargs["system"] = system
        if stop:
            kwargs["stop_sequences"] = stop

        response = await self.client.messages.create(**kwargs)

        content = ""
        for block in response.content:
            if block.type == "text":
                content += block.text

        return LLMResponse(
            content=content,
            model=response.model,
            prompt_tokens=response.usage.input_tokens,
            completion_tokens=response.usage.output_tokens,
            finish_reason=_STOP_REASON_MAP.get(response.stop_reason or "", "stop"),
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
        system, converted = _convert_messages(messages)

        kwargs: dict = {
            "model": model,
            "messages": converted,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "top_p": top_p,
        }
        if system:
            kwargs["system"] = system
        if stop:
            kwargs["stop_sequences"] = stop

        async with self.client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield {
                    "type": "content",
                    "content": text,
                }

            final_message = await stream.get_final_message()
            yield {
                "type": "done",
                "finish_reason": _STOP_REASON_MAP.get(
                    final_message.stop_reason or "", "stop"
                ),
                "tokens": {
                    "prompt": final_message.usage.input_tokens,
                    "completion": final_message.usage.output_tokens,
                },
            }
