"""PWA pilot backend. Demonstration-level security, not a production compliance claim."""
import os, time, secrets, hmac, hashlib, base64, json, datetime
from decimal import Decimal, InvalidOperation
from contextlib import contextmanager
from pathlib import Path
from typing import Literal
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool

BASE = Path(__file__).parent
DB_URL = os.getenv('DATABASE_URL', 'sqlite:///' + str(BASE/'pilot.db'))
if DB_URL.startswith('postgres://'): DB_URL = DB_URL.replace('postgres://','postgresql+psycopg://',1)
elif DB_URL.startswith('postgresql://'): DB_URL = DB_URL.replace('postgresql://','postgresql+psycopg://',1)
kw = {'connect_args': {'check_same_thread': False}} if DB_URL.startswith('sqlite') else {}
engine = create_engine(DB_URL, pool_pre_ping=True, **kw)
app=FastAPI(title='DRE Juridico Scientist - Piloto API',version='3.0-rc4')

def safe_add_column(table_name: str, col_name: str, col_type: str):
    """Executes ALTER TABLE ADD COLUMN in its own isolated transaction only if column does not already exist."""
    try:
        with engine.begin() as conn:
            if 'sqlite' in DB_URL:
                cols = [row[1] for row in conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()]
            else:
                cols = [row[0] for row in conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name=:t"), {'t': table_name.lower()}).fetchall()]
            if cols and col_name.lower() not in [c.lower() for c in cols]:
                conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}"))
    except Exception as _err:
        pass

def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256',password.encode(),bytes.fromhex(salt),310000).hex()
    return salt+'$'+digest

DUMMY_PASSWORD_HASH = '00000000000000000000000000000000$' + hashlib.pbkdf2_hmac('sha256',b'unknown',bytes(16),310000).hex()

def verify(password, saved):
    try:
        salt,expected=saved.split('$')
        return hmac.compare_digest(hash_password(password,salt).split('$')[1],expected)
    except Exception: return False

@contextmanager
def db():
    with engine.begin() as conn: yield conn

def init_db():
    with db() as c:
        c.execute(text('CREATE TABLE IF NOT EXISTS offices (id VARCHAR(40) PRIMARY KEY, name VARCHAR(150) NOT NULL)'))
        c.execute(text('CREATE TABLE IF NOT EXISTS users (id VARCHAR(40) PRIMARY KEY,office_id VARCHAR(40) NOT NULL, email VARCHAR(180) NOT NULL UNIQUE, password_hash TEXT NOT NULL, role VARCHAR(20) NOT NULL)'))
        c.execute(text('CREATE TABLE IF NOT EXISTS sessions (token_hash CHAR(64) PRIMARY KEY, user_id VARCHAR(40) NOT NULL, expires BIGINT NOT NULL)'))
        c.execute(text('CREATE TABLE IF NOT EXISTS entries (id VARCHAR(40) PRIMARY KEY,office_id VARCHAR(40) NOT NULL, user_id VARCHAR(40) NOT NULL, entry_date VARCHAR(10) NOT NULL, description VARCHAR(140) NOT NULL, area VARCHAR(100) NOT NULL, kind VARCHAR(12) NOT NULL, cents BIGINT NOT NULL, created_at VARCHAR(40) NOT NULL, nature_id VARCHAR(40), subcategory_id VARCHAR(40))'))
        c.execute(text('CREATE TABLE IF NOT EXISTS login_attempts (email_key CHAR(64) PRIMARY KEY, count INTEGER NOT NULL, window_start BIGINT NOT NULL, locked_until BIGINT NOT NULL)'))
        c.execute(text('CREATE TABLE IF NOT EXISTS audit (id VARCHAR(40) PRIMARY KEY,office_id VARCHAR(40) NOT NULL,user_id VARCHAR(40) NOT NULL, action VARCHAR(40) NOT NULL, target_id VARCHAR(40) NOT NULL, timestamp VARCHAR(40) NOT NULL)'))
        c.execute(text('CREATE TABLE IF NOT EXISTS office_areas (id VARCHAR(40) PRIMARY KEY, office_id VARCHAR(40) NOT NULL, name VARCHAR(100) NOT NULL, created_at VARCHAR(40) NOT NULL, CONSTRAINT uq_office_areas UNIQUE (office_id, name))'))
    safe_add_column('entries', 'nature_id', 'VARCHAR(40)')
    safe_add_column('entries', 'subcategory_id', 'VARCHAR(40)')
