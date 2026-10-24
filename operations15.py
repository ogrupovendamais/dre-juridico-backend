"""Operacoes do piloto SQLite 1.5: backup seguro e ensaio isolado de restauracao.
Nao agenda sozinho: executar por cron/Task Scheduler. Nao grava no banco ativo.
"""
from pathlib import Path
from datetime import datetime, timezone
import os, tempfile, hashlib, json
from security14 import encrypt_backup, verify_encrypted_backup, fernet
from security13 import backup_restore_check

def run_backup(backup_fn, directory, retain=14):
    if not fernet():
        raise RuntimeError('DRE_MFA_FERNET_KEY obrigatoria para backup agendavel')
    retain=int(retain)
    if not 1 <= retain <= 365:
        raise ValueError('Retencao deve ficar entre 1 e 365 backups')
    folder=Path(directory).expanduser().resolve()
    folder.mkdir(parents=True, exist_ok=True)
    if os.name=='posix': os.chmod(folder, 0o700)
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    encrypted=folder/f'dre-backup-{stamp}.sqlite.enc'
    # Restrict cleanup to files matching this tool's exact prefix/suffix.
    with tempfile.TemporaryDirectory(prefix='dre-backup-') as tmp:
        raw=Path(tmp)/'source.sqlite'
        backup_fn(raw)
        encrypt_backup(raw,encrypted)
    checked=verify_encrypted_backup(encrypted)
    if checked.get('integrity')!='ok':
        encrypted.unlink(missing_ok=True)
        raise RuntimeError('Verificacao de integridade reprovada')
    backups=sorted(folder.glob('dre-backup-*.sqlite.enc'))
    removed=[]
    for old in backups[:-retain]:
        if old.is_symlink() or not old.is_file():
            continue
        old.unlink()
        removed.append(old.name)
    return {'path':str(encrypted),'size_bytes':encrypted.stat().st_size,'sha256':hashlib.sha256(encrypted.read_bytes()).hexdigest(),'integrity':checked['integrity'],'removed':removed,'retention':retain}

def restore_drill(source):
    """Descriptografa em diretório temporario e executa integrity_check.
    Nunca substitui ou escreve no banco de operacao.
    """
    src=Path(source).resolve()
    if not src.is_file():raise FileNotFoundError(src)
    key=fernet()
    if not key:raise RuntimeError('DRE_MFA_FERNET_KEY obrigatoria')
    with tempfile.TemporaryDirectory(prefix='dre-drill-') as tmp:
        staging=Path(tmp)/'restored.sqlite'
        staging.write_bytes(key.decrypt(src.read_bytes()))
        result=backup_restore_check(staging)
        if result.get('integrity')!='ok':raise RuntimeError('Backup sem integridade')
        return {'integrity':result['integrity'],'restore_drill':'ok','source_sha256':hashlib.sha256(src.read_bytes()).hexdigest()}
