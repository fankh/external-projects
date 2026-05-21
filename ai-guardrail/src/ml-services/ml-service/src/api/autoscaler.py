"""Predictive autoscaling API."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field
from prometheus_client import Gauge

from src.services.predictive_scaler import (
    fetch_request_rate, exponential_smoothing, forecast_next, recommend_replicas
)

router = APIRouter(prefix="/v1/autoscale", tags=["autoscaling"])

_recommended_replicas = Gauge("kyra_autoscale_recommended_replicas", "Predicted replica count", labelnames=("service",))


class ForecastRequest(BaseModel):
    service: str = Field("rag-service", description="Service to forecast")
    forecast_steps: int = Field(6, description="Number of 5-min steps to forecast")


class ForecastResponse(BaseModel):
    service: str
    current_rate: float
    forecasted_rates: list[float]
    recommended_replicas: int
    series_length: int


@router.post("/forecast", response_model=ForecastResponse)
async def forecast(req: ForecastRequest) -> ForecastResponse:
    try:
        series = await fetch_request_rate(req.service)
    except Exception:
        series = []

    rates = [v for _, v in series]
    forecasted = forecast_next(rates, req.forecast_steps) if rates else [0.0] * req.forecast_steps
    peak = max(forecasted) if forecasted else 0.0
    replicas = recommend_replicas(peak)

    _recommended_replicas.labels(service=req.service).set(replicas)

    return ForecastResponse(
        service=req.service,
        current_rate=rates[-1] if rates else 0.0,
        forecasted_rates=[round(f, 2) for f in forecasted],
        recommended_replicas=replicas,
        series_length=len(rates),
    )
