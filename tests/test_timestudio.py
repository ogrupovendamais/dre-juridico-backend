import datetime, secrets, time
import pytest
from fastapi.testclient import TestClient
from server import app, db, hash_password, utc
from sqlalchemy import text

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def setup_tenants():
    o1 = secrets.token_hex(12)
    o2 = secrets.token_hex(12)
    admin_id = secrets.token_hex(12)
    p1_id = secrets.token_hex(12)
    p2_id = secrets.token_hex(12)
    c1_id = secrets.token_hex(12)
    c2_id = secrets.token_hex(12)
    
    with db() as c:
        # Create offices
        c.execute(text('INSERT INTO offices VALUES (:id, "Banca Alpha")'), {'id': o1})
        c.execute(text('INSERT INTO offices VALUES (:id, "Banca Beta")'), {'id': o2})

        # Create admin in o1
        pw_hash = hash_password('AdminPass1234!')
        c.execute(text('INSERT INTO users VALUES (:id, :o, :email, :pw, "admin")'), {
            'id': admin_id, 'o': o1, 'email': f'admin_{o1}@alpha.adv.br', 'pw': pw_hash
        })

        # Create professionals
        c.execute(text('INSERT INTO professionals VALUES (:id, :o, "Dr. Lucas Alpha", 20000, :at)'), {
            'id': p1_id, 'o': o1, 'at': utc()
        })
        c.execute(text('INSERT INTO professionals VALUES (:id, :o, "Dr. Rodrigo Beta", 30000, :at)'), {
            'id': p2_id, 'o': o2, 'at': utc()
        })

        # Create contracts
        c.execute(text('INSERT INTO contracts (id, office_id, customer_id, label, fee_type) VALUES (:id, :o, "cust1", "Contrato Alpha 01", "pro_labore")'), {
            'id': c1_id, 'o': o1
        })
        c.execute(text('INSERT INTO contracts (id, office_id, customer_id, label, fee_type) VALUES (:id, :o, "cust2", "Contrato Beta 01", "pro_labore")'), {
            'id': c2_id, 'o': o2
        })

    return {
        'o1': o1, 'o2': o2,
        'admin_id': admin_id, 'admin_email': f'admin_{o1}@alpha.adv.br',
        'p1': p1_id, 'p2': p2_id,
        'c1': c1_id, 'c2': c2_id
    }

