# -*- coding: utf-8 -*-
"""EDIM OpenAPI 3.1 스펙 자동 생성 — 컴포넌트정의서 APIS 목록이 원천 (단일 소스).

- 경로·메서드는 make_component_xlsx.py의 APIS에서 파생 → API 추가 시 자동 반영
- 스키마는 DB 정의서 핵심 필드 요약 (전체 컬럼은 DB정의서 참조)
- WS 채널(/ws/*)은 OpenAPI 제외 — 인터페이스정의서 §5 참조
실행: py docs/tools/make_openapi.py  (저장: docs/api/edim-openapi.yaml + 검증)
"""
import importlib.util
import os
import re

import yaml
from openapi_spec_validator import validate

BASE = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(BASE, "api", "edim-openapi.yaml")

spec_mod = importlib.util.spec_from_file_location(
    "comp", os.path.join(os.path.dirname(__file__), "make_component_xlsx.py"))
comp = importlib.util.module_from_spec(spec_mod)
spec_mod.loader.exec_module(comp)

# ---------------------------------------------------------------- 스키마 (핵심 필드 요약)
S = {
 "Problem": {"type": "object", "description": "RFC 9457 Problem Details",
   "properties": {"type": {"type": "string", "format": "uri"}, "title": {"type": "string"},
                  "status": {"type": "integer"}, "detail": {"type": "string"},
                  "instance": {"type": "string"}, "errors": {"type": "array", "items": {"type": "object"}}}},
 "Page": {"type": "object", "properties": {
   "items": {"type": "array", "items": {}}, "nextCursor": {"type": ["string", "null"]}}},
 "IdRef": {"type": "object", "properties": {"id": {"type": "integer", "format": "int64"}}},
 "ApprovalStatus": {"type": "string", "enum": ["DRAFT", "PENDING", "APPROVED", "REJECTED"]},

 "LoginRequest": {"type": "object", "required": ["loginId", "password"],
   "properties": {"loginId": {"type": "string"}, "password": {"type": "string"}}},
 "TokenResponse": {"type": "object", "properties": {
   "accessToken": {"type": "string"}, "refreshToken": {"type": "string"},
   "expiresIn": {"type": "integer"}, "userLevel": {"type": "string", "enum": ["PLATFORM", "ADMIN", "SETUP", "GENERAL"]}}},
 "User": {"type": "object", "properties": {
   "userId": {"type": "integer"}, "loginId": {"type": "string"}, "userName": {"type": "string"},
   "email": {"type": "string"}, "department": {"type": "string"},
   "userLevel": {"type": "string"}, "status": {"type": "string"}}},
 "Role": {"type": "object", "properties": {
   "roleId": {"type": "integer"}, "roleName": {"type": "string"},
   "permissions": {"type": "array", "items": {"type": "object", "properties": {
     "resourceType": {"type": "string"}, "resourceKey": {"type": "string"}, "action": {"type": "string"}}}}}},
 "Tenant": {"type": "object", "properties": {
   "tenantId": {"type": "integer"}, "tenantCode": {"type": "string"}, "tenantName": {"type": "string"},
   "plan": {"type": "string", "enum": ["SAAS", "SELF_MANAGED"]}, "status": {"type": "string"}}},

 "HierarchyNode": {"type": "object", "properties": {
   "hierarchyId": {"type": "integer"}, "parentId": {"type": ["integer", "null"]},
   "treeType": {"type": "string", "enum": ["PRODUCT", "GENERAL_DB", "CONFIG"]},
   "nodeName": {"type": "string"}, "symbol": {"type": "string"}, "address": {"type": "string"},
   "isSystem": {"type": "boolean"}, "approvalStatus": {"$ref": "#/components/schemas/ApprovalStatus"}}},

 "CodeGroup": {"type": "object", "properties": {
   "groupId": {"type": "integer"}, "groupCode": {"type": "string"}, "groupName": {"type": "string"},
   "groupType": {"type": "string", "enum": ["SPECIFICATION", "RAW_MATERIAL", "GPI", "PRODUCT"]},
   "hierarchyAddress": {"type": "string"},
   "items": {"type": "array", "items": {"type": "object", "properties": {
     "itemSlot": {"type": "string"}, "itemName": {"type": "string"},
     "values": {"type": "array", "items": {"type": "object", "properties": {
       "valueCode": {"type": "string"}, "valueName": {"type": "string"}}}}}}}}},
 "ProductCode": {"type": "object", "properties": {
   "productCodeId": {"type": "integer"}, "mainCode": {"type": "string"}, "codeName": {"type": "string"},
   "groupId": {"type": "integer"}, "hierarchyAddress": {"type": "string"},
   "approvalStatus": {"$ref": "#/components/schemas/ApprovalStatus"}}},
 "CodeRelationship": {"type": "object", "properties": {
   "relId": {"type": "integer"}, "motherCodeId": {"type": "integer"}, "childCodeId": {"type": "integer"},
   "quantity": {"type": "number"}, "remarks": {"type": "string"},
   "slotMaps": {"type": "array", "items": {"type": "object", "properties": {
     "childSlot": {"type": "string"}, "motherSlot": {"type": ["string", "null"]},
     "fixedValue": {"type": ["string", "null"]}}, "description": "motherSlot XOR fixedValue"}}}},
 "BomExpansion": {"type": "object", "description": "재귀 전개 결과 (verify_runtime.sql T1 형식)",
   "properties": {"finishedGoodsCode": {"type": "string"},
     "items": {"type": "array", "items": {"type": "object", "properties": {
       "level": {"type": "integer"}, "mainCode": {"type": "string"}, "resolvedCode": {"type": "string"},
       "resolvedSlots": {"type": "object"}, "quantity": {"type": "number"}, "path": {"type": "string"}}}}}},
 "RunningTestResult": {"type": "object", "properties": {
   "passed": {"type": "boolean"},
   "partList": {"type": "array", "items": {"type": "object"}},
   "errors": {"type": "array", "items": {"type": "string"}}}},
 "ArrangementCode": {"type": "object", "properties": {
   "arrangementId": {"type": "integer"}, "arrangementCode": {"type": "string"},
   "productFamily": {"type": "string"}, "directionOption": {"type": "string"},
   "components": {"type": "array", "items": {"type": "object"}}}},

 "Drawing": {"type": "object", "properties": {
   "drawingId": {"type": "integer"}, "drawingNo": {"type": "string"}, "drawingName": {"type": "string"},
   "drawingType": {"type": "string", "enum": ["ASSEMBLY", "PART", "LAYOUT"]},
   "dwgKind": {"type": "string", "enum": ["APPROVAL", "MANUFACTURING", "STANDARD"]},
   "status": {"type": "string", "enum": ["DRAFT", "REVIEW", "APPROVED", "RELEASED"]},
   "currentRev": {"type": "string"}}},
 "DrawingDocument": {"type": "object", "description": "도면 기하 표준 JSON — 프로토타입 스키마 승계",
   "properties": {"layers": {"type": "array", "items": {"type": "object"}},
     "entities": {"type": "array", "items": {"type": "object", "properties": {
       "entityType": {"type": "string", "enum": ["line", "polyline", "circle", "arc", "text"]}}}},
     "blockName": {"type": ["string", "null"]}}},
 "Dimension": {"type": "object", "properties": {
   "dimensionId": {"type": "integer"}, "dimLabel": {"type": "string"},
   "dimType": {"type": "string", "enum": ["KEY", "DETAIL"]},
   "macroId": {"type": ["integer", "null"]}, "variantValue": {"type": ["number", "null"],
     "description": "macroId XOR variantValue"},
   "designPriority": {"type": "integer"}, "dataPriority": {"type": "integer"}}},
 "Supersedure": {"type": "object", "properties": {
   "oldDrawingId": {"type": "integer"}, "newDrawingId": {"type": "integer"},
   "reason": {"type": "string"}, "supersededDate": {"type": "string", "format": "date"}}},
 "Part": {"type": "object", "properties": {
   "partId": {"type": "integer"}, "partNo": {"type": "string"}, "partName": {"type": "string"},
   "materialId": {"type": "integer"}, "unit": {"type": "string"}, "weight": {"type": "number"}}},
 "Material": {"type": "object", "properties": {
   "materialId": {"type": "integer"}, "materialCode": {"type": "string"}, "materialName": {"type": "string"},
   "density": {"type": "number"}, "hazardClass": {"type": ["string", "null"]}}},

 "DataTable": {"type": "object", "properties": {
   "tableId": {"type": "integer"}, "tableName": {"type": "string"},
   "tableType": {"type": "string", "enum": ["VARIANT", "TECH", "MATERIAL", "STD", "GENERATED"]},
   "columnDef": {"type": "object"}}},
 "TableRowsBulk": {"type": "object", "properties": {
   "rows": {"type": "array", "items": {"type": "object", "properties": {
     "rowKey": {"type": "string"}, "rowValues": {"type": "object"}},
     "description": "rowKey 숫자면 rowKeyNum 자동 파싱"}}}},
 "TableQueryResult": {"type": "object", "properties": {
   "rows": {"type": "array", "items": {"type": "object"}},
   "keyRange": {"type": "string", "description": "예: 10:25 — rowKeyNum 기준"}}},

 "Macro": {"type": "object", "properties": {
   "macroId": {"type": "integer"}, "macroName": {"type": "string"}, "version": {"type": "integer"},
   "promptText": {"type": "string"}, "macroExpr": {"type": "string"},
   "flowchartDef": {"type": "object"}, "codeText": {"type": "string"},
   "applyType": {"type": "string", "enum": ["MACRO", "CODING"]},
   "status": {"type": "string", "enum": ["DRAFT", "TESTED", "PENDING", "APPROVED"]}}},
 "MacroTestRun": {"type": "object", "properties": {
   "input": {"type": "object"}, "result": {}, "durationMs": {"type": "integer"},
   "refs": {"type": "array", "items": {"type": "object"}}}},
 "UiForm": {"type": "object", "properties": {
   "formId": {"type": "integer"}, "formName": {"type": "string"}, "formType": {"type": "string"},
   "version": {"type": "integer"}, "layoutDef": {"type": "object",
     "description": "선언적 바인딩만 — 스크립트 실행 금지 (개발표준 §4)"}}},

 "Selection": {"type": "object", "properties": {
   "selectionId": {"type": "integer"}, "projectId": {"type": "integer"},
   "finishedGoodsCode": {"type": "string"}, "slotValues": {"type": "object"},
   "isStandard": {"type": "boolean"}, "xCodeStatus": {"type": ["string", "null"]},
   "status": {"type": "string"}}},
 "RunRequest": {"type": "object", "required": ["runType"], "properties": {
   "runType": {"type": "string", "enum": ["BOM", "DWG", "PRICING", "TECH", "ALL"]}}},
 "RunAccepted": {"type": "object", "properties": {
   "runId": {"type": "integer"}, "status": {"type": "string", "enum": ["RUNNING"]},
   "statusUrl": {"type": "string"}}},
 "Run": {"type": "object", "properties": {
   "runId": {"type": "integer"}, "runType": {"type": "string"}, "status": {"type": "string"},
   "progress": {"type": "number"}, "dimensionValues": {"type": "object"},
   "errorDetail": {"type": ["object", "null"]}}},
 "OutputList": {"type": "object", "properties": {
   "outputs": {"type": "array", "items": {"type": "object", "properties": {
     "outputType": {"type": "string"}, "fileId": {"type": "integer"}, "data": {"type": "object"}}}}}},

 "Price": {"type": "object", "properties": {
   "priceId": {"type": "integer"}, "productCodeId": {"type": ["integer", "null"]},
   "partId": {"type": ["integer", "null"], "description": "productCodeId XOR partId"},
   "priceSource": {"type": "string", "enum": ["QUOTE", "PURCHASE", "STOCK", "APPLIED"]},
   "price": {"type": "number"}, "currency": {"type": "string"},
   "validFrom": {"type": "string", "format": "date"}, "validTo": {"type": ["string", "null"], "format": "date"}}},
 "PriceResolve": {"type": "object", "properties": {
   "resolvedPrice": {"type": "number"}, "source": {"type": "string"},
   "appliedRow": {"$ref": "#/components/schemas/Price"}}},
 "Pcr": {"type": "object", "properties": {
   "pcrId": {"type": "integer"}, "businessType": {"type": "string"},
   "directCostTotal": {"type": "number"}, "ebit": {"type": "number"}, "sections": {"type": "object"}}},
 "Quotation": {"type": "object", "properties": {
   "quotationId": {"type": "integer"}, "quotationNo": {"type": "string"},
   "totalAmount": {"type": "number"}, "currency": {"type": "string"},
   "lineItems": {"type": "array", "items": {"type": "object"}}, "status": {"type": "string"}}},

 "Project": {"type": "object", "properties": {
   "projectId": {"type": "integer"}, "projectNo": {"type": "string"}, "projectName": {"type": "string"},
   "salesStage": {"type": "string", "enum": ["TECH_PROPOSAL", "QUOTE", "NEGOTIATION", "CONTRACT", "CONTRACT_CHANGE", "CLOSED"]},
   "customerId": {"type": "integer"}, "status": {"type": "string"}}},
 "ProcessDef": {"type": "object", "properties": {
   "procDefId": {"type": "integer"}, "procCode": {"type": "string"}, "procName": {"type": "string"},
   "department": {"type": "string"}, "isAuto": {"type": "boolean"},
   "edges": {"type": "array", "items": {"type": "object", "properties": {
     "toDefId": {"type": "integer"}, "transitionCondition": {"type": "string"}}}}}},
 "ProcessEvent": {"type": "object", "properties": {
   "eventId": {"type": "integer"}, "procDefId": {"type": "integer"}, "projectId": {"type": "integer"},
   "status": {"type": "string", "enum": ["TODO", "IN_PROGRESS", "DONE", "ALERT"]},
   "assigneeId": {"type": "integer"}, "dueDate": {"type": "string", "format": "date"}}},
 "Dashboard": {"type": "object", "properties": {
   "kpis": {"type": "object"}, "processFlow": {"type": "array", "items": {"type": "object"}},
   "alerts": {"type": "array", "items": {"type": "object"}}}},
 "WorkProcess": {"type": "object", "properties": {
   "wpId": {"type": "integer"}, "productCodeId": {"type": "integer"}, "processType": {"type": "string"},
   "workTime": {"type": "number"}, "makeOrBuy": {"type": "string", "enum": ["MAKE", "BUY"]}}},
 "SupplierCodeMap": {"type": "object", "properties": {
   "partId": {"type": ["integer", "null"]}, "productCodeId": {"type": ["integer", "null"]},
   "supplierId": {"type": "integer"}, "supplierCode": {"type": "string"}}},

 "ApprovalRequest": {"type": "object", "properties": {
   "approvalId": {"type": "integer"}, "targetTable": {"type": "string"}, "targetId": {"type": "integer"},
   "requestType": {"type": "string"}, "step": {"type": "string", "enum": ["WRITE", "REVIEW", "APPROVE"]},
   "result": {"type": ["string", "null"], "enum": ["APPROVED", "REJECTED", None]}}},
 "ApprovalDecision": {"type": "object", "required": ["result"], "properties": {
   "result": {"type": "string", "enum": ["APPROVED", "REJECTED"]}, "comment": {"type": "string"}}},
 "DocControl": {"type": "object", "properties": {
   "docNo": {"type": "string"}, "title": {"type": "string"}, "version": {"type": "string"},
   "releasedStatus": {"type": "string", "enum": ["SET_UP", "CHECK", "APPROVE", "ACCEPTED"]},
   "managementGrade": {"type": "string"}}},
 "SignedUrl": {"type": "object", "properties": {
   "url": {"type": "string"}, "expiresIn": {"type": "integer"}, "fileId": {"type": "integer"}}},
 "FileRef": {"type": "object", "properties": {
   "fileId": {"type": "integer"}, "fileName": {"type": "string"}, "fileType": {"type": "string"},
   "downloadUrl": {"type": "string"}}},
 "NotificationList": {"type": "object", "properties": {
   "items": {"type": "array", "items": {"type": "object", "properties": {
     "notifyType": {"type": "string"}, "title": {"type": "string"}, "isRead": {"type": "boolean"}}}}}},
 "AiGeneration": {"type": "object", "properties": {
   "generated": {"type": "object"}, "model": {"type": "string"}, "tokenUsage": {"type": "object"},
   "requiresApproval": {"type": "boolean", "description": "AI 생성물은 승인 게이트 필수 (AI-008)"}}},
 "QrResult": {"type": "object", "properties": {
   "qrToken": {"type": "string"}, "targetType": {"type": "string"}, "targetUrl": {"type": "string"}}},
 "ImportResult": {"type": "object", "properties": {
   "total": {"type": "integer"}, "succeeded": {"type": "integer"},
   "failed": {"type": "array", "items": {"type": "object"}}}},
}

