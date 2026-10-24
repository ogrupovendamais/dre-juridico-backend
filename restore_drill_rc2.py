"""Isolated encrypted SQLite backup/restore drill for testing backup tools.
Never reads or replaces an existing production database.
"""
import argparse
import json
import os
import sqlite3
import tempfile
import time
from pathlib import Path
from operations15 import run_backup, restore_drill


def run():
    if not os.getenv('DRE_MFA_FERNET_KEY'):
        raise RuntimeError('Defina DRE_MFA_FERNET_KEY de TESTE (Fernet)')
    with tempfile.TemporaryDirectory(prefix='dre-rc2-') as tmp:
        root = Path(tmp)
        original = root / 'test-source.sqlite'
        con = sqlite3.connect(original)
        try:
            
            for table in ('offices', 'users', 'sessions', 'entries'):
                con.execute(f'CREATE TABLE {table} (id TEXT PRIMARY KEY)')
            con.execute('CREATE TABLE synthetic_test (id INTEGER PRIMARY KEY, amount_cents INTEGER NOT NULL)')
            con.executemany('INSERT INTO synthetic_test (amount_cents) VALUES (?)', [(1250,), (2300,), (780,)])
            con.commit()
        finally:
            con.close()
        def copy_consistently(target):
            src = sqlite3.connect(original)
            dst = sqlite3.connect(target)
            try:
                src.backup(dst)
            finally:
                dst.close()
                src.close()
        start = time.monotonic()
        record = run_backup(copy_consistently, root / 'encrypted', retain=2)
        result = restore_drill(record['path'])
        elapsed = round(time.monotonic() - start, 3)
        if result['integrity'] != 'ok':
            raise RuntimeError('Ensaio nao aprovado')
        return {'release':'3.0-rc2', 'scope':'SYNTHETIC_SQLITE_ONLY', 'encrypted_backup_integrity':record['integrity'], 'isolated_restore':result['restore_drill'], 'elapsed_seconds':elapsed, 'postgresql_backup_verified':False, 'production_backup_verified':False}

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--synthetic-only',action='store_true',help='Confirma que usa exclusivamente dados sinteticos')
    args=parser.parse_args()
    if not args.synthetic_only: parser.error('Exige --synthetic-only')
    print(json.dumps(run(),indent=2))
