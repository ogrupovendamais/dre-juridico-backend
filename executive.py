"""Read-only executive estimates. Source: manually classified bills; no automatic accounting recognition."""
from fastapi import Depends
from sqlalchemy import text

def setup(app,db,auth):
    @app.get('/api/executive')
    def executive(month: str|None=None,u=Depends(auth)):
        with db() as c:
            rows=c.execute(text("""SELECT b.competence, COALESCE(n.operation_type, a.kind) AS kind, b.cents, b.settled_cents, b.due_date, b.id, co.fee_type, n.group_id
            FROM bills b JOIN ledger_accounts a ON a.id=b.account_id AND a.office_id=b.office_id
            LEFT JOIN contracts co ON co.id=b.contract_id AND co.office_id=b.office_id
            LEFT JOIN operation_natures n ON n.id=b.nature_id
            WHERE b.office_id=:o ORDER BY b.competence"""),{'o':u['office_id']}).fetchall()
            cash=c.execute(text("""SELECT SUBSTR(m.movement_date,1,7),m.kind,SUM(m.cents)
            FROM cash_movements m WHERE m.office_id=:o GROUP BY SUBSTR(m.movement_date,1,7),m.kind"""),{'o':u['office_id']}).fetchall()
            unmatched=c.execute(text("""SELECT COUNT(*) FROM bills b LEFT JOIN
            (SELECT office_id,bill_id,SUM(cents) AS total FROM cash_movements GROUP BY office_id,bill_id) m
            ON m.office_id=b.office_id AND m.bill_id=b.id WHERE b.office_id=:o AND b.settled_cents<>COALESCE(m.total,0)"""),{'o':u['office_id']}).scalar()
        months={};flags=[]
        for comp,kind,cents,settled,due,ident,fee,gid in rows:
            m=months.setdefault(comp,{'receita_centavos':0,'custo_centavos':0,'despesa_centavos':0,'transitoria_centavos':0,'recebiveis_centavos':0,'pagaveis_centavos':0,'honorarios_condicionais_centavos':0,'titulos':0})
            m['titulos']+=1
            if gid=='G99' or kind in ('transitoria','patrimonial'):
                m['transitoria_centavos']+=cents
                continue
            if kind=='receita' and fee in ('exito','sucumbencial','misto'):
                m['honorarios_condicionais_centavos']+=cents
                flags.append({'titulo_id':ident,'competencia':comp,'tipo':'honorario_condicional','descricao':'Verificar direito ao recebimento e obrigacao de desempenho antes de reconhecer.'})
                continue
            m[kind+'_centavos']+=cents
            if kind=='receita':m['recebiveis_centavos']+=cents-settled
            else:m['pagaveis_centavos']+=cents-settled
        for m in months.values():
            m['resultado_indicativo_centavos']=m['receita_centavos']-m['custo_centavos']-m['despesa_centavos']
            m['margem_indicativa_pct']=round(100*m['resultado_indicativo_centavos']/m['receita_centavos'],2) if m['receita_centavos'] else None
        ca={}
        for month_cash,kind,value in cash:
            row=ca.setdefault(month_cash,{'entradas_centavos':0,'saidas_centavos':0})
            if kind=='receita':row['entradas_centavos']+=value
            elif kind in ('custo','despesa'):row['saidas_centavos']+=value
            else:flags.append({'competencia':month_cash,'tipo':'movimento_transitorio','descricao':'Movimento excluido do saldo operacional; analisar natureza.'})
        for item in ca.values():item['saldo_movimentacoes_centavos']=item['entradas_centavos']-item['saidas_centavos']
        selected=month or (max(set(months)|set(ca)) if (months or ca) else None)
        if selected and (len(selected)!=7 or selected[4]!='-' or not selected[:4].isdigit() or not selected[5:].isdigit() or not 1<=int(selected[5:])<=12):
            from fastapi import HTTPException
            raise HTTPException(422,'Periodo esperado AAAA-MM')
        return {'mes_selecionado':selected,'competencias':months,'caixa':ca,'resumo_competencia':months.get(selected) if selected else None,'resumo_caixa':ca.get(selected) if selected else None,
          'alertas':flags,'titulos_com_baixas_sem_historico':unmatched,
          'fontes':{'competencia':'Titulos classificados manualmente (exceto transitorias e honorarios condicionais sem validacao)','caixa':'Movimentos de baixa registrados (nao inclui extratos avulsos)'},
          'limites':['Nao e DRE contábil oficial: falta reconhecimento validado, tributos, provisoes e escrituração.','Competencia do titulo nao comprova receita auferida.','Honorarios de exito, sucumbenciais e mistos foram segregados por cautela.','Nao somar lancamentos legados de /api/entries com titulos; bases nao reconciliadas.','Fluxo de movimentos nao equivale a saldo bancario nem DFC oficial.','Rateios de custos por area nao disponiveis sem identificacao de centro de custo.']}
