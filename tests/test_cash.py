import uuid
from fastapi.testclient import TestClient
import server
c=TestClient(server.app)
def test_cash_and_reconciliation():
    key=uuid.uuid4().hex[:9]
    office=server.bootstrap('Teste Caixa '+key,key+'@example.test','Senha Segura ABC 1234')
    other=server.bootstrap('Outra '+key,key+'x@example.test','Senha Segura ABC 1234')
    server.create_user(office,key+'v@example.test','Senha Segura ABC 1234')
    def session(email):
        tok=c.post('/api/login',json={'email':email,'password':'Senha Segura ABC 1234'}).json()['token']
        return {'Authorization':'Bearer '+tok}
    admin=session(key+'@example.test'); viewer=session(key+'v@example.test'); outsider=session(key+'x@example.test')
    acct=c.post('/api/accounts',headers=admin,json={'code':'R1','name':'Honorarios','kind':'receita'}).json()['id']
    bill=c.post('/api/bills',headers=admin,json={'account_id':acct,'description':'Fatura ficticia','competence':'2026-09','due_date':'2026-10-01','amount':'125.50'}).json()['id']
    for amount,date in [('25.50','2026-10-02'),('100.00','2026-11-03')]:
        response=c.post('/api/bills/'+bill+'/settle',headers=admin,json={'amount':amount,'date':date});assert response.status_code==200,response.text
    assert c.post('/api/bills/'+bill+'/settle',headers=admin,json={'amount':'1','date':'2026-11-04'}).status_code==422
    assert c.post('/api/bills/'+bill+'/settle',headers=viewer,json={'amount':'1','date':'2026-11-04'}).status_code==403
    assert c.get('/api/cash-movements',headers=outsider).json()==[]
    report=c.get('/api/cash-report',headers=viewer).json()
    assert report['meses']['2026-10']['receita']==25.5
    assert report['meses']['2026-11']['receita']==100
    check=c.get('/api/reconciliation',headers=admin).json()
    assert check['reconciled'] and check['titles_checked']==1
    assert c.get('/api/reconciliation',headers=outsider).json()['titles_checked']==0
