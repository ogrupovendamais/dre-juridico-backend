"""Read-only PostgreSQL connectivity probe for homologation.
Never emits secrets. Does not assert financial-route readiness.
"""
import argparse
import json
import os
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


def validate_test_url(raw):
    if not raw:
        raise ValueError('Configure TEST_DATABASE_URL para um PostgreSQL de homologacao')
    url = make_url(raw)
    if url.get_backend_name() != 'postgresql':
        raise ValueError('Somente PostgreSQL e suportado')
    if not url.database or url.database.lower() in ('postgres', 'template0', 'template1'):
        raise ValueError('Use banco de homologacao dedicado')
    return url


def probe(raw, connect_factory=create_engine):
    url = validate_test_url(raw)
    # Keep credentials out of output, exceptions, and log messages.
    try:
        engine = connect_factory(url, connect_args={'connect_timeout': 5}, pool_pre_ping=True)
        try:
            with engine.connect() as connection:
                connection.execute(text('SET TRANSACTION READ ONLY'))
                version = connection.execute(text('SHOW server_version')).scalar_one()
                connection.execute(text('SELECT 1')).scalar_one()
                connection.rollback()
            return {'release':'3.0-rc3','postgresql_connection':'passed',
                    'postgresql_server_version':str(version).split(' ')[0],
                    'transaction_mode':'read_only', 'business_routes_tested':False,
                    'concurrency_tested':False,'backup_restore_tested':False,
                    'commercial_release':'BLOCKED'}
        finally:
            engine.dispose()
    except Exception:
        return {'release':'3.0-rc3','postgresql_connection':'failed',
                'reason':'Connection or read-only query failed; consult protected operator logs',
                'business_routes_tested':False,'commercial_release':'BLOCKED'}


def main():
    parser=argparse.ArgumentParser(description='Read-only PostgreSQL probe; no production approval')
    parser.add_argument('--output')
    args=parser.parse_args()
    try:
        result=probe(os.getenv('TEST_DATABASE_URL'))
    except (ValueError, TypeError):
        result={'release':'3.0-rc3','postgresql_connection':'blocked',
                'reason':'TEST_DATABASE_URL ausente ou nao apropriada', 'commercial_release':'BLOCKED'}
    content=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
    if args.output:
        from pathlib import Path
        Path(args.output).write_text(content,encoding='utf-8')
    else: print(content,end='')
    return 0 if result.get('postgresql_connection')=='passed' else 2

if __name__=='__main__': raise SystemExit(main())
