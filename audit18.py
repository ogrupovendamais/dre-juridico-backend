"""Extended, tenant-scoped audit trail. Operational history, NOT tamper-proof ledger."""
import json, secrets
from fastapi import Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import text
import csv, io

def initialize(db):
    with db() as c:
        c.execute(text('CREATE TABLE IF NOT EXISTS audit_details (id VARCHAR(40) PRIMARY KEY,office_id VARCHAR(40) NOT NULL,user_id VARCHAR(40) NOT NULL,action VARCHAR(80) NOT NULL,target_id VARCHAR(40) NOT NULL,details_json TEXT NOT NULL,timestamp VARCHAR(40) NOT NULL)'))
        c.execute(text('CREATE INDEX IF NOT EXISTS ix_audit_details_office_time ON audit_details (office_id,timestamp)'))

def record(c,u,action,target,details,utc):
    """Call inside the same transaction as business changes; no secrets in details."""
    c.execute(text('INSERT INTO audit_details (id,office_id,user_id,action,target_id,details_json,timestamp) VALUES (:id,:o,:u,:a,:t,:d,:at)'), {'id':secrets.token_hex(16),'o':u['office_id'],'u':u['id'],'a':action,'t':target,'d':json.dumps(details,sort_keys=True,ensure_ascii=False),'at':utc()})

def setup(app,db,auth,utc):
    initialize(db)
    def admin(u=Depends(auth)):
        if u['role']!='admin':raise HTTPException(403,'Apenas administrador')
        return u
    @app.get('/api/audit18')
    def read(limit:int=Query(100,ge=1,le=500),u=Depends(admin)):
        with db() as c:
            rows=c.execute(text('SELECT d.timestamp,d.action,d.target_id,d.details_json,COALESCE(u.email,\'usuario nao encontrado\') FROM audit_details d LEFT JOIN users u ON u.id=d.user_id AND u.office_id=d.office_id WHERE d.office_id=:o ORDER BY d.timestamp DESC,d.id DESC LIMIT :n'),{'o':u['office_id'],'n':limit}).fetchall()
        return [{'timestamp':r[0],'action':r[1],'target_id':r[2],'details':json.loads(r[3]),'actor':r[4]} for r in rows]
    @app.get('/api/audit18/export.csv')
    def export(u=Depends(admin)):
        with db() as c:
            rows=c.execute(text('SELECT timestamp,action,target_id,details_json,user_id FROM audit_details WHERE office_id=:o ORDER BY timestamp,id'),{'o':u['office_id']}).fetchall()
        buf=io.StringIO();wr=csv.writer(buf);wr.writerow(['timestamp','action','target_id','details_json','user_id'])
        wr.writerows(rows)
        return Response(content='\ufeff'+buf.getvalue(),media_type='text/csv; charset=utf-8',headers={'Content-Disposition':'attachment; filename="auditoria-operacional.csv"','Cache-Control':'no-store'})
