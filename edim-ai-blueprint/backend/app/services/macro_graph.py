# -*- coding: utf-8 -*-
"""Command Graph 파생 (요구 #60) — 수식(macro_expr)에서 단일 Graph 를 만든다.

5-View(Prompt/Macro/Flowchart/Description/Coding)는 지금까지 서로 독립 컬럼이라
하나만 고쳐도 나머지는 옛 내용으로 남았다. Graph 를 정본으로 두고 각 뷰가 그것에
맞춰져 있는지(지문 일치)를 판정한다.

Graph 는 파서 AST 를 그대로 옮긴 것이라 결정적이다 — 같은 수식이면 항상 같은 Graph·같은 체크섬.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

from app.services.macro_engine import Bin, Call, Neg, Num, Parser, Range, Ref, tokenize


def build_graph(expr: str) -> dict[str, Any]:
    """수식 → Command Graph (노드·엣지). 파싱 실패는 호출자가 처리한다."""
    ast = Parser(tokenize(expr)).parse()
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []

    def add(kind: str, label: str) -> int:
        nodes.append({"id": len(nodes), "kind": kind, "label": label})
        return len(nodes) - 1

    def walk(node: Any) -> int:
        if isinstance(node, Num):
            return add("CONST", f"{node.v:g}")
        if isinstance(node, Ref):
            return add("REF", node.name)
        if isinstance(node, Neg):
            nid = add("OP", "neg")
            edges.append({"from": walk(node.v), "to": nid})
            return nid
        if isinstance(node, Bin):
            nid = add("OP", node.op)
            edges.append({"from": walk(node.left), "to": nid})
            edges.append({"from": walk(node.right), "to": nid})
            return nid
        if isinstance(node, Call):
            nid = add("CALL", node.name)
            for a in node.args:
                edges.append({"from": walk(a), "to": nid})
            return nid
        if isinstance(node, Range):
            nid = add("RANGE", ":")
            edges.append({"from": walk(node.lo), "to": nid})
            edges.append({"from": walk(node.hi), "to": nid})
            return nid
        return add("UNKNOWN", type(node).__name__)

    root = walk(ast)
    refs = sorted({n["label"] for n in nodes if n["kind"] == "REF"})
    calls = sorted({n["label"] for n in nodes if n["kind"] == "CALL"})
    return {"root": root, "nodes": nodes, "edges": edges,
            "inputs": refs, "functions": calls}


def graph_checksum(graph: dict[str, Any]) -> str:
    """정규화 SHA-256 — Snapshot(#9)·Package(#56)와 같은 규약."""
    canon = json.dumps(graph, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()


def view_fingerprint(value: Any) -> str:
    """뷰 내용 지문 — 뷰가 Graph 와 맞춰진 시점을 기록/대조하는 데 쓴다."""
    if value is None:
        value = ""
    if not isinstance(value, str):
        value = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(value.strip().encode("utf-8")).hexdigest()[:32]


VIEWS = ("prompt", "expr", "flowchart", "description", "coding")
