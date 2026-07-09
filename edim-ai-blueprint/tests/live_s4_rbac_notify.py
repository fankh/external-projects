# -*- coding: utf-8 -*-
"""S4 live — RBAC 403 + notifications flow."""
import json
import urllib.error
import urllib.request

B = 'https://edim.seekerslab.com/api/v1'


def req(method, path, data=None, headers=None):
    h = {'Content-Type': 'application/json', **(headers or {})}
    body = json.dumps(data).encode() if data is not None else None
    r = urllib.request.Request(B + path, data=body, method=method, headers=h)
    with urllib.request.urlopen(r) as res:
        return json.loads(res.read())


def status_of(method, path, data=None, headers=None):
    try:
        req(method, path, data, headers)
        return 200
    except urllib.error.HTTPError as e:
        return e.code


tok_admin = req('POST', '/auth/login', {'userId': 'edim', 'password': 'edim'})['token']
tok_gen = req('POST', '/auth/login', {'userId': 'kim01', 'password': 'edim'})['token']
A = {'Authorization': f'Bearer {tok_admin}'}
G = {'Authorization': f'Bearer {tok_gen}'}

# RBAC — GENERAL
assert status_of('GET', '/documents', headers=G) == 200
print('PASS GENERAL read ok (documents)')
assert status_of('POST', '/approvals/999/decide', {'approve': True, 'comment': 'x'}, G) == 403
print('PASS GENERAL decide -> 403')
assert status_of('PUT', '/tables/Table12/rows/560', {'key': '560', 'values': {'A': 1}}, G) == 403
print('PASS GENERAL table write -> 403')
assert status_of('GET', '/users', headers=G) == 403
print('PASS GENERAL users list -> 403')
assert status_of('POST', '/users/park.f/unlock', headers=G) == 403
print('PASS GENERAL unlock -> 403')

# ADMIN paths
assert status_of('GET', '/users', headers=A) == 200
r = status_of('POST', '/users/park.f/unlock', headers=A)
assert r in (200, 404)   # 404 = 이미 ACTIVE (RBAC 통과 증명)
print(f'PASS ADMIN users/unlock allowed (unlock={r})')

# Notifications — seed 2건 + 요청/결정 트리거
n0 = req('GET', '/notifications', headers=A)
base_unread = sum(1 for n in n0 if not n['read'])
assert len(n0) >= 2
print(f'PASS notifications seeded ({len(n0)} items, unread {base_unread})')

# edim(ADMIN) 이 항목 H 등록 → park.f(ADMIN) 에게 알림
add = status_of('POST', '/codes/groups/KOF/items',
                {'slot': 'H', 'name': 'Blade Angle', 'values': ['15', '30']}, A)
assert add in (200, 201, 409)   # 409 = 재실행 (이미 존재)
if add != 409:
    tok_pf = req('POST', '/auth/login', {'userId': 'park.f', 'password': 'edim'})['token']
    npf = req('GET', '/notifications', headers={'Authorization': f'Bearer {tok_pf}'})
    assert any('KOF/H' in n['title'] for n in npf), npf[:3]
    print('PASS approval request notified to park.f (ADMIN)')

# 대기 요청 하나 승인 → 요청자에게 결과 알림
inbox = req('GET', '/approvals/inbox', headers=A)
target = next((r for r in inbox if 'H' in r['target'] or 'code_item' in r['target']), inbox[0] if inbox else None)
if target:
    req('POST', f"/approvals/{target['id']}/decide", {'approve': True, 'comment': 'S4 검증'}, A)
    n1 = req('GET', '/notifications', headers=A)
    assert any('승인 —' in n['title'] for n in n1)
    print('PASS decide -> requester notification (APPROVAL_RESULT)')

# 읽음 처리
unread_ids = [n['id'] for n in req('GET', '/notifications', headers=A) if not n['read']]
if unread_ids:
    req('POST', f'/notifications/{unread_ids[0]}/read', headers=A)
    n2 = req('GET', '/notifications', headers=A)
    assert sum(1 for n in n2 if not n['read']) == len(unread_ids) - 1
    print('PASS mark-read decrements unread')

print('S4 API LIVE: all pass')
