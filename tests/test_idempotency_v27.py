import uuid
from fastapi.testclient import TestClient
import server

def test_bank_match_and_month_close_replays():
    c=TestClient(server.app)
    x=uuid.uuid4().hex[:12]
    server.bootstrap('V27 '+x,x+'@test.invalid','Senha de exemplo muito forte 123')
    token=c.post('/api/login',json={'email':x+'@test.invalid','password':'Senha de exemplo muito forte 123'}).json()['token']
    h={'Authorization':'Bearer '+token}
    aid=c.post('/api/accounts',headers=h,json={'code':'H'+x,'name':'Honorarios','kind':'receita'}).json()['id']
    bill=c.post('/api/bills',headers=h,json={'account_id':aid,'description':'Contrato piloto','competence':'2026-08','due_date':'2026-08-15','amount':'100.00'}).json()['id']
    assert c.post('/api/bills/'+bill+'/settle',headers=h,json={'amount':'100.00','date':'2026-08-15'}).status_code==200
    raw=b'Data;Valor;Descricao\n15/08/2026;100,00;Honorarios\n'
    assert c.post('/api/bank/import',headers=h,files={'file':('banco.csv',raw,'text/csv')}).status_code==200
    match=c.get('/api/bank/suggestions',headers=h).json()[0]
    key='match_'+uuid.uuid4().hex
    mh={**h,'Idempotency-Key':key}
    assert c.post('/api/bank/match',headers=h,json=match).status_code==428
    first=c.post('/api/bank/match',headers=mh,json=match)
    second=c.post('/api/bank/match',headers=mh,json=match)
    assert first.status_code==200 and second.status_code==200 and first.json()==second.json()
    assert c.post('/api/bank/match',headers=mh,json={**match,'movement_id':'invalid'}).status_code==409
    k='close_'+uuid.uuid4().hex
    ch={**h,'Idempotency-Key':k}
    first=c.post('/api/finance/close',headers=ch,json={'month':'2026-08'})
    second=c.post('/api/finance/close',headers=ch,json={'month':'2026-08'})
    assert first.status_code==200 and second.json()==first.json()
    assert c.post('/api/finance/close',headers=ch,json={'month':'2026-09'}).status_code==409
    assert c.post('/api/finance/close',headers={**h,'Idempotency-Key':'close_'+uuid.uuid4().hex},json={'month':'2026-08'}).status_code==409

def test_browser_keys_bank_routes():
    from pathlib import Path
    js=(Path(__file__).resolve().parents[1]/'web/app.js').read_text()
    assert "url==='/bank/match'" in js and "url==='/finance/close'" in js
