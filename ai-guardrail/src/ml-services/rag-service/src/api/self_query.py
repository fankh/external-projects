"""
Self-query: extract structured metadata filters from natural language queries.

Parses patterns like:
  - "documents from 2024" → {"year": "2024"}
  - "PDF files about security" → {"type": "pdf", "topic": "security"}
  - "by John Smith in the legal department" → {"author": "John Smith", "department": "legal"}
  - "confidential reports" → {"classification": "confidential"}

Returns extracted filters + the cleaned query (filter phrases removed).
"""
from __future__ import annotations

import re
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/v1/rag", tags=["self-query"])


class SelfQueryRequest(BaseModel):
    query: str
    available_metadata_keys: list[str] = Field(
        default_factory=lambda: ["year", "type", "author", "department", "classification", "source", "language"],
        description="Metadata keys the index supports"
    )


class ExtractedFilter(BaseModel):
    key: str
    value: str
    original_phrase: str


class SelfQueryResponse(BaseModel):
    original_query: str
    cleaned_query: str
    filters: list[ExtractedFilter]


# Extraction patterns: (metadata_key, regex, group_index_for_value)
_EXTRACTORS: list[tuple[str, str, int]] = [
    ("year", r"(?:from|in|since|after|before|year)\s+(\d{4})", 1),
    ("type", r"(pdf|docx?|xlsx?|csv|pptx?|markdown|md|txt|json|xml)(?:\s+files?)?", 1),
    ("author", r"(?:by|author[: ]+)\s*([A-Z][a-z]+ [A-Z][a-z]+)", 1),
    ("department", r"(?:in the |in |from the |from )?(\w+)\s+department", 1),
    ("classification", r"(public|internal|confidential|restricted|secret|top.?secret)", 1),
    ("source", r"(?:from|source[: ]+)\s*(confluence|sharepoint|s3|gdrive|google drive|slack|teams|smb|nfs|sftp)", 1),
    ("language", r"(?:in\s+)?(english|korean|japanese|chinese|spanish|french|german)", 1),
]


@router.post("/self-query", response_model=SelfQueryResponse)
async def self_query(req: SelfQueryRequest) -> SelfQueryResponse:
    query = req.query
    filters: list[ExtractedFilter] = []
    available = set(req.available_metadata_keys)

    for key, pattern, group in _EXTRACTORS:
        if key not in available:
            continue
        m = re.search(pattern, query, re.IGNORECASE)
        if m:
            value = m.group(group).strip()
            filters.append(ExtractedFilter(key=key, value=value.lower(), original_phrase=m.group(0)))
            # Remove the matched phrase from query
            query = query[:m.start()] + query[m.end():]

    cleaned = re.sub(r"\s+", " ", query).strip()

    return SelfQueryResponse(
        original_query=req.query,
        cleaned_query=cleaned,
        filters=filters,
    )
