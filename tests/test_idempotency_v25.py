import uuid
from fastapi.testclient import TestClient
import server

c = TestClient(server.app)

def test_repeated_entry_and_payment_are_once_only():
    suffix=uuid.uuid4().hex[:12]
    server.bootstrap('Teste Idem '+suffix,suffix+'@example.test','Senha Forte Teste 123456')
    token=c.post('/api/login',json={'email':suffix+'@example.test','password':'Senha Forte Teste 123456'}).json()['token']
    h={'Authorization':'Bearer '+token}
    payload={'data':'2026-10-10','descricao':'Teste de repeticao','area':'Civel','tipo':'receita','valor':'200.00'}
    key='entry_'+uuid.uuid4().hex
    h1={**h,'Idempotency-Key':key}
    first=c.post('/api/entries',headers=h1,json=payload)
    again=c.post('/api/entries',headers=h1,json=payload)
    assert first.status_code==again.status_code==201
    assert first.json()==again.json()
    assert len(c.get('/api/entries',headers=h).json())==1
    assert c.post('/api/entries',headers=h1,json={**payload,'valor':'400.00'}).status_code==409
    assert c.post('/api/entries',headers=h,json=payload).status_code==201  # test fixture inserts unique key
    account=c.post('/api/accounts',headers=h,json={'code':'RR','name':'Receita','kind':'receita'}).json()['id']
    bill=c.post('/api/bills',headers=h,json={'account_id':account,'description':'Teste baixa','competence':'2026-10','due_date':'2026-10-10','amount':'150'}).json()['id']
    h2={**h,'Idempotency-Key':'settle_'+uuid.uuid4().hex}
    s={'amount':'75.00','date':'2026-10-12'}
    assert c.post('/api/bills/'+bill+'/settle',headers=h2,json=s).status_code==200
    assert c.post('/api/bills/'+bill+'/settle',headers=h2,json=s).status_code==200
    assert c.post('/api/bills/'+bill+'/settle',headers=h2,json={'amount':'60.00','date':'2026-10-12'}).status_code==409
    movements=[m for m in c.get('/api/cash-movements',headers=h).json() if m['bill_id']==bill]
    assert len(movements)==1 and movements[0]['cents']==7500
    assert c.post('/api/bills/'+bill+'/settle',headers=h,json=s).status_code==200  # new transaction allowed
