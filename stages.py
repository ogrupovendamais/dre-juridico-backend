"""Stages & Procedural Intelligence module:
Manages procedural stages by legal area, contract stage budgets (horas previstas vs realizadas),
deviation calculations (sem divisão por zero), managerial costing, similar process benchmarks,
and diagnostic alerts.
"""
import math
import re
import secrets
import statistics
from decimal import Decimal
from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

# Catálogo padrão de etapas por área jurídica
DEFAULT_STAGE_TEMPLATES = {
    'trabalhista': [
        ('Atendimento e Análise Inicial', 1, 240, 'Entrevista inicial, análise de rescisão e documentação laboral'),
        ('Organização Documental', 2, 180, 'Triagem de holerites, cartões de ponto, TRCT e comprovantes'),
        ('Elaboração de Petição Inicial ou Defesa', 3, 480, 'Redação técnica da peça inaugural ou contestação trabalhista'),
        ('Protocolo e Distribuição', 4, 120, 'Distribuição no PJe-JT e conferência de custas/segredo'),
        ('Audiências (Inicial / Una / Instrução)', 5, 360, 'Preparação com preposto e testemunhas e realização da audiência'),
        ('Produção de Provas e Perícias', 6, 300, 'Quesitos periciais, acompanhamento técnico e impugnação de laudo'),
        ('Manifestações e Recursos (RO / RR)', 7, 720, 'Razões finais, embargos, recurso ordinário e contrarrazões'),
        ('Cumprimento de Sentença / Execução', 8, 480, 'Cálculos de liquidação de sentença e impugnação aos cálculos'),
        ('Encerramento e Arquivamento', 9, 120, 'Baixa na distribuição, certidões e prestação final de contas')
    ],
    'civel': [
        ('Consulta Prévia e Análise de Risco', 1, 240, 'Exame do caso, viabilidade jurídica e definição estratégica'),
        ('Coleta de Provas e Documentos', 2, 180, 'Obtenção de contratos, notificações e certidões notariais'),
        ('Petição Inicial / Contestação', 3, 600, 'Elaboração fundamentada da inicial ou peça de bloqueio'),
        ('Saneamento e Instrução Probatória', 4, 360, 'Especificação de provas, rol de testemunhas e audiência'),
        ('Recursos e Incidentes Processuais', 5, 600, 'Agravos, apelações e memoriais aos desembargadores'),
        ('Cumprimento de Sentença / Liquidação', 6, 360, 'Execução de título, penhora e levantamento de valores'),
        ('Finalização e Baixa Definitiva', 7, 120, 'Verificação de custas finais e encerramento do processo')
    ],
    'previdenciario': [
        ('Análise de CNIS e Contagem de Tempo', 1, 240, 'Verificação de vínculos, recolhimentos e simulação de RMI'),
        ('Requerimento Administrativo no INSS', 2, 300, 'Protocolo no Meu INSS, cumprimento de exigências e recurso CRPS'),
        ('Petição Inicial Judicial', 3, 420, 'Ajuizamento na Justiça Federal ou Juizado Especial Previdenciário'),
        ('Perícia Médica / Social', 4, 300, 'Formulação de quesitos médicos e orientação ao segurado'),
        ('Manifestação sobre Laudo Pericial', 5, 240, 'Impugnação ao laudo desfavorável ou concordância técnica'),
        ('Recursos (Turma Recursal / TRU)', 6, 480, 'Recursos inominados e uniformização jurisprudencial'),
        ('Implantação de Benefício e Precatório/RPV', 7, 300, 'Expedição de requisição de pagamento e saque judicial')
    ],
    'tributario': [
        ('Diagnóstico Fiscal e Levantamento de Créditos', 1, 720, 'Auditoria de livros fiscais e cálculo preliminar de indébito'),
        ('Defesa / Impugnação Administrativa', 2, 900, 'Elaboração de impugnação fiscal perante CARF ou SEFAZ'),
        ('Ação Anulatória / Mandado de Segurança', 3, 1080, 'Ajuizamento com pedido liminar de suspensão de exigibilidade'),
        ('Perícia Contábil e Quesitações', 4, 720, 'Acompanhamento do perito do juízo e laudo contábil-fiscal'),
        ('Recursos e Sustentação Oral', 5, 1200, 'Recursos perante Tribunais de Justiça, TRFs e STJ/STF'),
        ('Compensação / Levantamento de Depósito', 6, 480, 'Habilitação de crédito perante a Receita Federal ou alvará')
    ],
    'empresarial': [
        ('Due Diligence e Diagnóstico Jurídico', 1, 600, 'Análise de passivos contratuais, societários e de conformidade'),
        ('Minuta Contratual / Reestruturação Societária', 2, 840, 'Elaboração de acordos de acionistas, fusões ou contratos'),
        ('Rodadas de Negociação e Alinhamento', 3, 480, 'Reuniões técnicas de mediação e ajuste de cláusulas críticas'),
        ('Fechamento e Registro Societário', 4, 240, 'Arquivamento em Junta Comercial e órgãos reguladores'),
        ('Monitoramento Pós-Fechamento', 5, 360, 'Acompanhamento de obrigações de transição e governança')
    ],
    'familia': [
        ('Atendimento e Mediação Preliminar', 1, 300, 'Acolhimento da parte, triagem emocional e busca de consenso'),
        ('Levantamento Patrimonial e Documental', 2, 360, 'Mapeamento de bens, contas bancárias e documentos registrais'),
        ('Petição Inicial / Minuta de Acordo', 3, 480, 'Elaboração da ação de divórcio, alimentos, guarda ou inventário'),
        ('Audiência de Conciliação / Instrução', 4, 300, 'Participação com auxílio de mediação familiar'),
        ('Partilha de Bens e Formal de Partilha', 5, 480, 'Divisão patrimonial, ITCMD e esboço de partilha'),
        ('Averbação e Registro Imobiliário', 6, 180, 'Expedição de mandado de averbação e transferência de bens')
    ]
}

