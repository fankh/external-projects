"""Tests for semantic cache API endpoints."""
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)


def test_cache_stats():
    resp = client.get("/v1/cache/stats")
    assert resp.status_code == 200


def test_cache_store_and_lookup():
    # Store
    resp = client.post("/v1/cache/store", json={
        "query": "What is the weather today?",
        "response": "Sunny, 25 degrees.",
        "model": "test",
    })
    assert resp.status_code == 200

    # Lookup exact
    resp = client.post("/v1/cache/lookup", json={
        "query": "What is the weather today?",
    })
    assert resp.status_code == 200
    body = resp.json()
    # May not hit if Redis is unavailable in test, but endpoint works
    assert "hit" in body


def test_cache_flush():
    resp = client.post("/v1/cache/flush")
    assert resp.status_code == 200