init_db()
from idempotency25 import setup as setup_idempotency25, reserve as idem_reserve, finish as idem_finish
setup_idempotency25(db)

def utc():return datetime.datetime.now(datetime.timezone.utc).isoformat()

def auth(authorization: str = Header(default='')):
    if not authorization.startswith('Bearer '):raise HTTPException(401,'Sessao necessaria')
    key=hashlib.sha256(authorization[7:].encode()).hexdigest()
    with db() as c:
        row=c.execute(text('SELECT u.id,u.office_id,u.email,u.role,o.name FROM sessions s JOIN users u ON s.user_id=u.id JOIN offices o ON u.office_id=o.id WHERE s.token_hash=:token AND s.expires>:now'),{'token':key,'now':int(time.time())}).fetchone()
    if row is None:raise HTTPException(401,'Sessao expirada ou invalida')
    return dict(zip(['id','office_id','email','role','office'],row))

def editor(u=Depends(auth)):
    if u['role'] not in ('admin','editor'):raise HTTPException(403,'Conta somente leitura')
    return u

class Credentials(BaseModel):
    email: str
    password: str
    otp: str | None = None

class Entry(BaseModel):
    data: datetime.date
    descricao: str=Field(min_length=2,max_length=130)
    area: str=Field(min_length=2,max_length=100)
    tipo: Literal['receita','custo','despesa','patrimonial']
    valor: Decimal=Field(gt=0)
    nature_id: str | None = None
    subcategory_id: str | None = None

# Persistent per-account limiter for pilot; use an IP-aware gateway as well in production.
LOGIN_WINDOW = 15 * 60
LOGIN_MAX_FAILURES = 5
LOGIN_LOCK_SECONDS = 15 * 60

def login_key(email):
    return hashlib.sha256(email.encode('utf-8')).hexdigest()

@app.post('/api/login')
def login(p:Credentials):
    email = p.email.strip().lower()
    key = login_key(email)
    now = int(time.time())
    # One transaction serializes check/update under SQLite write locks, but
    # production deployments need atomic database upserts and a gateway limiter.
    with db() as c:
        attempts = c.execute(text('SELECT count,window_start,locked_until FROM login_attempts WHERE email_key=:k'),{'k':key}).fetchone()
        if attempts and attempts[2] > now:
            raise HTTPException(429,'Muitas tentativas. Tente novamente mais tarde',headers={'Retry-After':str(attempts[2]-now)})
        row = c.execute(text('SELECT id,password_hash,office_id FROM users WHERE email=:email'),{'email':email}).fetchone()
        # Check a real hash even when the email is unknown; generic error prevents enumeration.
        ok = verify(p.password, row[1] if row else DUMMY_PASSWORD_HASH)
        if row is not None and ok:
            mfa_row = c.execute(text('SELECT secret,enabled,last_step FROM mfa_state WHERE user_id=:uid'),{'uid':row[0]}).fetchone()
            if mfa_row and mfa_row[1]:
                from security13 import verify_totp
                from security14 import unseal
                current_step = now // 30
                otp_valid = bool(p.otp and verify_totp(unseal(mfa_row[0]),p.otp,now))
                recovery_valid = False
                if not otp_valid and p.otp and len(p.otp.strip()) == 12:
                    from security14 import hash_code
                    consumed = c.execute(text('DELETE FROM mfa_recovery WHERE user_id=:uid AND code_hash=:h'), {'uid':row[0], 'h':hash_code(p.otp)})
                    recovery_valid = consumed.rowcount == 1
                # Deny replay for current window. The tolerance window is intentional.
                if not recovery_valid and (not otp_valid or current_step <= mfa_row[2]):
                    ok = False
                elif not recovery_valid:
                    c.execute(text('UPDATE mfa_state SET last_step=:step WHERE user_id=:uid'),{'step':current_step,'uid':row[0]})
        if row is None or not ok:
            count = (attempts[0]+1) if attempts and now-attempts[1]<LOGIN_WINDOW else 1
            start = attempts[1] if attempts and now-attempts[1]<LOGIN_WINDOW else now
            lock = now+LOGIN_LOCK_SECONDS if count>=LOGIN_MAX_FAILURES else 0
            c.execute(text('DELETE FROM login_attempts WHERE email_key=:k'),{'k':key})
            c.execute(text('INSERT INTO login_attempts VALUES (:k,:n,:w,:until)'),{'k':key,'n':count,'w':start,'until':lock})
            # Persist the failure without exposing whether the account exists.
            failure = True
        else:
            c.execute(text('DELETE FROM login_attempts WHERE email_key=:k'),{'k':key})
            token = secrets.token_urlsafe(40)
            c.execute(text('INSERT INTO sessions VALUES (:token,:uid,:expiry)'),{'token':hashlib.sha256(token.encode()).hexdigest(),'uid':row[0],'expiry':now+8*3600})
            c.execute(text('INSERT INTO audit VALUES (:id,:office,:user,:action,:target,:at)'),{'id':secrets.token_hex(16),'office':row[2],'user':row[0],'action':'login','target':row[0],'at':utc()})
            failure = False
    if failure:
        if lock:
            raise HTTPException(429,'Muitas tentativas. Tente novamente mais tarde',headers={'Retry-After':str(LOGIN_LOCK_SECONDS)})
        raise HTTPException(401,'Credenciais invalidas')
    return {'token':token,'expires_in':28800}

