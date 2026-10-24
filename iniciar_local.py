"""Inicializador do ambiente completo PWA com dados de demonstracao."""
import os
import sys
import secrets
from datetime import date, datetime, timezone
from sqlalchemy import text

# Importa o backend do PWA
import server
import uvicorn

def seed():
    with server.db() as conn:
        user = conn.execute(text("SELECT id, office_id FROM users WHERE email='admin@vendamaistech.com.br'")).first()
        if not user:
            print("Criando escritorio e usuario administrador...")
            office_id = server.bootstrap('Venda+ Tech Advocacia', 'admin@vendamaistech.com.br', 'admin12345678')
            user_id = conn.execute(text("SELECT id FROM users WHERE email='admin@vendamaistech.com.br'")).scalar_one()
        else:
            user_id, office_id = user[0], user[1]

        count = conn.execute(text("SELECT count(*) FROM entries WHERE office_id=:office"), {'office': office_id}).scalar()
        if count == 0:
            print("Inserindo lancamentos de demonstracao...")
            entries = [
                # Receitas
                ('2026-10-02', 'Honorários Contratuais - Acordo Cível Empresa Alpha', 'Cível', 'receita', 4850000),
                ('2026-10-05', 'Consultoria e Parecer Tributário - Grupo Beta', 'Tributário', 'receita', 3200000),
                ('2026-10-08', 'Assessoria Mensal Recorrente - Tech S/A', 'Trabalhista', 'receita', 1950000),
                ('2026-10-12', 'Honorários de Êxito - Execução Fiscal', 'Tributário', 'receita', 5400000),
                ('2026-10-15', 'Estruturação Societária e M&A', 'Societário', 'receita', 2700000),
                ('2026-10-18', 'Assessoria Consultiva Contratos Comerciais', 'Cível', 'receita', 1650000),
                # Custos
                ('2026-10-03', 'Adiantamento de Custas e Taxas Judiciais', 'Cível', 'custo', 380000),
                ('2026-10-06', 'Honorários Periciais Contábeis Especializados', 'Tributário', 'custo', 650000),
                ('2026-10-10', 'Diligências e Correspondentes Forenses', 'Geral', 'custo', 290000),
                ('2026-10-14', 'Pró-labore e Remuneração de Sócios Operacionais', 'Operacional', 'custo', 4200000),
                # Despesas
                ('2026-10-04', 'Licenciamento de Software Jurídico e IA', 'Tecnologia', 'despesa', 450000),
                ('2026-10-07', 'Aluguel, Condomínio e Infraestrutura', 'Administrativo', 'despesa', 850000),
                ('2026-10-11', 'Marketing Estratégico e Produção de Conteúdo', 'Comercial', 'despesa', 520000),
                ('2026-10-16', 'Tributos e Encargos Sobre Faturamento', 'Fiscal', 'despesa', 1420000),
                ('2026-10-19', 'Serviços de Contabilidade e Auditoria', 'Administrativo', 'despesa', 310000),
            ]
            now_iso = datetime.now(timezone.utc).isoformat()
            for dt, desc, area, kind, cents in entries:
                conn.execute(
                    text("INSERT INTO entries VALUES (:id, :office, :user, :date, :desc, :area, :kind, :cents, :created)"),
                    {'id': secrets.token_hex(16), 'office': office_id, 'user': user_id, 'date': dt,
                     'desc': desc, 'area': area, 'kind': kind, 'cents': cents, 'created': now_iso}
                )
            print("15 lancamentos financeiros inseridos com sucesso!")

        contracts_count = conn.execute(text("SELECT count(*) FROM contracts WHERE office_id=:office"), {'office': office_id}).scalar() or 0
        if contracts_count < 6:
            print("Cadastrando clientes e contratos de demonstracao...")
            demo_clients = [
                ('Alpha Indústria e Comércio Ltda', 'Contrato Alpha - Contencioso Cível Estratégico', 'fixo', 'marketing', 'google_ads', '2026-10-02'),
                ('Grupo Beta Holdings S/A', 'Contrato Beta - Consultoria e Planejamento Tributário', 'recorrente', 'atendimento', 'indicacao_cliente', '2026-10-05'),
                ('Tech Solutions Brasil S/A', 'Contrato Tech - Assessoria Trabalhista Preventiva', 'recorrente', 'marketing', 'site_seo', '2026-10-08'),
                ('Fazenda Nacional (Execuções)', 'Contrato Fiscal - Execução e Recuperação Tributária', 'exito', 'atendimento', 'carteira_antiga', '2026-10-12'),
                ('Ômega Participações Societárias', 'Contrato Ômega - Estruturação Societária e M&A', 'fixo', 'marketing', 'redes_sociais', '2026-10-15'),
                ('Delta Logística e Distribuição', 'Contrato Delta - Assessoria em Contratos Comerciais', 'recorrente', 'atendimento', 'indicacao_parceiro', '2026-10-18'),
            ]
            for cust_name, contract_label, fee_type, origin, suborigin, sig_dt in demo_clients:
                cust = conn.execute(text("SELECT id FROM customers WHERE office_id=:o AND name=:n"), {'o': office_id, 'n': cust_name}).first()
                if not cust:
                    cust_id = secrets.token_hex(16)
                    conn.execute(text("INSERT INTO customers (id, office_id, name, created_at) VALUES (:id, :o, :n, :created)"), {
                        'id': cust_id, 'o': office_id, 'n': cust_name, 'created': sig_dt + 'T12:00:00+00:00'
                    })
                else:
                    cust_id = cust[0]

                cont = conn.execute(text("SELECT id FROM contracts WHERE office_id=:o AND label=:l"), {'o': office_id, 'l': contract_label}).first()
                if not cont:
                    cont_id = secrets.token_hex(16)
                    conn.execute(text("INSERT INTO contracts (id, office_id, customer_id, label, fee_type, origin, suborigin, signed_date, created_at) VALUES (:id, :o, :cust, :label, :type, :origin, :suborigin, :signed, :created)"), {
                        'id': cont_id, 'o': office_id, 'cust': cust_id, 'label': contract_label, 'type': fee_type, 'origin': origin, 'suborigin': suborigin,
                        'signed': sig_dt, 'created': sig_dt + 'T12:00:00+00:00'
                    })
                else:
                    conn.execute(text("UPDATE contracts SET origin=:origin, suborigin=:suborigin, signed_date=COALESCE(signed_date, :signed) WHERE id=:id"), {
                        'origin': origin, 'suborigin': suborigin, 'signed': sig_dt, 'id': cont[0]
                    })
            print("Contratos de demonstracao vinculados com sucesso!")

        bills_count = conn.execute(text("SELECT count(*) FROM bills WHERE office_id=:office"), {'office': office_id}).scalar() or 0
        if bills_count == 0:
            print("Vinculando títulos financeiros e metas de planejamento...")
            try:
                import populate_management
                populate_management.populate()
            except Exception as e:
                print("Aviso ao popular gestao:", e)

if __name__ == '__main__':
    seed()
    print("="*60)
    print(" SISTEMA COMPLETO DRE JURIDICO SCIENTIST (PWA v30 RC4)")
    print("="*60)
    print(" URL:      http://localhost:8000")
    print(" Status:   Servidor ativo e pronto para conexoes")
    print(" Acesse com o e-mail e a senha cadastrados do escritorio.")
    print("="*60)
    uvicorn.run(server.app, host='127.0.0.1', port=8000, log_level='info')

