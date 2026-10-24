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
    admin_id1 = secrets.token_hex(12)
    admin_id2 = secrets.token_hex(12)
    p1_id = secrets.token_hex(12)
    p2_id = secrets.token_hex(12)
    c1_id = secrets.token_hex(12)
    c2_id = secrets.token_hex(12)
    
    with db() as c:
        # Create offices
        c.execute(text('INSERT INTO offices VALUES (:id, "Banca Alpha Stages")'), {'id': o1})
        c.execute(text('INSERT INTO offices VALUES (:id, "Banca Beta Stages")'), {'id': o2})

        # Create admin in o1 & o2
        pw_hash = hash_password('AdminPass1234!')
        c.execute(text('INSERT INTO users VALUES (:id, :o, :email, :pw, "admin")'), {
            'id': admin_id1, 'o': o1, 'email': f'admin_{o1}@alpha.adv.br', 'pw': pw_hash
        })
        c.execute(text('INSERT INTO users VALUES (:id, :o, :email, :pw, "admin")'), {
            'id': admin_id2, 'o': o2, 'email': f'admin_{o2}@beta.adv.br', 'pw': pw_hash
        })

        # Create professionals
        c.execute(text('INSERT INTO professionals VALUES (:id, :o, "Dr. Lucas Alpha", 15000, :at)'), {
            'id': p1_id, 'o': o1, 'at': utc()
        })
        c.execute(text('INSERT INTO professionals VALUES (:id, :o, "Dr. Rodrigo Beta", 25000, :at)'), {
            'id': p2_id, 'o': o2, 'at': utc()
        })

        # Create contracts
        c.execute(text('INSERT INTO contracts (id, office_id, customer_id, label, fee_type, legal_area) VALUES (:id, :o, "cust1", "Reclamatória Silva vs Metalúrgica", "mensal", "trabalhista")'), {
            'id': c1_id, 'o': o1
        })
        c.execute(text('INSERT INTO contracts (id, office_id, customer_id, label, fee_type, legal_area) VALUES (:id, :o, "cust2", "Contrato Beta Cível", "fixo", "civel")'), {
            'id': c2_id, 'o': o2
        })

    return {
        'o1': o1, 'o2': o2,
        'admin_email1': f'admin_{o1}@alpha.adv.br',
        'admin_email2': f'admin_{o2}@beta.adv.br',
        'p1': p1_id, 'p2': p2_id,
        'c1': c1_id, 'c2': c2_id
    }

def test_stage_templates_and_contract_generation(client, setup_tenants):
    t = setup_tenants
    # Login Alfa
    res_log = client.post('/api/login', json={'email': t['admin_email1'], 'password': 'AdminPass1234!'})
    assert res_log.status_code == 200
    token_alfa = res_log.json()['token']
    headers_alfa = {'Authorization': f'Bearer {token_alfa}'}

    # 1. List stage templates (catálogo padrão)
    res_t = client.get('/api/stages/templates', headers=headers_alfa)
    assert res_t.status_code == 200
    templates = res_t.json()
    assert len(templates) >= 6
    areas = {tpl['legal_area'] for tpl in templates}
    assert 'trabalhista' in areas
    assert 'civel' in areas

    # 2. Get contract stages for trabalhista contract (auto-generation from template)
    res_c1 = client.get(f'/api/contracts/{t["c1"]}/stages', headers=headers_alfa)
    assert res_c1.status_code == 200
    data_c1 = res_c1.json()
    assert data_c1['contract_id'] == t['c1']
    assert len(data_c1['stages']) == 9  # Trabalhista template has 9 stages
    stage_names = [s['stage_name'] for s in data_c1['stages']]
    assert 'Atendimento e Análise Inicial' in stage_names[0]
    assert 'Audiências' in stage_names[4]

    # Verify zero actual hours state handles deviation without ZeroDivisionError
    first_stage = data_c1['stages'][0]
    assert first_stage['planned_hours'] > 0
    assert first_stage['actual_hours'] == 0
    assert first_stage['desvio_percentual'] == -100.0 or first_stage['saldo_hours'] == first_stage['planned_hours']

def test_stage_budget_update_and_audit(client, setup_tenants):
    t = setup_tenants
    res_log = client.post('/api/login', json={'email': t['admin_email1'], 'password': 'AdminPass1234!'})
    headers = {'Authorization': f'Bearer {res_log.json()["token"]}'}

    stages_res = client.get(f'/api/contracts/{t["c1"]}/stages', headers=headers).json()
    stage_0 = stages_res['stages'][0]
    stage_id = stage_0['id']

    # Update budget to 10 hours
    up_res = client.put(f'/api/contracts/{t["c1"]}/stages/{stage_id}', json={
        'planned_hours': 10.0,
        'status': 'EM_ANDAMENTO'
    }, headers=headers)
    assert up_res.status_code == 200

    # Verify updated values
    stages_after = client.get(f'/api/contracts/{t["c1"]}/stages', headers=headers).json()
    st_after = [s for s in stages_after['stages'] if s['id'] == stage_id][0]
    assert st_after['planned_hours'] == 10.0
    assert st_after['planned_minutes'] == 600

