"""Agent Planning Engine -- uses LLM to create step-by-step execution plans."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any

from openai import AsyncOpenAI

from src.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class PlanStep:
    """A single step in an execution plan."""

    step_number: int
    tool_name: str
    description: str
    input_template: dict[str, Any] = field(default_factory=dict)
    depends_on: list[int] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "step_number": self.step_number,
            "tool_name": self.tool_name,
            "description": self.description,
            "input_template": self.input_template,
            "depends_on": self.depends_on,
        }


@dataclass
class ExecutionPlan:
    """Complete execution plan produced by the planning engine."""

    steps: list[PlanStep]
    estimated_duration: int  # seconds
    risk_assessment: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "steps": [s.to_dict() for s in self.steps],
            "estimated_duration": self.estimated_duration,
            "risk_assessment": self.risk_assessment,
        }


# ---------------------------------------------------------------------------
# Planning Engine
# ---------------------------------------------------------------------------


PLANNING_SYSTEM_PROMPT = """\
You are an AI agent planner for the KYRA AI Guardrail platform. Your job is to \
decompose a user task into a sequence of concrete tool-invocation steps.

You will receive:
- A task description
- A list of available tools (with names)
- Constraints (max_steps, timeout_seconds, requires_approval)

Produce a JSON object with exactly these keys:
{
  "steps": [
    {
      "step_number": 1,
      "tool_name": "<one of the available tools>",
      "description": "<what this step accomplishes>",
      "input_template": { "<key>": "<value or placeholder>" },
      "depends_on": []
    }
  ],
  "estimated_duration": <total estimated seconds>,
  "risk_assessment": {
    "overall_risk": "low" | "medium" | "high",
    "factors": ["<risk factor descriptions>"],
    "requires_human_review": <true|false>
  }
}

Rules:
- Use ONLY tools from the available_tools list.
- Respect max_steps constraint.
- Order steps logically; use depends_on to indicate data dependencies.
- Be conservative with risk: if a tool modifies data or sends notifications, mark risk higher.
- Return ONLY valid JSON, no markdown fences or extra text.
"""


class PlanningEngine:
    """Uses an LLM to decompose a task into a step-by-step execution plan."""

    def __init__(self, model: str | None = None) -> None:
        self._model = model or settings.DEFAULT_MODEL
        self._client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    async def plan(
        self,
        task: str,
        available_tools: list[str],
        constraints: dict[str, Any] | None = None,
    ) -> ExecutionPlan:
        """Generate an execution plan for the given task.

        Args:
            task: Natural-language description of what the agent should do.
            available_tools: Tool names the agent is allowed to use.
            constraints: Dict with keys like max_steps, timeout_seconds, requires_approval.

        Returns:
            An ``ExecutionPlan`` ready for execution.
        """
        constraints = constraints or {}
        max_steps = constraints.get("max_steps", 10)

        user_message = json.dumps(
            {
                "task": task,
                "available_tools": available_tools,
                "constraints": {
                    "max_steps": max_steps,
                    "timeout_seconds": constraints.get("timeout_seconds", 300),
                    "requires_approval": constraints.get("requires_approval", False),
                },
            },
            indent=2,
        )

        logger.info(
            "Planning task (model=%s, tools=%d, max_steps=%d): %s",
            self._model,
            len(available_tools),
            max_steps,
            task[:120],
        )

        try:
            response = await self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": PLANNING_SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                temperature=0.2,
                max_tokens=2048,
                response_format={"type": "json_object"},
            )

            raw = response.choices[0].message.content or "{}"
            plan_data = json.loads(raw)

        except json.JSONDecodeError as exc:
            logger.error("LLM returned invalid JSON: %s", exc)
            raise ValueError(f"Planning LLM returned unparseable JSON: {exc}") from exc
        except Exception as exc:
            logger.error("LLM call failed during planning: %s", exc)
            raise RuntimeError(f"Planning LLM call failed: {exc}") from exc

        # Parse steps
        raw_steps = plan_data.get("steps", [])
        if not raw_steps:
            raise ValueError("LLM returned a plan with no steps")

        # Enforce max_steps
        raw_steps = raw_steps[:max_steps]

        steps: list[PlanStep] = []
        for s in raw_steps:
            tool_name = s.get("tool_name", "")
            if tool_name not in available_tools:
                logger.warning(
                    "Plan step references unavailable tool '%s'; skipping", tool_name
                )
                continue
            steps.append(
                PlanStep(
                    step_number=s.get("step_number", len(steps) + 1),
                    tool_name=tool_name,
                    description=s.get("description", ""),
                    input_template=s.get("input_template", {}),
                    depends_on=s.get("depends_on", []),
                )
            )

        if not steps:
            raise ValueError(
                "No valid steps produced -- all referenced tools were unavailable"
            )

        # Re-number steps sequentially
        for idx, step in enumerate(steps, start=1):
            step.step_number = idx

        estimated_duration = plan_data.get("estimated_duration", len(steps) * 30)
        risk_assessment = plan_data.get(
            "risk_assessment",
            {
                "overall_risk": "medium",
                "factors": ["auto-generated plan without explicit risk analysis"],
                "requires_human_review": False,
            },
        )

        plan = ExecutionPlan(
            steps=steps,
            estimated_duration=estimated_duration,
            risk_assessment=risk_assessment,
        )

        logger.info(
            "Plan generated: %d steps, est %ds, risk=%s",
            len(steps),
            estimated_duration,
            risk_assessment.get("overall_risk", "unknown"),
        )

        return plan
