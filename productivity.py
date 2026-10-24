"""Pilot productivity analytics. Costs are independent from the classified-bill DRE."""
import datetime
import re
import secrets
from decimal import Decimal
from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

MAX_CENTS = 100_000_000_000

def cents(value):
    v=value*100
    if not value.is_finite() or v != v.to_integral_value() or v>MAX_CENTS:
        raise HTTPException(422,'Valor monetário inválido: máximo de duas casas decimais')
    return int(v)

def setup(app,db,auth,editor,utc):
    with db() as c:
        c.execute(text('CREATE TABLE IF NOT EXISTS professionals (id VARCHAR(40) PRIMARY KEY, office_id VARCHAR(40) NOT NULL, name VARCHAR(140) NOT NULL, hourly_cost_cents BIGINT NOT NULL, created_at VARCHAR(40) NOT NULL)'))
        c.execute(text('CREATE TABLE IF NOT EXISTS worklogs (id VARCHAR(40) PRIMARY KEY, office_id VARCHAR(40) NOT NULL, professional_id VARCHAR(40) NOT NULL, contract_id VARCHAR(40) NOT NULL, work_date VARCHAR(10) NOT NULL, minutes BIGINT NOT NULL, cost_cents BIGINT NOT NULL, created_by VARCHAR(40) NOT NULL, created_at VARCHAR(40) NOT NULL)'))
    class ProfessionalIn(BaseModel):
        name:str=Field(min_length=2,max_length=140)
        hourly_cost:Decimal=Field(ge=0)
    class WorkIn(BaseModel):
        professional_id:str
        contract_id:str
        date:datetime.date
        minutes:int=Field(gt=0,le=1440)
    def audit(c,u,action,target):
        c.execute(text('INSERT INTO audit VALUES (:id,:o,:u,:a,:t,:at)'),{'id':secrets.token_hex(16),'o':u['office_id'],'u':u['id'],'a':action,'t':target,'at':utc()})
    @app.post('/api/productivity/professionals',status_code=201)
    def add_pro(data:ProfessionalIn,u=Depends(editor)):
        name=data.name.strip()
        if len(name)<2:raise HTTPException(422,'Nome inválido')
        value=cents(data.hourly_cost)
        ident=secrets.token_hex(16)
        with db() as c:
            c.execute(text('INSERT INTO professionals VALUES (:id,:o,:n,:v,:at)'),{'id':ident,'o':u['office_id'],'n':name,'v':value,'at':utc()})
            audit(c,u,'professional.create',ident)
        return {'id':ident}
    @app.get('/api/productivity/professionals')
    def pros(u=Depends(auth)):
        with db() as c:rows=c.execute(text('SELECT id,name,hourly_cost_cents FROM professionals WHERE office_id=:o ORDER BY name'),{'o':u['office_id']}).fetchall()
        return [dict(zip(('id','name','hourly_cost_cents'),r)) for r in rows]

    @app.put('/api/productivity/professionals/{pro_id}')
    def update_pro(pro_id: str, data: ProfessionalIn, u=Depends(editor)):
        name = data.name.strip()
        if len(name) < 2: raise HTTPException(422, 'Nome inválido')
        value = cents(data.hourly_cost)
        with db() as c:
            row = c.execute(text('SELECT id FROM professionals WHERE id=:id AND office_id=:o'), {'id': pro_id, 'o': u['office_id']}).fetchone()
            if not row:
                raise HTTPException(404, 'Profissional não encontrado')
            c.execute(text('UPDATE professionals SET name=:name, hourly_cost_cents=:cost WHERE id=:id AND office_id=:o'), {
                'id': pro_id, 'o': u['office_id'], 'name': name, 'cost': value
            })
            audit(c, u, 'professional.update', pro_id)
        return {'id': pro_id, 'name': name, 'hourly_cost_cents': value}

    @app.delete('/api/productivity/professionals/{pro_id}')
    def delete_pro(pro_id: str, u=Depends(editor)):
        with db() as c:
            row = c.execute(text('SELECT id, name FROM professionals WHERE id=:id AND office_id=:o'), {'id': pro_id, 'o': u['office_id']}).fetchone()
            if not row:
                raise HTTPException(404, 'Profissional não encontrado')
            worklog_count = c.execute(text('SELECT COUNT(*) FROM worklogs WHERE professional_id=:id AND office_id=:o'), {'id': pro_id, 'o': u['office_id']}).scalar() or 0
            if worklog_count > 0:
                raise HTTPException(400, f'Não é possível excluir "{row[1]}" pois existem {worklog_count} apontamento(s) de horas vinculado(s). Exclua os apontamentos no histórico antes ou edite os dados do profissional.')
            c.execute(text('DELETE FROM professional_invites WHERE professional_id=:id AND office_id=:o'), {'id': pro_id, 'o': u['office_id']})
            c.execute(text('DELETE FROM professional_accounts WHERE professional_id=:id AND office_id=:o'), {'id': pro_id, 'o': u['office_id']})
            c.execute(text('DELETE FROM professionals WHERE id=:id AND office_id=:o'), {'id': pro_id, 'o': u['office_id']})
            audit(c, u, 'professional.delete', pro_id)
        return {'id': pro_id, 'deleted': True}
    @app.post('/api/productivity/worklogs',status_code=201)
    def add_work(data:WorkIn,u=Depends(editor)):
        ident=secrets.token_hex(16)
        with db() as c:
            professional=c.execute(text('SELECT hourly_cost_cents, name FROM professionals WHERE id=:id AND office_id=:o'),{'id':data.professional_id,'o':u['office_id']}).first()
            if not professional:raise HTTPException(422,'Profissional não pertence ao escritório')
            contract=c.execute(text('SELECT id, label FROM contracts WHERE id=:id AND office_id=:o'),{'id':data.contract_id,'o':u['office_id']}).first()
            if not contract:raise HTTPException(422,'Contrato não pertence ao escritório')
            # Integer cents, exact half-up rounding for sub-cent hourly fractions.
            cost=int((Decimal(professional[0])*Decimal(data.minutes)/Decimal(60)).quantize(Decimal('1'),rounding='ROUND_HALF_UP'))
            c.execute(text('INSERT INTO worklogs (id, office_id, professional_id, contract_id, work_date, minutes, cost_cents, created_by, created_at, status, source) VALUES (:id,:o,:p,:contract,:date,:minutes,:cost,:u,:at, "APPROVED", "web")'),{'id':ident,'o':u['office_id'],'p':data.professional_id,'contract':data.contract_id,'date':data.date.isoformat(),'minutes':data.minutes,'cost':cost,'u':u['id'],'at':utc()})
            audit(c,u,'worklog.create',ident)
        return {'id':ident,'minutes':data.minutes,'cost_cents':cost,'work_date':data.date.isoformat(),'professional_name':professional[1],'contract_label':contract[1]}

    @app.delete('/api/productivity/worklogs/{worklog_id}')
    def delete_worklog(worklog_id: str, u=Depends(editor)):
        with db() as c:
            row = c.execute(text('SELECT id FROM worklogs WHERE id=:id AND office_id=:o'), {'id': worklog_id, 'o': u['office_id']}).fetchone()
            if not row:
                raise HTTPException(404, 'Apontamento não encontrado')
            c.execute(text('DELETE FROM worklogs WHERE id=:id AND office_id=:o'), {'id': worklog_id, 'o': u['office_id']})
            audit(c, u, 'worklog.delete', worklog_id)
        return {'id': worklog_id, 'deleted': True}
    @app.get('/api/productivity')
    def report(month:str|None=None,u=Depends(auth)):
        if month and not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])',month):raise HTTPException(422,'Mês deve ser AAAA-MM')
        params={'o':u['office_id']};filter_sql=''
        if month:
            filter_sql=' AND w.work_date >= :begin AND w.work_date < :end'
            year,mon=map(int,month.split('-'));next_year=year+(mon==12);next_month=1 if mon==12 else mon+1
            params.update(begin=f'{year:04}-{mon:02}-01',end=f'{next_year:04}-{next_month:02}-01')
        with db() as c:
            rows=c.execute(text('''SELECT w.contract_id,c.label,COALESCE(cu.name,''),COALESCE(c.fee_type,'fixo'),w.professional_id,p.name,SUM(w.minutes),SUM(w.cost_cents)
                FROM worklogs w JOIN contracts c ON c.id=w.contract_id AND c.office_id=w.office_id
                LEFT JOIN customers cu ON cu.id=c.customer_id AND cu.office_id=c.office_id
                JOIN professionals p ON p.id=w.professional_id AND p.office_id=w.office_id
                WHERE w.office_id=:o AND (w.status IS NULL OR w.status = 'APPROVED')'''+filter_sql+' GROUP BY w.contract_id,c.label,cu.name,c.fee_type,w.professional_id,p.name ORDER BY c.label,p.name'),params).fetchall()
            # Only eligible titles; excludes conditional fees and transit accounts. Strictly indicative.
            revenue=c.execute(text('''SELECT b.contract_id,COALESCE(SUM(b.cents),0) FROM bills b
                JOIN ledger_accounts a ON a.id=b.account_id AND a.office_id=b.office_id
                JOIN contracts co ON co.id=b.contract_id AND co.office_id=b.office_id
                WHERE b.office_id=:o AND a.kind='receita' AND co.fee_type NOT IN ('exito','sucumbencial','misto')'''+(' AND b.competence=:month' if month else '')+' GROUP BY b.contract_id'),dict(params,month=month)).fetchall()
            # Other classified contract costs shown separately, never sum worklog costs into DRE.
            existing_costs=c.execute(text('''SELECT b.contract_id,COALESCE(SUM(b.cents),0) FROM bills b
                JOIN ledger_accounts a ON a.id=b.account_id AND a.office_id=b.office_id
                WHERE b.office_id=:o AND a.kind='custo' AND b.contract_id IS NOT NULL'''+(' AND b.competence=:month' if month else '')+' GROUP BY b.contract_id'),dict(params,month=month)).fetchall()
        rev=dict(revenue);classified=dict(existing_costs);contracts={}; professionals={}
        for contract,label,customer,fee_type,pro,name,minutes,cost in rows:
            v=contracts.setdefault(contract,{'contract_id':contract,'label':label,'customer':customer,'fee_type':fee_type,'minutes':0,'cost_hours_cents':0,'professionals':[]})
            v['minutes']+=minutes;v['cost_hours_cents']+=cost
            v['professionals'].append({'professional_id':pro,'name':name,'minutes':minutes,'cost_hours_cents':cost})

            p=professionals.setdefault(pro,{'professional_id':pro,'name':name,'minutes':0,'cost_hours_cents':0,'contracts':[]})
            p['minutes']+=minutes;p['cost_hours_cents']+=cost
            p['contracts'].append({'contract_id':contract,'label':label,'customer':customer,'fee_type':fee_type,'minutes':minutes,'cost_hours_cents':cost})
        for key,v in contracts.items():
            v['revenue_titles_cents']=rev.get(key,0)
            v['classified_direct_costs_cents']=classified.get(key,0)
            v['candidate_contribution_cents']=v['revenue_titles_cents']-v['cost_hours_cents']
            v['candidate_margin_pct']=round(100*v['candidate_contribution_cents']/v['revenue_titles_cents'],2) if v['revenue_titles_cents'] else None
            v['possible_double_counting']=bool(classified.get(key,0))
        return {'month':month,'contracts':list(contracts.values()),'professionals':list(professionals.values()),
                'totals':{'minutes':sum(x['minutes'] for x in professionals.values()),'cost_hours_cents':sum(x['cost_hours_cents'] for x in professionals.values())},
                'warnings':['Horas e custo-hora declarados, não validados com folha de pagamento.',
                            'Receitas dos títulos são indicativas; honorários condicionais não são reconhecidos.',
                            'Custo de horas pode já estar incluído em títulos de custo: não somar automaticamente à DRE.',
                            'Margem candidata desconsidera despesas, tributos e demais custos e não representa lucro líquido.',
                            'Sem registro de capacidade disponível: utilização e produtividade efetiva não calculadas.']}
