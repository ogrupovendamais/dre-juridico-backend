import uuid
from fastapi.testclient import TestClient
import server
c=TestClient(server.app)
def login(email,password):
    r=c.post('/api/login',json={'email':email,'password':password}); assert r.status_code==200,r.text
    return {'Authorization':'Bearer '+r.json()['token']}
def test_finance_tenants_and_competence():
    tag=uuid.uuid4().hex[:8]
    a=server.bootstrap('Escritorio A '+tag,tag+'a@test.dev','Senha A forte 12345')
    b=server.bootstrap('Escritorio B '+tag,tag+'b@test.dev','Senha B forte 12345')
    server.create_user(a,tag+'v@test.dev','Senha V forte 12345')
    ha=login(tag+'a@test.dev','Senha A forte 12345');hb=login(tag+'b@test.dev','Senha B forte 12345');hv=login(tag+'v@test.dev','Senha V forte 12345')
    account=c.post('/api/accounts',json={'code':'3.01','name':'Honorarios','kind':'receita'},headers=ha).json()['id']
    assert c.post('/api/accounts',json={'code':'3.01','name':'Duplicada','kind':'receita'},headers=ha).status_code==409
    customer=c.post('/api/customers',json={'name':'Pessoa ficticia'},headers=ha).json()['id']
    contract=c.post('/api/contracts',json={'customer_id':customer,'label':'Contrato T','fee_type':'exito'},headers=ha).json()['id']
    assert c.post('/api/contracts',json={'customer_id':customer,'label':'Ataque','fee_type':'fixo'},headers=hb).status_code==422
    bill={'account_id':account,'contract_id':contract,'description':'Honorarios ilustrativos','competence':'2026-10','due_date':'2026-11-15','amount':'1000.00'}
    assert c.post('/api/bills',json=bill,headers=hb).status_code==422
    assert c.post('/api/bills',json=bill,headers=hv).status_code==403
    assert c.post('/api/bills',json={**bill,'amount':'1.234'},headers=ha).status_code==422
    bid=c.post('/api/bills',json=bill,headers=ha);assert bid.status_code==201,bid.text;bid=bid.json()['id']
    assert len(c.get('/api/bills',headers=ha).json())==1
    assert c.get('/api/bills',headers=hb).json()==[]
    assert c.get('/api/bills',headers=hv).status_code==200
    assert c.post(f'/api/bills/{bid}/settle',json={'amount':'100.00','date':'2026-11-20'},headers=hv).status_code==403
    assert c.post(f'/api/bills/{bid}/settle',json={'amount':'100.00','date':'2026-11-20'},headers=hb).status_code==404
    assert c.post(f'/api/bills/{bid}/settle',json={'amount':'1001.00','date':'2026-11-20'},headers=ha).status_code==422
    assert c.post(f'/api/bills/{bid}/settle',json={'amount':'250.00','date':'2026-11-20'},headers=ha).status_code==200
    assert c.get('/api/bills',headers=ha).json()[0]['settled_cents']==25000
    rep=c.get('/api/financial-report',headers=ha).json()
    assert rep['competencias']['2026-10']['receita']==1000
    assert rep['saldos_em_aberto']['receita']==750
    assert c.get('/api/financial-report',headers=hb).json()['competencias']=={}
