"""Agent planning API endpoints."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.services.planning_engine import PlanningEngine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/agents", tags=["agents"])

# -- singleton service instance (created on first use) ---------------------

_planning_engine: PlanningEngine | None = None


def _get_planning_engine() -> PlanningEngine:
    global _planning_engine
    if _planning_engine is None:
        _planning_engine = PlanningEngine()
    return _planning_engine


# -- Request / Response schemas -------------------------------------------


class PlanRequest(BaseModel):
    """Request body for generating an execution plan."""

    task: str = Field(..., description="Natural-language task description")
    available_tools: list[str] = Field(
        ..., description="List of tool names the agent may use"
    )
    constraints: dict[str, Any] = Field(
        default_factory=dict,
        description="Constraints: max_steps, timeout_seconds, requires_approval",
    )


class PlanStepResponse(BaseModel):
    step_number: int
    tool_name: str
    description: str
    input_template: dict[str, Any] = Field(default_factory=dict)
    depends_on: list[int] = Field(default_factory=list)


class RiskAssessmentResponse(BaseModel):
    overall_risk: str = "medium"
    factors: list[str] = Field(default_factory=list)
    requires_human_review: bool = False


class PlanResponse(BaseModel):
    """Response body containing the generated execution plan."""

    steps: list[PlanStepResponse]
    estimated_duration: int
    risk_assessment: RiskAssessmentResponse


# -- Endpoints ------------------------------------------------------------


@router.post("/plan", response_model=PlanResponse)
async def generate_plan(body: PlanRequest) -> PlanResponse:
    """Generate a step-by-step execution plan for a task."""
    try:
        engine = _get_planning_engine()
        plan = await engine.plan(
            task=body.task,
            available_tools=body.available_tools,
            constraints=body.constraints,
        )
        plan_dict = plan.to_dict()
        return PlanResponse(
            steps=[PlanStepResponse(**s) for s in plan_dict["steps"]],
            estimated_duration=plan_dict["estimated_duration"],
            risk_assessment=RiskAssessmentResponse(**plan_dict["risk_assessment"]),
        )
    except ValueError as exc:
        logger.warning("Plan generation validation error: %s", exc)
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.exception("Plan generation failed")
        raise HTTPException(status_code=500, detail=f"Planning error: {exc}")