# ---------------------------------------------------------------- 경로 → 스키마 매핑 (키워드, 첫 일치 우선)
REQ_MAP = [
 ("auth/login", "LoginRequest"), ("auth/password", None), ("auth/refresh", None),
 ("users", "User"), ("roles", "Role"), ("tenants", "Tenant"),
 ("hierarchy/nodes", "HierarchyNode"),
 ("codes/groups", "CodeGroup"), ("codes/products", "ProductCode"),
 ("codes/relationships/running-test", "CodeRelationship"), ("codes/relationships", "CodeRelationship"),
 ("codes/arrangements", "ArrangementCode"), ("codes/values/import-excel", None),
 ("drawings/import", None), ("supersede", "Supersedure"), ("dimensions", "Dimension"),
 ("drawings/{id}/document", "DrawingDocument"), ("revisions", None), ("drawings", "Drawing"),
 ("parts", "Part"), ("materials", "Material"),
 ("rows:bulk", "TableRowsBulk"), ("tables/import-excel", None), ("tables", "DataTable"),
 ("toolbox/forms", "UiForm"), ("macros/{id}/test-run", "MacroTestRun"), ("macros", "Macro"),
 ("selections/{id}/runs", "RunRequest"), ("slots", "Selection"), ("x-code-review", None),
 ("finalize", None), ("cpq/selections", "Selection"),
 ("prices", "Price"), ("pcr", "Pcr"), ("quotations", "Quotation"),
 ("projects", "Project"), ("process-defs", "ProcessDef"), ("erp/events", "ProcessEvent"),
 ("work-processes", "WorkProcess"), ("supplier-code-maps", "SupplierCodeMap"),
 ("approvals/{id}/decide", "ApprovalDecision"), ("approvals", "ApprovalRequest"),
 ("doc-controls", "DocControl"), ("documents/render", None), ("export-office", None),
 ("files/upload-url", None), ("notifications/read", None),
 ("ai/", "AiGeneration"), ("qr/issue", None),
]
RES_MAP = [
 ("auth/login", "TokenResponse"), ("auth/refresh", "TokenResponse"), ("auth/me", "User"),
 ("auth/permissions", None), ("users", "User"), ("roles", "Role"), ("tenants", "Tenant"),
 ("hierarchy/search", "Page"), ("hierarchy/resolve", "HierarchyNode"), ("hierarchy", "HierarchyNode"),
 ("check-duplicate", None), ("expand", "BomExpansion"), ("running-test", "RunningTestResult"),
 ("codes/groups", "CodeGroup"), ("codes/products", "ProductCode"), ("codes/relationships", "CodeRelationship"),
 ("codes/arrangements", "ArrangementCode"), ("export-excel", "FileRef"), ("import-excel", "ImportResult"),
 ("referencers", "Page"), ("variants", "Page"), ("supersede", "Supersedure"),
 ("drawings/{id}/document", "DrawingDocument"), ("dimensions", "Dimension"),
 ("drawings/{id}/export", "FileRef"), ("drawings/import", "Drawing"), ("revisions", "Drawing"),
 ("drawings", "Drawing"), ("parts", "Part"), ("materials", "Material"),
 ("tables/{id}/query", "TableQueryResult"), ("rows:bulk", "ImportResult"), ("tables", "DataTable"),
 ("toolbox/forms", "UiForm"), ("templets", "Page"),
 ("test-run", "MacroTestRun"), ("macros", "Macro"),
 ("selections/{id}/runs", "RunAccepted"), ("runs/{runId}/outputs", "OutputList"),
 ("bom/export", "FileRef"), ("runs/{runId}", "Run"), ("cpq/selections", "Selection"),
 ("prices/resolve", "PriceResolve"), ("prices", "Price"), ("pcr", "Pcr"),
 ("quotations/{id}/render", "FileRef"), ("quotations", "Quotation"),
 ("dashboard", "Dashboard"), ("projects", "Project"), ("process-defs", "ProcessDef"),
 ("erp/processes", "ProcessDef"), ("erp/events", "ProcessEvent"),
 ("work-processes", "WorkProcess"), ("supplier-code-maps", "SupplierCodeMap"),
 ("approvals", "ApprovalRequest"),
 ("doc-controls/allocate-code", "DocControl"), ("doc-controls", "DocControl"),
 ("documents/render", "FileRef"), ("export-office", "FileRef"),
 ("upload-url", "SignedUrl"), ("download-url", "SignedUrl"), ("files", "Page"),
 ("notifications", "NotificationList"), ("ai/", "AiGeneration"),
 ("qr/issue", "QrResult"), ("qr/resolve", "QrResult"),
]


