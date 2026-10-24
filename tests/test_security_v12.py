import sqlite3
from pathlib import Path
import server
from fastapi.testclient import TestClient

client=TestClient(server.app)

def test_rate_limit_and_operator_recovery(tmp_path):
    email='recover-v12@demo.test'
    office=server.bootstrap('V12 Pilot',email,'original secret 123')
    for n in range(4):
        assert client.post('/api/login',json={'email':email,'password':'wrong'}).status_code==401
    res=client.post('/api/login',json={'email':email,'password':'wrong'})
    assert res.status_code==429
    assert int(res.headers['Retry-After'])>0
    assert client.post('/api/login',json={'email':email,'password':'original secret 123'}).status_code==429
    server.reset_password_cli(email,'another secret 123')
    ok=client.post('/api/login',json={'email':email,'password':'another secret 123'})
    assert ok.status_code==200
    token=ok.json()['token']
    assert client.get('/api/me',headers={'Authorization':'Bearer '+token}).status_code==200
    server.reset_password_cli(email,'third secret 12345')
    assert client.get('/api/me',headers={'Authorization':'Bearer '+token}).status_code==401
    with server.db() as c:
        actions=c.execute(server.text('SELECT action FROM audit WHERE office_id=:o'),{'o':office}).scalars().all()
    assert actions.count('operator_password_reset')==2

def test_sqlite_backup_integrity(tmp_path):
    dest=tmp_path/'restricted'/'pilot-backup.sqlite'
    result=server.backup_sqlite(str(dest))
    assert Path(result)==dest
    with sqlite3.connect(dest) as c:
        assert c.execute('pragma integrity_check').fetchone()[0]=='ok'
        assert c.execute('select count(*) from offices').fetchone()[0]>=1
    import os
    if os.name=='posix':assert (dest.stat().st_mode & 0o077)==0
    try:server.backup_sqlite(str(dest))
    except FileExistsError:pass
    else:assert False,'backup must not overwrite'
