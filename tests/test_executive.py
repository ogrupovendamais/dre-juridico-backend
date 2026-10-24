import uuid
from fastapi.testclient import TestClient
import server
c=TestClient(server.app)
def test_executive_readonly_isolation():
 t=uuid.uuid4().hex[:10]; a=server.bootstrap('Escritorio '+t,t+'a@test.dev','senha forte 123456'); b=server.bootstrap('Outro '+t,t+'b@test.dev','senha forte 123456');server.create_user(a,t+'v@test.dev','senha forte 123456')
 def login(e):return {'Authorization':'Bearer '+c.post('/api/login',json={'email':e,'password':'senha forte 123456'}).json()['token']}
 ha=login(t+'a@test.dev');hb=login(t+'b@test.dev');hv=login(t+'v@test.dev')
 def acct(code,kind):return c.post('/api/accounts',json={'code':code,'name':'Conta '+code,'kind':kind},headers=ha).json()['id']
 rev=acct('1','receita');cost=acct('2','custo');trans=acct('3','transitoria')
 cust=c.post('/api/customers',json={'name':'Cliente teste'},headers=ha).json()['id'];contract=c.post('/api/contracts',json={'customer_id':cust,'label':'Caso teste','fee_type':'exito'},headers=ha).json()['id']
 def bill(account,amount,contract_id=None):return c.post('/api/bills',json={'account_id':account,'contract_id':contract_id,'description':'Lancamento teste','competence':'2026-08','due_date':'2026-09-15','amount':amount},headers=ha).json()['id']
 fixed=bill(rev,'1000.00');bill(rev,'500.00',contract);bill(cost,'200.00');bill(trans,'300.00')
 assert c.post('/api/bills/'+fixed+'/settle',json={'amount':'400.00','date':'2026-09-22'},headers=ha).status_code==200
 r=c.get('/api/executive?month=2026-08',headers=hv); assert r.status_code==200,r.text;x=r.json();m=x['resumo_competencia'];assert m['receita_centavos']==100000;assert m['custo_centavos']==20000;assert m['resultado_indicativo_centavos']==80000;assert m['transitoria_centavos']==30000;assert m['honorarios_condicionais_centavos']==50000
 assert c.get('/api/executive?month=2026-09',headers=ha).json()['resumo_caixa']['entradas_centavos']==40000
 assert c.get('/api/executive',headers=hb).json()['competencias']=={}
 assert c.get('/api/executive?month=outubro',headers=ha).status_code==422
 assert c.post('/api/accounts',json={'code':'9','name':'Novo','kind':'receita'},headers=hv).status_code==403
