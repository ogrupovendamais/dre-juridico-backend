"""Time Studio module: PWA backend, professional invites, idempotent timesheet sync,
and administrative approval workflow integrated with managerial costing.
"""
import hashlib
import re
import secrets
import time
from decimal import Decimal
from fastapi import Depends, HTTPException, Header
from pydantic import BaseModel, Field
from sqlalchemy import text

INVITE_EXPIRES_SECONDS = 48 * 3600  # 48 hours
SESSION_EXPIRES_SECONDS = 7 * 86400  # 7 days

def hash_pw(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), bytes.fromhex(salt), 310000).hex()
    return salt + '$' + digest

def verify_pw(password: str, saved: str) -> bool:
    try:
        salt, expected = saved.split('$')
        digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), bytes.fromhex(salt), 310000).hex()
        return secrets.compare_digest(digest, expected)
    except Exception:
        return False

def setup(app, db, auth, editor, utc):
    with db() as c:
        # 1. Professional invites table
        c.execute(text('''CREATE TABLE IF NOT EXISTS professional_invites (
            id VARCHAR(40) PRIMARY KEY,
            office_id VARCHAR(40) NOT NULL,
            professional_id VARCHAR(40) NOT NULL,
            email VARCHAR(180) NOT NULL,
            token_hash CHAR(64) NOT NULL UNIQUE,
            expires_at BIGINT NOT NULL,
            used_at VARCHAR(40),
            created_by VARCHAR(40) NOT NULL,
            created_at VARCHAR(40) NOT NULL
        )'''))

        # 2. Professional credentials table
        c.execute(text('''CREATE TABLE IF NOT EXISTS professional_accounts (
            id VARCHAR(40) PRIMARY KEY,
            office_id VARCHAR(40) NOT NULL,
            professional_id VARCHAR(40) NOT NULL UNIQUE,
            email VARCHAR(180) NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at VARCHAR(40) NOT NULL
        )'''))

        # 3. Time Studio dedicated sessions table
        c.execute(text('''CREATE TABLE IF NOT EXISTS timestudio_sessions (
            token_hash CHAR(64) PRIMARY KEY,
            professional_id VARCHAR(40) NOT NULL,
            office_id VARCHAR(40) NOT NULL,
            expires_at BIGINT NOT NULL
        )'''))

        # 4. Safe migration of worklogs table to support approval, idempotency, and notes
        for col_def in [
            ('status', 'VARCHAR(20) DEFAULT "APPROVED"'),
            ('description', 'VARCHAR(500)'),
            ('idempotency_key', 'VARCHAR(64)'),
            ('approved_by', 'VARCHAR(40)'),
            ('approved_at', 'VARCHAR(40)'),
            ('rejection_reason', 'VARCHAR(250)'),
            ('source', 'VARCHAR(20) DEFAULT "web"')
        ]:
            col_name, col_type = col_def
            try:
                c.execute(text(f'ALTER TABLE worklogs ADD COLUMN {col_name} {col_type}'))
            except Exception:
                pass
        
        # Ensure any legacy entries without status are marked APPROVED
        c.execute(text("UPDATE worklogs SET status = 'APPROVED' WHERE status IS NULL OR status = ''"))

    def log_audit(c, office_id, user_id, action, target_id):
        c.execute(text('INSERT INTO audit VALUES (:id, :o, :u, :a, :t, :at)'), {
            'id': secrets.token_hex(16),
            'o': office_id,
            'u': user_id,
            'a': action,
            't': target_id,
            'at': utc()
        })

    def timestudio_auth(authorization: str = Header(default='')):
        if not authorization.startswith('Bearer '):
            raise HTTPException(401, 'Sessão do Time Studio necessária')
        raw_token = authorization[7:].strip()
        key = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
        now = int(time.time())
        with db() as c:
            row = c.execute(text('''
                SELECT s.professional_id, s.office_id, p.name, a.email, o.name
                FROM timestudio_sessions s
                JOIN professionals p ON p.id = s.professional_id AND p.office_id = s.office_id
                JOIN professional_accounts a ON a.professional_id = s.professional_id AND a.office_id = s.office_id
                JOIN offices o ON o.id = s.office_id
                WHERE s.token_hash = :token AND s.expires_at > :now AND a.is_active = 1
            '''), {'token': key, 'now': now}).fetchone()
        if not row:
            raise HTTPException(401, 'Sessão do Time Studio expirada ou inválida')
        return {
            'professional_id': row[0],
            'office_id': row[1],
            'name': row[2],
            'email': row[3],
            'office_name': row[4]
        }

    # --- Pydantic Models ---
    class InviteIn(BaseModel):
        professional_id: str
        email: str = Field(min_length=5, max_length=180)

    class AcceptInviteIn(BaseModel):
        token: str
        password: str = Field(min_length=6, max_length=120)

    class LoginIn(BaseModel):
        email: str
        password: str

    class SyncItem(BaseModel):
        idempotency_key: str = Field(min_length=8, max_length=64)
        contract_id: str
        work_date: str
        minutes: int = Field(gt=0, le=1440)
        description: str = Field(default='', max_length=500)
        stage_id: str | None = None
        activity_type: str | None = None
        start_time: str | None = None
        end_time: str | None = None
        pause_minutes: int | None = Field(default=0, ge=0, le=1440)

    class SyncBatchIn(BaseModel):
        entries: list[SyncItem]

    class RejectIn(BaseModel):
        reason: str = Field(min_length=3, max_length=250)

    # --- Admin Endpoints (Gestão de Convites & Aprovações) ---
    @app.post('/api/timestudio/invites', status_code=201)
    def create_invite(data: InviteIn, u=Depends(editor)):
        email = data.email.strip().lower()
        if not re.match(r'^[^@]+@[^@]+\.[^@]+$', email):
            raise HTTPException(422, 'Email inválido')
        with db() as c:
            prof = c.execute(text('SELECT name FROM professionals WHERE id = :p AND office_id = :o'), {
                'p': data.professional_id, 'o': u['office_id']
            }).fetchone()
            if not prof:
                raise HTTPException(404, 'Profissional não encontrado no escritório')

            token = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(token.encode('utf-8')).hexdigest()
            now = int(time.time())
            expires_at = now + INVITE_EXPIRES_SECONDS
            invite_id = secrets.token_hex(16)

            c.execute(text('''
                INSERT INTO professional_invites VALUES (
                    :id, :o, :p, :email, :th, :exp, NULL, :by, :at
                )
            '''), {
                'id': invite_id,
                'o': u['office_id'],
                'p': data.professional_id,
                'email': email,
                'th': token_hash,
                'exp': expires_at,
                'by': u['id'],
                'at': utc()
            })
            log_audit(c, u['office_id'], u['id'], 'timestudio.invite.create', invite_id)

        return {
            'invite_id': invite_id,
            'professional_id': data.professional_id,
            'professional_name': prof[0],
            'email': email,
            'token': token,
            'invite_url': f'/timestudio/?invite={token}',
            'expires_at': expires_at
        }

    @app.get('/api/timestudio/invites')
    def list_invites(u=Depends(auth)):
        now = int(time.time())
        with db() as c:
            rows = c.execute(text('''
                SELECT i.id, i.professional_id, p.name, i.email, i.expires_at, i.used_at, i.created_at
                FROM professional_invites i
                JOIN professionals p ON p.id = i.professional_id AND p.office_id = i.office_id
                WHERE i.office_id = :o
                ORDER BY i.created_at DESC
            '''), {'o': u['office_id']}).fetchall()
        result = []
        for r in rows:
            used = bool(r[5])
            expired = now > r[4] and not used
            status = 'USADO' if used else ('EXPIRADO' if expired else 'ATIVO')
            result.append({
                'id': r[0],
                'professional_id': r[1],
                'professional_name': r[2],
                'email': r[3],
                'expires_at': r[4],
                'used_at': r[5],
                'created_at': r[6],
                'status': status
            })
        return result

    @app.get('/api/timestudio/approvals')
    def list_approvals(status: str | None = None, month: str | None = None, u=Depends(auth)):
        if month and not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', month):
            raise HTTPException(422, 'Mês deve ser AAAA-MM')
        query = '''
            SELECT w.id, w.professional_id, p.name, w.contract_id, co.label,
                   w.work_date, w.minutes, w.cost_cents, w.status, w.description,
                   w.rejection_reason, w.created_at, w.approved_at, w.source,
                   w.stage_id, cs.stage_name, w.activity_type, w.start_time, w.end_time, w.pause_minutes
            FROM worklogs w
            JOIN professionals p ON p.id = w.professional_id AND p.office_id = w.office_id
            JOIN contracts co ON co.id = w.contract_id AND co.office_id = w.office_id
            LEFT JOIN contract_stages cs ON cs.id = w.stage_id AND cs.office_id = w.office_id
            WHERE w.office_id = :o
        '''
        params = {'o': u['office_id']}
        if status:
            query += ' AND w.status = :status'
            params['status'] = status.upper()
        if month:
            query += ' AND w.work_date >= :b AND w.work_date < :e'
            y, m = map(int, month.split('-'))
            ny = y + (m == 12)
            nm = 1 if m == 12 else m + 1
            params.update(b=f'{y:04d}-{m:02d}-01', e=f'{ny:04d}-{nm:02d}-01')
        query += ' ORDER BY w.work_date DESC, w.created_at DESC'

        with db() as c:
            rows = c.execute(text(query), params).fetchall()

        keys = ('id', 'professional_id', 'professional_name', 'contract_id', 'contract_label',
                'work_date', 'minutes', 'cost_cents', 'status', 'description',
                'rejection_reason', 'created_at', 'approved_at', 'source',
                'stage_id', 'stage_name', 'activity_type', 'start_time', 'end_time', 'pause_minutes')
        return [dict(zip(keys, r)) for r in rows]

    @app.post('/api/timestudio/approvals/{worklog_id}/approve')
    def approve_worklog(worklog_id: str, u=Depends(editor)):
        with db() as c:
            row = c.execute(text('SELECT status FROM worklogs WHERE id = :id AND office_id = :o'), {
                'id': worklog_id, 'o': u['office_id']
            }).fetchone()
            if not row:
                raise HTTPException(404, 'Apontamento não encontrado')
            c.execute(text('''
                UPDATE worklogs
                SET status = 'APPROVED', approved_by = :u, approved_at = :at, rejection_reason = NULL
                WHERE id = :id AND office_id = :o
            '''), {'id': worklog_id, 'o': u['office_id'], 'u': u['id'], 'at': utc()})
            log_audit(c, u['office_id'], u['id'], 'worklog.approve', worklog_id)
        return {'id': worklog_id, 'status': 'APPROVED'}

    @app.post('/api/timestudio/approvals/{worklog_id}/reject')
    def reject_worklog(worklog_id: str, data: RejectIn, u=Depends(editor)):
        with db() as c:
            row = c.execute(text('SELECT status FROM worklogs WHERE id = :id AND office_id = :o'), {
                'id': worklog_id, 'o': u['office_id']
            }).fetchone()
            if not row:
                raise HTTPException(404, 'Apontamento não encontrado')
            c.execute(text('''
                UPDATE worklogs
                SET status = 'REJECTED', approved_by = :u, approved_at = :at, rejection_reason = :reason
                WHERE id = :id AND office_id = :o
            '''), {'id': worklog_id, 'o': u['office_id'], 'u': u['id'], 'at': utc(), 'reason': data.reason.strip()})
            log_audit(c, u['office_id'], u['id'], 'worklog.reject', worklog_id)
        return {'id': worklog_id, 'status': 'REJECTED', 'reason': data.reason.strip()}

    # --- Public Time Studio Endpoints (Invite Verification & Acceptance) ---
    @app.get('/api/timestudio/invite/verify')
    def verify_invite(token: str):
        token_hash = hashlib.sha256(token.strip().encode('utf-8')).hexdigest()
        now = int(time.time())
        with db() as c:
            row = c.execute(text('''
                SELECT i.id, i.professional_id, p.name, i.email, o.name, i.expires_at, i.used_at
                FROM professional_invites i
                JOIN professionals p ON p.id = i.professional_id AND p.office_id = i.office_id
                JOIN offices o ON o.id = i.office_id
                WHERE i.token_hash = :th
            '''), {'th': token_hash}).fetchone()
        if not row:
            raise HTTPException(404, 'Convite não encontrado ou inválido')
        if row[6]:
            raise HTTPException(400, 'Este convite já foi utilizado')
        if now > row[5]:
            raise HTTPException(400, 'Este convite expirou. Solicite um novo link ao administrador')
        return {
            'valid': True,
            'professional_id': row[1],
            'professional_name': row[2],
            'email': row[3],
            'office_name': row[4]
        }

    @app.post('/api/timestudio/invite/accept')
    def accept_invite(data: AcceptInviteIn):
        token_hash = hashlib.sha256(data.token.strip().encode('utf-8')).hexdigest()
        now = int(time.time())
        with db() as c:
            row = c.execute(text('''
                SELECT i.id, i.office_id, i.professional_id, i.email, i.expires_at, i.used_at
                FROM professional_invites i
                WHERE i.token_hash = :th
            '''), {'th': token_hash}).fetchone()
            if not row:
                raise HTTPException(404, 'Convite não encontrado')
            if row[5]:
                raise HTTPException(400, 'Convite já utilizado')
            if now > row[4]:
                raise HTTPException(400, 'Convite expirado')

            invite_id, office_id, prof_id, email = row[0], row[1], row[2], row[3]
            pw_hash = hash_pw(data.password)

            # Upsert into professional_accounts
            existing = c.execute(text('SELECT id FROM professional_accounts WHERE professional_id = :p OR email = :e'), {
                'p': prof_id, 'e': email
            }).fetchone()
            if existing:
                c.execute(text('UPDATE professional_accounts SET professional_id = :p, email = :e, password_hash = :pw, is_active = 1 WHERE id = :id'), {
                    'p': prof_id, 'e': email, 'pw': pw_hash, 'id': existing[0]
                })
            else:
                c.execute(text('INSERT INTO professional_accounts VALUES (:id, :o, :p, :e, :pw, 1, :at)'), {
                    'id': secrets.token_hex(16), 'o': office_id, 'p': prof_id, 'e': email, 'pw': pw_hash, 'at': utc()
                })

            # Mark invite as used
            c.execute(text('UPDATE professional_invites SET used_at = :at WHERE id = :id'), {
                'at': utc(), 'id': invite_id
            })

            # Create session
            session_token = secrets.token_urlsafe(32)
            session_hash = hashlib.sha256(session_token.encode('utf-8')).hexdigest()
            session_expires = now + SESSION_EXPIRES_SECONDS
            c.execute(text('INSERT INTO timestudio_sessions VALUES (:th, :p, :o, :exp)'), {
                'th': session_hash, 'p': prof_id, 'o': office_id, 'exp': session_expires
            })
            log_audit(c, office_id, prof_id, 'timestudio.invite.accept', invite_id)

            prof_row = c.execute(text('SELECT name FROM professionals WHERE id = :p'), {'p': prof_id}).fetchone()
            prof_name = prof_row[0] if prof_row else 'Profissional'
            office_row = c.execute(text('SELECT name FROM offices WHERE id = :o'), {'o': office_id}).fetchone()
            office_name = office_row[0] if office_row else 'Escritório'

        return {
            'token': session_token,
            'professional': {
                'id': prof_id,
                'name': prof_name,
                'email': email,
                'office_id': office_id,
                'office_name': office_name
            }
        }

    @app.post('/api/timestudio/auth/login')
    def timestudio_login(data: LoginIn):
        email = data.email.strip().lower()
        now = int(time.time())
        with db() as c:
            row = c.execute(text('''
                SELECT a.professional_id, a.office_id, a.password_hash, a.is_active, p.name, o.name
                FROM professional_accounts a
                JOIN professionals p ON p.id = a.professional_id AND p.office_id = a.office_id
                JOIN offices o ON o.id = a.office_id
                WHERE a.email = :e
            '''), {'e': email}).fetchone()
            if not row or not row[3]:
                raise HTTPException(401, 'Credenciais inválidas ou conta inativa')
            if not verify_pw(data.password, row[2]):
                raise HTTPException(401, 'Credenciais inválidas ou senha incorreta')

            prof_id, office_id, prof_name, office_name = row[0], row[1], row[4], row[5]
            session_token = secrets.token_urlsafe(32)
            session_hash = hashlib.sha256(session_token.encode('utf-8')).hexdigest()
            session_expires = now + SESSION_EXPIRES_SECONDS
            c.execute(text('INSERT INTO timestudio_sessions VALUES (:th, :p, :o, :exp)'), {
                'th': session_hash, 'p': prof_id, 'o': office_id, 'exp': session_expires
            })
            log_audit(c, office_id, prof_id, 'timestudio.login', prof_id)

        return {
            'token': session_token,
            'professional': {
                'id': prof_id,
                'name': prof_name,
                'email': email,
                'office_id': office_id,
                'office_name': office_name
            }
        }

    # --- Authenticated Professional Endpoints ---
    @app.get('/api/timestudio/me')
    def timestudio_me(p=Depends(timestudio_auth)):
        with db() as c:
            # Active office contracts eligible for time tracking
            contracts = c.execute(text('''
                SELECT id, label, fee_type, COALESCE(legal_area, 'civel') FROM contracts
                WHERE office_id = :o ORDER BY label
            '''), {'o': p['office_id']}).fetchall()

            for crow in contracts:
                cid, clabel, cfee, carea = crow[0], crow[1], crow[2], (crow[3] or 'civel').lower()
                has_st = c.execute(text('SELECT 1 FROM contract_stages WHERE contract_id = :c AND office_id = :o LIMIT 1'), {
                    'c': cid, 'o': p['office_id']
                }).first()
                if not has_st:
                    tpls = c.execute(text('''
                        SELECT stage_name, stage_order, default_budget_minutes
                        FROM process_stage_templates
                        WHERE (office_id = :o OR office_id IS NULL) AND legal_area = :a
                        ORDER BY stage_order
                    '''), {'o': p['office_id'], 'a': carea}).fetchall()
                    if not tpls:
                        tpls = c.execute(text('''
                            SELECT stage_name, stage_order, default_budget_minutes
                            FROM process_stage_templates
                            WHERE office_id IS NULL AND legal_area = 'trabalhista'
                            ORDER BY stage_order
                        ''')).fetchall()
                    for t_name, t_order, t_min in tpls:
                        c.execute(text('''
                            INSERT INTO contract_stages (id, office_id, contract_id, stage_name, stage_order, planned_minutes, status, created_at)
                            VALUES (:id, :o, :c, :name, :order, :min, 'EM_ANDAMENTO', :at)
                        '''), {
                            'id': secrets.token_hex(16), 'o': p['office_id'], 'c': cid,
                            'name': t_name, 'order': t_order, 'min': t_min, 'at': utc()
                        })

            # Include procedural stages for contracts
            stage_rows = c.execute(text('''
                SELECT id, contract_id, stage_name, stage_order, status
                FROM contract_stages
                WHERE office_id = :o ORDER BY stage_order
            '''), {'o': p['office_id']}).fetchall()

        stages_by_c = {}
        for st in stage_rows:
            stages_by_c.setdefault(st[1], []).append({
                'id': st[0],
                'stage_name': st[2],
                'stage_order': st[3],
                'status': st[4]
            })

        contracts_out = []
        for r in contracts:
            contracts_out.append({
                'id': r[0],
                'label': r[1],
                'fee_type': r[2],
                'stages': stages_by_c.get(r[0], [])
            })

        return {
            'professional': p,
            'contracts': contracts_out
        }

    @app.get('/api/timestudio/entries')
    def my_entries(p=Depends(timestudio_auth)):
        with db() as c:
            rows = c.execute(text('''
                SELECT w.id, w.contract_id, co.label, w.work_date, w.minutes,
                       w.cost_cents, w.status, w.description, w.rejection_reason,
                       w.idempotency_key, w.created_at,
                       w.stage_id, cs.stage_name, w.activity_type, w.start_time, w.end_time, w.pause_minutes
                FROM worklogs w
                JOIN contracts co ON co.id = w.contract_id AND co.office_id = w.office_id
                LEFT JOIN contract_stages cs ON cs.id = w.stage_id AND cs.office_id = w.office_id
                WHERE w.office_id = :o AND w.professional_id = :p
                ORDER BY w.work_date DESC, w.created_at DESC
                LIMIT 50
            '''), {'o': p['office_id'], 'p': p['professional_id']}).fetchall()
        keys = ('id', 'contract_id', 'contract_label', 'work_date', 'minutes',
                'cost_cents', 'status', 'description', 'rejection_reason',
                'idempotency_key', 'created_at',
                'stage_id', 'stage_name', 'activity_type', 'start_time', 'end_time', 'pause_minutes')
        return [dict(zip(keys, r)) for r in rows]

    @app.post('/api/timestudio/entries/sync')
    def sync_entries(batch: SyncBatchIn, p=Depends(timestudio_auth)):
        synced = []
        with db() as c:
            # Get professional cost
            pro_row = c.execute(text('SELECT hourly_cost_cents FROM professionals WHERE id = :p AND office_id = :o'), {
                'p': p['professional_id'], 'o': p['office_id']
            }).fetchone()
            hourly_cost = pro_row[0] if (pro_row and pro_row[0] is not None) else 0

            for entry in batch.entries:
                if not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])', entry.work_date):
                    continue
                # Idempotency check: does an entry with this idempotency_key already exist for this professional?
                existing = c.execute(text('''
                    SELECT id, status, minutes FROM worklogs
                    WHERE office_id = :o AND professional_id = :p AND idempotency_key = :k
                '''), {'o': p['office_id'], 'p': p['professional_id'], 'k': entry.idempotency_key}).fetchone()

                if existing:
                    synced.append({
                        'idempotency_key': entry.idempotency_key,
                        'id': existing[0],
                        'status': existing[1],
                        'duplicated': True
                    })
                    continue

                # Verify contract belongs to office
                contract = c.execute(text('SELECT 1 FROM contracts WHERE id = :c AND office_id = :o'), {
                    'c': entry.contract_id, 'o': p['office_id']
                }).first()
                if not contract:
                    continue

                cost = int((Decimal(hourly_cost) * Decimal(entry.minutes) / Decimal(60)).quantize(Decimal('1')))
                entry_id = secrets.token_hex(16)

                c.execute(text('''
                    INSERT INTO worklogs (
                        id, office_id, professional_id, contract_id, work_date,
                        minutes, cost_cents, created_by, created_at, status,
                        description, idempotency_key, source,
                        stage_id, activity_type, start_time, end_time, pause_minutes
                    ) VALUES (
                        :id, :o, :p, :contract, :date,
                        :min, :cost, :p, :at, 'PENDING',
                        :desc, :k, 'timestudio',
                        :stage, :act, :start, :end, :pause
                    )
                '''), {
                    'id': entry_id,
                    'o': p['office_id'],
                    'p': p['professional_id'],
                    'contract': entry.contract_id,
                    'date': entry.work_date,
                    'min': entry.minutes,
                    'cost': cost,
                    'at': utc(),
                    'desc': entry.description.strip(),
                    'k': entry.idempotency_key,
                    'stage': entry.stage_id,
                    'act': entry.activity_type,
                    'start': entry.start_time,
                    'end': entry.end_time,
                    'pause': entry.pause_minutes or 0
                })
                log_audit(c, p['office_id'], p['professional_id'], 'timestudio.entry.submit', entry_id)

                synced.append({
                    'idempotency_key': entry.idempotency_key,
                    'id': entry_id,
                    'status': 'PENDING',
                    'duplicated': False
                })

        return {'synced_count': len(synced), 'entries': synced}
