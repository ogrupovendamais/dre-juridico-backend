"""v0.5: assisted bank statement import and explicit manual one-to-one matching."""
import csv, io, secrets, hashlib, datetime, re, xml.etree.ElementTree as ET
from decimal import Decimal, InvalidOperation
from fastapi import Depends, HTTPException, UploadFile, File, Header
from pydantic import BaseModel
from sqlalchemy import text

def parse_money(s):
    s=str(s).strip().replace('R$','').replace(' ','')
    if ',' in s: s=s.replace('.','').replace(',','.')
    elif s.count('.')>1: s=s.replace('.','')
    try: n=Decimal(s)*100
    except InvalidOperation: raise ValueError('valor invalido')
    if not n.is_finite() or n != n.to_integral_value() or n==0 or abs(n)>100000000000:raise ValueError('valor invalido')
    return int(n)

def parse_date(s):
    s=str(s).strip()
    for fmt in ('%Y-%m-%d','%d/%m/%Y','%d-%m-%Y','%Y%m%d'):
        try:return datetime.datetime.strptime(s[:10],fmt).date().isoformat()
        except ValueError:pass
    raise ValueError('data invalida')

def statement_rows(data, filename):
    if len(data)>2_000_000: raise ValueError('arquivo maior que 2 MB')
    if filename.lower().endswith('.csv'):
        decoded=None
        for codec in ('utf-8-sig','cp1252'):
            try:decoded=data.decode(codec);break
            except UnicodeDecodeError:continue
        if decoded is None:raise ValueError('codificacao nao suportada')
        sniffer=csv.Sniffer()
        delimiter=';' if decoded.splitlines()[0].count(';')>decoded.splitlines()[0].count(',') else ','
        r=csv.DictReader(io.StringIO(decoded),delimiter=delimiter)
        heads={re.sub(r'[^a-z]','',k.lower()):k for k in (r.fieldnames or [])}
        def field(*aliases):
            for a in aliases:
                if a in heads:return heads[a]
            return None
        d=field('data','date','dtmovimento');v=field('valor','value','amount');desc=field('descricao','description','historico','memo')
        if not d or not v:raise ValueError('colunas data e valor obrigatorias')
        output=[]
        for line,row in enumerate(r,2):
            if not any(row.values()):continue
            try:output.append((parse_date(row[d]),parse_money(row[v]),str(row.get(desc,'') or '')[:250],f'csv:{line}'))
            except (ValueError,KeyError) as ex:raise ValueError(f'linha {line}: {ex}')
        return output
    if filename.lower().endswith('.ofx'):
        body=data.decode('cp1252',errors='replace')
        parts=re.findall(r'<STMTTRN>(.*?)(?:</STMTTRN>|(?=<STMTTRN>)|\Z)',body,flags=re.I|re.S)
        if not parts:raise ValueError('OFX sem transacoes STMTTRN')
        result=[]
        def tag(part,name):
            m=re.search(r'<'+name+r'>\s*([^<\r\n]+)',part,re.I)
            return m.group(1).strip() if m else ''
        for idx,p in enumerate(parts,1):
            date=tag(p,'DTPOSTED')[:8]; val=tag(p,'TRNAMT')
            result.append((parse_date(date),parse_money(val),(tag(p,'MEMO') or tag(p,'NAME'))[:250], 'ofx:'+str(idx)))
        return result
    raise ValueError('Use CSV ou OFX')

class Match(BaseModel):
    statement_id:str
    movement_id:str

class Close(BaseModel):
    month:str

