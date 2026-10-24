"""Fresh synthetic tenant end-to-end verification; no real client information."""
import uuid
from test_server import client, signin, server
from readiness21 import upgrade

def test_readiness_permissions_and_schema():
    tag=uuid.uuid4().hex[:8]
    a=server.bootstrap('Pilot A '+tag,tag+'a@piloto.test','Senha forte teste 1234')
    b=server.bootstrap('Pilot B '+tag,tag+'b@piloto.test','Senha forte teste 1234')
    server.create_user(a,tag+'view@piloto.test','Senha forte teste 1234')
    ha=signin(tag+'a@piloto.test','Senha forte teste 1234')
    hb=signin(tag+'b@piloto.test','Senha forte teste 1234')
    hv=signin(tag+'view@piloto.test','Senha forte teste 1234')
    assert client.get('/api/admin/readiness').status_code==401
    assert client.get('/api/admin/readiness',headers=hv).status_code==403
    status=client.get('/api/admin/readiness',headers=ha)
    assert status.status_code==200,status.text
    doc=status.json()
    assert doc['checks']['schema_21_applied']
    assert doc['production_approved'] is False
    assert doc['checks']['production_https_verified'] is False
    upgrade(server.db)
    from sqlalchemy import text
    with server.db() as c:
        assert c.execute(text('SELECT COUNT(*) FROM schema_history WHERE version=21')).scalar_one()==1
    # Full flow: account > customer > contract > receivable > partial settlement > cash by month.
    acct=client.post('/api/accounts',headers=ha,json={'code':'3.05','name':'Honorarios piloto','kind':'receita'})
    assert acct.status_code==201,acct.text
    acct_id=acct.json()['id']
    customer=client.post('/api/customers',headers=ha,json={'name':'Cliente ficticio '+tag})
    assert customer.status_code==201,customer.text
    contract=client.post('/api/contracts',headers=ha,json={'customer_id':customer.json()['id'],'label':'Piloto '+tag,'fee_type':'fixo'})
    assert contract.status_code==201,contract.text
    payload={'account_id':acct_id,'contract_id':contract.json()['id'],'description':'Honorarios teste e2e','competence':'2026-09','due_date':'2026-10-20','amount':'1200.00'}
    assert client.post('/api/bills',headers=hv,json=payload).status_code==403
    assert client.post('/api/bills',headers=hb,json=payload).status_code==422
    bill=client.post('/api/bills',headers=ha,json=payload)
    assert bill.status_code==201,bill.text
    bill_id=bill.json()['id']
    settle=client.post(f'/api/bills/{bill_id}/settle',headers=ha,json={'amount':'450.00','date':'2026-10-21'})
    assert settle.status_code==200,settle.text
    assert client.post(f'/api/bills/{bill_id}/settle',headers=hv,json={'amount':'50.00','date':'2026-10-21'}).status_code==403
    assert client.get('/api/financial-report',headers=hb).json()['competencias']=={}
    report=client.get('/api/financial-report',headers=ha).json()
    assert report['competencias']['2026-09']['receita']==1200
    assert report['saldos_em_aberto']['receita']==750
    cash=client.get('/api/cash-report',headers=ha).json()
    assert cash['meses']['2026-10']['receita']==450
    assert cash['titulos_com_divergencia']==0
    assert client.get('/api/cash-movements',headers=hb).json()==[]
    assert client.get('/api/reconciliation',headers=ha).json()['reconciled']
    assert len(client.get('/api/bills',headers=hv).json())==1
