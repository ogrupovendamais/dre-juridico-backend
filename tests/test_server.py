import os, tempfile
fd,p=tempfile.mkstemp(suffix='.sqlite');os.close(fd)
os.environ['DATABASE_URL']='sqlite:///'+p
from fastapi.testclient import TestClient
import server

client=TestClient(server.app)
def signin(email,pw):
 r=client.post('/api/login',json={'email':email,'password':pw});assert r.status_code==200,r.text
 return {'Authorization':'Bearer '+r.json()['token']}

def test_accounts_and_tenants():
 a=server.bootstrap('Piloto A','a@exemplo.test','senha forte aaa 123');b=server.bootstrap('Piloto B','b@exemplo.test','senha forte bbb 123')
 server.create_user(a,'viewer@exemplo.test','viewer senha 1234')
 ha=signin('a@exemplo.test','senha forte aaa 123');hb=signin('b@exemplo.test','senha forte bbb 123');hv=signin('viewer@exemplo.test','viewer senha 1234')
 payload={'data':'2026-10-17','descricao':'Honorarios de teste','area':'Civel','tipo':'receita','valor':'150.25'}
 r=client.post('/api/entries',json=payload,headers=ha);assert r.status_code==201,r.text;item=r.json()['id']
 assert len(client.get('/api/entries',headers=ha).json())==1
 assert len(client.get('/api/entries',headers=hb).json())==0
 assert len(client.get('/api/entries',headers=hv).json())==1
 assert client.post('/api/entries',json=payload,headers=hv).status_code==403
 assert client.delete('/api/entries/'+item,headers=hv).status_code==403
 assert client.delete('/api/entries/'+item,headers=hb).status_code==404
 assert client.get('/api/summary',headers=ha).json()['receita']==150.25
 assert client.post('/api/entries',json={**payload,'valor':'1.234'},headers=ha).status_code==422
 assert client.post('/api/logout',headers=ha).status_code==200
 assert client.get('/api/entries',headers=ha).status_code==401
 assert client.delete('/api/entries/'+item,headers=hb).status_code==404
 assert client.get('/').status_code==200
