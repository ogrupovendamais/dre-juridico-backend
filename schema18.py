"""Forward-only, additive schema marker; never claim full Alembic migrations."""
import datetime
from sqlalchemy import text
VERSION=18

def status(db):
    with db() as c:
        c.execute(text('CREATE TABLE IF NOT EXISTS schema_history (version INTEGER PRIMARY KEY,applied_at VARCHAR(40) NOT NULL,comment VARCHAR(150) NOT NULL)'))
        return [r[0] for r in c.execute(text('SELECT version FROM schema_history ORDER BY version')).fetchall()]

def apply(db):
    from audit18 import initialize
    existing=status(db)
    if any(v>VERSION for v in existing):raise RuntimeError('Esquema desconhecido mais recente; interrompido')
    initialize(db)
    if VERSION not in existing:
        with db() as c:
            c.execute(text('INSERT INTO schema_history (version,applied_at,comment) VALUES (:v,:at,:comment)'),{'v':VERSION,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'comment':'baseline incremental: audit_details; preservar tabelas legadas'})
    return status(db)
