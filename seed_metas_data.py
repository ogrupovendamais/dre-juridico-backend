"""Seed script to populate monthly targets, capacity, overhead pools, and contract specialties for Metas view."""
import secrets
from datetime import datetime, timezone
from sqlalchemy import text
import server

def run():
    now_iso = datetime.now(timezone.utc).isoformat()
    with server.db() as conn:
        # 1. Target offices: active tenant and demo tenant
        offices = ['73fb1ebaa3e43c6911479e7a', 'a5ff2fbc4c1c09167a9f989b']
        user_id = conn.execute(text("SELECT id FROM users WHERE email='admin@vendamaistech.com.br'")).scalar() or 'system'

        for o in offices:
            # Check if office exists
            if not conn.execute(text("SELECT 1 FROM offices WHERE id=:o"), {'o': o}).first():
                continue

            # A. Monthly targets
            targets = [
                ('2026-09', 4200000), # R$ 42.000,00
                ('2026-10', 5000000), # R$ 50.000,00
                ('2026-11', 7000000), # R$ 70.000,00
            ]
            for m, cents in targets:
                conn.execute(text("DELETE FROM monthly_targets WHERE office_id=:o AND month=:m"), {'o': o, 'm': m})
                conn.execute(
                    text("INSERT INTO monthly_targets (office_id, month, revenue_cents, created_by, updated_at) VALUES (:o, :m, :v, :u, :at)"),
                    {'o': o, 'm': m, 'v': cents, 'u': user_id, 'at': now_iso}
                )

            # B. Contract specialties
            contracts = conn.execute(text("SELECT id, label FROM contracts WHERE office_id=:o"), {'o': o}).fetchall()
            specialty_map = {
                'Alpha': 'Cível',
                'Beta': 'Tributário',
                'Tech': 'Trabalhista',
                'Fiscal': 'Tributário',
                'Ômega': 'Empresarial',
                'Omega': 'Empresarial',
                'Delta': 'Cível',
            }
            for cid, label in contracts:
                assigned = 'Cível'
                for kw, spec in specialty_map.items():
                    if kw.lower() in label.lower():
                        assigned = spec
                        break
                conn.execute(text("DELETE FROM contract_specialties WHERE office_id=:o AND contract_id=:id"), {'o': o, 'id': cid})
                conn.execute(
                    text("INSERT INTO contract_specialties (office_id, contract_id, specialty) VALUES (:o, :id, :s)"),
                    {'o': o, 'id': cid, 's': assigned}
                )

            # C. Capacity for professionals
            pros = conn.execute(text("SELECT id, name FROM professionals WHERE office_id=:o"), {'o': o}).fetchall()
            cap_minutes = {
                'Roberto': 6000,  # 100h
                'Camila': 7200,   # 120h
                'Lucas': 9600,    # 160h
                'Mariana': 9600,  # 160h
                'Felipe': 9600,   # 160h
            }
            for pid, name in pros:
                mins = 9600
                for kw, m in cap_minutes.items():
                    if kw.lower() in name.lower():
                        mins = m
                        break
                conn.execute(text("DELETE FROM monthly_capacity WHERE office_id=:o AND professional_id=:p AND month='2026-10'"), {'o': o, 'p': pid})
                conn.execute(
                    text("INSERT INTO monthly_capacity (id, office_id, professional_id, month, available_minutes, created_at) VALUES (:id, :o, :p, '2026-10', :mins, :at)"),
                    {'id': secrets.token_hex(16), 'o': o, 'p': pid, 'mins': mins, 'at': now_iso}
                )

            # D. Overhead pools (indirect costs simulation) for 2026-10
            conn.execute(text("DELETE FROM overhead_pools WHERE office_id=:o AND month='2026-10'"), {'o': o})
            pools = [
                ('Licenciamento Softwares Jurídicos & IA Legal', 450000, 'minutes_logged', 'Contrato SaaS Kurier + LexML + Antigravity AI'),
                ('Infraestrutura, Sede & Coworking Corporativo', 850000, 'minutes_logged', 'Condomínio, locação corporativa e conectividade dedicada'),
                ('Marketing Estratégico & Posicionamento', 520000, 'minutes_logged', 'Agência Venda+ Tech, Google Ads e produção de conteúdo jurídico'),
                ('Serviços de Contabilidade & Compliance', 310000, 'minutes_logged', 'Assessoria contábil externa e pareceres de conformidade'),
            ]
            for label, cents, basis, note in pools:
                conn.execute(
                    text("INSERT INTO overhead_pools (id, office_id, month, label, amount_cents, basis, source_note, created_at) VALUES (:id, :o, '2026-10', :l, :v, :b, :s, :at)"),
                    {'id': secrets.token_hex(16), 'o': o, 'l': label, 'v': cents, 'b': basis, 's': note, 'at': now_iso}
                )

        print("Seeding of Metas, Specialties, Capacity and Overhead Pools completed successfully!")

if __name__ == '__main__':
    run()
