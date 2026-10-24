"""Non-destructive operational preflight for pilot deployments (not a security certification)."""
import datetime
from sqlalchemy import text

EXPECTED_SCHEMA = 20

def status(db, database_url):
    checks = {}
    with db() as c:
        versions = [r[0] for r in c.execute(text('SELECT version FROM schema_history ORDER BY version'))]
        checks['schema_versions'] = versions
        checks['schema_current'] = EXPECTED_SCHEMA in versions and not any(v > 21 for v in versions)
        checks['office_count'] = c.execute(text('SELECT COUNT(*) FROM offices')).scalar_one()
        checks['user_count'] = c.execute(text('SELECT COUNT(*) FROM users')).scalar_one()
        checks['audit_events'] = c.execute(text('SELECT COUNT(*) FROM audit')).scalar_one()
        checks['detailed_events'] = c.execute(text('SELECT COUNT(*) FROM audit_details')).scalar_one()
        checks['orphan_entries'] = c.execute(text('SELECT COUNT(*) FROM entries e LEFT JOIN offices o ON e.office_id=o.id WHERE o.id IS NULL')).scalar_one()
        checks['orphan_sessions'] = c.execute(text('SELECT COUNT(*) FROM sessions s LEFT JOIN users u ON s.user_id=u.id WHERE u.id IS NULL')).scalar_one()
    checks['integrity_pass'] = not checks['orphan_entries'] and not checks['orphan_sessions']
    checks['engine'] = 'sqlite' if database_url.startswith('sqlite') else 'other'
    checks['note'] = 'Conferencia parcial: nao substitui integridade referencial, auditoria externa ou homologacao.'
    return checks

def setup(app, db, auth, database_url):
    from fastapi import Depends, HTTPException
    @app.get('/api/admin/preflight')
    def preflight(u=Depends(auth)):
        if u['role']!='admin':
            raise HTTPException(403,'Apenas administrador')
        return status(db,database_url)

def upgrade(db):
    with db() as c:
        rows=[v[0] for v in c.execute(text('SELECT version FROM schema_history ORDER BY version'))]
        if any(v>21 for v in rows):
            raise RuntimeError('Versao de banco futura desconhecida')
        if 19 not in rows:
            raise RuntimeError('Atualize primeiro para o esquema 19 com backup validado')
        if 20 not in rows:
            c.execute(text('INSERT INTO schema_history (version,applied_at,comment) VALUES (20,:at,:description)'),
                      {'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
                       'description':'Marcador de preflight operacional; sem alteracoes destrutivas'})