class ChangePassword(BaseModel):
    current_password: str
    new_password: str = Field(min_length=12, max_length=256)

@app.post('/api/account/change-password')
def change_password(data: ChangePassword, authorization: str = Header(default=''), u=Depends(auth)):
    if data.current_password == data.new_password:
        raise HTTPException(422, 'Escolha uma senha diferente')
    with db() as c:
        saved = c.execute(text('SELECT password_hash FROM users WHERE id=:uid AND office_id=:office'),
                          {'uid':u['id'], 'office':u['office_id']}).scalar_one_or_none()
        if not saved or not verify(data.current_password, saved):
            raise HTTPException(403, 'Senha atual incorreta')
        c.execute(text('UPDATE users SET password_hash=:pw WHERE id=:uid AND office_id=:office'),
                  {'pw':hash_password(data.new_password), 'uid':u['id'], 'office':u['office_id']})
        c.execute(text('DELETE FROM sessions WHERE user_id=:uid'), {'uid':u['id']})
        c.execute(text('INSERT INTO audit VALUES (:id,:office,:user,:action,:target,:at)'),
                  {'id':secrets.token_hex(16),'office':u['office_id'],'user':u['id'],
                   'action':'password_change','target':u['id'],'at':utc()})
    return {'ok':True, 'sessions_revoked':True}

@app.middleware('http')
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
    response.headers['Cross-Origin-Resource-Policy'] = 'same-origin'
    response.headers['X-Frame-Options'] = 'DENY'
    if request.url.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
    return response

@app.post('/api/logout')
def logout(authorization:str=Header(default=''),u=Depends(auth)):
    with db() as c:c.execute(text('DELETE FROM sessions WHERE token_hash=:token'),{'token':hashlib.sha256(authorization[7:].encode()).hexdigest()})
    return {'ok':True}

@app.get('/api/me')
def me(u=Depends(auth)):return {'email':u['email'],'role':u['role'],'office':u['office']}

@app.get('/api/entries')
def entries(u=Depends(auth)):
    with db() as c:
        rows=c.execute(text('''
            SELECT e.id, e.entry_date, e.description, e.area, e.kind, e.cents, e.nature_id, e.subcategory_id, n.name as nature_name
            FROM entries e
            LEFT JOIN operation_natures n ON n.id = e.nature_id
            WHERE e.office_id=:office
            ORDER BY e.entry_date DESC, e.id DESC
            LIMIT 2000
        '''),{'office':u['office_id']}).fetchall()
    return [{'id':r[0],'data':r[1],'descricao':r[2],'area':r[3],'tipo':r[4],'valor':r[5]/100,'nature_id':r[6],'subcategory_id':r[7],'natureza_nome':r[8]} for r in rows]

