"""Offline deployment preflight. Checks configuration; never certifies an environment.
No secrets or connection strings are displayed or transmitted.
"""
import argparse
import json
import os
from pathlib import Path
from sqlalchemy.engine import make_url


def inspect_config(env=None):
    env = dict(os.environ if env is None else env)
    raw = env.get('DATABASE_URL', '').strip()
    items = []
    def record(key, passed, reason):
        items.append({'key': key, 'status': 'configured' if passed else 'blocked', 'message': reason})
    database = False
    if raw:
        try:
            url = make_url(raw)
            database = url.get_backend_name() == 'postgresql' and bool(url.database) and url.database.lower() not in ('postgres', 'template0', 'template1')
        except Exception:
            pass
    record('postgresql_url', database, 'URL PostgreSQL dedicada identificada (sem testar conexao)' if database else 'Configure DATABASE_URL para PostgreSQL dedicado')
    key = env.get('DRE_MFA_FERNET_KEY', '').strip()
    valid_key = False
    if key:
        try:
            from cryptography.fernet import Fernet
            Fernet(key.encode())
            valid_key = True
        except (ValueError, TypeError):
            pass
    record('encryption_key', valid_key, 'Chave Fernet com formato valido (nao atesta armazenamento seguro)' if valid_key else 'Configure DRE_MFA_FERNET_KEY valida e protegida')
    public_url = env.get('DRE_PUBLIC_URL', '').strip()
    https = public_url.startswith('https://') and 'localhost' not in public_url and '127.0.0.1' not in public_url
    record('public_https_url', https, 'URL publica HTTPS declarada (nao atesta certificado nem proxy)' if https else 'Configure DRE_PUBLIC_URL com dominio HTTPS real')
    configured_backup = bool(env.get('DRE_BACKUP_DIR', '').strip())
    record('backup_destination', configured_backup, 'Diretorio de backup indicado (nao atesta backup, criptografia nem restauracao)' if configured_backup else 'Configure DRE_BACKUP_DIR e exercite restauracao isolada')
    return {'release': '3.0-rc2', 'status': 'CONFIGURATION_CHECK_ONLY', 'all_configured': all(i['status']=='configured' for i in items), 'production_approved': False, 'checks': items, 'required_manual_evidence': ['PostgreSQL em operacoes financeiras reais e concorrencia', 'TLS e seguranca da hospedagem', 'Backup criptografado e restauracao externa', 'LGPD e revisao contabil', 'Testes de navegadores e dispositivos', 'Aceite formal do piloto']}


def main():
    p=argparse.ArgumentParser(description='Preflight offline da infraestrutura RC2 (nao conecta a servidores)')
    p.add_argument('--output',type=Path)
    args=p.parse_args()
    report=inspect_config()
    content=json.dumps(report,ensure_ascii=False,indent=2)+'\n'
    if args.output:args.output.write_text(content,encoding='utf-8')
    else:print(content,end='')
    return 0 if report['all_configured'] else 2

if __name__=='__main__':raise SystemExit(main())
