"""Pilot governance: office-scoped users, audit visibility and CSV exports.
This does not constitute immutable or comprehensive accounting audit history.
"""
import csv, io, secrets
from fastapi import Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import text

class NewUser(BaseModel):
    email: str = Field(min_length=5, max_length=180)
    password: str = Field(min_length=12, max_length=200)
    role: str = 'viewer'

def setup(app, db, auth, hash_password, utc):
    def administrator(u=Depends(auth)):
        if u['role'] != 'admin':
            raise HTTPException(403, 'Somente administrador')
        return u

    @app.get('/api/governance/users')
    def users(u=Depends(administrator)):
        with db() as c:
            rows=c.execute(text('SELECT id,email,role FROM users WHERE office_id=:oid ORDER BY email'),{'oid':u['office_id']}).fetchall()
        return [{'id':r[0],'email':r[1],'role':r[2]} for r in rows]

    @app.post('/api/governance/users',status_code=201)
    def create_user(p:NewUser,u=Depends(administrator)):
        if p.role not in ('admin','editor','viewer'):raise HTTPException(422,'Perfil invalido')
        email=p.email.strip().lower()
        if '@' not in email or email.startswith('@') or email.endswith('@'):raise HTTPException(422,'Email invalido')
        uid=secrets.token_hex(12)
        with db() as c:
            if c.execute(text('SELECT 1 FROM users WHERE email=:email'),{'email':email}).first():raise HTTPException(409,'Email ja utilizado')
            c.execute(text('INSERT INTO users (id,office_id,email,password_hash,role) VALUES (:id,:office,:email,:pw,:role)'),{'id':uid,'office':u['office_id'],'email':email,'pw':hash_password(p.password),'role':p.role})
            c.execute(text('INSERT INTO audit VALUES (:id,:office,:user,:action,:target,:at)'),{'id':secrets.token_hex(16),'office':u['office_id'],'user':u['id'],'action':'user_create','target':uid,'at':utc()})
        return {'id':uid,'email':email,'role':p.role}

    @app.get('/api/governance/audit')
    def audit(limit:int=Query(100,ge=1,le=500),u=Depends(administrator)):
        with db() as c:
            rows=c.execute(text('SELECT a.timestamp,a.action,a.target_id,COALESCE(u.email,\'usuario nao encontrado\') FROM audit a LEFT JOIN users u ON u.id=a.user_id AND u.office_id=a.office_id WHERE a.office_id=:office ORDER BY a.timestamp DESC,a.id DESC LIMIT :lim'),{'office':u['office_id'],'lim':limit}).fetchall()
        return [{'timestamp':r[0],'action':r[1],'target_id':r[2],'actor':r[3]} for r in rows]

    @app.get('/api/governance/export/entries.csv')
    def export_entries(u=Depends(administrator)):
        with db() as c:
            rows=c.execute(text('SELECT entry_date,description,area,kind,cents,id FROM entries WHERE office_id=:office ORDER BY entry_date,id'),{'office':u['office_id']}).fetchall()
        buf=io.StringIO();writer=csv.writer(buf);writer.writerow(['data','descricao','area','natureza','valor_reais','id'])
        for day,desc,area,kind,cents,uid in rows:writer.writerow([day,desc,area,kind,f'{cents/100:.2f}',uid])
        return Response(content='\ufeff'+buf.getvalue(),media_type='text/csv; charset=utf-8',headers={'Content-Disposition':'attachment; filename="lancamentos-piloto.csv"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
