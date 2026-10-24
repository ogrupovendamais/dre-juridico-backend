"""Pilot TOTP (RFC 6238), session management and backup restore verification.
No secrets are returned to users other than the account owner during explicit setup.
Production deployments require secret encryption at rest, MFA recovery and HTTPS.
"""
import base64, hashlib, hmac, secrets, struct, time, sqlite3
from pathlib import Path
from urllib.parse import quote
from fastapi import Depends, HTTPException, Header
from pydantic import BaseModel, Field
from sqlalchemy import text
from security14 import seal, unseal

def totp(secret, at=None):
    at = int(time.time() if at is None else at)
    key = base64.b32decode(secret + '=' * ((-len(secret)) % 8), casefold=True)
    msg = struct.pack('>Q', at // 30)
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 15
    value = struct.unpack('>I',digest[offset:offset+4])[0] & 0x7fffffff
    return str(value % 1000000).zfill(6)

def verify_totp(secret, code, now=None):
    if not isinstance(code,str) or len(code)!=6 or not code.isascii() or not code.isdecimal():return False
    now = int(time.time() if now is None else now)
    return any(hmac.compare_digest(totp(secret,now+30*d),code) for d in (-1,0,1))

class ConfirmMFA(BaseModel):
    code: str = Field(min_length=6,max_length=6)

class DisableMFA(BaseModel):
    password: str
    code: str = Field(min_length=6,max_length=6)

def setup(app, db, auth, verify_password, utc):
    with db() as c:
        c.execute(text('CREATE TABLE IF NOT EXISTS mfa_state (user_id VARCHAR(40) PRIMARY KEY, secret VARCHAR(80) NOT NULL, enabled INTEGER NOT NULL DEFAULT 0, last_step BIGINT NOT NULL DEFAULT -1)'))
        c.execute(text('CREATE TABLE IF NOT EXISTS schema_versions (version INTEGER PRIMARY KEY, applied_at VARCHAR(40) NOT NULL)'))
        c.execute(text('INSERT INTO schema_versions (version,applied_at) SELECT 13,:date WHERE NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=13)'),{'date':utc()})

    @app.post('/api/account/mfa/setup')
    def mfa_setup(u=Depends(auth)):
        secret=base64.b32encode(secrets.token_bytes(20)).decode().rstrip('=')
        with db() as c:
            current=c.execute(text('SELECT enabled FROM mfa_state WHERE user_id=:uid'),{'uid':u['id']}).fetchone()
            if current and current[0]:raise HTTPException(409,'MFA ja ativado')
            c.execute(text('DELETE FROM mfa_state WHERE user_id=:uid'),{'uid':u['id']})
            c.execute(text('INSERT INTO mfa_state (user_id,secret,enabled,last_step) VALUES (:uid,:s,0,-1)'),{'uid':u['id'],'s':seal(secret)})
        uri='otpauth://totp/'+quote('DRE Juridico:'+u['email'])+'?secret='+secret+'&issuer='+quote('DRE Juridico')+'&digits=6&period=30'
        return {'secret':secret,'otpauth_uri':uri,'warning':'Segredo exibido apenas durante o cadastro. Guarde em local seguro.'}

    @app.post('/api/account/mfa/confirm')
    def mfa_confirm(p:ConfirmMFA,u=Depends(auth)):
        with db() as c:
            row=c.execute(text('SELECT secret,enabled,last_step FROM mfa_state WHERE user_id=:uid'),{'uid':u['id']}).fetchone()
            if not row or row[1]:raise HTTPException(409,'Cadastro MFA indisponivel')
            if not verify_totp(unseal(row[0]),p.code):raise HTTPException(400,'Codigo invalido')
            c.execute(text('UPDATE mfa_state SET enabled=1,last_step=:step WHERE user_id=:uid'),{'step':int(time.time())//30,'uid':u['id']})
            c.execute(text('DELETE FROM sessions WHERE user_id=:uid'),{'uid':u['id']})
        return {'enabled':True,'sessions_revoked':True}

    @app.get('/api/account/mfa/status')
    def mfa_status(u=Depends(auth)):
        with db() as c: r=c.execute(text('SELECT enabled FROM mfa_state WHERE user_id=:uid'),{'uid':u['id']}).fetchone()
        return {'enabled':bool(r and r[0])}

    @app.post('/api/account/mfa/disable')
    def mfa_disable(p:DisableMFA,u=Depends(auth)):
        with db() as c:
            pw=c.execute(text('SELECT password_hash FROM users WHERE id=:uid AND office_id=:office'),{'uid':u['id'],'office':u['office_id']}).scalar_one_or_none()
            r=c.execute(text('SELECT secret,enabled FROM mfa_state WHERE user_id=:uid'),{'uid':u['id']}).fetchone()
            if not pw or not verify_password(p.password,pw) or not r or not r[1] or not verify_totp(unseal(r[0]),p.code):raise HTTPException(403,'Verificacao invalida')
            c.execute(text('DELETE FROM mfa_state WHERE user_id=:uid'),{'uid':u['id']})
            c.execute(text('DELETE FROM sessions WHERE user_id=:uid'),{'uid':u['id']})
            c.execute(text('INSERT INTO audit VALUES (:id,:o,:u,:a,:t,:at)'),{'id':secrets.token_hex(16),'o':u['office_id'],'u':u['id'],'a':'mfa_disabled','t':u['id'],'at':utc()})
        return {'enabled':False,'sessions_revoked':True}

    @app.get('/api/account/sessions')
    def sessions(u=Depends(auth)):
        with db() as c: rows=c.execute(text('SELECT expires FROM sessions WHERE user_id=:uid ORDER BY expires DESC'),{'uid':u['id']}).fetchall()
        return {'active_sessions':len(rows),'expires':[r[0] for r in rows]}

    @app.post('/api/account/sessions/revoke-all')
    def sessions_revoke(u=Depends(auth)):
        with db() as c:c.execute(text('DELETE FROM sessions WHERE user_id=:uid'),{'uid':u['id']})
        return {'ok':True,'sessions_revoked':True}

def backup_restore_check(path):
    """Read-only validation of a copied SQLite backup, without touching the active DB."""
    p=Path(path).resolve()
    if not p.is_file():raise ValueError('Arquivo nao encontrado')
    uri='file:'+quote(str(p))+'?mode=ro'
    c=sqlite3.connect(uri,uri=True)
    try:
        result=c.execute('PRAGMA integrity_check').fetchone()[0]
        if result!='ok':raise ValueError('Falha de integridade: '+str(result))
        tables={r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        missing={'offices','users','sessions','entries'}-tables
        if missing:raise ValueError('Tabelas ausentes: '+', '.join(sorted(missing)))
        return {'integrity':'ok','offices':c.execute('SELECT COUNT(*) FROM offices').fetchone()[0], 'users':c.execute('SELECT COUNT(*) FROM users').fetchone()[0]}
    finally:
        c.close()
