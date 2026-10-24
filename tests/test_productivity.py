import uuid
from fastapi.testclient import TestClient
import server
c=TestClient(server.app)

def test_productivity_tenant_viewer_and_cost_integrity():
    x=uuid.uuid4().hex[:12]
    a=server.bootstrap('Alpha'+x,x+'a@test.example','senha_super_segura_123')
    b=server.bootstrap('Beta'+x,x+'b@test.example','senha_super_segura_123')
    server.create_user(a,x+'v@test.example','senha_super_segura_123')
    def h(email):
        r=c.post('/api/login',json={'email':email,'password':'senha_super_segura_123'})
        assert r.status_code==200,r.text
        return {'Authorization':'Bearer '+r.json()['token']}
    h1=h(x+'a@test.example'); h2=h(x+'b@test.example');hv=h(x+'v@test.example')
    def create(endpoint,payload):
        r=c.post('/api/'+endpoint,json=payload,headers=h1)
        assert r.status_code==201,(endpoint,r.text)
        return r.json()['id']
    client=create('customers',{'name':'Cliente exemplo'})
    contract=create('contracts',{'customer_id':client,'label':'Contrato Alpha','fee_type':'fixo'})
    account=create('accounts',{'code':'REC-8','name':'Receita','kind':'receita'})
    costacc=create('accounts',{'code':'CUS-8','name':'Custo','kind':'custo'})
    for aid,amount in [(account,'300.00'),(costacc,'50.00')]:
        create('bills',{'account_id':aid,'contract_id':contract,'description':'Título teste','competence':'2026-10','due_date':'2026-10-20','amount':amount})
    pro=create('productivity/professionals',{'name':'Profissional Teste','hourly_cost':'120.00'})
    log={'professional_id':pro,'contract_id':contract,'date':'2026-10-15','minutes':90}
    assert c.post('/api/productivity/worklogs',json=log,headers=hv).status_code==403
    assert c.post('/api/productivity/worklogs',json=log,headers=h2).status_code==422
    r=c.post('/api/productivity/worklogs',json=log,headers=h1)
    assert r.status_code==201,r.text
    assert r.json()['cost_cents']==18000
    d=c.get('/api/productivity?month=2026-10',headers=hv).json()
    item=d['contracts'][0]
    assert item['cost_hours_cents']==18000
    assert item['revenue_titles_cents']==30000
    assert item['candidate_contribution_cents']==12000
    assert item['possible_double_counting'] is True
    assert d['totals']['minutes']==90
    assert c.get('/api/productivity',headers=h2).json()['contracts']==[]
    assert c.get('/api/productivity/professionals',headers=h2).json()==[]
    assert c.post('/api/productivity/professionals',json={'name':'Teste','hourly_cost':'1.001'},headers=h1).status_code==422
    assert c.post('/api/productivity/worklogs',json={**log,'minutes':0},headers=h1).status_code==422
    assert c.get('/api/productivity?month=2026-13',headers=h1).status_code==422
    assert c.get('/api/productivity?month=2026-09',headers=h1).json()['totals']['minutes']==0

    # Test update professional
    r_up = c.put(f'/api/productivity/professionals/{pro}', json={'name': 'Profissional Atualizado', 'hourly_cost': '150.00'}, headers=h1)
    assert r_up.status_code == 200, r_up.text
    assert r_up.json()['name'] == 'Profissional Atualizado'
    assert r_up.json()['hourly_cost_cents'] == 15000

    # Test delete professional with existing worklog (should fail 400)
    r_del_blocked = c.delete(f'/api/productivity/professionals/{pro}', headers=h1)
    assert r_del_blocked.status_code == 400, r_del_blocked.text

    # Test delete worklog
    worklog_id = r.json()['id']
    r_del_work = c.delete(f'/api/productivity/worklogs/{worklog_id}', headers=h1)
    assert r_del_work.status_code == 200, r_del_work.text

    # Test delete professional after worklog deleted (should succeed)
    r_del_ok = c.delete(f'/api/productivity/professionals/{pro}', headers=h1)
    assert r_del_ok.status_code == 200, r_del_ok.text
