"""Tests for conversation summarization."""
import pytest
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)


def test_summarize_basic():
    resp = client.post("/v1/summarize/conversation", json={
        "messages": [
            {"role": "user", "content": "What is KYRA AI Guardrail? I need a security platform for my LLM deployment."},
            {"role": "assistant", "content": "KYRA AI Guardrail is an enterprise LLM security platform. It provides DLP scanning, prompt injection detection, and audit trails. It supports RAG with document indexing and multi-persona chat."},
            {"role": "user", "content": "Great, we decided to go with KYRA. Please set up a demo by Friday."},
            {"role": "assistant", "content": "I will set up a demo environment by Friday. Action item: configure SSO and provision admin accounts before the demo."},
        ],
        "max_sentences": 4,
        "include_decisions": True,
        "include_action_items": True,
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["message_count"] == 4
    assert len(body["summary"]) > 20
    assert body["compression_ratio"] > 0
    assert len(body["key_topics"]) > 0


def test_summarize_decisions_detected():
    resp = client.post("/v1/summarize/conversation", json={
        "messages": [
            {"role": "user", "content": "Should we use PostgreSQL or MySQL?"},
            {"role": "assistant", "content": "We decided to use PostgreSQL for its JSONB support and advanced indexing."},
        ],
    })
    body = resp.json()
    assert len(body["decisions"]) >= 1
    assert any("decided" in d.lower() or "postgresql" in d.lower() for d in body["decisions"])


def test_summarize_action_items_detected():
    resp = client.post("/v1/summarize/conversation", json={
        "messages": [
            {"role": "assistant", "content": "TODO: update the deployment script. Please review the PR by end of day."},
        ],
    })
    body = resp.json()
    assert len(body["action_items"]) >= 1


def test_summarize_empty():
    resp = client.post("/v1/summarize/conversation", json={"messages": []})
    assert resp.status_code == 200
    body = resp.json()
    assert body["message_count"] == 0
    assert body["summary"] == ""
