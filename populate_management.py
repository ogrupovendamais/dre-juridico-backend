import sys, secrets
from datetime import datetime, timezone
from sqlalchemy import text
import server

def populate():
    with server.db() as c:
        user = c.execute(text("SELECT id, office_id FROM users WHERE email='admin@vendamaistech.com.br'")).first()
        if not user:
            print("User not found")
            return
        user_id, office_id = user[0], user[1]
        now_iso = datetime.now(timezone.utc).isoformat()

        # 1. Planos de Contas (ledger_accounts)
        accounts_data = [
            ('REC_HON', 'Honorários Contratuais e Assessoria Mensal', 'receita'),
            ('REC_EXITO', 'Honorários de Êxito e Sucumbência', 'receita'),
            ('CUS_PROC', 'Custas Judiciais e Diligências Forenses', 'custo'),
            ('CUS_PER', 'Honorários Periciais Especializados', 'custo'),
            ('DES_ADM', 'Despesas Administrativas e Software', 'despesa'),
            ('DES_MKT', 'Marketing Jurídico e Captação de Clientes', 'despesa'),
        ]
        acc_map = {}
        for code, name, kind in accounts_data:
            existing = c.execute(text("SELECT id FROM ledger_accounts WHERE office_id=:o AND code=:code"), {'o': office_id, 'code': code}).first()
            if existing:
                acc_map[code] = existing[0]
            else:
                acc_id = secrets.token_hex(16)
                c.execute(text("INSERT INTO ledger_accounts (id, office_id, code, name, kind) VALUES (:id, :o, :code, :name, :kind)"), {
                    'id': acc_id, 'o': office_id, 'code': code, 'name': name, 'kind': kind
                })
                acc_map[code] = acc_id

        # 2. Contratos & Especialidades (contract_specialties)
        conts = c.execute(text("SELECT id, label, fee_type FROM contracts WHERE office_id=:o"), {'o': office_id}).fetchall()
        cont_map = {row[1]: (row[0], row[2]) for row in conts}
        print("Existing contracts:", cont_map.keys())

        specialties_map = {
            'Contrato Alpha - Contencioso Cível Estratégico': 'Cível',
            'Contrato Beta - Consultoria e Planejamento Tributário': 'Tributário',
            'Contrato Tech - Assessoria Trabalhista Preventiva': 'Trabalhista',
            'Contrato Fiscal - Execução e Recuperação Tributária': 'Tributário',
            'Contrato Ômega - Estruturação Societária e M&A': 'Empresarial',
            'Contrato Delta - Assessoria em Contratos Comerciais': 'Cível'
        }
        for label, spec in specialties_map.items():
            if label in cont_map:
                cid = cont_map[label][0]
                c.execute(text("DELETE FROM contract_specialties WHERE office_id=:o AND contract_id=:cid"), {'o': office_id, 'cid': cid})
                c.execute(text("INSERT INTO contract_specialties (office_id, contract_id, specialty) VALUES (:o, :cid, :s)"), {
                    'o': office_id, 'cid': cid, 's': spec
                })

        # 3. Metas Mensais (monthly_targets)
        # 2026-09: R$ 42.000,00 | 2026-10: R$ 50.000,00
        targets = [
            ('2026-09', 4200000),
            ('2026-10', 5000000)
        ]
        for m, rev_cents in targets:
            c.execute(text("DELETE FROM monthly_targets WHERE office_id=:o AND month=:m"), {'o': office_id, 'm': m})
            c.execute(text("INSERT INTO monthly_targets (office_id, month, revenue_cents, created_by, updated_at) VALUES (:o, :m, :v, :u, :at)"), {
                'o': office_id, 'm': m, 'v': rev_cents, 'u': user_id, 'at': now_iso
            })

        # 4. Títulos Financeiros (bills) para 2026-09 e 2026-10
        # Limpar títulos antigos do escritório para manter consistência exata do piloto
        c.execute(text("DELETE FROM bills WHERE office_id=:o"), {'o': office_id})

        bills_data = [
            # --- MÊS ATUAL: 2026-10 ---
            # Receitas fixas/recorrentes por contrato (Total: R$ 55.000,00 -> 110% da meta de R$ 50k)
            ('REC_HON', 'Contrato Alpha - Contencioso Cível Estratégico', 'Honorários Mensais - Contencioso Cível Estratégico', '2026-10', '2026-10-10', 1800000),
            ('REC_HON', 'Contrato Beta - Consultoria e Planejamento Tributário', 'Honorários Consultoria Tributária Mensal', '2026-10', '2026-10-15', 1500000),
            ('REC_HON', 'Contrato Tech - Assessoria Trabalhista Preventiva', 'Retainer Mensal Assessoria Trabalhista', '2026-10', '2026-10-12', 1200000),
            ('REC_HON', 'Contrato Ômega - Estruturação Societária e M&A', 'Honorários Fixos Estruturação Societária', '2026-10', '2026-10-20', 1000000),
            # Receita condicional (Êxito) - Segregado pelo motor analítico!
            ('REC_EXITO', 'Contrato Fiscal - Execução e Recuperação Tributária', 'Honorários de Êxito em Execução Fiscal Homologada', '2026-10', '2026-10-25', 800000),
            # Custos diretos
            ('CUS_PROC', 'Contrato Alpha - Contencioso Cível Estratégico', 'Preparo e Custas Judiciais TJ/STJ', '2026-10', '2026-10-14', 250000),
            ('CUS_PER', 'Contrato Beta - Consultoria e Planejamento Tributário', 'Honorários Perícia Contábil Tributária', '2026-10', '2026-10-18', 300000),
            ('CUS_PROC', 'Contrato Tech - Assessoria Trabalhista Preventiva', 'Diligências e Custas em Audiências TRT', '2026-10', '2026-10-16', 150000),
            # Despesas parciais alocadas
            ('DES_ADM', 'Contrato Alpha - Contencioso Cível Estratégico', 'Impressões, Certidões e Diligências Cíveis', '2026-10', '2026-10-22', 100000),
            ('DES_ADM', 'Contrato Beta - Consultoria e Planejamento Tributário', 'Parecer Externo Especializado e Bases Fiscais', '2026-10', '2026-10-22', 120000),
            ('DES_ADM', 'Contrato Tech - Assessoria Trabalhista Preventiva', 'Cálculos de Liquidação Trabalhista', '2026-10', '2026-10-22', 80000),
            # Despesa geral sem contrato (mostra segregação sem área)
            ('DES_MKT', None, 'Campanha Google Ads & Publicações Institucionais', '2026-10', '2026-10-25', 200000),

            # --- MÊS ANTERIOR: 2026-09 ---
            # Receitas fixas/recorrentes por contrato (Total: R$ 42.000,00 -> 100% da meta de R$ 42k)
            # Variação Outubro (55k) vs Setembro (42k) = +30,95% de crescimento!
            ('REC_HON', 'Contrato Alpha - Contencioso Cível Estratégico', 'Honorários Mensais Cível Setembro', '2026-09', '2026-09-10', 1400000),
            ('REC_HON', 'Contrato Beta - Consultoria e Planejamento Tributário', 'Honorários Consultoria Tributária Setembro', '2026-09', '2026-09-15', 1200000),
            ('REC_HON', 'Contrato Tech - Assessoria Trabalhista Preventiva', 'Retainer Trabalhista Setembro', '2026-09', '2026-09-12', 1000000),
            ('REC_HON', 'Contrato Ômega - Estruturação Societária e M&A', 'Fase 1 M&A Setembro', '2026-09', '2026-09-20', 600000),
            # Custos diretos setembro
            ('CUS_PROC', 'Contrato Alpha - Contencioso Cível Estratégico', 'Custas e Emolumentos Judiciais Setembro', '2026-09', '2026-09-14', 200000),
            ('CUS_PER', 'Contrato Beta - Consultoria e Planejamento Tributário', 'Perícia Contábil Setembro', '2026-09', '2026-09-18', 250000),
            ('CUS_PROC', 'Contrato Tech - Assessoria Trabalhista Preventiva', 'Diligências Forenses Setembro', '2026-09', '2026-09-16', 120000),
            # Despesas parciais setembro
            ('DES_ADM', 'Contrato Alpha - Contencioso Cível Estratégico', 'Despesas Cíveis Setembro', '2026-09', '2026-09-22', 90000),
            ('DES_ADM', 'Contrato Beta - Consultoria e Planejamento Tributário', 'Pesquisas Fiscais Setembro', '2026-09', '2026-09-22', 110000),
            ('DES_ADM', 'Contrato Tech - Assessoria Trabalhista Preventiva', 'Cálculos Trabalhistas Setembro', '2026-09', '2026-09-22', 70000),
            ('DES_MKT', None, 'Divulgação Institucional Setembro', '2026-09', '2026-09-25', 180000),
        ]

        for acc_code, cont_name, desc, comp, due, cents in bills_data:
            bill_id = secrets.token_hex(16)
            account_id = acc_map[acc_code]
            contract_id = cont_map[cont_name][0] if cont_name and cont_name in cont_map else None
            c.execute(text("""
                INSERT INTO bills (id, office_id, account_id, contract_id, description, competence, due_date, cents, settled_cents, created_by, created_at)
                VALUES (:id, :o, :acc, :cid, :desc, :comp, :due, :cents, :cents, :u, :created)
            """), {
                'id': bill_id, 'o': office_id, 'acc': account_id, 'cid': contract_id, 'desc': desc,
                'comp': comp, 'due': due, 'cents': cents, 'u': user_id, 'created': now_iso
            })

        print("População concluída com sucesso!")

if __name__ == '__main__':
    populate()
