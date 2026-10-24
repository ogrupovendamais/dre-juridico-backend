import secrets
from pathlib import Path
import server
from security13 import totp
from security14 import PREFIX, encrypt_backup, verify_encrypted_backup
from fastapi.testclient import TestClient
from sqlalchemy import text

client=TestClient(server.app)

def test_encrypted_mfa_recovery_and_backup(tmp_path):
    email='mfa14-'+secrets.token_hex(5)+'@test.invalid'
    server.bootstrap('MFA14',email,'strong password 2026')
    def login(otp=None):return client.post('/api/login',json={'email':email,'password':'strong password 2026','otp':otp})
    first=login();assert first.status_code==200,first.text
    h={'Authorization':'Bearer '+first.json()['token']}
    setup=client.post('/api/account/mfa/setup',headers=h);assert setup.status_code==200,setup.text
    secret=setup.json()['secret']
    with server.db() as db:
        stored=db.execute(text('SELECT secret FROM mfa_state WHERE user_id=(SELECT id FROM users WHERE email=:email)'),{'email':email}).scalar_one()
    assert stored.startswith(PREFIX) and secret not in stored
    confirmed=client.post('/api/account/mfa/confirm',headers=h,json={'code':totp(secret)})
    assert confirmed.status_code==200,confirmed.text
    from unittest.mock import patch
    import time
    future=int(time.time())+90
    with patch('server.time.time',return_value=future):
        assert login(totp(secret,future)).status_code==200
        new_session=login(totp(secret,future))
        # same TOTP must fail replay; the preceding login already used that step
        assert new_session.status_code==401
    future2=future+90
    with patch('server.time.time',return_value=future2):
        valid=login(totp(secret,future2))
    assert valid.status_code==200,valid.text
    h2={'Authorization':'Bearer '+valid.json()['token']}
    with patch('security13.time.time',return_value=future2):
        renewed=client.post('/api/account/mfa/recovery-codes/renew',headers=h2,json={'password':'strong password 2026','code':totp(secret,future2)})
    assert renewed.status_code==200,renewed.text
    recovery=renewed.json()['recovery_codes'][0]
    recovered=login(recovery);assert recovered.status_code==200,recovered.text
    assert login(recovery).status_code==401
    raw=tmp_path/'original.sqlite';server.backup_sqlite(raw)
    encrypted=tmp_path/'protected.enc';encrypt_backup(raw,encrypted)
    assert b'SQLite format 3' not in encrypted.read_bytes()
    assert verify_encrypted_backup(encrypted)['integrity']=='ok'