def find(mapping, path):
    for key, schema in mapping:
        if key in path:
            return schema
    return None


def to_params(path):
    out = []
    for name in re.findall(r"\{(\w+)\}", path):
        out.append({"name": name, "in": "path", "required": True,
                    "schema": {"type": "string"}})
    return out


def main():
    paths = {}
    for service, method, path, desc in comp.APIS:
        if path.startswith("/ws/"):
            continue  # WS 채널은 인터페이스정의서 §5
        method_l = method.lower()
        op = {
            "tags": [service],
            "summary": desc,
            "operationId": re.sub(r"[^a-zA-Z0-9]+", "_", f"{method_l}_{path[8:]}").strip("_"),
            "responses": {
                "400": {"$ref": "#/components/responses/BadRequest"},
                "401": {"$ref": "#/components/responses/Unauthorized"},
                "403": {"$ref": "#/components/responses/Forbidden"},
            },
        }
        params = to_params(path)
        if params:
            op["parameters"] = params
        if method_l in ("post", "patch", "put"):
            req = find(REQ_MAP, path)
            body = {"$ref": f"#/components/schemas/{req}"} if req else {"type": "object"}
            op["requestBody"] = {"required": True, "content": {"application/json": {"schema": body}}}
        res = find(RES_MAP, path)
        res_schema = {"$ref": f"#/components/schemas/{res}"} if res else {"type": "object"}
        if "RunAccepted" == res:
            op["responses"]["202"] = {"description": "비동기 잡 수락 (개발표준 §3)",
                "content": {"application/json": {"schema": res_schema}}}
        elif method_l == "post":
            op["responses"]["201"] = {"description": "생성됨 (승인 대상 자산은 DRAFT)",
                "content": {"application/json": {"schema": res_schema}}}
        elif method_l == "delete":
            op["responses"]["204"] = {"description": "삭제됨 (DRAFT 자산만)"}
        else:
            op["responses"]["200"] = {"description": "성공",
                "content": {"application/json": {"schema": res_schema}}}
        paths.setdefault(path, {})[method_l] = op

    doc = {
        "openapi": "3.1.0",
        "info": {
            "title": "EDIM API",
            "version": "0.1.0",
            "description": ("EDIM (Enterprise Digital Integration Management) REST API.\n\n"
                            "- 원천: 컴포넌트정의서 APIS 목록 (make_openapi.py 자동 생성)\n"
                            "- 규약: 개발표준 §3 — RFC 9457 오류, 커서 페이지네이션(?cursor=&limit=), "
                            "비동기 잡 202+runId, Idempotency-Key 지원\n"
                            "- 인증: Bearer JWT (테넌트 claim 포함) · 권한: 권한승인정의서 매트릭스\n"
                            "- 스키마는 핵심 필드 요약 — 전체 컬럼은 DB정의서 v0.4 참조"),
        },
        "servers": [
            {"url": "https://edim.seekerslab.com", "description": "개발"},
            {"url": "https://{tenant-host}", "description": "운영 (테넌트별)", "variables": {"tenant-host": {"default": "edim.example.com"}}},
        ],
        "security": [{"bearerAuth": []}],
        "tags": sorted({a[0] for a in comp.APIS if not a[2].startswith("/ws/")}) and
                [{"name": t} for t in sorted({a[0] for a in comp.APIS if not a[2].startswith("/ws/")})],
        "paths": paths,
        "components": {
            "securitySchemes": {"bearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}},
            "responses": {
                "BadRequest": {"description": "요청 오류", "content": {"application/problem+json": {"schema": {"$ref": "#/components/schemas/Problem"}}}},
                "Unauthorized": {"description": "인증 실패", "content": {"application/problem+json": {"schema": {"$ref": "#/components/schemas/Problem"}}}},
                "Forbidden": {"description": "권한 없음 — 권한승인정의서 매트릭스", "content": {"application/problem+json": {"schema": {"$ref": "#/components/schemas/Problem"}}}},
            },
            "schemas": S,
        },
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        yaml.dump(doc, f, allow_unicode=True, sort_keys=False, width=110)
    validate(doc)
    n_ops = sum(len(v) for v in paths.values())
    print(f"saved+validated: {os.path.abspath(OUT)}  (경로 {len(paths)} · 오퍼레이션 {n_ops} · 스키마 {len(S)})")


if __name__ == "__main__":
    main()
