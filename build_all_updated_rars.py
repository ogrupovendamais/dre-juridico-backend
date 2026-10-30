import os
import subprocess
import zipfile
import sys

sys.stdout.reconfigure(encoding='utf-8')

winrar_path = r"C:\Program Files\WinRAR\WinRAR.exe"
assert os.path.exists(winrar_path), "WinRAR.exe não encontrado em C:\\Program Files\\WinRAR"

project_root = r"c:\Users\vendamaistech\Desktop\DRE ADVOCACIA\DRE_Juridico_Scientist_PROJETO_COMPLETO_2026-10-20\DRE_Juridico_Scientist_PROJETO_COMPLETO_2026-10-20"
hostinger_dir = os.path.join(project_root, "01_APLICACAO_PWA_RC4", "hostinger_public_html")
desktop_dir = r"C:\Users\vendamaistech\Desktop"
dre_advocacia_dir = r"c:\Users\vendamaistech\Desktop\DRE ADVOCACIA"

print("--- 1. Compactando DRE_JURIDICO_HOSTINGER_COMERCIAL.rar ---")
rar_hostinger_desktop = os.path.join(desktop_dir, "DRE_JURIDICO_HOSTINGER_COMERCIAL.rar")
rar_hostinger_dre = os.path.join(dre_advocacia_dir, "DRE_JURIDICO_HOSTINGER_COMERCIAL.rar")
zip_hostinger_desktop = os.path.join(desktop_dir, "DRE_JURIDICO_HOSTINGER_COMERCIAL.zip")

for target in [rar_hostinger_desktop, rar_hostinger_dre]:
    if os.path.exists(target):
        try: os.remove(target)
        except Exception: pass
    cmd = [winrar_path, "a", "-r", "-ep1", target, hostinger_dir + r"\*"]
    res = subprocess.run(cmd, capture_output=True)
    if os.path.exists(target):
        size_mb = os.path.getsize(target) / (1024 * 1024)
        print(f"  -> {target} criado com sucesso: {size_mb:.2f} MB")
    else:
        print(f"  -> Falha ao criar {target}")

# Criar ZIP do hostinger como fallback
with zipfile.ZipFile(zip_hostinger_desktop, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(hostinger_dir):
        for file in files:
            full_path = os.path.join(root, file)
            arcname = os.path.relpath(full_path, hostinger_dir)
            zipf.write(full_path, arcname)
print(f"  -> {zip_hostinger_desktop} criado com sucesso: {os.path.getsize(zip_hostinger_desktop) / (1024*1024):.2f} MB")

print("\n--- 2. Compactando DRE_Juridico_PROJETO_COMPLETO_ATUALIZADO.rar ---")
rar_full_desktop = os.path.join(desktop_dir, "DRE_Juridico_PROJETO_COMPLETO_ATUALIZADO.rar")
rar_full_dre = os.path.join(dre_advocacia_dir, "DRE_Juridico_PROJETO_COMPLETO_ATUALIZADO.rar")

for target in [rar_full_desktop, rar_full_dre]:
    if os.path.exists(target):
        try: os.remove(target)
        except Exception: pass
    cmd = [winrar_path, "a", "-r", target, project_root]
    res = subprocess.run(cmd, capture_output=True)
    if os.path.exists(target):
        size_mb = os.path.getsize(target) / (1024 * 1024)
        print(f"  -> {target} criado com sucesso: {size_mb:.2f} MB")
    else:
        print(f"  -> Falha ao criar {target}")

print("\nTodos os pacotes RAR foram gerados com êxito!")
