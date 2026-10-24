import os,tempfile
fd,path=tempfile.mkstemp(suffix='.db');os.close(fd)
os.environ['DATABASE_URL']='sqlite:///'+path
from fastapi.testclient import TestClient
import server
from schema19 import apply
client=TestClient(server.app)
def login(mail,pw):
    r=client.post('/api/login',json={'email':mail,'password':pw});assert r.status_code==200,r.text
    return {'Authorization':'Bearer '+r.json()['token']}
def test_finance_audit_tenant_and_version():
    a=server.bootstrap('Pilot A18','adm-a18@demo.test','password-A18-01234')
    b=server.bootstrap('Pilot B18','adm-b18@demo.test','password-B18-01234')
    server.create_user(a,'viewer-a18@demo.test','password-viewer-123')
    ha=login('adm-a18@demo.test','password-A18-01234')
    hb=login('adm-b18@demo.test','password-B18-01234')
    hv=login('viewer-a18@demo.test','password-viewer-123')
    ac=client.post('/api/accounts',json={'code':'A18','name':'Receita de teste','kind':'receita'},headers=ha)
    assert ac.status_code==201,ac.text
    bill=client.post('/api/bills',json={'account_id':ac.json()['id'],'competence':'2026-10','due_date':'2026-10-31','description':'Fatura exemplo','amount':'150.25'},headers=ha)
    assert bill.status_code==201,bill.text
    settle=client.post(f"/api/bills/{bill.json()['id']}/settle",json={'amount':'50.20','date':'2026-10-20'},headers=ha)
    assert settle.status_code==200,settle.text
    trail=client.get('/api/audit18',headers=ha)
    assert trail.status_code==200,trail.text
    lines=trail.json()
    assert any(e['action']=='bill.create' and e['details']['amount_cents']==15025 for e in lines)
    assert any(e['action']=='bill.settle' and e['details']['amount_cents']==5020 for e in lines)
    assert client.get('/api/audit18',headers=hb).json()==[]
    assert client.get('/api/audit18',headers=hv).status_code==403
    csv=client.get('/api/audit18/export.csv',headers=ha)
    assert csv.status_code==200 and 'bill.settle' in csv.text
    assert 'bill.settle' not in client.get('/api/audit18/export.csv',headers=hb).text
    assert client.get('/api/audit18/export.csv',headers=hv).status_code==403
    assert apply(server.db)==[18,19,20,21]
