"""Conservative deployment readiness inventory. Does NOT certify production security."""
import os
from sqlalchemy import text

SCHEMA_VERSION=21

def report(db, engine):
    with db() as c:
        versions=[r[0] for r in c.execute(text('SELECT version FROM schema_history ORDER BY version'))]
        orphans=c.execute(text('SELECT COUNT(*) FROM entries e LEFT JOIN offices o ON o.id=e.office_id WHERE o.id IS NULL')).scalar_one()
        orphan_users=c.execute(text('SELECT COUNT(*) FROM users u LEFT JOIN offices o ON o.id=u.office_id WHERE o.id IS NULL')).scalar_one()
        orphan_sessions=c.execute(text('SELECT COUNT(*) FROM sessions s LEFT JOIN users u ON u.id=s.user_id WHERE u.id IS NULL')).scalar_one()
    checks={
      'schema_21_applied':21 in versions and not any(v>21 for v in versions),
      'tenant_references_consistent':not (orphans or orphan_users or orphan_sessions),
      'postgresql_backend':engine.dialect.name=='postgresql',
      'mfa_encryption_key_configured':bool(os.getenv('DRE_MFA_FERNET_KEY')),
      'production_https_verified':False,
      'offsite_backup_restore_verified':False,
      'external_security_audit_completed':False,
      'real_device_e2e_verified':False,
      'accounting_rules_homologated':False
    }
    return {'version':'2.1','production_approved':False,'checks':checks,
       'counts':{'orphan_entries':orphans,'orphan_users':orphan_users,'orphan_sessions':orphan_sessions},
       'notes':'Inventario tecnico local e parcial; campos externos permanecem pendentes, nunca sao inferidos.'}

def setup(app,db,auth,engine):
    from fastapi import Depends,HTTPException
    @app.get('/api/admin/readiness')
    def readiness(u=Depends(auth)):
        if u['role']!='admin':raise HTTPException(403,'Apenas administrador')
        return report(db,engine)

def upgrade(db):
    from datetime import datetime,timezone
    with db() as c:
        versions=[v[0] for v in c.execute(text('SELECT version FROM schema_history ORDER BY version'))]
        if any(v>21 for v in versions):raise RuntimeError('Esquema futuro desconhecido')
        if 20 not in versions:raise RuntimeError('Atualize antes para a versao 20')
        if 21 not in versions:
            c.execute(text('INSERT INTO schema_history (version,applied_at,comment) VALUES (21,:at,:msg)'),
             {'at':datetime.now(timezone.utc).isoformat(),'msg':'Inventario de homologacao, sem alteracao destrutiva'})
