"""Optional Fernet encryption for MFA at rest; recovery codes are stored as hashes."""
import os, hashlib, hmac, secrets
from cryptography.fernet import Fernet, InvalidToken
from pathlib import Path
import sqlite3, tempfile
from sqlalchemy import text
from fastapi import HTTPException, Depends
from pydantic import BaseModel, Field

PREFIX='enc:v1:'
def fernet():
    key=os.getenv('DRE_MFA_FERNET_KEY','').strip()
    if not key: return None
    try: return Fernet(key.encode())
    except Exception as e: raise RuntimeError('DRE_MFA_FERNET_KEY invalida') from e

def seal(secret):
    f=fernet()
    if not f: raise RuntimeError('Defina DRE_MFA_FERNET_KEY antes de configurar MFA novo')
    return PREFIX+f.encrypt(secret.encode()).decode()

def unseal(value):
    if value.startswith(PREFIX):
        f=fernet()
        if not f: raise RuntimeError('Chave de MFA ausente: configure DRE_MFA_FERNET_KEY')
        return f.decrypt(value[len(PREFIX):].encode()).decode()
    return value # legacy v1.3; migrate explicitly with migrate_mfa()

def migrate_mfa(db):
    f=fernet()
    if not f: raise RuntimeError('Chave de MFA obrigatoria para migracao')
    with db() as c:
        rows=c.execute(text('SELECT user_id,secret FROM mfa_state')).fetchall()
        n=0
        for uid,value in rows:
            if not value.startswith(PREFIX):
                c.execute(text('UPDATE mfa_state SET secret=:s WHERE user_id=:uid'),{'s':seal(value),'uid':uid});n+=1
    return n

def hash_code(code):
    return hashlib.sha256(code.strip().upper().encode()).hexdigest()

class Recover(BaseModel):
    password: str
    recovery_code: str = Field(min_length=8,max_length=80)

def setup(app, db, auth, verify_password, utc):
    with db() as c:
        c.execute(text('CREATE TABLE IF NOT EXISTS mfa_recovery (user_id VARCHAR(40) NOT NULL, code_hash CHAR(64) NOT NULL, PRIMARY KEY(user_id,code_hash))'))
        c.execute(text('INSERT INTO schema_versions (version,applied_at) SELECT 14,:at WHERE NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=14)'),{'at':utc()})

    class Renew(BaseModel):
        password: str
        code: str = Field(min_length=6,max_length=6)

    @app.post('/api/account/mfa/recovery-codes/renew')
    def renew(p:Renew,u=Depends(auth)):
        from security13 import verify_totp
        import time
        with db() as c:
            pw=c.execute(text('SELECT password_hash FROM users WHERE id=:uid'),{'uid':u['id']}).scalar_one_or_none()
            row=c.execute(text('SELECT secret,enabled FROM mfa_state WHERE user_id=:uid'),{'uid':u['id']}).fetchone()
            if not pw or not verify_password(p.password,pw) or not row or not row[1] or not verify_totp(unseal(row[0]),p.code):
                raise HTTPException(403,'Confirmacao invalida')
            codes=[secrets.token_hex(6).upper() for _ in range(8)]
            c.execute(text('DELETE FROM mfa_recovery WHERE user_id=:uid'),{'uid':u['id']})
            for code in codes:
                c.execute(text('INSERT INTO mfa_recovery VALUES (:uid,:hash)'),{'uid':u['id'],'hash':hash_code(code)})
            c.execute(text('INSERT INTO audit VALUES (:id,:o,:u,:a,:t,:at)'),{'id':secrets.token_hex(16),'o':u['office_id'],'u':u['id'],'a':'mfa_recovery_renewed','t':u['id'],'at':utc()})
        return {'recovery_codes':codes,'warning':'Exibidos uma unica vez. Guarde offline; cada codigo funciona uma vez.'}



def encrypt_backup(source,destination):
    f=fernet()
    if not f: raise RuntimeError('Configure DRE_MFA_FERNET_KEY antes de criptografar backup')
    source=Path(source);destination=Path(destination)
    if not source.is_file():raise ValueError('Backup SQLite inexistente')
    if destination.exists():raise FileExistsError('Destino existente')
    from security13 import backup_restore_check
    backup_restore_check(source)
    destination.parent.mkdir(parents=True,exist_ok=True)
    fd=os.open(str(destination),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    try:
        with os.fdopen(fd,'wb') as out:out.write(f.encrypt(source.read_bytes()))
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return str(destination)

def verify_encrypted_backup(path):
    f=fernet()
    if not f:raise RuntimeError('Configure DRE_MFA_FERNET_KEY')
    payload=f.decrypt(Path(path).read_bytes())
    with tempfile.TemporaryDirectory() as tmp:
        target=Path(tmp)/'verification.sqlite'
        target.write_bytes(payload)
        from security13 import backup_restore_check
        return backup_restore_check(target)
