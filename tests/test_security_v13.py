import secrets
import server
from security13 import totp, verify_totp, backup_restore_check
from fastapi.testclient import TestClient

client=TestClient(server.app)

def test_mfa_and_revocation(tmp_path):
    email='mfa-'+secrets.token_hex(5)+'@test.invalid'
    server.bootstrap('MFA test',email,'safe password 12345')
    login=lambda otp=None: client.post('/api/login',json={'email':email,'password':'safe password 12345','otp':otp})
    first=login();assert first.status_code==200
    h={'Authorization':'Bearer '+first.json()['token']}
    setup=client.post('/api/account/mfa/setup',headers=h);assert setup.status_code==200
    secret=setup.json()['secret']
    assert verify_totp(secret,totp(secret))
    assert client.post('/api/account/mfa/confirm',headers=h,json={'code':totp(secret)}).status_code==200
    assert client.get('/api/me',headers=h).status_code==401
    assert login().status_code==401
    # Fresh future step avoids intentional replay prevention.
    from unittest.mock import patch
    from time import time
    future=int(time())+90
    with patch('server.time.time',return_value=future):
        with patch('security13.time.time',return_value=future):
            logged=login(totp(secret,future))
    assert logged.status_code==200,logged.text
    h2={'Authorization':'Bearer '+logged.json()['token']}
    assert client.get('/api/account/sessions',headers=h2).json()['active_sessions']>=1
    assert client.post('/api/account/sessions/revoke-all',headers=h2).status_code==200
    assert client.get('/api/me',headers=h2).status_code==401

def test_backup_check(tmp_path):
    p=tmp_path/'backup.sqlite'
    server.backup_sqlite(p)
    result=backup_restore_check(p)
    assert result['integrity']=='ok' and result['users']>=1