def test_timestudio_full_lifecycle(client, setup_tenants):
    t = setup_tenants

    # 1. Admin logs in
    login_res = client.post('/api/login', json={'email': t['admin_email'], 'password': 'AdminPass1234!'})
    assert login_res.status_code == 200
    admin_token = login_res.json()['token']
    admin_headers = {'Authorization': f'Bearer {admin_token}'}

    # 2. Admin generates single-use invite for p1
    prof_email = f"lucas_{secrets.token_hex(4)}@alpha.adv.br"
    inv_res = client.post('/api/timestudio/invites', json={
        'professional_id': t['p1'],
        'email': prof_email
    }, headers=admin_headers)
    assert inv_res.status_code == 201
    inv_data = inv_res.json()
    token = inv_data['token']
    assert token and len(token) > 20

    # 3. Verify invite endpoint
    verify_res = client.get(f'/api/timestudio/invite/verify?token={token}')
    assert verify_res.status_code == 200
    assert verify_res.json()['professional_name'] == 'Dr. Lucas Alpha'
    assert verify_res.json()['office_name'] == 'Banca Alpha'

    # 4. Professional accepts invite and sets password
    accept_res = client.post('/api/timestudio/invite/accept', json={
        'token': token,
        'password': 'MinhaSenhaSegura2026!'
    })
    assert accept_res.status_code == 200
    pro_session = accept_res.json()['token']
    pro_headers = {'Authorization': f'Bearer {pro_session}'}

    # 5. Single-use rule: re-accepting same invite MUST fail
    reaccept_res = client.post('/api/timestudio/invite/accept', json={
        'token': token,
        'password': 'OutraSenha123'
    })
    assert reaccept_res.status_code == 400

    # 6. Professional login with credentials
    pro_login = client.post('/api/timestudio/auth/login', json={
        'email': prof_email,
        'password': 'MinhaSenhaSegura2026!'
    })
    assert pro_login.status_code == 200
    assert pro_login.json()['professional']['id'] == t['p1']

    # 7. Professional queries /api/timestudio/me (must see only office contracts)
    me_res = client.get('/api/timestudio/me', headers=pro_headers)
    assert me_res.status_code == 200
    contracts_avail = me_res.json()['contracts']
    contract_ids = [c['id'] for c in contracts_avail]
    assert t['c1'] in contract_ids
    assert t['c2'] not in contract_ids  # Tenant isolation!

    # 8. Idempotent Timesheet Sync
    idempotency_key = f'ts_test_{secrets.token_hex(8)}'
    sync_res = client.post('/api/timestudio/entries/sync', json={
        'entries': [{
            'idempotency_key': idempotency_key,
            'contract_id': t['c1'],
            'work_date': '2026-10-23',
            'minutes': 120,
            'description': 'Petição inicial de embargos'
        }]
    }, headers=pro_headers)
    assert sync_res.status_code == 200
    sync_data = sync_res.json()
    assert sync_data['synced_count'] == 1
    worklog_id = sync_data['entries'][0]['id']
    assert sync_data['entries'][0]['status'] == 'PENDING'

    # Re-syncing same idempotency_key MUST NOT duplicate
    sync_repeat = client.post('/api/timestudio/entries/sync', json={
        'entries': [{
            'idempotency_key': idempotency_key,
            'contract_id': t['c1'],
            'work_date': '2026-10-23',
            'minutes': 120,
            'description': 'Petição inicial de embargos'
        }]
    }, headers=pro_headers)
    assert sync_repeat.status_code == 200
    assert sync_repeat.json()['entries'][0]['duplicated'] is True
    assert sync_repeat.json()['entries'][0]['id'] == worklog_id

    # 9. Cross-tenant injection attempt (Professional p1 trying to log to contract c2 of Office 2)
    cross_sync = client.post('/api/timestudio/entries/sync', json={
        'entries': [{
            'idempotency_key': f'ts_cross_{secrets.token_hex(8)}',
            'contract_id': t['c2'],
            'work_date': '2026-10-23',
            'minutes': 60,
            'description': 'Tentativa indevida'
        }]
    }, headers=pro_headers)
    assert cross_sync.status_code == 200
    assert cross_sync.json()['synced_count'] == 0  # rejected, not belonging to office

    # 10. Managerial DRE check: while PENDING, worklog MUST NOT affect candidate cost/margin
    prod_before = client.get('/api/productivity?month=2026-10', headers=admin_headers).json()
    contract_p1 = next((c for c in prod_before['contracts'] if c['contract_id'] == t['c1']), None)
    # Since only approved entries count, candidate cost from this pending log is 0
    cost_before = contract_p1['cost_hours_cents'] if contract_p1 else 0

    # 11. Admin lists approvals and approves the entry
    approvals_res = client.get('/api/timestudio/approvals?status=PENDING', headers=admin_headers)
    assert approvals_res.status_code == 200
    pending_items = approvals_res.json()
    assert any(x['id'] == worklog_id for x in pending_items)

    approve_res = client.post(f'/api/timestudio/approvals/{worklog_id}/approve', headers=admin_headers)
    assert approve_res.status_code == 200
    assert approve_res.json()['status'] == 'APPROVED'

    # 12. Managerial DRE check: now that it is APPROVED, cost MUST be consolidated
    prod_after = client.get('/api/productivity?month=2026-10', headers=admin_headers).json()
    contract_p1_after = next((c for c in prod_after['contracts'] if c['contract_id'] == t['c1']), None)
    assert contract_p1_after is not None
    # 120 minutes at R$ 200/h (20000 cents) = R$ 400 (40000 cents)
    assert contract_p1_after['cost_hours_cents'] == cost_before + 40000

    # 13. Rejection workflow check
    # Submit another entry to test rejection
    idemp_reject = f'ts_rej_{secrets.token_hex(8)}'
    client.post('/api/timestudio/entries/sync', json={
        'entries': [{
            'idempotency_key': idemp_reject,
            'contract_id': t['c1'],
            'work_date': '2026-10-23',
            'minutes': 60,
            'description': 'Atividade incorreta'
        }]
    }, headers=pro_headers)
    
    appr_list = client.get('/api/timestudio/approvals?status=PENDING', headers=admin_headers).json()
    item_to_reject = next(x for x in appr_list if x['description'] == 'Atividade incorreta')
    
    reject_res = client.post(f'/api/timestudio/approvals/{item_to_reject["id"]}/reject', json={
        'reason': 'Horas duplicadas com outro processo'
    }, headers=admin_headers)
    assert reject_res.status_code == 200
    assert reject_res.json()['status'] == 'REJECTED'

    # Professional views history and sees rejection reason
    hist_res = client.get('/api/timestudio/entries', headers=pro_headers)
    assert hist_res.status_code == 200
    my_rejected = next(x for x in hist_res.json() if x['id'] == item_to_reject['id'])
    assert my_rejected['status'] == 'REJECTED'
    assert my_rejected['rejection_reason'] == 'Horas duplicadas com outro processo'
