"""Offline rehearsal of SQLite schema upgrade against a disposable copy."""
import os,sqlite3,tempfile,pathlib,json,subprocess,sys
def drill(source):
    original=pathlib.Path(source).resolve()
    if not original.is_file(): raise FileNotFoundError('Banco de origem inexistente')
    with tempfile.TemporaryDirectory(prefix='dre-migration-') as td:
        dest=pathlib.Path(td)/'rehearsal.db'
        src = sqlite3.connect(str(original))
        copy = sqlite3.connect(str(dest))
        try:
            src.backup(copy)
            before=copy.execute('PRAGMA integrity_check').fetchone()[0]
            if before!='ok': raise ValueError('Origem falhou integridade')
            before_tables={row[0] for row in copy.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            before_counts={name:copy.execute('SELECT COUNT(*) FROM "'+name.replace('"','""')+'"').fetchone()[0] for name in before_tables if not name.startswith('sqlite_')}
        finally:
            copy.close()
            src.close()
        code='import server, schema19; schema19.apply(server.db)'
        env=dict(os.environ,DATABASE_URL='sqlite:///'+str(dest))
        result=subprocess.run([sys.executable,'-c',code],env=env,cwd=str(pathlib.Path(__file__).parent),capture_output=True,text=True,timeout=40)
        if result.returncode:raise RuntimeError('Ensaio falhou: '+result.stderr[-1500:])
        c = sqlite3.connect(str(dest))
        try:
            after=c.execute('PRAGMA integrity_check').fetchone()[0]
            version=[row[0] for row in c.execute('SELECT version FROM schema_history ORDER BY version')]
            if after!='ok' or version[-1]!=21: raise RuntimeError('Integridade ou versao invalida')
            for name,count in before_counts.items():
                now=c.execute('SELECT COUNT(*) FROM "'+name.replace('"','""')+'"').fetchone()[0]
                if name!='schema_history' and now!=count:raise RuntimeError('Contagem alterada: '+name)
        finally:
            c.close()
        return {'result':'PASS','integrity_check':after,'schema_versions':version,'tables_checked':len(before_counts),'operational_db_unchanged':True,'note':'Verificacao de contagem e integridade; nao comprova migracao de negocio nem rollback'}
if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('--database',required=True);a=p.parse_args();print(json.dumps(drill(a.database),ensure_ascii=False))
