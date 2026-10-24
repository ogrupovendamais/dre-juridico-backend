from test_audit_v18 import client,login,server
from migration_drill19 import drill
from pathlib import Path

def test_entry_create_delete_audit_and_permissions():
    a=server.bootstrap('Office 19','v19-admin@test.local','v19-pass-123456789')
    b=server.bootstrap('Office 19B','v19-adminb@test.local','v19-pass-123456789')
    server.create_user(a,'v19-view@test.local','v19-pass-123456789')
    h=login('v19-admin@test.local','v19-pass-123456789')
    hb=login('v19-adminb@test.local','v19-pass-123456789')
    hv=login('v19-view@test.local','v19-pass-123456789')
    data={'data':'2026-10-17','descricao':'Teste auditoria','area':'Civel','tipo':'receita','valor':'75.50'}
    assert client.post('/api/entries',json=data,headers=hv).status_code==403
    response=client.post('/api/entries',json=data,headers=h)
    assert response.status_code==201,response.text
    uid=response.json()['id']
    assert client.delete('/api/entries/'+uid,headers=hv).status_code==403
    assert client.delete('/api/entries/'+uid,headers=hb).status_code==404
    response=client.delete('/api/entries/'+uid,headers=h)
    assert response.status_code==200,response.text
    events=client.get('/api/audit18',headers=h).json()
    assert any(x['action']=='entry.create' and x['details']['amount_cents']==7550 for x in events)
    assert any(x['action']=='entry.delete' and x['details']['previous_amount_cents']==7550 for x in events)
    assert not any(x['target_id']==uid for x in client.get('/api/audit18',headers=hb).json())
    assert client.get('/api/audit18',headers=hv).status_code==403

def test_offline_migration_drill_does_not_update_source():
    database=Path(server.engine.url.database)
    before=database.read_bytes()
    result=drill(database)
    assert result['result']=='PASS' and result['schema_versions']==[18,19,20,21]
    assert before==database.read_bytes()
