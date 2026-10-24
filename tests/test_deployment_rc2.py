from cryptography.fernet import Fernet
from deployment_rc2 import inspect_config
from restore_drill_rc2 import run

def test_preflight_fail_closed():
    r=inspect_config({})
    assert not r['all_configured'] and not r['production_approved']
    assert all(x['status']=='blocked' for x in r['checks'])

def test_preflight_does_not_expose_password():
    r=inspect_config({'DATABASE_URL':'postgresql+psycopg://user:very-secret-password@db.internal:5432/dre_test', 'DRE_MFA_FERNET_KEY':Fernet.generate_key().decode(), 'DRE_PUBLIC_URL':'https://dre.example.com', 'DRE_BACKUP_DIR':'/tmp/test-only'})
    assert r['all_configured']
    assert not r['production_approved']
    assert 'very-secret-password' not in str(r)

def test_restore_drill_synthetic(monkeypatch):
    monkeypatch.setenv('DRE_MFA_FERNET_KEY',Fernet.generate_key().decode())
    r=run()
    assert r['isolated_restore']=='ok' and r['encrypted_backup_integrity']=='ok'
    assert r['postgresql_backup_verified'] is False
