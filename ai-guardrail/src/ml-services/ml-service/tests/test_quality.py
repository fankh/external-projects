"""Tests for the quality scoring + citation verification heuristics.

Run from repo root:
    cd ml-services/ml-service && pytest -v

Or in the running container:
    docker exec kyra-ml-service sh -c 'cd /app && pip install pytest && pytest -v tests/'
"""
import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.api.quality import QualityRequest, Citation, score_response, verify_citations, VerifyRequest


client = TestClient(app)


# ---------- score_response ----------

@pytest.mark.asyncio
async def test_score_response_short():
    req = QualityRequest(query="hello", response="hi", citations=[])
    out = await score_response(req)
    assert out.dimensions["completeness"].score < 0.5
    assert any("short" in w.lower() for w in out.warnings)


@pytest.mark.asyncio
async def test_score_response_no_citations_warning():
    req = QualityRequest(query="explain X", response="X is something with structure and detail.", citations=[])
    out = await score_response(req)
    assert any("citations" in w.lower() for w in out.warnings)


@pytest.mark.asyncio
async def test_score_response_safety_pattern():
    req = QualityRequest(query="q", response="The password is hunter2 in production", citations=[])
    out = await score_response(req)
    assert out.dimensions["safety"].score < 1.0
    assert any("safety" in w.lower() for w in out.warnings)


# ---------- verify_citations ----------

@pytest.mark.asyncio
async def test_verify_citations_supported():
    req = VerifyRequest(
        response="KYRA AI Guardrail provides DLP scanning. It blocks injection attacks reliably.",
        citations=[Citation(content="KYRA AI Guardrail provides DLP scanning. It blocks injection attacks.")],
    )
    out = await verify_citations(req)
    assert out.overall_supported_ratio >= 0.5
    assert out.unsupported_count == 0


@pytest.mark.asyncio
async def test_verify_citations_unsupported():
    req = VerifyRequest(
        response="The Eiffel Tower is in Tokyo. The sky is purple at noon.",
        citations=[Citation(content="KYRA provides security features for AI applications.")],
    )
    out = await verify_citations(req)
    assert out.overall_supported_ratio < 0.5
    assert out.unsupported_count >= 1


# ---------- HTTP smoke ----------

def test_score_endpoint_smoke():
    resp = client.post("/v1/quality/score", json={
        "query": "what is KYRA",
        "response": "KYRA is an enterprise LLM security platform with RAG and DLP.",
        "citations": [{"content": "KYRA is an enterprise LLM security platform."}]
    })
    assert resp.status_code == 200
    body = resp.json()
    assert 0 <= body["overall"] <= 1
    assert "relevance" in body["dimensions"]


def test_verify_endpoint_smoke():
    resp = client.post("/v1/quality/verify-citations", json={
        "response": "KYRA provides DLP. Random unsupported claim here in this response.",
        "citations": [{"content": "KYRA provides DLP scanning"}]
    })
    assert resp.status_code == 200
    body = resp.json()
    assert "claims" in body
