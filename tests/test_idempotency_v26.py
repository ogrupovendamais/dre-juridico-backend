import uuid
from fastapi.testclient import TestClient
import server

c=TestClient(server.app)
def test_bill_creation_idempotent_and_scoped():
    suffix=uuid.uuid4().hex[:12]
    server.bootstrap('Escritorio '+suffix,suffix+'@example.test','Senha Forte Teste 123456')
    t=c.post('/api/login',json={'email':suffix+'@example.test','password':'Senha Forte Teste 123456'}).json()['token']
    h={'Authorization':'Bearer '+t}
    account=c.post('/api/accounts',headers=h,json={'code':'H','name':'Honorarios','kind':'receita'}).json()['id']
    payload={'account_id':account,'description':'Parcela A','competence':'2026-10','due_date':'2026-10-15','amount':'300.00'}
    key='bill_'+uuid.uuid4().hex
    idem={**h,'Idempotency-Key':key}
    first=c.post('/api/bills',headers=idem,json=payload)
    replay=c.post('/api/bills',headers=idem,json=payload)
    assert first.status_code==201 and replay.status_code==201
    assert first.json()==replay.json()
    assert len(c.get('/api/bills',headers=h).json())==1
    assert c.post('/api/bills',headers=idem,json={**payload,'amount':'301.00'}).status_code==409
    from conftest import _original_post
    assert _original_post(c,'/api/bills',headers=h,json=payload).status_code==428

def test_frontend_reuse_key_on_network_failure():
    from pathlib import Path
    js=(Path(__file__).resolve().parents[1]/'web/app.js').read_text()
    assert 'pendingFinancialRequests' in js
    assert "url==='/bills'" in js
    assert 'catch(error)' in js