def setup(app,db,auth,editor,utc):
    from idempotency25 import reserve as idem_reserve, finish as idem_finish
    with db() as c:
        c.execute(text('CREATE TABLE IF NOT EXISTS bank_rows (id VARCHAR(40) PRIMARY KEY,office_id VARCHAR(40) NOT NULL,source VARCHAR(180) NOT NULL,line VARCHAR(25) NOT NULL,posted VARCHAR(10) NOT NULL,cents BIGINT NOT NULL,description VARCHAR(250),fingerprint CHAR(64) NOT NULL,matched_movement VARCHAR(40),UNIQUE(office_id,fingerprint))'))
        c.execute(text('CREATE TABLE IF NOT EXISTS finance_closures (office_id VARCHAR(40) NOT NULL,month VARCHAR(7) NOT NULL,closed_by VARCHAR(40) NOT NULL,closed_at VARCHAR(40) NOT NULL,PRIMARY KEY (office_id,month))'))
    with db() as c:
        # At most one statement row can claim any given movement inside an office.
        c.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS ux_bank_match_once ON bank_rows(office_id,matched_movement)'))
    def assert_open(c, office, date):
        if c.execute(text('SELECT 1 FROM finance_closures WHERE office_id=:o AND month=:m'),{'o':office,'m':date[:7]}).first():raise HTTPException(409,'Periodo fechado: operacao bloqueada')
    @app.post('/api/bank/import')
    async def import_bank(file:UploadFile=File(...),u=Depends(editor)):
        name=(file.filename or '')[:160]
        if not name.lower().endswith(('.csv','.ofx')):raise HTTPException(422,'Formato nao suportado')
        raw=await file.read(2_000_001)
        try:parsed=statement_rows(raw,name)
        except ValueError as exc:raise HTTPException(422,str(exc))
        if len(parsed)>5000:raise HTTPException(422,'Limite de 5000 linhas')
        inserted=0;skipped=0
        with db() as c:
            for date,value,description,line in parsed:
                assert_open(c,u['office_id'],date)
                # Same file bytes and line or OFX transaction position: idempotent re-upload.
                fingerprint=hashlib.sha256((hashlib.sha256(raw).hexdigest()+'|'+line).encode()).hexdigest()
                if c.execute(text('SELECT 1 FROM bank_rows WHERE office_id=:o AND fingerprint=:f'),{'o':u['office_id'],'f':fingerprint}).first():skipped+=1;continue
                c.execute(text('INSERT INTO bank_rows VALUES (:id,:o,:source,:line,:date,:value,:desc,:fp,NULL)'),{'id':secrets.token_hex(16),'o':u['office_id'],'source':name,'line':line,'date':date,'value':value,'desc':description,'fp':fingerprint})
                inserted+=1
        return {'inserted':inserted,'duplicates_skipped':skipped,'imported_not_reconciled':True}
    @app.get('/api/bank/rows')
    def bank_rows(u=Depends(auth)):
        with db() as c:
            rows=c.execute(text('SELECT id,posted,cents,description,source,matched_movement FROM bank_rows WHERE office_id=:o ORDER BY posted DESC,id DESC LIMIT 3000'),{'o':u['office_id']}).fetchall()
        return [dict(zip(('id','date','cents','description','source','matched_movement'),r)) for r in rows]
    @app.get('/api/bank/suggestions')
    def suggestions(u=Depends(auth)):
        with db() as c:
            rows=c.execute(text('SELECT b.id,m.id FROM bank_rows b JOIN cash_movements m ON m.office_id=b.office_id AND m.movement_date=b.posted AND ((m.kind=:income AND b.cents=m.cents) OR (m.kind IN (:cost,:expense) AND b.cents=-m.cents)) WHERE b.office_id=:o AND b.matched_movement IS NULL AND NOT EXISTS (SELECT 1 FROM bank_rows x WHERE x.office_id=m.office_id AND x.matched_movement=m.id) LIMIT 3000'),{'o':u['office_id'],'income':'receita','cost':'custo','expense':'despesa'}).fetchall()
        return [{'statement_id':a,'movement_id':b,'status':'suggestion_only'} for a,b in rows]
    @app.post('/api/bank/match')
    def match(data:Match,idempotency_key:str|None=Header(default=None,alias='Idempotency-Key'),u=Depends(editor)):
        with db() as c:
            replay=idem_reserve(c,u,'bank.match',idempotency_key,{'statement_id':data.statement_id,'movement_id':data.movement_id})
            if replay is not None:return replay
            b=c.execute(text('SELECT posted,cents,matched_movement FROM bank_rows WHERE office_id=:o AND id=:id'),{'o':u['office_id'],'id':data.statement_id}).first()
            m=c.execute(text('SELECT movement_date,cents,kind FROM cash_movements WHERE office_id=:o AND id=:id'),{'o':u['office_id'],'id':data.movement_id}).first()
            if not b or not m:raise HTTPException(404,'Movimento nao encontrado neste escritorio')
            assert_open(c,u['office_id'],b[0])
            expected=m[1] if m[2]=='receita' else -m[1]
            if b[2] or b[0]!=m[0] or b[1]!=expected:raise HTTPException(422,'Correspondencia divergente ou ja conciliada')
            if c.execute(text('SELECT 1 FROM bank_rows WHERE office_id=:o AND matched_movement=:id'),{'o':u['office_id'],'id':data.movement_id}).first():raise HTTPException(409,'Movimento ja conciliado')
            updated=c.execute(text('UPDATE bank_rows SET matched_movement=:m WHERE office_id=:o AND id=:b AND matched_movement IS NULL'),{'m':data.movement_id,'o':u['office_id'],'b':data.statement_id})
            if updated.rowcount!=1:raise HTTPException(409,'Conciliacao concorrente: linha ja conciliada')
            c.execute(text('INSERT INTO audit VALUES (:id,:o,:u,:a,:t,:at)'),{'id':secrets.token_hex(16),'o':u['office_id'],'u':u['id'],'a':'bank.match','t':data.statement_id,'at':utc()})
            idem_finish(c,u,'bank.match',idempotency_key,{'ok':True})
        return {'ok':True}
    @app.get('/api/bank/status')
    def bank_status(u=Depends(auth)):
        with db() as c:
            rows=c.execute(text('SELECT SUBSTR(posted,1,7),COUNT(*),SUM(CASE WHEN matched_movement IS NOT NULL THEN 1 ELSE 0 END) FROM bank_rows WHERE office_id=:o GROUP BY SUBSTR(posted,1,7)'),{'o':u['office_id']}).fetchall()
            closed=c.execute(text('SELECT month,closed_at FROM finance_closures WHERE office_id=:o ORDER BY month DESC'),{'o':u['office_id']}).fetchall()
        return {'months':[{'month':m,'statement_rows':n,'matched':v,'pending':n-v} for m,n,v in rows],'closed':[{'month':m,'at':t} for m,t in closed]}
    @app.post('/api/finance/close')
    def close_month(data:Close,idempotency_key:str|None=Header(default=None,alias='Idempotency-Key'),u=Depends(editor)):
        try:month=datetime.date.fromisoformat(data.month+'-01')
        except ValueError:raise HTTPException(422,'Mes invalido')
        with db() as c:
            replay=idem_reserve(c,u,'finance.close',idempotency_key,{'month':data.month})
            if replay is not None:return replay
            if c.execute(text('SELECT 1 FROM finance_closures WHERE office_id=:o AND month=:m'),{'o':u['office_id'],'m':data.month}).first():raise HTTPException(409,'Mes ja fechado')
            pending=c.execute(text('SELECT COUNT(*) FROM bank_rows WHERE office_id=:o AND SUBSTR(posted,1,7)=:m AND matched_movement IS NULL'),{'o':u['office_id'],'m':data.month}).scalar()
            if pending:raise HTTPException(409,f'Extrato possui {pending} movimentos nao conciliados')
            mismatch=c.execute(text('SELECT COUNT(*) FROM bills b LEFT JOIN (SELECT office_id,bill_id,SUM(cents) total FROM cash_movements GROUP BY office_id,bill_id) m ON m.bill_id=b.id AND m.office_id=b.office_id WHERE b.office_id=:o AND b.settled_cents<>COALESCE(m.total,0)'),{'o':u['office_id']}).scalar()
            if mismatch:raise HTTPException(409,'Historico de baixas possui divergencias')
            c.execute(text('INSERT INTO finance_closures VALUES (:o,:m,:u,:at)'),{'o':u['office_id'],'m':data.month,'u':u['id'],'at':utc()})
            result={'month':data.month,'closed':True,'scope':'bloqueio operacional piloto; nao e fechamento contabil oficial'}
            idem_finish(c,u,'finance.close',idempotency_key,result)
        return result
    return assert_open