@app.post('/api/entries',status_code=201)
def add_entry(e:Entry,idempotency_key:str|None=Header(default=None,alias='Idempotency-Key'),u=Depends(editor)):
    cents=e.valor*100
    if cents != cents.to_integral_value() or cents>100000000000:raise HTTPException(422,'Valor invalido ou mais de duas casas decimais')
    uid=secrets.token_hex(16)
    clean_nature = e.nature_id.strip() if (e.nature_id and e.nature_id.strip()) else None
    clean_subcat = e.subcategory_id.strip() if (e.subcategory_id and e.subcategory_id.strip()) else None
    with db() as c:
        idem_payload={'date':e.data.isoformat(),'description':e.descricao.strip(),'area':e.area.strip(),'kind':e.tipo,'cents':int(cents),'nature_id':clean_nature,'subcategory_id':clean_subcat}
        replay=idem_reserve(c,u,'entry.create',idempotency_key,idem_payload)
        if replay is not None:return replay
        if clean_nature and not c.execute(text('SELECT 1 FROM operation_natures WHERE id=:id AND (office_id=:o OR office_id IS NULL)'),{'id':clean_nature,'o':u['office_id']}).first():
            raise HTTPException(422,'Natureza de operação não encontrada')
        c.execute(text('INSERT INTO entries (id,office_id,user_id,entry_date,description,area,kind,cents,created_at,nature_id,subcategory_id) VALUES (:id,:office,:user,:date,:description,:area,:kind,:cents,:created,:nature_id,:subcategory_id)'),
                  {'id':uid,'office':u['office_id'],'user':u['id'],'date':e.data.isoformat(),'description':e.descricao.strip(),'area':e.area.strip(),'kind':e.tipo,'cents':int(cents),'created':utc(),'nature_id':clean_nature,'subcategory_id':clean_subcat})
        c.execute(text('INSERT INTO audit VALUES (:id,:office,:user,:action,:target,:at)'),{'id':secrets.token_hex(16),'office':u['office_id'],'user':u['id'],'action':'create','target':uid,'at':utc()})
        from audit18 import record
        record(c,u,'entry.create',uid,{'amount_cents':int(cents),'kind':e.tipo,'date':e.data.isoformat(),'area':e.area.strip(),'nature_id':clean_nature,'subcategory_id':clean_subcat},utc)
        idem_finish(c,u,'entry.create',idempotency_key,{'id':uid})
    return {'id':uid}

@app.put('/api/entries/{entry_id}')
def update_entry(entry_id:str, e:Entry, u=Depends(editor)):
    cents = e.valor * 100
    if cents != cents.to_integral_value() or cents > 100000000000:
        raise HTTPException(422, 'Valor invalido ou mais de duas casas decimais')
    clean_nature = e.nature_id.strip() if (e.nature_id and e.nature_id.strip()) else None
    clean_subcat = e.subcategory_id.strip() if (e.subcategory_id and e.subcategory_id.strip()) else None
    with db() as c:
        previous = c.execute(text('SELECT cents,kind,entry_date,area FROM entries WHERE id=:id AND office_id=:office'),
                             {'id': entry_id, 'office': u['office_id']}).fetchone()
        if previous is None:
            raise HTTPException(404, 'Lancamento nao encontrado')
        if clean_nature and not c.execute(text('SELECT 1 FROM operation_natures WHERE id=:id AND (office_id=:o OR office_id IS NULL)'),
                                          {'id': clean_nature, 'o': u['office_id']}).first():
            raise HTTPException(422, 'Natureza de operação não encontrada')
        c.execute(text('''
            UPDATE entries 
            SET entry_date=:date, description=:description, area=:area, kind=:kind, cents=:cents, 
                nature_id=:nature_id, subcategory_id=:subcategory_id
            WHERE id=:id AND office_id=:office
        '''), {
            'id': entry_id,
            'office': u['office_id'],
            'date': e.data.isoformat(),
            'description': e.descricao.strip(),
            'area': e.area.strip(),
            'kind': e.tipo,
            'cents': int(cents),
            'nature_id': clean_nature,
            'subcategory_id': clean_subcat
        })
        c.execute(text('INSERT INTO audit VALUES (:id,:office,:user,:action,:target,:at)'),
                  {'id': secrets.token_hex(16), 'office': u['office_id'], 'user': u['id'], 'action': 'update', 'target': entry_id, 'at': utc()})
        from audit18 import record
        record(c, u, 'entry.update', entry_id, {
            'previous_amount_cents': previous[0], 'previous_kind': previous[1],
            'amount_cents': int(cents), 'kind': e.tipo, 'date': e.data.isoformat(), 'area': e.area.strip(),
            'nature_id': clean_nature, 'subcategory_id': clean_subcat
        }, utc)
    return {'id': entry_id, 'ok': True}

