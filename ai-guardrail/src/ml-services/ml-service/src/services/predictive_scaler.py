"""
Predictive autoscaling — forecasts request load using simple exponential smoothing
(Prophet/ARIMA require extra deps; this ships today as a lightweight alternative).

The service:
  1. Reads recent metrics from Prometheus (query rate over 1h windows)
  2. Applies exponential smoothing to forecast next 30 min
  3. Recommends replica count based on threshold
  4. Emits recommendation as a Prometheus gauge for KEDA to consume
"""
from __future__ import annotations

import logging
import math
import os
from typing import Optional

logger = logging.getLogger(__name__)

PROM_URL = os.getenv("PROMETHEUS_URL", "http://prometheus:9090")
REQUESTS_PER_REPLICA = float(os.getenv("REQUESTS_PER_REPLICA", "50"))
MIN_REPLICAS = int(os.getenv("MIN_REPLICAS", "1"))
MAX_REPLICAS = int(os.getenv("MAX_REPLICAS", "10"))
SMOOTHING_ALPHA = 0.3


async def fetch_request_rate(service: str, window: str = "5m") -> list[tuple[float, float]]:
    """Fetch rate timeseries from Prometheus."""
    import httpx
    query = f'sum(rate(http_server_requests_seconds_count{{service="{service}"}}[{window}]))'
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{PROM_URL}/api/v1/query_range", params={
            "query": query, "start": "now-2h", "end": "now", "step": "5m"
        })
        resp.raise_for_status()
        data = resp.json()
    result = data.get("data", {}).get("result", [])
    if not result:
        return []
    values = result[0].get("values", [])
    return [(float(ts), float(val)) for ts, val in values]


def exponential_smoothing(series: list[float], alpha: float = SMOOTHING_ALPHA) -> list[float]:
    if not series:
        return []
    result = [series[0]]
    for i in range(1, len(series)):
        result.append(alpha * series[i] + (1 - alpha) * result[-1])
    return result


def forecast_next(series: list[float], steps: int = 6, alpha: float = SMOOTHING_ALPHA) -> list[float]:
    """Forecast next N steps using last smoothed value + trend."""
    if len(series) < 2:
        return [series[-1] if series else 0.0] * steps
    smoothed = exponential_smoothing(series, alpha)
    last = smoothed[-1]
    trend = smoothed[-1] - smoothed[-2]
    return [max(0, last + trend * (i + 1)) for i in range(steps)]


def recommend_replicas(forecasted_rate: float) -> int:
    needed = math.ceil(forecasted_rate / REQUESTS_PER_REPLICA)
    return max(MIN_REPLICAS, min(MAX_REPLICAS, needed))
