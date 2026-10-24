from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def test_compose_does_not_publish_postgres_and_binds_web_to_loopback():
    s = (ROOT/'deploy/staging/compose.yaml').read_text()
    assert '127.0.0.1:8080:8080' in s
    db = s.split('\n  db:',1)[1].split('\n  app:',1)[0]
    assert 'ports:' not in db
    assert 'dre_pg_staging:' in s
    assert 'healthcheck:' in db

def test_restore_drill_requires_explicit_acknowledgement_and_no_overwrite():
    s=(ROOT/'deploy/staging/backup_restore_drill.sh').read_text()
    assert 'I_CONFIRM_DISPOSABLE_STAGING' in s
    assert 'Refusing to overwrite backup' in s
    assert 'dre_restore_drill already exists' in s
    assert 'pg_restore --exit-on-error' in s

def test_staging_doc_does_not_claim_production_ready():
    s=(ROOT/'README-RC4.md').read_text()
    assert 'BLOQUEADA' in s
    assert 'Docker Compose' in s
