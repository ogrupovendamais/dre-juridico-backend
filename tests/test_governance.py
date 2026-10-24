import os,tempfile
fd,path=tempfile.mkstemp(suffix='.db');os.close(fd)
os.environ['DATABASE_URL']='sqlite:///'+path
from fastapi.testclient import TestClient
import server
client=TestClient(server.app)

def auth(email,pw):
    r=client.post('/api/login',json={'email':email,'password':pw});assert r.status_code==200,r.text
    return {'Authorization':'Bearer '+r.json()['token']}

def test_governance_scoping_and_csv():
    import secrets
    pfx = secrets.token_hex(4)
    em_a = f'adm-a-{pfx}@demo.test'
    em_b = f'adm-b-{pfx}@demo.test'
    em_v = f'read-a-{pfx}@demo.test'
    em_new = f'new-{pfx}@demo.test'
    a=server.bootstrap('Office A',em_a,'password a123456789')
    b=server.bootstrap('Office B',em_b,'password b123456789')
    server.create_user(a,em_v,'viewer password123')
    aa=auth(em_a,'password a123456789')
    ab=auth(em_b,'password b123456789')
    av=auth(em_v,'viewer password123')
    assert client.get('/api/governance/users',headers=av).status_code==403
    assert client.post('/api/governance/users',json={'email':em_new,'password':'password new123','role':'viewer'},headers=av).status_code==403
    x=client.post('/api/governance/users',json={'email':em_new,'password':'password new123','role':'viewer'},headers=aa)
    assert x.status_code==201,x.text
    assert len(client.get('/api/governance/users',headers=aa).json())==3
    assert len(client.get('/api/governance/users',headers=ab).json())==1
    assert client.post('/api/governance/users',json={'email':em_new,'password':'password new123','role':'viewer'},headers=aa).status_code==409
    e={'data':'2026-09-15','descricao':'Lancamento teste','area':'Civel','tipo':'receita','valor':'150.25'}
    assert client.post('/api/entries',json=e,headers=aa).status_code==201
    a_csv=client.get('/api/governance/export/entries.csv',headers=aa)
    b_csv=client.get('/api/governance/export/entries.csv',headers=ab)
    assert a_csv.status_code==200 and 'Lancamento teste' in a_csv.text
    assert 'Lancamento teste' not in b_csv.text
    assert client.get('/api/governance/export/entries.csv',headers=av).status_code==403
    events=client.get('/api/governance/audit',headers=aa).json()
    assert any(item['action']=='user_create' for item in events)
    assert all(item['actor']!='adm-b@demo.test' for item in events)
    assert client.get('/api/governance/audit?limit=501',headers=aa).status_code==422