def setup(app, db, auth, editor, utc):
    with db() as c:
        # 1. Catálogo de templates de etapas processuais por área
        c.execute(text('''CREATE TABLE IF NOT EXISTS process_stage_templates (
            id VARCHAR(40) PRIMARY KEY,
            office_id VARCHAR(40),
            legal_area VARCHAR(60) NOT NULL,
            stage_name VARCHAR(140) NOT NULL,
            stage_order INTEGER NOT NULL,
            default_budget_minutes BIGINT NOT NULL DEFAULT 0,
            description VARCHAR(255)
        )'''))

        # 2. Etapas atribuídas a contratos/processos
        c.execute(text('''CREATE TABLE IF NOT EXISTS contract_stages (
            id VARCHAR(40) PRIMARY KEY,
            office_id VARCHAR(40) NOT NULL,
            contract_id VARCHAR(40) NOT NULL,
            stage_name VARCHAR(140) NOT NULL,
            stage_order INTEGER NOT NULL,
            planned_minutes BIGINT NOT NULL DEFAULT 0,
            status VARCHAR(30) NOT NULL DEFAULT 'EM_ANDAMENTO',
            created_at VARCHAR(40) NOT NULL
        )'''))

        # 3. Histórico de alterações e auditoria de orçamentos por etapa
        c.execute(text('''CREATE TABLE IF NOT EXISTS stage_hour_budgets (
            id VARCHAR(40) PRIMARY KEY,
            contract_stage_id VARCHAR(40) NOT NULL,
            planned_minutes BIGINT NOT NULL,
            updated_by VARCHAR(40) NOT NULL,
            updated_at VARCHAR(40) NOT NULL
        )'''))

        # 4. Trilha de auditoria específica para etapas
        c.execute(text('''CREATE TABLE IF NOT EXISTS stage_audit_events (
            id VARCHAR(40) PRIMARY KEY,
            office_id VARCHAR(40) NOT NULL,
            contract_id VARCHAR(40),
            stage_id VARCHAR(40),
            user_id VARCHAR(40) NOT NULL,
            action VARCHAR(60) NOT NULL,
            details TEXT,
            created_at VARCHAR(40) NOT NULL
        )'''))

        # 5. Adições seguras e não destrutivas na tabela worklogs
        for col, col_def in [
            ('stage_id', 'VARCHAR(40)'),
            ('activity_type', 'VARCHAR(80)'),
            ('start_time', 'VARCHAR(10)'),
            ('end_time', 'VARCHAR(10)'),
            ('pause_minutes', 'INTEGER DEFAULT 0')
        ]:
            try:
                c.execute(text(f'ALTER TABLE worklogs ADD COLUMN {col} {col_def}'))
            except Exception:
                pass

        # 6. Adição segura de legal_area em contracts se não existir
        try:
            c.execute(text("ALTER TABLE contracts ADD COLUMN legal_area VARCHAR(60) DEFAULT 'civel'"))
        except Exception:
            pass

        # 7. Preencher templates padrão no sistema se vazios
        count = c.execute(text('SELECT COUNT(*) FROM process_stage_templates WHERE office_id IS NULL')).scalar() or 0
        if count == 0:
            for area, stages in DEFAULT_STAGE_TEMPLATES.items():
                for name, order, minutes, desc in stages:
                    c.execute(text('''
                        INSERT INTO process_stage_templates (id, office_id, legal_area, stage_name, stage_order, default_budget_minutes, description)
                        VALUES (:id, NULL, :area, :name, :order, :min, :desc)
                    '''), {
                        'id': secrets.token_hex(16),
                        'area': area,
                        'name': name,
                        'order': order,
                        'min': minutes,
                        'desc': desc
                    })

    def log_stage_audit(c, office_id, user_id, action, contract_id=None, stage_id=None, details=''):
        c.execute(text('''
            INSERT INTO stage_audit_events VALUES (:id, :o, :c, :s, :u, :a, :d, :at)
        '''), {
            'id': secrets.token_hex(16),
            'o': office_id,
            'c': contract_id,
            's': stage_id,
            'u': user_id,
            'a': action,
            'd': details,
            'at': utc()
        })

    def ensure_contract_stages(c, office_id, contract_id):
        """Garante que o contrato possua etapas cadastradas. Caso não possua, cria a partir do template padrão."""
        rows = c.execute(text('''
            SELECT id, stage_name, stage_order, planned_minutes, status
            FROM contract_stages
            WHERE office_id = :o AND contract_id = :c
            ORDER BY stage_order
        '''), {'o': office_id, 'c': contract_id}).fetchall()
        if rows:
            return rows

        # Descobre a área jurídica do contrato (ou usa 'trabalhista' ou 'civel' como fallback)
        contract = c.execute(text('''
            SELECT legal_area, label FROM contracts WHERE id = :c AND office_id = :o
        '''), {'c': contract_id, 'o': office_id}).fetchone()
        
        area = 'civel'
        if contract and contract[0]:
            area = contract[0].lower().strip()
        elif contract and contract[1]:
            lbl = contract[1].lower()
            if 'trabalh' in lbl or 'reclama' in lbl:
                area = 'trabalhista'
            elif 'previd' in lbl or 'inss' in lbl:
                area = 'previdenciario'
            elif 'tribut' in lbl or 'fiscal' in lbl:
                area = 'tributario'
            elif 'societ' in lbl or 'empres' in lbl:
                area = 'empresarial'
            elif 'fam' in lbl or 'divorc' in lbl or 'invent' in lbl:
                area = 'familia'

        # Busca do catálogo
        templates = c.execute(text('''
            SELECT stage_name, stage_order, default_budget_minutes
            FROM process_stage_templates
            WHERE (office_id = :o OR office_id IS NULL) AND legal_area = :a
            ORDER BY stage_order
        '''), {'o': office_id, 'a': area}).fetchall()

        if not templates:
            templates = c.execute(text('''
                SELECT stage_name, stage_order, default_budget_minutes
                FROM process_stage_templates
                WHERE office_id IS NULL AND legal_area = 'civel'
                ORDER BY stage_order
            ''')).fetchall()

        for t_name, t_order, t_min in templates:
            c.execute(text('''
                INSERT INTO contract_stages (id, office_id, contract_id, stage_name, stage_order, planned_minutes, status, created_at)
                VALUES (:id, :o, :c, :name, :order, :min, 'EM_ANDAMENTO', :at)
            '''), {
                'id': secrets.token_hex(16),
                'o': office_id,
                'c': contract_id,
                'name': t_name,
                'order': t_order,
                'min': t_min,
                'at': utc()
            })

        return c.execute(text('''
            SELECT id, stage_name, stage_order, planned_minutes, status
            FROM contract_stages
            WHERE office_id = :o AND contract_id = :c
            ORDER BY stage_order
        '''), {'o': office_id, 'c': contract_id}).fetchall()

    # --- Pydantic Models ---
    class StageTemplateIn(BaseModel):
        legal_area: str = Field(min_length=2, max_length=60)
        stage_name: str = Field(min_length=2, max_length=140)
        stage_order: int = Field(ge=1, le=100)
        default_budget_hours: Decimal = Field(default=Decimal('0'), ge=0)
        description: str = Field(default='', max_length=255)

    class ContractStageIn(BaseModel):
        stage_name: str = Field(min_length=2, max_length=140)
        stage_order: int = Field(ge=1, le=100)
        planned_hours: Decimal = Field(default=Decimal('0'), ge=0)
        status: str = Field(default='EM_ANDAMENTO')

    class ContractStageUpdate(BaseModel):
        stage_name: str | None = Field(default=None, min_length=2, max_length=140)
        stage_order: int | None = Field(default=None, ge=1, le=100)
        planned_hours: Decimal | None = Field(default=None, ge=0)
        status: str | None = Field(default=None)

    class StageBudgetUpdate(BaseModel):
        planned_hours: Decimal = Field(ge=0)

    # --- Endpoints de Templates ---
    @app.get('/api/stages/templates')
    def list_stage_templates(area: str | None = None, u=Depends(auth)):
        query = '''
            SELECT id, office_id, legal_area, stage_name, stage_order, default_budget_minutes, description
            FROM process_stage_templates
            WHERE (office_id = :o OR office_id IS NULL)
        '''
        params = {'o': u['office_id']}
        if area:
            query += ' AND legal_area = :a'
            params['a'] = area.lower().strip()
        query += ' ORDER BY legal_area, stage_order'

        with db() as c:
            rows = c.execute(text(query), params).fetchall()

        templates = []
        for r in rows:
            templates.append({
                'id': r[0],
                'is_custom': bool(r[1]),
                'legal_area': r[2],
                'stage_name': r[3],
                'stage_order': r[4],
                'default_budget_hours': round(r[5] / 60.0, 2),
                'default_budget_minutes': r[5],
                'description': r[6] or ''
            })
        return templates

    @app.post('/api/stages/templates', status_code=201)
    def create_stage_template(data: StageTemplateIn, u=Depends(editor)):
        ident = secrets.token_hex(16)
        minutes = int((data.default_budget_hours * 60).to_integral_value())
        with db() as c:
            c.execute(text('''
                INSERT INTO process_stage_templates (id, office_id, legal_area, stage_name, stage_order, default_budget_minutes, description)
                VALUES (:id, :o, :area, :name, :order, :min, :desc)
            '''), {
                'id': ident,
                'o': u['office_id'],
                'area': data.legal_area.lower().strip(),
                'name': data.stage_name.strip(),
                'order': data.stage_order,
                'min': minutes,
                'desc': data.description.strip()
            })
            log_stage_audit(c, u['office_id'], u['id'], 'stage_template.create', details=data.stage_name)
        return {'id': ident}

    # --- Endpoints de Etapas por Contrato / Processo ---
    @app.get('/api/contracts/{contract_id}/stages')
    def get_contract_stages(contract_id: str, u=Depends(auth)):
        with db() as c:
            # Verifica existência do contrato no escritório
            contract = c.execute(text('SELECT id, label, legal_area FROM contracts WHERE id = :c AND office_id = :o'), {
                'c': contract_id, 'o': u['office_id']
            }).fetchone()
            if not contract:
                raise HTTPException(404, 'Processo/Contrato não encontrado')

            rows = ensure_contract_stages(c, u['office_id'], contract_id)

            # Consulta dados acumulados de horas por etapa para este contrato
            stats = c.execute(text('''
                SELECT w.stage_id,
                       SUM(CASE WHEN w.status = 'APPROVED' THEN w.minutes ELSE 0 END) as app_min,
                       SUM(CASE WHEN w.status = 'PENDING' THEN w.minutes ELSE 0 END) as pend_min,
                       SUM(CASE WHEN w.status = 'APPROVED' THEN w.cost_cents ELSE 0 END) as cost_cents,
                       COUNT(w.id) as total_entries
                FROM worklogs w
                WHERE w.office_id = :o AND w.contract_id = :c
                GROUP BY w.stage_id
            '''), {'o': u['office_id'], 'c': contract_id}).fetchall()
            stat_map = {r[0]: {'approved_minutes': r[1] or 0, 'pending_minutes': r[2] or 0, 'cost_cents': r[3] or 0, 'count': r[4]} for r in stats}

        result = []
        for r in rows:
            stg_id = r[0]
            planned_min = r[3]
            planned_hours = round(planned_min / 60.0, 2)
            st = stat_map.get(stg_id, {'approved_minutes': 0, 'pending_minutes': 0, 'cost_cents': 0, 'count': 0})
            actual_min = st['approved_minutes'] + st['pending_minutes']
            actual_hours = round(actual_min / 60.0, 2)
            approved_hours = round(st['approved_minutes'] / 60.0, 2)
            pending_hours = round(st['pending_minutes'] / 60.0, 2)
            saldo_hours = round(planned_hours - actual_hours, 2)
            desvio_abs = round(actual_hours - planned_hours, 2)
            
            # Cálculo de desvio percentual seguro: nunca divide por zero
            desvio_pct = None
            if planned_hours > 0:
                desvio_pct = round(((actual_hours - planned_hours) / planned_hours) * 100.0, 1)

            result.append({
                'id': stg_id,
                'stage_name': r[1],
                'stage_order': r[2],
                'status': r[4],
                'planned_minutes': planned_min,
                'planned_hours': planned_hours,
                'actual_hours': actual_hours,
                'approved_hours': approved_hours,
                'pending_hours': pending_hours,
                'saldo_hours': saldo_hours,
                'desvio_absoluto_hours': desvio_abs,
                'desvio_percentual': desvio_pct,
                'cost_approved_cents': st['cost_cents'],
                'worklog_count': st['count']
            })

        return {
            'contract_id': contract_id,
            'contract_label': contract[1],
            'legal_area': contract[2] or 'civel',
            'stages': result
        }

    @app.post('/api/contracts/{contract_id}/stages', status_code=201)
    def add_contract_stage(contract_id: str, data: ContractStageIn, u=Depends(editor)):
        with db() as c:
            contract = c.execute(text('SELECT 1 FROM contracts WHERE id = :c AND office_id = :o'), {
                'c': contract_id, 'o': u['office_id']
            }).fetchone()
            if not contract:
                raise HTTPException(404, 'Processo/Contrato não encontrado')

            ident = secrets.token_hex(16)
            minutes = int((data.planned_hours * 60).to_integral_value())
            c.execute(text('''
                INSERT INTO contract_stages (id, office_id, contract_id, stage_name, stage_order, planned_minutes, status, created_at)
                VALUES (:id, :o, :c, :name, :order, :min, :status, :at)
            '''), {
                'id': ident,
                'o': u['office_id'],
                'c': contract_id,
                'name': data.stage_name.strip(),
                'order': data.stage_order,
                'min': minutes,
                'status': data.status,
                'at': utc()
            })
            log_stage_audit(c, u['office_id'], u['id'], 'contract_stage.create', contract_id=contract_id, stage_id=ident, details=data.stage_name)
        return {'id': ident}

    @app.put('/api/contracts/{contract_id}/stages/{stage_id}')
    def update_contract_stage(contract_id: str, stage_id: str, data: ContractStageUpdate, u=Depends(editor)):
        with db() as c:
            existing = c.execute(text('''
                SELECT id, planned_minutes FROM contract_stages
                WHERE id = :s AND contract_id = :c AND office_id = :o
            '''), {'s': stage_id, 'c': contract_id, 'o': u['office_id']}).fetchone()
            if not existing:
                raise HTTPException(404, 'Etapa não encontrada no processo especificado')

            updates = []
            params = {'s': stage_id, 'c': contract_id, 'o': u['office_id']}

            if data.stage_name is not None:
                updates.append('stage_name = :name')
                params['name'] = data.stage_name.strip()
            if data.stage_order is not None:
                updates.append('stage_order = :order')
                params['order'] = data.stage_order
            if data.status is not None:
                updates.append('status = :status')
                params['status'] = data.status.upper()
            if data.planned_hours is not None:
                new_min = int((data.planned_hours * 60).to_integral_value())
                updates.append('planned_minutes = :min')
                params['min'] = new_min

                # Grava histórico de alteração do orçamento de esforço
                c.execute(text('''
                    INSERT INTO stage_hour_budgets (id, contract_stage_id, planned_minutes, updated_by, updated_at)
                    VALUES (:id, :cs, :min, :u, :at)
                '''), {
                    'id': secrets.token_hex(16),
                    'cs': stage_id,
                    'min': new_min,
                    'u': u['id'],
                    'at': utc()
                })

            if updates:
                c.execute(text(f'''
                    UPDATE contract_stages
                    SET {", ".join(updates)}
                    WHERE id = :s AND contract_id = :c AND office_id = :o
                '''), params)
                log_stage_audit(c, u['office_id'], u['id'], 'contract_stage.update', contract_id=contract_id, stage_id=stage_id, details=str(params))

        return {'id': stage_id, 'updated': True}

    # --- Motor de Inteligência & Dashboard Analítico de Etapas ---
    @app.get('/api/productivity/stages')
    def report_stage_intelligence(contract_id: str | None = None,
                                  professional_id: str | None = None,
                                  month: str | None = None,
                                  u=Depends(auth)):
        if month and not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', month):
            raise HTTPException(422, 'Mês deve ser AAAA-MM')

        params = {'o': u['office_id']}
        worklog_filter = ''
        if month:
            y, m = map(int, month.split('-'))
            ny = y + (m == 12)
            nm = 1 if m == 12 else m + 1
            worklog_filter += ' AND w.work_date >= :b AND w.work_date < :e'
            params.update(b=f'{y:04d}-{m:02d}-01', e=f'{ny:04d}-{nm:02d}-01')

        if contract_id:
            worklog_filter += ' AND w.contract_id = :cid'
            params['cid'] = contract_id

        if professional_id:
            worklog_filter += ' AND w.professional_id = :pid'
            params['pid'] = professional_id

        with db() as c:
            # 1. Carrega todos os contratos do escritório
            contracts_query = "SELECT id, label, fee_type, COALESCE(legal_area, 'civel') FROM contracts WHERE office_id = :o"
            if contract_id:
                contracts_query += ' AND id = :cid'
            contracts_query += ' ORDER BY label'
            c_rows = c.execute(text(contracts_query), params).fetchall()

            # Garante etapas para os contratos avaliados
            for crow in c_rows:
                ensure_contract_stages(c, u['office_id'], crow[0])

            # 2. Carrega todas as etapas dos contratos
            stage_q = '''
                SELECT cs.id, cs.contract_id, cs.stage_name, cs.stage_order, cs.planned_minutes, cs.status
                FROM contract_stages cs
                WHERE cs.office_id = :o
            '''
            if contract_id:
                stage_q += ' AND cs.contract_id = :cid'
            stage_q += ' ORDER BY cs.contract_id, cs.stage_order'
            stage_rows = c.execute(text(stage_q), params).fetchall()

            # 3. Carrega os apontamentos detalhados com informações da etapa e profissional
            wl_q = f'''
                SELECT w.id, w.contract_id, w.professional_id, p.name,
                       w.stage_id, cs.stage_name, w.activity_type,
                       w.work_date, w.minutes, w.cost_cents, w.status,
                       p.hourly_cost_cents, w.description
                FROM worklogs w
                JOIN professionals p ON p.id = w.professional_id AND p.office_id = w.office_id
                LEFT JOIN contract_stages cs ON cs.id = w.stage_id AND cs.office_id = w.office_id
                WHERE w.office_id = :o {worklog_filter}
                ORDER BY w.work_date DESC, w.created_at DESC
            '''
            wl_rows = c.execute(text(wl_q), params).fetchall()

        # Estrutura dados por Contrato e Etapa
        # Etapas por contrato
        stages_by_contract = {}
        stage_meta = {}
        for s_id, s_cid, s_name, s_order, s_plan_min, s_status in stage_rows:
            st_dict = {
                'id': s_id,
                'stage_name': s_name,
                'stage_order': s_order,
                'status': s_status,
                'planned_minutes': s_plan_min,
                'planned_hours': round(s_plan_min / 60.0, 2),
                'actual_minutes': 0,
                'approved_minutes': 0,
                'pending_minutes': 0,
                'cost_approved_cents': 0,
                'worklog_count': 0,
                'professionals': {}
            }
            stages_by_contract.setdefault(s_cid, []).append(st_dict)
            stage_meta[s_id] = st_dict

        # Acumula apontamentos
        contract_data = {}
        for cid, clabel, cfee, carea in c_rows:
            contract_data[cid] = {
                'contract_id': cid,
                'label': clabel,
                'fee_type': cfee,
                'legal_area': carea,
                'planned_minutes': sum(s['planned_minutes'] for s in stages_by_contract.get(cid, [])),
                'actual_minutes': 0,
                'approved_minutes': 0,
                'pending_minutes': 0,
                'cost_approved_cents': 0,
                'worklog_count': 0,
                'stages': stages_by_contract.get(cid, [])
            }

        # Profissionais
        prof_data = {}
        # Atividades
        activity_data = {}
        # Áreas
        area_data = {}

        for w_id, w_cid, w_pid, w_pname, w_sid, w_sname, w_act, w_date, w_min, w_cost, w_status, w_hcost, w_desc in wl_rows:
            is_approved = (w_status == 'APPROVED')
            is_pending = (w_status == 'PENDING')
            cost_app = w_cost if is_approved else 0

            # Atualiza Contrato
            if w_cid in contract_data:
                c_item = contract_data[w_cid]
                c_item['actual_minutes'] += w_min
                c_item['worklog_count'] += 1
                if is_approved:
                    c_item['approved_minutes'] += w_min
                    c_item['cost_approved_cents'] += cost_app
                elif is_pending:
                    c_item['pending_minutes'] += w_min

            # Atualiza Etapa
            if w_sid and w_sid in stage_meta:
                s_item = stage_meta[w_sid]
                s_item['actual_minutes'] += w_min
                s_item['worklog_count'] += 1
                if is_approved:
                    s_item['approved_minutes'] += w_min
                    s_item['cost_approved_cents'] += cost_app
                elif is_pending:
                    s_item['pending_minutes'] += w_min

                # Profissional na etapa
                p_st = s_item['professionals'].setdefault(w_pid, {'name': w_pname, 'minutes': 0, 'cost_cents': 0})
                p_st['minutes'] += w_min
                if is_approved:
                    p_st['cost_cents'] += cost_app

            # Atualiza Profissional
            p_item = prof_data.setdefault(w_pid, {
                'professional_id': w_pid,
                'name': w_pname,
                'hourly_cost_cents': w_hcost,
                'total_minutes': 0,
                'approved_minutes': 0,
                'pending_minutes': 0,
                'cost_approved_cents': 0,
                'contracts': {},
                'stages': {},
                'activities': {}
            })
            p_item['total_minutes'] += w_min
            if is_approved:
                p_item['approved_minutes'] += w_min
                p_item['cost_approved_cents'] += cost_app
            elif is_pending:
                p_item['pending_minutes'] += w_min

            # Distribuições do profissional
            c_label = contract_data.get(w_cid, {}).get('label', 'Contrato')
            p_item['contracts'][c_label] = p_item['contracts'].get(c_label, 0) + w_min

            st_label = w_sname or 'Etapa não vinculada'
            p_item['stages'][st_label] = p_item['stages'].get(st_label, 0) + w_min

            act_label = w_act or 'Atividade Geral'
            p_item['activities'][act_label] = p_item['activities'].get(act_label, 0) + w_min
            activity_data[act_label] = activity_data.get(act_label, 0) + w_min

            # Atualiza Área
            area_name = contract_data.get(w_cid, {}).get('legal_area', 'Geral')
            ar = area_data.setdefault(area_name, {'area': area_name, 'actual_minutes': 0, 'cost_approved_cents': 0, 'contracts_set': set()})
            ar['actual_minutes'] += w_min
            ar['cost_approved_cents'] += cost_app
            ar['contracts_set'].add(w_cid)

        # Formata Contratos com Desvios
        contracts_out = []
        alerts = []

        for cid, c_item in contract_data.items():
            planned_h = round(c_item['planned_minutes'] / 60.0, 2)
            actual_h = round(c_item['actual_minutes'] / 60.0, 2)
            approved_h = round(c_item['approved_minutes'] / 60.0, 2)
            pending_h = round(c_item['pending_minutes'] / 60.0, 2)
            saldo_h = round(planned_h - actual_h, 2)
            desvio_abs_h = round(actual_h - planned_h, 2)
            desvio_pct = None
            if planned_h > 0:
                desvio_pct = round(((actual_h - planned_h) / planned_h) * 100.0, 1)

            # Formata etapas
            stages_out = []
            for s in c_item['stages']:
                s_plan_h = s['planned_hours']
                s_act_h = round(s['actual_minutes'] / 60.0, 2)
                s_app_h = round(s['approved_minutes'] / 60.0, 2)
                s_pend_h = round(s['pending_minutes'] / 60.0, 2)
                s_saldo_h = round(s_plan_h - s_act_h, 2)
                s_desv_abs = round(s_act_h - s_plan_h, 2)
                s_desv_pct = None
                if s_plan_h > 0:
                    s_desv_pct = round(((s_act_h - s_plan_h) / s_plan_h) * 100.0, 1)

                pro_list = [{'id': k, 'name': v['name'], 'hours': round(v['minutes'] / 60.0, 2), 'cost_cents': v['cost_cents']} for k, v in s['professionals'].items()]

                s_cost_reais = round(s['cost_approved_cents'] / 100.0, 2)
                stages_out.append({
                    'id': s['id'],
                    'stage_id': s['id'],
                    'stage_name': s['stage_name'],
                    'stage_order': s['stage_order'],
                    'status': s['status'],
                    'planned_hours': s_plan_h,
                    'actual_hours': s_act_h,
                    'approved_hours': s_app_h,
                    'pending_hours': s_pend_h,
                    'saldo_hours': s_saldo_h,
                    'remaining_hours': s_saldo_h,
                    'desvio_absoluto_hours': s_desv_abs,
                    'desvio_percentual': s_desv_pct,
                    'cost_approved_cents': s['cost_approved_cents'],
                    'approved_cost': s_cost_reais,
                    'worklog_count': s['worklog_count'],
                    'professionals': pro_list
                })

                # Geração de diagnósticos de etapa
                if s_plan_h > 0 and s_act_h > s_plan_h:
                    alerts.append({
                        'severity': 'warning' if s_desv_pct < 50 else 'danger',
                        'category': 'Etapa com Desvio Relevante',
                        'title': f'Etapa "{s["stage_name"]}" excedeu orçamento em {c_item["label"]}',
                        'fact': f'Executadas {s_act_h}h contra {s_plan_h}h planejadas.',
                        'message': f'Executadas {s_act_h}h contra {s_plan_h}h planejadas.',
                        'metric_affected': 'Desvio de Esforço por Etapa',
                        'data_supporting': f'Excesso de +{s_desv_abs}h (+{s_desv_pct}%). Custo gerencial aprovado: R$ {s["cost_approved_cents"]/100:.2f}.',
                        'impact': 'Pressão sobre a margem de contribuição do contrato e potencial sobrecarga operacional.',
                        'recommended_action': 'Avaliar se houve complexidade probatória atípica ou necessidade de renegociação de honorários.',
                        'recommendation': 'Avaliar se houve complexidade probatória atípica ou necessidade de renegociação de honorários.'
                    })

            # Diagnósticos do contrato geral
            if planned_h > 0:
                consumption_pct = (actual_h / planned_h) * 100.0
                if consumption_pct >= 100.0:
                    alerts.append({
                        'severity': 'danger',
                        'category': 'Excesso de Orçamento Global',
                        'title': f'Orçamento 100% esgotado no processo {c_item["label"]}',
                        'fact': f'O processo acumulou {actual_h}h, ultrapassando as {planned_h}h contratadas.',
                        'message': f'O processo acumulou {actual_h}h, ultrapassando as {planned_h}h contratadas.',
                        'metric_affected': 'Saldo de Horas do Contrato',
                        'data_supporting': f'Consumo de {consumption_pct:.1f}% do teto ({actual_h}h / {planned_h}h). Desvio: +{desvio_abs_h}h.',
                        'impact': 'Horas adicionais sem cobertura contratual reduzem a rentabilidade efetiva.',
                        'recommended_action': 'Revisar escopo com o cliente ou emitir aditivo de honorários para novas fases processuais.',
                        'recommendation': 'Revisar escopo com o cliente ou emitir aditivo de honorários para novas fases processuais.'
                    })
                elif consumption_pct >= 80.0:
                    alerts.append({
                        'severity': 'warning',
                        'category': 'Atenção Orçamentária (>= 80%)',
                        'title': f'Alerta preventivo: {c_item["label"]} consumiu {consumption_pct:.1f}% do esforço',
                        'fact': f'Restam apenas {saldo_h}h disponíveis das {planned_h}h previstas.',
                        'message': f'Restam apenas {saldo_h}h disponíveis das {planned_h}h previstas.',
                        'metric_affected': 'Projeção de Término do Processo',
                        'data_supporting': f'{actual_h}h realizadas de {planned_h}h planejadas.',
                        'impact': 'Risco de estouro do orçamento caso restem etapas críticas pendentes.',
                        'recommended_action': 'Priorizar atos essenciais e monitorar o tempo dos próximos apontamentos da equipe.',
                        'recommendation': 'Priorizar atos essenciais e monitorar o tempo dos próximos apontamentos da equipe.'
                    })

            if pending_h > 0:
                alerts.append({
                    'severity': 'info',
                    'category': 'Apontamentos Pendentes de Homologação',
                    'title': f'{pending_h}h pendentes de aprovação em {c_item["label"]}',
                    'fact': 'Existem registros de tempo submetidos pelo Time Studio aguardando revisão do gestor.',
                    'message': 'Existem registros de tempo submetidos pelo Time Studio aguardando revisão do gestor.',
                    'metric_affected': 'Custo Gerencial Apurado',
                    'data_supporting': f'{pending_h}h ainda não incorporadas ao custo financeiro gerencial.',
                    'impact': 'Subavaliação temporária do custo real da causa no painel de rentabilidade.',
                    'recommended_action': 'Acessar a Central de Homologação e revisar os apontamentos pendentes.',
                    'recommendation': 'Acessar a Central de Homologação e revisar os apontamentos pendentes.'
                })

            c_cost_reais = round(c_item['cost_approved_cents'] / 100.0, 2)
            contracts_out.append({
                'contract_id': cid,
                'id': cid,
                'label': c_item['label'],
                'title': c_item['label'],
                'fee_type': c_item['fee_type'],
                'legal_area': c_item['legal_area'],
                'area': c_item['legal_area'],
                'planned_hours': planned_h,
                'actual_hours': actual_h,
                'approved_hours': approved_h,
                'pending_hours': pending_h,
                'saldo_hours': saldo_h,
                'remaining_hours': saldo_h,
                'total_planned_hours': planned_h,
                'total_actual_hours': actual_h,
                'total_approved_hours': approved_h,
                'total_pending_hours': pending_h,
                'total_remaining_hours': saldo_h,
                'desvio_absoluto_hours': desvio_abs_h,
                'desvio_percentual': desvio_pct,
                'cost_approved_cents': c_item['cost_approved_cents'],
                'approved_cost': c_cost_reais,
                'total_approved_cost': c_cost_reais,
                'worklog_count': c_item['worklog_count'],
                'stages': stages_out
            })

        # Alerta para apontamentos de sessão prolongada (> 4 horas ininterruptas)
        for w in wl_rows:
            if w[8] > 240:
                alerts.append({
                    'severity': 'warning',
                    'category': 'Atividade Prolongada (> 4h)',
                    'title': f'Apontamento extenso ({round(w[8]/60.0, 1)}h) registrado por {w[3]}',
                    'fact': f'Sessão contínua de {round(w[8]/60.0, 1)}h em {w[7]} na atividade "{w[6] or "Geral"}".',
                    'message': f'Sessão contínua de {round(w[8]/60.0, 1)}h em {w[7]} na atividade "{w[6] or "Geral"}".',
                    'metric_affected': 'Concentração de Esforço',
                    'data_supporting': f'Apontamento ID {w[0][:8]} no contrato {contract_data.get(w[1], {}).get("label")}.',
                    'impact': 'Possível falta de detalhamento ou cronômetro esquecido aberto.',
                    'recommended_action': 'Verificar com o profissional a exatidão das horas e incentivar apontamentos fracionados por ato.',
                    'recommendation': 'Verificar com o profissional a exatidão das horas e incentivar apontamentos fracionados por ato.'
                })

        # Formata profissionais
        professionals_out = []
        for p in prof_data.values():
            p_actual_h = round(p['total_minutes'] / 60.0, 2)
            p_cost_reais = round(p['cost_approved_cents'] / 100.0, 2)
            p_rate_reais = round(p['hourly_cost_cents'] / 100.0, 2)
            top_stg = [{'name': k, 'hours': round(v / 60.0, 2)} for k, v in sorted(p['stages'].items(), key=lambda x: -x[1])]
            top_act = [{'type': k, 'name': k, 'hours': round(v / 60.0, 2)} for k, v in sorted(p['activities'].items(), key=lambda x: -x[1])]
            professionals_out.append({
                'professional_id': p['professional_id'],
                'name': p['name'],
                'hourly_cost_cents': p['hourly_cost_cents'],
                'hourly_rate': p_rate_reais,
                'total_hours': p_actual_h,
                'actual_hours': p_actual_h,
                'approved_hours': round(p['approved_minutes'] / 60.0, 2),
                'pending_hours': round(p['pending_minutes'] / 60.0, 2),
                'cost_approved_cents': p['cost_approved_cents'],
                'approved_cost': p_cost_reais,
                'contracts': [{'name': k, 'hours': round(v / 60.0, 2)} for k, v in sorted(p['contracts'].items(), key=lambda x: -x[1])],
                'stages': top_stg,
                'top_stages': top_stg,
                'activities': top_act,
                'top_activities': top_act
            })

        # Formata áreas
        areas_out = []
        for a in area_data.values():
            cnt = len(a['contracts_set'])
            tot_h = round(a['actual_minutes'] / 60.0, 2)
            areas_out.append({
                'area': a['area'],
                'total_hours': tot_h,
                'cost_approved_cents': a['cost_approved_cents'],
                'total_cost': round(a['cost_approved_cents'] / 100.0, 2),
                'contract_count': cnt,
                'avg_hours_per_contract': round(tot_h / cnt, 2) if cnt > 0 else 0.0
            })

        # Totais consolidados
        total_planned_m = sum(c['planned_minutes'] for c in contract_data.values())
        total_actual_m = sum(c['actual_minutes'] for c in contract_data.values())
        total_approved_m = sum(c['approved_minutes'] for c in contract_data.values())
        total_pending_m = sum(c['pending_minutes'] for c in contract_data.values())
        total_cost_app = sum(c['cost_approved_cents'] for c in contract_data.values())
        total_saldo_m = total_planned_m - total_actual_m
        total_desvio_pct = round(((total_actual_m - total_planned_m) / total_planned_m * 100.0), 1) if total_planned_m > 0 else 0.0

        return {
            'month': month,
            'totals': {
                'planned_hours': round(total_planned_m / 60.0, 2),
                'actual_hours': round(total_actual_m / 60.0, 2),
                'approved_hours': round(total_approved_m / 60.0, 2),
                'pending_hours': round(total_pending_m / 60.0, 2),
                'saldo_hours': round(total_saldo_m / 60.0, 2),
                'remaining_hours': round(total_saldo_m / 60.0, 2),
                'desvio_percentual': total_desvio_pct,
                'cost_approved_cents': total_cost_app,
                'approved_cost': round(total_cost_app / 100.0, 2),
                'contracts_count': len(contracts_out),
                'alerts_count': len(alerts)
            },
            'contracts': contracts_out,
            'professionals': professionals_out,
            'areas': areas_out,
            'activities': [{'name': k, 'hours': round(v / 60.0, 2)} for k, v in sorted(activity_data.items(), key=lambda x: -x[1])],
            'alerts': alerts[:20],
            'methodological_notes': [
                'O custo gerencial de horas é calculado unicamente sobre apontamentos APROVADOS.',
                'Horas pendentes são contabilizadas no esforço físico, mas não integram o custo gerencial até homologação.',
                'Custos gerenciais de mão de obra não representam despesas no demonstrativo contábil/DRE oficial.',
                'Desvios de horas são comparativos de planejamento e não implicam automaticamente ineficiência técnica.'
            ]
        }

    # --- Comparação entre Processos Semelhantes (Benchmarking Estatístico) ---
    @app.get('/api/productivity/stages/benchmarks')
    def get_stage_benchmarks(area: str | None = None, u=Depends(auth)):
        params = {'o': u['office_id']}
        area_filter = ''
        if area:
            area_filter = " AND COALESCE(c.legal_area, 'civel') = :area"
            params['area'] = area.lower().strip()

        with db() as c:
            # Garante que os contratos do escritório tenham suas etapas inicializadas
            all_c = c.execute(text('SELECT id FROM contracts WHERE office_id = :o'), {'o': u['office_id']}).fetchall()
            for oc in all_c:
                ensure_contract_stages(c, u['office_id'], oc[0])

            # Seleciona contratos com total de horas e horas por etapa
            rows = c.execute(text(f'''
                SELECT c.id, c.label, COALESCE(c.legal_area, 'civel') as area, c.fee_type,
                       cs.stage_name, cs.stage_order,
                       COALESCE(SUM(w.minutes), 0) as stage_minutes
                FROM contracts c
                JOIN contract_stages cs ON cs.contract_id = c.id AND cs.office_id = c.office_id
                LEFT JOIN worklogs w ON w.contract_id = c.id AND w.stage_id = cs.id AND w.office_id = c.office_id
                WHERE c.office_id = :o {area_filter}
                GROUP BY c.id, c.label, c.legal_area, c.fee_type, cs.stage_name, cs.stage_order
                ORDER BY c.legal_area, c.id, cs.stage_order
            '''), params).fetchall()

        # Agrupa por área jurídica
        cohorts = {}
        for cid, clabel, carea, cfee, sname, sorder, smin in rows:
            c_area = carea.lower().strip()
            cohort = cohorts.setdefault(c_area, {'contracts': {}, 'stages': {}})
            
            # Contrato
            con = cohort['contracts'].setdefault(cid, {'label': clabel, 'fee_type': cfee, 'total_minutes': 0})
            con['total_minutes'] += smin

            # Etapa
            st_list = cohort['stages'].setdefault(sname, [])
            st_list.append(smin)

        benchmarks = []
        for carea, data in cohorts.items():
            contracts = list(data['contracts'].values())
            n = len(contracts)
            if n == 0:
                continue

            hours_list = [round(c['total_minutes'] / 60.0, 2) for c in contracts]
            avg_h = round(statistics.mean(hours_list), 2) if hours_list else 0.0
            med_h = round(statistics.median(hours_list), 2) if hours_list else 0.0
            min_h = min(hours_list) if hours_list else 0.0
            max_h = max(hours_list) if hours_list else 0.0
            std_dev = round(statistics.stdev(hours_list), 2) if len(hours_list) > 1 else 0.0

            # Médias por etapa
            stage_stats = []
            for st_name, mins in data['stages'].items():
                st_hours = [round(m / 60.0, 2) for m in mins]
                st_avg = round(statistics.mean(st_hours), 2) if st_hours else 0.0
                st_med = round(statistics.median(st_hours), 2) if st_hours else 0.0
                stage_stats.append({
                    'stage_name': st_name,
                    'average_hours': st_avg,
                    'mean_hours': st_avg,
                    'median_hours': st_med,
                    'sample_entries': len(mins)
                })

            rel_rating = 'Alta' if n >= 10 else ('Média' if n >= 4 else 'Inicial (Amostra pequena)')
            rel_code = 'ALTA' if n >= 10 else ('MEDIA' if n >= 4 else 'INICIAL')
            benchmarks.append({
                'legal_area': carea,
                'area': carea,
                'sample_size_n': n,
                'sample_size': n,
                'average_hours': avg_h,
                'mean_hours': avg_h,
                'median_hours': med_h,
                'min_hours': min_h,
                'max_hours': max_h,
                'dispersion_std_dev': std_dev,
                'dispersion_hours': std_dev,
                'stages_breakdown': stage_stats,
                'stages_benchmark': stage_stats,
                'reliability_rating': rel_rating,
                'reliability': rel_code,
                'reliability_label': f'{rel_rating} Confiança' if n >= 4 else rel_rating
            })

        return {
            'benchmarks': benchmarks,
            'cohorts': benchmarks,
            'limitations_note': 'Dados exclusivamente descritivos. Amostras reduzidas refletem fase inicial de apontamentos e não devem ser interpretadas como parâmetros determinísticos ou causais.'
        }
