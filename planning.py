"""v0.9 operational planning: capacity and opt-in allocation previews; no posting to DRE."""
import re, secrets
from decimal import Decimal
from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

def setup(app, db, auth, editor, utc):
    with db() as c:
        c.execute(text('CREATE TABLE IF NOT EXISTS monthly_capacity (id VARCHAR(40) PRIMARY KEY, office_id VARCHAR(40) NOT NULL, professional_id VARCHAR(40) NOT NULL, month VARCHAR(7) NOT NULL, available_minutes BIGINT NOT NULL, created_at VARCHAR(40) NOT NULL, UNIQUE(office_id,professional_id,month))'))
        c.execute(text('CREATE TABLE IF NOT EXISTS overhead_pools (id VARCHAR(40) PRIMARY KEY, office_id VARCHAR(40) NOT NULL, month VARCHAR(7) NOT NULL, label VARCHAR(160) NOT NULL, amount_cents BIGINT NOT NULL, basis VARCHAR(30) NOT NULL, source_note VARCHAR(250) NOT NULL, created_at VARCHAR(40) NOT NULL)'))
    def valid_month(month):
        if not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', month): raise HTTPException(422,'Mês inválido (AAAA-MM)')
    def log(c,u,action,target):
        c.execute(text('INSERT INTO audit VALUES (:id,:o,:u,:a,:t,:at)'),{'id':secrets.token_hex(16),'o':u['office_id'],'u':u['id'],'a':action,'t':target,'at':utc()})
    class Capacity(BaseModel):
        professional_id:str
        month:str
        available_minutes:int=Field(gt=0,le=44640)
    class Pool(BaseModel):
        month:str
        label:str=Field(min_length=2,max_length=160)
        amount:Decimal=Field(gt=0)
        basis:str
        source_note:str=Field(min_length=5,max_length=250)
    @app.post('/api/planning/capacity',status_code=201)
    def set_capacity(x:Capacity,u=Depends(editor)):
        valid_month(x.month)
        with db() as c:
            if not c.execute(text('SELECT 1 FROM professionals WHERE id=:p AND office_id=:o'),{'p':x.professional_id,'o':u['office_id']}).first():raise HTTPException(422,'Profissional não pertence ao escritório')
            existing=c.execute(text('SELECT id FROM monthly_capacity WHERE office_id=:o AND professional_id=:p AND month=:m'),{'o':u['office_id'],'p':x.professional_id,'m':x.month}).first()
            ident=existing[0] if existing else secrets.token_hex(16)
            if existing:
                c.execute(text('UPDATE monthly_capacity SET available_minutes=:v WHERE id=:id AND office_id=:o'),{'v':x.available_minutes,'id':ident,'o':u['office_id']})
            else:
                c.execute(text('INSERT INTO monthly_capacity VALUES (:id,:o,:p,:m,:v,:at)'),{'id':ident,'o':u['office_id'],'p':x.professional_id,'m':x.month,'v':x.available_minutes,'at':utc()})
            log(c,u,'capacity.upsert',ident)
        return {'id':ident}
    @app.post('/api/planning/overhead',status_code=201)
    def add_pool(x:Pool,u=Depends(editor)):
        valid_month(x.month)
        if x.basis!='minutes_logged':raise HTTPException(422,'Única base disponível nesta versão: minutes_logged')
        value=x.amount*100
        if not value.is_finite() or value!=value.to_integral_value() or value>100_000_000_000:raise HTTPException(422,'Valor monetário inválido')
        ident=secrets.token_hex(16)
        with db() as c:
            c.execute(text('INSERT INTO overhead_pools VALUES (:id,:o,:m,:l,:v,:b,:s,:at)'),{'id':ident,'o':u['office_id'],'m':x.month,'l':x.label.strip(),'v':int(value),'b':x.basis,'s':x.source_note.strip(),'at':utc()})
            log(c,u,'overhead.create',ident)
        return {'id':ident}
    @app.get('/api/planning')
    def report(month:str,u=Depends(auth)):
        valid_month(month)
        with db() as c:
            cap=c.execute(text('SELECT p.id,p.name,mc.available_minutes FROM professionals p LEFT JOIN monthly_capacity mc ON mc.professional_id=p.id AND mc.office_id=p.office_id AND mc.month=:m WHERE p.office_id=:o ORDER BY p.name'),{'o':u['office_id'],'m':month}).fetchall()
            hours=c.execute(text("SELECT professional_id, SUM(minutes) FROM worklogs WHERE office_id=:o AND (status IS NULL OR status='APPROVED') AND work_date>=:a AND work_date<:b GROUP BY professional_id"),{'o':u['office_id'],'a':month+'-01','b':f'{int(month[:4])+(month[5:] == "12"):04}-{(int(month[5:])%12)+1:02}-01'}).fetchall()
            contract_hours=c.execute(text("SELECT w.contract_id,co.label,SUM(w.minutes) FROM worklogs w JOIN contracts co ON co.id=w.contract_id AND co.office_id=w.office_id WHERE w.office_id=:o AND (w.status IS NULL OR w.status='APPROVED') AND w.work_date>=:a AND w.work_date<:b GROUP BY w.contract_id,co.label ORDER BY co.label"),{'o':u['office_id'],'a':month+'-01','b':f'{int(month[:4])+(month[5:] == "12"):04}-{(int(month[5:])%12)+1:02}-01'}).fetchall()
            pools=c.execute(text('SELECT id,label,amount_cents,basis,source_note FROM overhead_pools WHERE office_id=:o AND month=:m ORDER BY label,id'),{'o':u['office_id'],'m':month}).fetchall()
        worked=dict(hours)
        people=[{'professional_id':pid,'name':name,'available_minutes':avail,'logged_minutes':worked.get(pid,0),'utilization_pct':round(100*worked.get(pid,0)/avail,2) if avail else None,'over_capacity':bool(avail is not None and worked.get(pid,0)>avail)} for pid,name,avail in cap]
        total=sum(r[2] for r in contract_hours)
        allocations=[]
        for ident,label,amount,basis,source in pools:
            parts=[];distributed=0
            if total:
                for i,(contract,name,minutes) in enumerate(contract_hours):
                    # Deterministic last-row remainder; sum allocations == pool cents.
                    share=(amount*minutes//total) if i<len(contract_hours)-1 else amount-distributed
                    distributed+=share
                    parts.append({'contract_id':contract,'contract':name,'logged_minutes':minutes,'allocated_cents':share})
            allocations.append({'pool_id':ident,'label':label,'amount_cents':amount,'source_note':source,'basis':basis,'status':'SIMULATION_ONLY' if total else 'NO_ALLOCATION_BASIS','unallocated_cents':0 if total else amount,'allocations':parts})
        return {'month':month,'professionals':people,'pools':allocations,'logged_minutes_total':total,'warnings':['Rateio é simulação opcional: nenhum valor é lançado na DRE ou somado aos custos históricos.','O usuário deve documentar se cada pool já existe nos títulos para evitar dupla contagem.','Utilização compara minutos declarados a capacidade informada; não mede eficiência, qualidade nem horas faturáveis.','Rateio por minutos registrados não demonstra causalidade de custos; contratos sem horas não recebem parcela.']}