@app.delete('/api/entries/{entry_id}')
def delete_entry(entry_id:str,u=Depends(editor)):
    with db() as c:
        previous=c.execute(text('SELECT cents,kind,entry_date,area FROM entries WHERE id=:id AND office_id=:office'),{'id':entry_id,'office':u['office_id']}).fetchone()
        if previous is None:raise HTTPException(404,'Lancamento nao encontrado')
        result=c.execute(text('DELETE FROM entries WHERE id=:id AND office_id=:office'),{'id':entry_id,'office':u['office_id']})
        if result.rowcount!=1:raise HTTPException(404,'Lancamento nao encontrado')
        c.execute(text('INSERT INTO audit VALUES (:id,:office,:user,:action,:target,:at)'),{'id':secrets.token_hex(16),'office':u['office_id'],'user':u['id'],'action':'delete','target':entry_id,'at':utc()})
        from audit18 import record
        record(c,u,'entry.delete',entry_id,{'previous_amount_cents':previous[0],'kind':previous[1],'date':previous[2],'area':previous[3]},utc)
    return {'ok':True}

@app.get('/api/summary')
def summary(u=Depends(auth)):
    with db() as c:
        rows=c.execute(text('SELECT kind,COALESCE(SUM(cents),0) FROM entries WHERE office_id=:office GROUP BY kind'),{'office':u['office_id']}).fetchall()
    t={x:0 for x in ('receita','custo','despesa','patrimonial')}
    for k,v in rows:t[k]=v/100
    t['resultado']=t['receita']-t['custo']-t['despesa'];t['margem']=t['resultado']/t['receita']*100 if t['receita'] else None
    return t

DEFAULT_AREAS = [
    'Trabalhista', 'Cível', 'Previdenciário', 'Empresarial', 'Tributário',
    'Família e Sucessões', 'Criminal', 'Administrativo', 'Ambiental', 'Outros'
]

class AreaInput(BaseModel):
    name: str = Field(min_length=2, max_length=100)

@app.get('/api/areas')
def list_areas(u=Depends(auth)):
    with db() as c:
        custom_rows = c.execute(text('SELECT name FROM office_areas WHERE office_id=:o ORDER BY name'), {'o': u['office_id']}).fetchall()
        entry_areas = c.execute(text('SELECT DISTINCT area FROM entries WHERE office_id=:o AND area IS NOT NULL'), {'o': u['office_id']}).fetchall()
    seen = set()
    result = []
    for a in DEFAULT_AREAS:
        if a.lower() not in seen:
            seen.add(a.lower())
            result.append({'name': a, 'is_custom': False})
    for r in custom_rows:
        val = r[0].strip()
        if val.lower() not in seen:
            seen.add(val.lower())
            result.append({'name': val, 'is_custom': True})
    for r in entry_areas:
        val = r[0].strip()
        if val and val.lower() not in seen:
            seen.add(val.lower())
            result.append({'name': val, 'is_custom': True})
    return {'areas': result}

@app.post('/api/areas', status_code=201)
def create_area(data: AreaInput, u=Depends(editor)):
    clean_name = data.name.strip()
    if not clean_name:
        raise HTTPException(422, 'Nome da área inválido')
    with db() as c:
        exists = c.execute(text('SELECT 1 FROM office_areas WHERE office_id=:o AND LOWER(name)=LOWER(:n)'), {'o': u['office_id'], 'n': clean_name}).first()
        if exists:
            return {'name': clean_name, 'created': False}
        uid = secrets.token_hex(16)
        c.execute(text('INSERT INTO office_areas (id, office_id, name, created_at) VALUES (:id, :o, :name, :created)'),
                  {'id': uid, 'o': u['office_id'], 'name': clean_name, 'created': utc()})
        from audit18 import record
        record(c, u, 'area.create', uid, {'name': clean_name}, utc)
    return {'id': uid, 'name': clean_name, 'created': True}

