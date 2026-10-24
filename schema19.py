"""Additive forward-only schema version 19. No automatic destructive migration."""
import datetime
from sqlalchemy import text
from schema18 import apply as apply18
VERSION=19
def apply(db):
    with db() as c:
        c.execute(text("CREATE TABLE IF NOT EXISTS schema_history (version INTEGER PRIMARY KEY,applied_at VARCHAR(40) NOT NULL,comment VARCHAR(150) NOT NULL)"))
        v=[row[0] for row in c.execute(text("SELECT version FROM schema_history ORDER BY version"))]
    if any(i>VERSION for i in v) and VERSION not in v:raise RuntimeError('Esquema futuro desconhecido; interrompido')
    if 18 not in v: apply18(db)
    with db() as c:
        if not c.execute(text('SELECT 1 FROM schema_history WHERE version=19')).first():
            c.execute(text('INSERT INTO schema_history (version,applied_at,comment) VALUES (19,:t,:d)'),{'t':datetime.datetime.now(datetime.timezone.utc).isoformat(),'d':'Auditoria detalhada para entries; sem alteracao de colunas'})
        return [row[0] for row in c.execute(text('SELECT version FROM schema_history ORDER BY version'))]
