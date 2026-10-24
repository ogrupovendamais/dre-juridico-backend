"""Non-production PostgreSQL concurrency drill. Creates and drops its OWN temporary schema.
Requires explicit --disposable and TEST_DATABASE_URL. NEVER point at a client database.
"""
import argparse
import concurrent.futures
import os
import secrets
import threading
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


def require_disposable(url, acknowledged):
    if not acknowledged:
        raise ValueError('Passe --disposable somente para banco DESCARTAVEL, vazio de dados reais')
    if not url:
        raise ValueError('TEST_DATABASE_URL obrigatoria')
    parsed = make_url(url)
    if parsed.get_backend_name() != 'postgresql':
        raise ValueError('Este ensaio exige PostgreSQL real')
    if not parsed.database or parsed.database.lower() in ('postgres', 'template0', 'template1'):
        raise ValueError('Use banco de teste dedicado, nunca o banco administrativo padrao')
    return parsed


def run(url, acknowledged=False):
    require_disposable(url, acknowledged)
    engine = create_engine(url, pool_size=4, max_overflow=0, pool_pre_ping=True, connect_args={'connect_timeout': 5})
    schema = 'dre_drill_' + secrets.token_hex(6)
    # Generated schema matches a restricted identifier grammar; never interpolate user data.
    assert schema.replace('_', '').isalnum()
    results = {'backend': 'postgresql', 'schema_temporary': schema, 'checks': {}}
    try:
        with engine.begin() as c:
            c.execute(text(f'CREATE SCHEMA "{schema}"'))
            c.execute(text(f'''CREATE TABLE "{schema}".idem (
                op_key TEXT PRIMARY KEY, payload TEXT NOT NULL, response TEXT NOT NULL)'''))
            c.execute(text(f'''CREATE TABLE "{schema}".saldo (
                id INT PRIMARY KEY, total_cents BIGINT NOT NULL, paid_cents BIGINT NOT NULL,
                CONSTRAINT paid_range CHECK (paid_cents >= 0 AND paid_cents <= total_cents))'''))
            c.execute(text(f'INSERT INTO "{schema}".saldo VALUES (1, 10000, 0)'))

        # A duplicate request must return one persisted result. Both transactions race
        # on a real PostgreSQL UNIQUE index; one waits for the other to commit.
        start = threading.Barrier(2)
        def idem_worker(i):
            start.wait(timeout=5)
            with engine.begin() as c:
                c.execute(text(f'''INSERT INTO "{schema}".idem (op_key,payload,response)
                    VALUES ('same-request','sha256:same','result-123') ON CONFLICT (op_key) DO NOTHING'''))
                return c.execute(text(f'SELECT payload,response FROM "{schema}".idem WHERE op_key=:k'), {'k':'same-request'}).one()
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
            futures = [ex.submit(idem_worker, i) for i in range(2)]
            pairs = [f.result(timeout=15) for f in futures]
        with engine.connect() as c:
            n = c.execute(text(f'SELECT COUNT(*) FROM "{schema}".idem')).scalar_one()
        assert n == 1 and pairs[0] == pairs[1] == ('sha256:same', 'result-123')
        results['checks']['concurrent_idempotency'] = 'passed'

        # Competing settlements of 7000 and 6000 cents for a 10000-cent title.
        # Conditional atomic UPDATE must accept only one, regardless of scheduling.
        start = threading.Barrier(2)
        def settle_worker(amount):
            start.wait(timeout=5)
            with engine.begin() as c:
                result=c.execute(text(f'''UPDATE "{schema}".saldo
                  SET paid_cents=paid_cents+:amount
                  WHERE id=1 AND paid_cents+:amount <= total_cents'''), {'amount':amount})
                return result.rowcount
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
            f1=ex.submit(settle_worker,7000)
            f2=ex.submit(settle_worker,6000)
            counts=[f1.result(timeout=15), f2.result(timeout=15)]
        with engine.connect() as c:
            balance=c.execute(text(f'SELECT paid_cents FROM "{schema}".saldo WHERE id=1')).scalar_one()
        assert sorted(counts) == [0,1] and balance in (6000,7000)
        results['checks']['atomic_balance_guard'] = 'passed'
        results['result']='PASSED_DISPOSABLE_DRILL_ONLY'
        return results
    finally:
        # Explicitly remove only the random schema created by this run.
        try:
            with engine.begin() as c:
                c.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        finally:
            engine.dispose()


if __name__ == '__main__':
    import json
    parser=argparse.ArgumentParser(description='PostgreSQL concurrency verification in disposable DB only')
    parser.add_argument('--disposable', action='store_true', help='I confirm TEST_DATABASE_URL points to a disposable test database')
    args=parser.parse_args()
    print(json.dumps(run(os.getenv('TEST_DATABASE_URL'),args.disposable),ensure_ascii=False,indent=2))