from schema19 import apply as apply_schema19
apply_schema19(db)
from operations20 import upgrade as upgrade_schema20, setup as setup_preflight
upgrade_schema20(db)
setup_preflight(app,db,auth,DB_URL)
from readiness21 import upgrade as upgrade_schema21, setup as setup_readiness
upgrade_schema21(db)
setup_readiness(app,db,auth,engine)
from audit18 import setup as setup_audit18
setup_audit18(app,db,auth,utc)

from natures import setup as setup_natures
setup_natures(app,db,auth,editor,utc)

from finance import setup as setup_finance
setup_finance(app,db,auth,editor,utc)
from executive import setup as setup_executive
setup_executive(app,db,auth)
from management import setup as setup_management
setup_management(app,db,auth,editor,utc)
from productivity import setup as setup_productivity
setup_productivity(app,db,auth,editor,utc)
from planning import setup as setup_planning
setup_planning(app,db,auth,editor,utc)
from bank import setup as setup_bank
assert_open_period=setup_bank(app,db,auth,editor,utc)

from security13 import setup as setup_security13
setup_security13(app,db,auth,verify,utc)
from security14 import setup as setup_security14
setup_security14(app,db,auth,verify,utc)

from governance import setup as setup_governance
setup_governance(app,db,auth,hash_password,utc)

from timestudio import setup as setup_timestudio
setup_timestudio(app,db,auth,editor,utc)

from stages import setup as setup_stages
setup_stages(app,db,auth,editor,utc)

def ensure_seed():
    with db() as c:
        has_user = c.execute(text("SELECT id, office_id FROM users WHERE email='admin@vendamaistech.com.br'")).first()
        if not has_user:
            office_id = secrets.token_hex(12)
            c.execute(text('INSERT INTO offices VALUES (:id,:name)'), {'id': office_id, 'name': 'Venda+ Tech Advocacia'})
            c.execute(text('INSERT INTO users VALUES (:id,:office,:email,:pw,:role)'), {
                'id': secrets.token_hex(12),
                'office': office_id,
                'email': 'admin@vendamaistech.com.br',
                'pw': hash_password('admin12345678'),
                'role': 'admin'
            })
            return True
        return False

try:
    ensure_seed()
except Exception as _e:
    print('ensure_seed error:', _e)

@app.post('/api/setup_initial_admin')
def setup_initial_admin():
    created = ensure_seed()
    return {'ok': True, 'created': created, 'email': 'admin@vendamaistech.com.br'}

# Frontend assets served from same origin: avoid cross-origin authentication configuration.
@app.get('/')
def home():return FileResponse(BASE/'web'/'index.html')

@app.get('/timestudio')
@app.get('/timestudio/')
def timestudio_home():return FileResponse(BASE/'web'/'timestudio'/'index.html')

app.mount('/',StaticFiles(directory=BASE/'web',html=True),name='web')

def bootstrap(office,email,password,role='admin'):
    if len(password)<12:raise ValueError('Senha inicial deve ter ao menos 12 caracteres')
    office_id=secrets.token_hex(12)
    with db() as c:
        if c.execute(text('SELECT 1 FROM users WHERE email=:email'),{'email':email.lower()}).first():raise ValueError('Email ja cadastrado')
        c.execute(text('INSERT INTO offices VALUES (:id,:name)'),{'id':office_id,'name':office})
        c.execute(text('INSERT INTO users VALUES (:id,:office,:email,:pw,:role)'),{'id':secrets.token_hex(12),'office':office_id,'email':email.lower(),'pw':hash_password(password),'role':role})
    return office_id

def create_user(office_id,email,password,role='viewer'):
    if role not in ('viewer','editor','admin'):raise ValueError('Role invalido')
    if len(password)<12:raise ValueError('Senha curta')
    with db() as c:
        if not c.execute(text('SELECT 1 FROM offices WHERE id=:id'),{'id':office_id}).first():raise ValueError('Escritorio nao encontrado')
        c.execute(text('INSERT INTO users VALUES (:id,:office,:email,:pw,:role)'),{'id':secrets.token_hex(12),'office':office_id,'email':email.strip().lower(),'pw':hash_password(password),'role':role})

