"""v0.3 pilot: financial receivables/payables and competent-period ledger; non-accounting prototype."""
import secrets, datetime
from decimal import Decimal
from fastapi import Depends, HTTPException, Header
from pydantic import BaseModel, Field
from sqlalchemy import text

def setup(app, db, auth, editor, utc):
    with db() as c:
        c.execute(text('CREATE TABLE IF NOT EXISTS ledger_accounts (id VARCHAR(40) PRIMARY KEY,office_id VARCHAR(40) NOT NULL,code VARCHAR(24) NOT NULL,name VARCHAR(120) NOT NULL,kind VARCHAR(20) NOT NULL,UNIQUE(office_id,code))'))
        c.execute(text('CREATE TABLE IF NOT EXISTS customers (id VARCHAR(40) PRIMARY KEY,office_id VARCHAR(40) NOT NULL,name VARCHAR(160) NOT NULL)'))
        c.execute(text('CREATE TABLE IF NOT EXISTS contracts (id VARCHAR(40) PRIMARY KEY,office_id VARCHAR(40) NOT NULL,customer_id VARCHAR(40) NOT NULL,label VARCHAR(160) NOT NULL,fee_type VARCHAR(24) NOT NULL,origin VARCHAR(30) DEFAULT \'atendimento\',suborigin VARCHAR(80))'))
        try: c.execute(text("ALTER TABLE contracts ADD COLUMN origin VARCHAR(30) DEFAULT 'atendimento'"))
        except Exception: pass
        try: c.execute(text("ALTER TABLE contracts ADD COLUMN suborigin VARCHAR(80)"))
        except Exception: pass
        try: c.execute(text("ALTER TABLE customers ADD COLUMN created_at VARCHAR(40)"))
        except Exception: pass
        try: c.execute(text("ALTER TABLE contracts ADD COLUMN created_at VARCHAR(40)"))
        except Exception: pass
        try: c.execute(text("ALTER TABLE contracts ADD COLUMN signed_date VARCHAR(10)"))
        except Exception: pass
        try: c.execute(text("ALTER TABLE contracts ADD COLUMN contract_value_cents BIGINT DEFAULT 0"))
        except Exception: pass
        try:
            c.execute(text("""
                UPDATE customers 
                SET created_at = COALESCE(
                    (SELECT timestamp FROM audit WHERE audit.action='customer.create' AND audit.target_id=customers.id ORDER BY timestamp DESC LIMIT 1),
                    '2026-10-20T12:00:00+00:00'
                )
                WHERE created_at IS NULL
            """))
            c.execute(text("""
                UPDATE contracts 
                SET created_at = COALESCE(
                    (SELECT timestamp FROM audit WHERE audit.action='contract.create' AND audit.target_id=contracts.id ORDER BY timestamp DESC LIMIT 1),
                    '2026-10-20T12:00:00+00:00'
                )
                WHERE created_at IS NULL
            """))
            c.execute(text("""
                UPDATE contracts 
                SET signed_date = substr(created_at, 1, 10)
                WHERE signed_date IS NULL
            """))
        except Exception: pass
        c.execute(text('CREATE TABLE IF NOT EXISTS bills (id VARCHAR(40) PRIMARY KEY,office_id VARCHAR(40) NOT NULL,account_id VARCHAR(40) NOT NULL,contract_id VARCHAR(40),description VARCHAR(160) NOT NULL,competence VARCHAR(7) NOT NULL,due_date VARCHAR(10) NOT NULL,cents BIGINT NOT NULL,settled_cents BIGINT NOT NULL DEFAULT 0,settled_date VARCHAR(10),created_by VARCHAR(40) NOT NULL,created_at VARCHAR(40) NOT NULL,nature_id VARCHAR(40),subcategory_id VARCHAR(40))'))
        try: c.execute(text('ALTER TABLE bills ADD COLUMN nature_id VARCHAR(40)'))
        except Exception: pass
        try: c.execute(text('ALTER TABLE bills ADD COLUMN subcategory_id VARCHAR(40)'))
        except Exception: pass
        c.execute(text('CREATE TABLE IF NOT EXISTS cash_movements (id VARCHAR(40) PRIMARY KEY,office_id VARCHAR(40) NOT NULL,bill_id VARCHAR(40) NOT NULL,kind VARCHAR(20) NOT NULL,movement_date VARCHAR(10) NOT NULL,cents BIGINT NOT NULL,created_by VARCHAR(40) NOT NULL,created_at VARCHAR(40) NOT NULL)'))
    class AccountIn(BaseModel):
        code:str=Field(min_length=1,max_length=24)
        name:str=Field(min_length=2,max_length=120)
        kind:str
    class CustomerIn(BaseModel):
        name:str=Field(min_length=2,max_length=160)
        date:str|None=None
    class ContractIn(BaseModel):
        customer_id:str
        label:str=Field(min_length=2,max_length=160)
        fee_type:str='fixo'
        origin:str='atendimento'
        suborigin:str|None=None
        signed_date:str|None=None
        contract_value:Decimal|None=None
        contract_value_cents:int|None=None
    class BillIn(BaseModel):
        account_id:str
        contract_id:str|None=None
        description:str=Field(min_length=2,max_length=160)
        competence:str
        due_date:datetime.date
        amount:Decimal=Field(gt=0)
        nature_id:str|None=None
        subcategory_id:str|None=None
    class Settlement(BaseModel):
        amount:Decimal=Field(gt=0)
        date:datetime.date

    def cents(value):
        x=value*100
        if x!=x.to_integral_value() or x>100000000000:raise HTTPException(422,'Valor necessita centavos validos')
        return int(x)
    def event(c,u,action,target,details=None):
        c.execute(text('INSERT INTO audit VALUES (:id,:o,:u,:a,:t,:at)'),{'id':secrets.token_hex(16),'o':u['office_id'],'u':u['id'],'a':action,'t':target,'at':utc()})
        from audit18 import record
        record(c,u,action,target,details or {},utc)
    @app.get('/api/accounts')
    def accounts(u=Depends(auth)):
        with db() as c:rows=c.execute(text('SELECT id,code,name,kind FROM ledger_accounts WHERE office_id=:o ORDER BY code'),{'o':u['office_id']}).fetchall()
        return [dict(zip(('id','code','name','kind'),r)) for r in rows]
    @app.post('/api/accounts',status_code=201)
    def add_account(data:AccountIn,u=Depends(editor)):
        if data.kind not in ('receita','custo','despesa','transitoria'):raise HTTPException(422,'Natureza invalida')
        ident=secrets.token_hex(16)
        with db() as c:
            if c.execute(text('SELECT 1 FROM ledger_accounts WHERE office_id=:o AND code=:code'),{'o':u['office_id'],'code':data.code.strip()}).first():raise HTTPException(409,'Codigo ja cadastrado')
            c.execute(text('INSERT INTO ledger_accounts VALUES (:id,:o,:code,:name,:kind)'),{'id':ident,'o':u['office_id'],'code':data.code.strip(),'name':data.name.strip(),'kind':data.kind})
            event(c,u,'account.create',ident)
        return {'id':ident}
    @app.get('/api/customers')
    def customers(month:str|None=None,u=Depends(auth)):
        with db() as c:
            query = 'SELECT id,name,COALESCE(created_at, :now) as created_at FROM customers WHERE office_id=:o'
            params = {'o':u['office_id'], 'now': utc()}
            if month:
                query += ' AND substr(created_at, 1, 7) = :m'
                params['m'] = month
            query += ' ORDER BY name'
            rows=c.execute(text(query), params).fetchall()
        return [dict(zip(('id','name','created_at'),r)) for r in rows]
    @app.post('/api/customers',status_code=201)
    def add_customer(data:CustomerIn,u=Depends(editor)):
        ident=secrets.token_hex(16)
        created_iso = (data.date + 'T12:00:00+00:00') if (data.date and len(data.date.strip()) == 10) else utc()
        with db() as c:
            c.execute(text('INSERT INTO customers (id,office_id,name,created_at) VALUES (:id,:o,:name,:created)'),{'id':ident,'o':u['office_id'],'name':data.name.strip(),'created':created_iso})
            event(c,u,'customer.create',ident)
        return {'id':ident}
    @app.get('/api/contracts')
    def contracts(month:str|None=None,u=Depends(auth)):
        with db() as c:
            query = """
                SELECT c.id, c.customer_id, c.label, c.fee_type, COALESCE(c.origin,'atendimento') as origin, 
                       c.suborigin, COALESCE(c.signed_date, substr(c.created_at, 1, 10), '2026-10-20') as signed_date,
                       COALESCE(c.created_at, '2026-10-20T12:00:00+00:00') as created_at,
                       cust.name as customer_name,
                       COALESCE(c.contract_value_cents, 0) as contract_value_cents
                FROM contracts c 
                LEFT JOIN customers cust ON cust.id=c.customer_id 
                WHERE c.office_id=:o
            """
            params = {'o':u['office_id']}
            if month:
                query += ' AND (substr(c.signed_date, 1, 7) = :m OR (c.signed_date IS NULL AND substr(c.created_at, 1, 7) = :m))'
                params['m'] = month
            query += ' ORDER BY signed_date DESC, c.label'
            rows=c.execute(text(query), params).fetchall()
        keys = ('id','customer_id','label','fee_type','origin','suborigin','signed_date','created_at','customer_name','contract_value_cents')
        res = []
        for r in rows:
            d = dict(zip(keys, r))
            d['contract_value'] = round((d.get('contract_value_cents') or 0) / 100.0, 2)
            res.append(d)
        return res
    @app.post('/api/contracts',status_code=201)
    def add_contract(data:ContractIn,u=Depends(editor)):
        if data.fee_type not in ('fixo','recorrente','exito','sucumbencial','misto'):raise HTTPException(422,'Modalidade invalida')
        clean_origin = data.origin.strip().lower() if data.origin else 'atendimento'
        if clean_origin not in ('marketing', 'atendimento'): clean_origin = 'atendimento'
        clean_suborigin = data.suborigin.strip()[:80] if (data.suborigin and data.suborigin.strip()) else None
        s_date = data.signed_date if (data.signed_date and len(data.signed_date.strip()) == 10) else datetime.date.today().isoformat()
        val_cents = 0
        if data.contract_value_cents is not None and data.contract_value_cents >= 0:
            val_cents = int(data.contract_value_cents)
        elif data.contract_value is not None and data.contract_value >= 0:
            try:
                val_cents = cents(data.contract_value)
            except Exception:
                val_cents = int(round(float(data.contract_value) * 100))
        ident=secrets.token_hex(16)
        created_iso = (s_date + 'T12:00:00+00:00')
        with db() as c:
            if not c.execute(text('SELECT 1 FROM customers WHERE id=:id AND office_id=:o'),{'id':data.customer_id,'o':u['office_id']}).first():raise HTTPException(422,'Cliente nao pertence ao escritorio')
            c.execute(text('INSERT INTO contracts (id,office_id,customer_id,label,fee_type,origin,suborigin,signed_date,created_at,contract_value_cents) VALUES (:id,:o,:customer,:label,:type,:origin,:suborigin,:signed,:created,:val_cents)'),{'id':ident,'o':u['office_id'],'customer':data.customer_id,'label':data.label.strip(),'type':data.fee_type,'origin':clean_origin,'suborigin':clean_suborigin,'signed':s_date,'created':created_iso,'val_cents':val_cents})
            event(c,u,'contract.create',ident)
        return {'id':ident}
    @app.get('/api/bills')
    def bills(u=Depends(auth)):
        with db() as c:
            rows=c.execute(text('''
                SELECT b.id,b.description,b.competence,b.due_date,b.cents,b.settled_cents,b.settled_date,b.account_id,a.name,a.kind,b.contract_id,b.nature_id,b.subcategory_id,n.name as nature_name
                FROM bills b
                JOIN ledger_accounts a ON a.id=b.account_id AND a.office_id=b.office_id
                LEFT JOIN operation_natures n ON n.id=b.nature_id
                WHERE b.office_id=:o
                ORDER BY b.due_date DESC LIMIT 3000
            '''),{'o':u['office_id']}).fetchall()
        keys=['id','description','competence','due_date','cents','settled_cents','settled_date','account_id','account','kind','contract_id','nature_id','subcategory_id','nature_name'];return [dict(zip(keys,r)) for r in rows]
    @app.post('/api/bills',status_code=201)
    def add_bill(data:BillIn,idempotency_key:str|None=Header(default=None,alias='Idempotency-Key'),u=Depends(editor)):
        try:month=datetime.date.fromisoformat(data.competence+'-01')
        except ValueError:raise HTTPException(422,'Competencia AAAA-MM invalida')
        if month.year<2000 or month.year>2100:raise HTTPException(422,'Competencia fora do intervalo')
        ident=secrets.token_hex(16)
        from idempotency25 import reserve, finish
        clean_nature = data.nature_id.strip() if (data.nature_id and data.nature_id.strip()) else None
        clean_subcat = data.subcategory_id.strip() if (data.subcategory_id and data.subcategory_id.strip()) else None
        clean_contract = data.contract_id.strip() if (data.contract_id and data.contract_id.strip()) else None
        with db() as c:
            replay=reserve(c,u,'bill.create',idempotency_key,{'account_id':data.account_id,'contract_id':clean_contract,'description':data.description.strip(),'competence':data.competence,'due_date':data.due_date.isoformat(),'cents':cents(data.amount),'nature_id':clean_nature,'subcategory_id':clean_subcat})
            if replay is not None:return replay
            account=c.execute(text('SELECT kind FROM ledger_accounts WHERE office_id=:o AND id=:id'),{'o':u['office_id'],'id':data.account_id}).first()
            if not account:raise HTTPException(422,'Conta inexistente no escritorio')
            if clean_contract and not c.execute(text('SELECT 1 FROM contracts WHERE office_id=:o AND id=:id'),{'o':u['office_id'],'id':clean_contract}).first():raise HTTPException(422,'Contrato inexistente no escritorio')
            if clean_nature and not c.execute(text('SELECT 1 FROM operation_natures WHERE id=:id AND (office_id=:o OR office_id IS NULL)'),{'id':clean_nature,'o':u['office_id']}).first():raise HTTPException(422,'Natureza inexistente no escritorio')
            c.execute(text('INSERT INTO bills (id,office_id,account_id,contract_id,description,competence,due_date,cents,settled_cents,settled_date,created_by,created_at,nature_id,subcategory_id) VALUES (:id,:o,:account,:contract,:description,:competence,:due,:cents,0,NULL,:user,:created,:nature_id,:subcategory_id)'),{'id':ident,'o':u['office_id'],'account':data.account_id,'contract':clean_contract,'description':data.description.strip(),'competence':data.competence,'due':data.due_date.isoformat(),'cents':cents(data.amount),'user':u['id'],'created':utc(),'nature_id':clean_nature,'subcategory_id':clean_subcat})
            event(c,u,'bill.create',ident,{'amount_cents':cents(data.amount),'competence':data.competence,'account_id':data.account_id,'nature_id':clean_nature,'subcategory_id':clean_subcat})
            finish(c,u,'bill.create',idempotency_key,{'id':ident})
        return {'id':ident}
    @app.post('/api/bills/{bill_id}/settle')
    def settle(bill_id:str,data:Settlement,idempotency_key:str|None=Header(default=None,alias='Idempotency-Key'),u=Depends(editor)):
        value=cents(data.amount)
        from idempotency25 import reserve, finish
        with db() as c:
            replay=reserve(c,u,'bill.settle:'+bill_id,idempotency_key,{'cents':value,'date':data.date.isoformat()})
            if replay is not None:return replay
            row=c.execute(text('SELECT cents,settled_cents FROM bills WHERE id=:id AND office_id=:o'),{'id':bill_id,'o':u['office_id']}).fetchone()
            if not row:raise HTTPException(404,'Titulo nao encontrado')
            if c.execute(text('SELECT 1 FROM finance_closures WHERE office_id=:o AND month=:m'),{'o':u['office_id'],'m':data.date.isoformat()[:7]}).first():raise HTTPException(409,'Periodo fechado')
            if value>row[0]-row[1]:raise HTTPException(422,'Baixa supera o saldo')
            kind=c.execute(text('SELECT a.kind FROM bills b JOIN ledger_accounts a ON a.id=b.account_id AND a.office_id=b.office_id WHERE b.id=:id AND b.office_id=:o'),{'id':bill_id,'o':u['office_id']}).scalar()
            c.execute(text('INSERT INTO cash_movements VALUES (:id,:o,:bill,:kind,:date,:value,:user,:at)'),{'id':secrets.token_hex(16),'o':u['office_id'],'bill':bill_id,'kind':kind,'date':data.date.isoformat(),'value':value,'user':u['id'],'at':utc()})
            c.execute(text('UPDATE bills SET settled_cents=settled_cents+:v,settled_date=:d WHERE id=:id AND office_id=:o'),{'v':value,'d':data.date.isoformat(),'id':bill_id,'o':u['office_id']})
            event(c,u,'bill.settle',bill_id,{'amount_cents':value,'settlement_date':data.date.isoformat(),'previous_settled_cents':row[1],'new_settled_cents':row[1]+value})
            finish(c,u,'bill.settle:'+bill_id,idempotency_key,{'ok':True})
        return {'ok':True}
    @app.get('/api/financial-report')
    def report(u=Depends(auth)):
        with db() as c:
            rows=c.execute(text('SELECT b.competence,a.kind,SUM(b.cents) FROM bills b JOIN ledger_accounts a ON a.id=b.account_id AND a.office_id=b.office_id WHERE b.office_id=:o GROUP BY b.competence,a.kind ORDER BY b.competence,a.kind'),{'o':u['office_id']}).fetchall()
            pending=c.execute(text('SELECT a.kind,COALESCE(SUM(b.cents-b.settled_cents),0) FROM bills b JOIN ledger_accounts a ON a.id=b.account_id AND a.office_id=b.office_id WHERE b.office_id=:o GROUP BY a.kind'),{'o':u['office_id']}).fetchall()
            # Cash settlements stored as cumulative amount and latest date: cash per month not reconstructible.
            settled=c.execute(text('SELECT a.kind,COALESCE(SUM(b.settled_cents),0) FROM bills b JOIN ledger_accounts a ON a.id=b.account_id AND a.office_id=b.office_id WHERE b.office_id=:o GROUP BY a.kind'),{'o':u['office_id']}).fetchall()
        months={}
        for month,kind,amount in rows:months.setdefault(month,{})[kind]=amount/100
        for item in months.values():item['resultado_indicativo']=item.get('receita',0)-item.get('custo',0)-item.get('despesa',0)
        return {'competencias':months,'saldos_em_aberto':{k:v/100 for k,v in pending},'baixas_acumuladas':{k:v/100 for k,v in settled},'aviso':'Demonstrativo gerencial de valores classificados manualmente. Títulos não equivalem necessariamente a receita contabilmente reconhecida. Baixas acumuladas não constituem DFC mensal.'}

    @app.get('/api/cash-movements')
    def cash_movements(u=Depends(auth)):
        with db() as c:
            rows=c.execute(text('SELECT m.id,m.bill_id,m.movement_date,m.cents,m.kind,b.description FROM cash_movements m JOIN bills b ON b.id=m.bill_id AND b.office_id=m.office_id WHERE m.office_id=:o ORDER BY m.movement_date DESC,m.created_at DESC LIMIT 3000'),{'o':u['office_id']}).fetchall()
        return [dict(zip(('id','bill_id','date','cents','kind','description'),r)) for r in rows]

    @app.get('/api/cash-report')
    def cash_report(u=Depends(auth)):
        with db() as c:
            rows=c.execute(text('SELECT SUBSTR(m.movement_date,1,7),m.kind,SUM(m.cents) FROM cash_movements m WHERE m.office_id=:o GROUP BY SUBSTR(m.movement_date,1,7),m.kind ORDER BY 1,2'),{'o':u['office_id']}).fetchall()
            missing=c.execute(text('SELECT COUNT(*),COALESCE(SUM(b.settled_cents-COALESCE(x.total,0)),0) FROM bills b LEFT JOIN (SELECT bill_id,office_id,SUM(cents) AS total FROM cash_movements GROUP BY bill_id,office_id) x ON x.bill_id=b.id AND x.office_id=b.office_id WHERE b.office_id=:o AND b.settled_cents<>COALESCE(x.total,0)'),{'o':u['office_id']}).fetchone()
        months={}
        for month,kind,value in rows:
            months.setdefault(month,{})[kind]=value/100
        for item in months.values():
            item['saldo_gerencial']=item.get('receita',0)-item.get('custo',0)-item.get('despesa',0)
        return {'meses':months,'titulos_com_divergencia':missing[0],'diferenca_historica_centavos':missing[1], 'aviso':'Fluxo por data dos movimentos registrados a partir da versao 0.4; nao equivale a conciliacao bancaria ou DFC contabil. Baixas historicas da versao 0.3 podem faltar.'}

    @app.get('/api/reconciliation')
    def reconciliation(u=Depends(auth)):
        with db() as c:
            rows=c.execute(text('SELECT b.id,b.description,b.cents,b.settled_cents,COALESCE(SUM(m.cents),0) FROM bills b LEFT JOIN cash_movements m ON m.bill_id=b.id AND m.office_id=b.office_id WHERE b.office_id=:o GROUP BY b.id,b.description,b.cents,b.settled_cents ORDER BY b.due_date DESC LIMIT 3000'),{'o':u['office_id']}).fetchall()
        errors=[{'bill_id':ident,'description':desc,'settled_cents':settled,'movements_cents':mov,'difference_cents':settled-mov} for ident,desc,total,settled,mov in rows if settled!=mov or settled>total]
        return {'titles_checked':len(rows),'mismatches':errors,'reconciled':len(errors)==0,'scope':'Conferencia interna entre baixas acumuladas e movimentos registrados; nao confronta extrato bancario nem partidas dobradas.'}