def test_worklog_with_stage_and_approval_costing(client, setup_tenants):
    t = setup_tenants
    res_log = client.post('/api/login', json={'email': t['admin_email1'], 'password': 'AdminPass1234!'})
    admin_headers = {'Authorization': f'Bearer {res_log.json()["token"]}'}

    # Invite professional and accept
    inv_res = client.post('/api/timestudio/invites', json={
        'professional_id': t['p1'],
        'email': f'adv_{t["p1"]}@alpha.adv.br'
    }, headers=admin_headers)
    token = inv_res.json()['token']

    acc_res = client.post('/api/timestudio/invite/accept', json={
        'token': token,
        'password': 'SenhaProfissional123!'
    })
    pro_token = acc_res.json()['token']
    pro_headers = {'Authorization': f'Bearer {pro_token}'}

    # 1. Professional queries /api/timestudio/me (must receive contracts with their stages)
    me_res = client.get('/api/timestudio/me', headers=pro_headers)
    assert me_res.status_code == 200
    contracts = me_res.json()['contracts']
    assert len(contracts) >= 1
    c1 = [c for c in contracts if c['id'] == t['c1']][0]
    assert 'stages' in c1
    assert len(c1['stages']) > 0
    stage_id = c1['stages'][0]['id']

    # 2. Professional syncs an entry with stage and activity
    k1 = f"sync_stage_test_{int(time.time()*1000)}"
    sync_res = client.post('/api/timestudio/entries/sync', json={
        'entries': [{
            'idempotency_key': k1,
            'contract_id': t['c1'],
            'stage_id': stage_id,
            'activity_type': 'Petição Inicial',
            'start_time': '14:00',
            'end_time': '16:00',
            'pause_minutes': 0,
            'work_date': '2026-10-23',
            'minutes': 120,
            'description': 'Elaboração e revisão dos pedidos na inicial trabalhista'
        }]
    }, headers=pro_headers)
    assert sync_res.status_code == 200
    entry_id = sync_res.json()['entries'][0]['id']

    # 3. Check /api/productivity/stages before approval:
    # Hours must be actual=2h, approved=0h, pending=2h, cost_approved_cents=0 (pending does NOT compose approved cost!)
    rep_res = client.get('/api/productivity/stages', headers=admin_headers)
    assert rep_res.status_code == 200
    rep_data = rep_res.json()
    c_stage_data = [c for c in rep_data['contracts'] if c['contract_id'] == t['c1']][0]
    assert c_stage_data['actual_hours'] >= 2.0
    assert c_stage_data['pending_hours'] >= 2.0
    assert c_stage_data['cost_approved_cents'] == 0  # Unapproved entries cannot produce approved managerial cost!

    # 4. Approve the entry
    appr_res = client.post(f'/api/timestudio/approvals/{entry_id}/approve', headers=admin_headers)
    assert appr_res.status_code == 200

    # 5. Check /api/productivity/stages after approval:
    # Now approved_hours >= 2.0, cost_approved_cents >= 30000 (2h * R$150/h = R$300 = 30000 cents)
    rep_after = client.get('/api/productivity/stages', headers=admin_headers).json()
    c_after = [c for c in rep_after['contracts'] if c['contract_id'] == t['c1']][0]
    assert c_after['approved_hours'] >= 2.0
    assert c_after['cost_approved_cents'] >= 30000

def test_similar_process_benchmarks(client, setup_tenants):
    t = setup_tenants
    res_log = client.post('/api/login', json={'email': t['admin_email1'], 'password': 'AdminPass1234!'})
    headers = {'Authorization': f'Bearer {res_log.json()["token"]}'}

    bench_res = client.get('/api/productivity/stages/benchmarks', headers=headers)
    assert bench_res.status_code == 200
    bench_data = bench_res.json()
    assert 'benchmarks' in bench_data
    assert 'limitations_note' in bench_data
    assert len(bench_data['benchmarks']) > 0
    trab_bench = [b for b in bench_data['benchmarks'] if b['legal_area'] == 'trabalhista'][0]
    assert trab_bench['sample_size_n'] >= 1
    assert 'average_hours' in trab_bench
    assert 'median_hours' in trab_bench
    assert 'dispersion_std_dev' in trab_bench
    assert 'reliability_rating' in trab_bench

def test_multitenant_stage_isolation(client, setup_tenants):
    t = setup_tenants

    # Login Beta
    res_beta = client.post('/api/login', json={'email': t['admin_email2'], 'password': 'AdminPass1234!'})
    beta_headers = {'Authorization': f'Bearer {res_beta.json()["token"]}'}

    # Beta attempts to query Alfa's contract stages
    cross_res = client.get(f'/api/contracts/{t["c1"]}/stages', headers=beta_headers)
    assert cross_res.status_code == 404  # Must be blocked by tenant boundary!