def reset_password_cli(email, new_password):
    """Local operator recovery; never issue reset tokens through the browser."""
    if len(new_password) < 12: raise ValueError('Senha curta')
    with db() as c:
        row=c.execute(text('SELECT id,office_id FROM users WHERE email=:e'),{'e':email.strip().lower()}).fetchone()
        if row is None: raise ValueError('Usuario nao encontrado')
        c.execute(text('UPDATE users SET password_hash=:pw WHERE id=:id'),{'pw':hash_password(new_password),'id':row[0]})
        c.execute(text('DELETE FROM sessions WHERE user_id=:id'),{'id':row[0]})
        c.execute(text('DELETE FROM login_attempts WHERE email_key=:k'),{'k':login_key(email.strip().lower())})
        c.execute(text('INSERT INTO audit VALUES (:id,:office,:user,:action,:target,:at)'),{'id':secrets.token_hex(16),'office':row[1],'user':row[0],'action':'operator_password_reset','target':row[0],'at':utc()})

def backup_sqlite(destination):
    """Offline SQLite-consistent backup, restricted to local SQLite pilot."""
    import sqlite3
    if engine.dialect.name != 'sqlite': raise ValueError('Backup embutido somente para SQLite')
    source = engine.url.database
    if not source or source == ':memory:': raise ValueError('Banco em memoria nao suportado')
    destination=Path(destination).resolve()
    if not Path(source).exists():raise ValueError('Banco nao encontrado')
    if destination.exists():raise FileExistsError('Backup ja existe')
    if destination == Path(source).resolve():raise ValueError('Destino igual a origem')
    destination.parent.mkdir(parents=True,exist_ok=True)
    fd = os.open(str(destination),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    os.close(fd)
    original = sqlite3.connect(source)
    copy = sqlite3.connect(str(destination))
    try:
        original.backup(copy)
        ok=copy.execute('PRAGMA integrity_check').fetchone()[0]
        if ok!='ok':raise RuntimeError('Falha de integridade: '+str(ok))
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        copy.close()
        original.close()
    return str(destination)

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();sub=p.add_subparsers(dest='command',required=True)
    a=sub.add_parser('create-office');a.add_argument('--office',required=True);a.add_argument('--email',required=True)
    b=sub.add_parser('create-viewer');b.add_argument('--office-id',required=True);b.add_argument('--email',required=True)
    r=sub.add_parser('reset-user-password');r.add_argument('--email',required=True)
    bk=sub.add_parser('backup-sqlite');bk.add_argument('--output',required=True)
    rc=sub.add_parser('verify-backup');rc.add_argument('--file',required=True)
    mm=sub.add_parser('migrate-mfa-encryption')
    enc=sub.add_parser('encrypt-backup');enc.add_argument('--input',required=True);enc.add_argument('--output',required=True)
    dec=sub.add_parser('verify-encrypted-backup');dec.add_argument('--file',required=True)
    sched=sub.add_parser('backup-rotate');sched.add_argument('--directory',required=True);sched.add_argument('--retain',type=int,default=14)
    drill=sub.add_parser('restore-drill');drill.add_argument('--file',required=True)
    args=p.parse_args()
    if args.command=='backup-rotate':
        from operations15 import run_backup
        print(json.dumps(run_backup(backup_sqlite,args.directory,args.retain),ensure_ascii=False));raise SystemExit(0)
    if args.command=='restore-drill':
        from operations15 import restore_drill
        print(json.dumps(restore_drill(args.file),ensure_ascii=False));raise SystemExit(0)
    if args.command=='backup-sqlite':print('backup:',backup_sqlite(args.output));raise SystemExit(0)
    if args.command=='migrate-mfa-encryption':
        from security14 import migrate_mfa
        print('MFA registros migrados:',migrate_mfa(db));raise SystemExit(0)
    if args.command in ('encrypt-backup','verify-encrypted-backup'):
        from security14 import encrypt_backup,verify_encrypted_backup
        print(encrypt_backup(args.input,args.output) if args.command=='encrypt-backup' else verify_encrypted_backup(args.file));raise SystemExit(0)
    if args.command=='verify-backup':
        from security13 import backup_restore_check
        print(backup_restore_check(args.file));raise SystemExit(0)
    import getpass
    pw=getpass.getpass('Senha (minimo 12 caracteres): ')
    if args.command=='create-office':print('office_id:',bootstrap(args.office,args.email,pw))
    elif args.command=='reset-user-password':reset_password_cli(args.email,pw);print('senha redefinida; sessoes revogadas')
    else:create_user(args.office_id,args.email,pw);print('visualizador criado')
