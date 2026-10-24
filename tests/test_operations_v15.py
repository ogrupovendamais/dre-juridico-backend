from pathlib import Path
import pytest
import server
from operations15 import run_backup, restore_drill

def test_encrypted_rotation_and_drill(tmp_path):
    folder=tmp_path/'safe'
    a=run_backup(server.backup_sqlite,folder,retain=1)
    assert a['integrity']=='ok'
    assert Path(a['path']).is_file()
    assert restore_drill(a['path'])['restore_drill']=='ok'
    b=run_backup(server.backup_sqlite,folder,retain=1)
    assert len(list(folder.glob('dre-backup-*.sqlite.enc')))==1
    assert Path(b['path']).exists()
    assert a['path'] != b['path']
    assert Path(a['path']).name in b['removed']

def test_backup_fail_closed_without_key(tmp_path,monkeypatch):
    monkeypatch.delenv('DRE_MFA_FERNET_KEY',raising=False)
    with pytest.raises(RuntimeError): run_backup(server.backup_sqlite,tmp_path/'backups')
    with pytest.raises(ValueError):
        from security14 import Fernet
        monkeypatch.setenv('DRE_MFA_FERNET_KEY',Fernet.generate_key().decode())
        run_backup(server.backup_sqlite,tmp_path/'bad',retain=0)
