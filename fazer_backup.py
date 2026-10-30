"""
Script de Backup e Restauracao do Banco de Dados - DRE Juridico
Executa copia de seguranca local de todas as tabelas e dados.
"""
import os, sys, datetime, subprocess

def main():
    print("=" * 60)
    print("  DRE JURIDICO - GERADOR DE BACKUP DE SEGURANCA")
    print("=" * 60)
    
    # 1. Obter a URL do banco (PostgreSQL ou SQLite)
    db_url = os.getenv("DATABASE_URL")
    
    # Se nao estiver em variavel de ambiente, verificar .env
    if not db_url and os.path.exists(".env"):
        with open(".env", "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("DATABASE_URL="):
                    db_url = line.strip().split("=", 1)[1].strip()
                    break

    now_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    os.makedirs("backups", exist_ok=True)

    if db_url and ("postgres" in db_url or "neon.tech" in db_url):
        # Backup PostgreSQL (Neon Cloud)
        clean_url = db_url.replace("postgresql+psycopg://", "postgres://")
        out_file = os.path.join("backups", f"backup_dre_cloud_{now_str}.sql")
        print(f"Detectado banco em nuvem PostgreSQL (Neon).")
        print(f"Gerando copia de seguranca em: {out_file}...")
        
        # Tenta executar pg_dump se instalado, ou exportacao via Python
        try:
            cmd = f'pg_dump "{clean_url}" -f "{out_file}"'
            res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            if res.returncode == 0:
                print(f"[SUCESSO] Backup salvo com exito!")
                print(f"Tamanho do arquivo: {os.path.getsize(out_file)} bytes")
                return
        except Exception:
            pass

    # Backup local SQLite (pilot.db)
    local_db = "pilot.db"
    if os.path.exists(local_db):
        import shutil
        out_file = os.path.join("backups", f"backup_pilot_{now_str}.db")
        shutil.copy2(local_db, out_file)
        print(f"[SUCESSO] Backup do banco local salvo em: {out_file}")
        print(f"Tamanho do arquivo: {os.path.getsize(out_file) / 1024:.1f} KB")
    else:
        print("[INFO] Configure DATABASE_URL ou verifique o arquivo de banco para gerar o backup.")

if __name__ == "__main__":
    main()
