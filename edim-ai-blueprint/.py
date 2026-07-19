# -*- coding: utf-8 -*-
import json, urllib.request
req = urllib.request.Request("https://edimsol.com/api/v1/auth/login",
    data=json.dumps({"userId": "edim", "password": "edim"}).encode(),
    headers={"Content-Type": "application/json"})
tok = json.loads(urllib.request.urlopen(req).read())["token"]
H = {"Authorization": "Bearer " + tok, "Content-Type": "application/json"}
def api(method, path, body=None):
    d = json.dumps(body).encode() if body is not None else None
    rq = urllib.request.Request("https://edimsol.com/api/v1" + path, data=d, headers=H, method=method)
    try:
        r = urllib.request.urlopen(rq)
        return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:200].decode("utf-8", "replace")
st, p1 = api("POST", "/hierarchy/nodes", {"treeType": "PRODUCT", "parentAddress": "", "address": "911", "name": "UT-DBG", "symbol": ""})
print("create:", st, p1)
nid = p1.get("hierarchyId") if isinstance(p1, dict) else None
if nid is None and isinstance(p1, dict):
    nid = p1.get("id") or p1.get("nodeId")
print("id:", nid)
st, info = api("GET", f"/hierarchy/nodes/{nid}/info")
print("info:", st, str(info)[:200])
print("del:", api("DELETE", f"/hierarchy/nodes/{nid}")[0])
