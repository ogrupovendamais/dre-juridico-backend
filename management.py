"""Read-only analytics built on manually classified bills, no automatic recognition."""
import re, secrets
from decimal import Decimal
from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

AREAS=('Trabalhista','Cível','Previdenciário','Empresarial','Tributário','Família','Criminal','Administrativo','Outros')

def setup(app,db,auth,editor,utc):
    with db() as c:
        c.execute(text('CREATE TABLE IF NOT EXISTS contract_specialties (office_id VARCHAR(40) NOT NULL, contract_id VARCHAR(40) NOT NULL, specialty VARCHAR(80) NOT NULL, PRIMARY KEY(office_id,contract_id))'))
        c.execute(text('CREATE TABLE IF NOT EXISTS monthly_targets (office_id VARCHAR(40) NOT NULL, month VARCHAR(7) NOT NULL, revenue_cents BIGINT NOT NULL, created_by VARCHAR(40) NOT NULL, updated_at VARCHAR(40) NOT NULL, PRIMARY KEY(office_id,month))'))
    class SpecialtyIn(BaseModel):
        specialty:str
    class TargetIn(BaseModel):
        month:str
        revenue:Decimal=Field(ge=0)
    def validate_month(v):
        if not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])',v):raise HTTPException(422,'Mês deve ser AAAA-MM')
    def audit(c,u,action,target):
        c.execute(text('INSERT INTO audit VALUES (:id,:o,:u,:a,:t,:at)'),{'id':secrets.token_hex(16),'o':u['office_id'],'u':u['id'],'a':action,'t':target,'at':utc()})
    @app.post('/api/management/contracts/{contract_id}/specialty')
    def assign(contract_id:str,data:SpecialtyIn,u=Depends(editor)):
        with db() as c:
            is_custom = c.execute(text('SELECT 1 FROM office_areas WHERE office_id=:o AND LOWER(name)=LOWER(:s)'), {'o': u['office_id'], 's': data.specialty}).first()
            if data.specialty not in AREAS and not is_custom:raise HTTPException(422,'Especialidade não cadastrada')
            if not c.execute(text('SELECT 1 FROM contracts WHERE id=:id AND office_id=:o'),{'id':contract_id,'o':u['office_id']}).first():raise HTTPException(404,'Contrato não encontrado')
            c.execute(text('DELETE FROM contract_specialties WHERE office_id=:o AND contract_id=:id'),{'o':u['office_id'],'id':contract_id})
            c.execute(text('INSERT INTO contract_specialties VALUES (:o,:id,:s)'),{'o':u['office_id'],'id':contract_id,'s':data.specialty})
            audit(c,u,'specialty.assign',contract_id)
        return {'contract_id':contract_id,'specialty':data.specialty}
    @app.post('/api/management/targets')
    def target(data:TargetIn,u=Depends(editor)):
        validate_month(data.month)
        cents=data.revenue*100
        if cents!=cents.to_integral_value() or cents>100000000000:raise HTTPException(422,'Valor inválido')
        with db() as c:
            c.execute(text('DELETE FROM monthly_targets WHERE office_id=:o AND month=:m'),{'o':u['office_id'],'m':data.month})
            c.execute(text('INSERT INTO monthly_targets VALUES (:o,:m,:v,:u,:at)'),{'o':u['office_id'],'m':data.month,'v':int(cents),'u':u['id'],'at':utc()})
            audit(c,u,'target.set',data.month)
        return {'month':data.month,'revenue_cents':int(cents)}
    @app.get('/api/management')
    def report(month:str|None=None,u=Depends(auth)):
        if month:validate_month(month)
        with db() as c:
            rows=c.execute(text('''SELECT b.competence,a.kind,b.cents,b.contract_id,co.fee_type,s.specialty
            FROM bills b JOIN ledger_accounts a ON a.office_id=b.office_id AND a.id=b.account_id
            LEFT JOIN contracts co ON co.office_id=b.office_id AND co.id=b.contract_id
            LEFT JOIN contract_specialties s ON s.office_id=b.office_id AND s.contract_id=b.contract_id
            WHERE b.office_id=:o ORDER BY b.competence'''),{'o':u['office_id']}).fetchall()
            goals=c.execute(text('SELECT month,revenue_cents FROM monthly_targets WHERE office_id=:o'),{'o':u['office_id']}).fetchall()
            assignments=c.execute(text('SELECT contract_id,specialty FROM contract_specialties WHERE office_id=:o'),{'o':u['office_id']}).fetchall()
        goals=dict(goals);assigned=dict(assignments);by_month={};by_area={};excluded={'transitoria_centavos':0,'condicionais_centavos':0,'sem_area_centavos':0}
        for comp,kind,cents,contract,fee,specialty in rows:
            if kind=='transitoria':excluded['transitoria_centavos']+=cents;continue
            if kind=='receita' and fee in ('exito','sucumbencial','misto'):
                excluded['condicionais_centavos']+=cents;continue
            r=by_month.setdefault(comp,{'receita_centavos':0,'custo_centavos':0,'despesa_centavos':0})
            r[kind+'_centavos']+=cents
            if specialty:
                a=by_area.setdefault(comp,{}).setdefault(specialty,{'receita_centavos':0,'custo_centavos':0,'despesa_centavos':0})
                a[kind+'_centavos']+=cents
            else:excluded['sem_area_centavos']+=cents
        for v in by_month.values():
            v['resultado_centavos']=v['receita_centavos']-v['custo_centavos']-v['despesa_centavos']
            v['margem_pct']=round(100*v['resultado_centavos']/v['receita_centavos'],2) if v['receita_centavos'] else None
        for periods in by_area.values():
            for v in periods.values():
                v['resultado_parcial_centavos']=v['receita_centavos']-v['custo_centavos']-v['despesa_centavos']
        selected=month or (max(set(by_month)|set(goals)) if (by_month or goals) else None)
        previous=None
        if selected:
            y,m=map(int,selected.split('-'));previous=f'{y-1:04d}-12' if m==1 else f'{y:04d}-{m-1:02d}'
        cur=by_month.get(selected,{});prev=by_month.get(previous,{})
        g=goals.get(selected)
        rev=cur.get('receita_centavos',0)
        return {'mes_selecionado':selected,'mes_anterior':previous,'meses':by_month,'areas_por_mes':by_area,
            'areas_selecionadas':by_area.get(selected,{}),'comparativo':{'atual':cur,'anterior':prev,'variacao_receita_pct':round((rev-prev['receita_centavos'])*100/prev['receita_centavos'],2) if prev.get('receita_centavos') else None},
            'meta':{'receita_centavos':g,'atingimento_pct':round(100*rev/g,2) if g else None,'diferenca_centavos':rev-g if g is not None else None},
            'especialidades':AREAS,'classificacoes':assigned,'valores_segretados_total':excluded,
            'avisos':['Estimativas baseadas em títulos manuais, não DRE contábil reconhecida.','Sem rateio: títulos sem área ficam fora dos resultados por especialidade.','Resultado por área é parcial e não significa lucro líquido por especialidade.','Honorários condicionais segregados; verificar reconhecimento com documentação.','Metas são planejamento e não movimentações contábeis.','Não somar a base legada de lançamentos com títulos.']}
