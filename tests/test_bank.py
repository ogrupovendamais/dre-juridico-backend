import uuid
from fastapi.testclient import TestClient
import server
c=TestClient(server.app)
def test_bank_reconciliation_and_close():
    x=uuid.uuid4().hex[:12]
    office=server.bootstrap('Bank '+x,x+'@test.invalid','Uma senha de teste longa 123')
    other=server.bootstrap('Other '+x,x+'other@test.invalid','Uma senha de teste longa 123')
    server.create_user(office,x+'viewer@test.invalid','Uma senha de teste longa 123')
    def header(email):
        token=c.post('/api/login',json={'email':email,'password':'Uma senha de teste longa 123'}).json()['token']
        return {'Authorization':'Bearer '+token}
    a=header(x+'@test.invalid');v=header(x+'viewer@test.invalid');o=header(x+'other@test.invalid')
    account=c.post('/api/accounts',headers=a,json={'code':'R'+x,'name':'Honorarios','kind':'receita'}).json()['id']
    bill=c.post('/api/bills',headers=a,json={'account_id':account,'description':'Honorarios','competence':'2026-10','due_date':'2026-10-10','amount':'125.50'}).json()['id']
    assert c.post('/api/bills/'+bill+'/settle',headers=a,json={'amount':'125.50','date':'2026-10-10'}).status_code==200
    csv=b'Data;Valor;Descricao\n10/10/2026;125,50;Honorarios\n'
    def upload(headers=a):return c.post('/api/bank/import',headers=headers,files={'file':('banco.csv',csv,'text/csv')})
    assert upload(v).status_code==403
    assert upload().json()['inserted']==1
    assert upload().json()['duplicates_skipped']==1
    assert c.get('/api/bank/rows',headers=o).json()==[]
    rows=c.get('/api/bank/rows',headers=a).json();assert len(rows)==1
    suggested=c.get('/api/bank/suggestions',headers=a).json();assert len(suggested)==1
    assert c.post('/api/bank/match',headers=v,json=suggested[0]).status_code==403
    match=c.post('/api/bank/match',headers={**a,'Idempotency-Key':'match_'+uuid.uuid4().hex},json=suggested[0]);assert match.status_code==200,match.text
    assert c.post('/api/bank/match',headers={**a,'Idempotency-Key':'match_'+uuid.uuid4().hex},json=suggested[0]).status_code in (409,422)
    assert c.get('/api/bank/status',headers=a).json()['months'][0]['pending']==0
    assert c.post('/api/finance/close',headers=v,json={'month':'2026-10'}).status_code==403
    r=c.post('/api/finance/close',headers={**a,'Idempotency-Key':'close_'+uuid.uuid4().hex},json={'month':'2026-10'});assert r.status_code==200,r.text
    assert upload().status_code==409
    assert c.post('/api/bills/'+bill+'/settle',headers=a,json={'amount':'1','date':'2026-10-10'}).status_code==409
