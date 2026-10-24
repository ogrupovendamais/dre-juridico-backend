import uuid
from fastapi.testclient import TestClient
import server

c = TestClient(server.app)

def login(email, password):
    r = c.post('/api/login', json={'email': email, 'password': password})
    assert r.status_code == 200, r.text
    return {'Authorization': 'Bearer ' + r.json()['token']}

def test_contract_value_and_cac_integration():
    tag = uuid.uuid4().hex[:8]
    office_id = server.bootstrap('Escritorio Contratos ' + tag, tag + '@test.dev', 'Senha Forte 12345')
    h = login(tag + '@test.dev', 'Senha Forte 12345')

    # 1. Create a customer
    cust_resp = c.post('/api/customers', json={'name': 'Cliente Teste CAC Valor'}, headers=h)
    assert cust_resp.status_code == 201
    cust_id = cust_resp.json()['id']

    # 2. Create contract with contract_value
    contract_data = {
        'customer_id': cust_id,
        'label': 'Contrato Consultoria Empresarial Alpha',
        'fee_type': 'fixo',
        'origin': 'marketing',
        'suborigin': 'Campanha Google Ads',
        'signed_date': '2026-10-22',
        'contract_value': 25000.50
    }
    create_resp = c.post('/api/contracts', json=contract_data, headers=h)
    assert create_resp.status_code == 201
    contract_id = create_resp.json()['id']

    # 3. Retrieve contracts and verify contract_value and contract_value_cents
    list_resp = c.get('/api/contracts', headers=h)
    assert list_resp.status_code == 200
    contracts = list_resp.json()
    created = next((item for item in contracts if item['id'] == contract_id), None)
    assert created is not None
    assert created['contract_value'] == 25000.50
    assert created['contract_value_cents'] == 2500050
    assert created['origin'] == 'marketing'
    assert created['customer_name'] == 'Cliente Teste CAC Valor'

    # 4. Create contract without contract_value (backward compatibility)
    contract_data2 = {
        'customer_id': cust_id,
        'label': 'Contrato Sem Valor Informado',
        'fee_type': 'exito',
        'origin': 'atendimento'
    }
    create_resp2 = c.post('/api/contracts', json=contract_data2, headers=h)
    assert create_resp2.status_code == 201
    contract_id2 = create_resp2.json()['id']

    list_resp2 = c.get('/api/contracts', headers=h)
    assert list_resp2.status_code == 200
    created2 = next((item for item in list_resp2.json() if item['id'] == contract_id2), None)
    assert created2 is not None
    assert created2['contract_value'] == 0.0
    assert created2['contract_value_cents'] == 0
