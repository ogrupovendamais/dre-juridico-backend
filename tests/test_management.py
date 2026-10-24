import uuid
from fastapi.testclient import TestClient
import server
c=TestClient(server.app)
def test_management_targets_specialties_and_isolation():
  x=uuid.uuid4().hex[:12]; a=server.bootstrap('A'+x,x+'a@example.test','Senha forte 123456');b=server.bootstrap('B'+x,x+'b@example.test','Senha forte 123456');server.create_user(a,x+'v@example.test','Senha forte 123456')
  def hdr(mail):return {'Authorization':'Bearer '+c.post('/api/login',json={'email':mail,'password':'Senha forte 123456'}).json()['token']}
  h=hdr(x+'a@example.test');hv=hdr(x+'v@example.test');hb=hdr(x+'b@example.test')
  def add(path,data):
    r=c.post('/api/'+path,json=data,headers=h);assert r.status_code==201,(path,r.text);return r.json()['id']
  rev=add('accounts',{'code':'1','name':'Receita','kind':'receita'});cost=add('accounts',{'code':'2','name':'Custo','kind':'custo'});cust=add('customers',{'name':'Cliente ficcional'});contract=add('contracts',{'customer_id':cust,'label':'Caso 1','fee_type':'fixo'})
  def bill(kind,amount,month,linked=contract):
    r=c.post('/api/bills',json={'account_id':kind,'contract_id':linked,'description':'Teste','competence':month,'due_date':month+'-10','amount':amount},headers=h);assert r.status_code==201,r.text
  bill(rev,'1000.00','2026-07');bill(rev,'1500.00','2026-08');bill(cost,'400.00','2026-08');bill(cost,'100.00','2026-08',None)
  r=c.post('/api/management/contracts/'+contract+'/specialty',json={'specialty':'Trabalhista'},headers=h);assert r.status_code==200,r.text
  r=c.post('/api/management/targets',json={'month':'2026-08','revenue':'2000.00'},headers=h);assert r.status_code==200,r.text
  data=c.get('/api/management?month=2026-08',headers=hv).json()
  assert data['comparativo']['variacao_receita_pct']==50.0
  assert data['meta']['atingimento_pct']==75.0
  assert data['areas_selecionadas']['Trabalhista']['resultado_parcial_centavos']==110000
  assert data['comparativo']['atual']['resultado_centavos']==100000
  assert data['valores_segretados_total']['sem_area_centavos']==10000
  assert c.post('/api/management/targets',json={'month':'2026-08','revenue':'5'},headers=hv).status_code==403
  assert c.post('/api/management/contracts/'+contract+'/specialty',json={'specialty':'Cível'},headers=hb).status_code==404
  assert c.get('/api/management',headers=hb).json()['meses']=={}
  assert c.post('/api/management/targets',json={'month':'2026-13','revenue':'5'},headers=h).status_code==422
  assert c.post('/api/management/targets',json={'month':'2026-08','revenue':'1.001'},headers=h).status_code==422
