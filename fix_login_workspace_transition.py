import sys, os

sys.stdout.reconfigure(encoding='utf-8')

print("Aplicando correção cirúrgica de exibição e alternância do Login e Workspace...")

def fix_html(path):
    print(f"Corrigindo {path}...")
    with open(path, "r", encoding="utf-8") as f:
        c = f.read()

    old_css_part = """#login-layer.login-overlay {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  min-height: 100vh !important;
  min-height: 100dvh !important;
  height: 100% !important;
  overflow-y: auto !important;
  -webkit-overflow-scrolling: touch !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 20px 16px calc(36px + env(safe-area-inset-bottom)) !important;
  z-index: 99999 !important;
  background: radial-gradient(circle at 50% 25%, #0B1C47 0%, #010E38 100%) !important;
  box-sizing: border-box !important;
}"""

    new_css_part = """#login-layer[hidden],
#login-layer.hidden,
.login-overlay[hidden],
[hidden] {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

#login-layer:not([hidden]).login-overlay,
#login-layer:not([hidden]) {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  min-height: 100vh !important;
  min-height: 100dvh !important;
  height: 100% !important;
  overflow-y: auto !important;
  -webkit-overflow-scrolling: touch !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 20px 16px calc(36px + env(safe-area-inset-bottom)) !important;
  z-index: 99999 !important;
  background: radial-gradient(circle at 50% 25%, #0B1C47 0%, #010E38 100%) !important;
  box-sizing: border-box !important;
}"""

    if old_css_part in c:
        c = c.replace(old_css_part, new_css_part)
        print("  -> Regras CSS de login-layer corrigidas com seletor :not([hidden]) e [hidden] prioritário.")
    else:
        # Se por acaso a formatação mudou, buscar por regex
        import re
        c = re.sub(
            r'#login-layer\.login-overlay\s*\{[^}]*\}',
            new_css_part,
            c,
            flags=re.DOTALL
        )
        print("  -> Regras CSS atualizadas via substituição segura.")

    with open(path, "w", encoding="utf-8") as f:
        f.write(c)
    print(f"  -> {path} gravado com sucesso.")

def fix_app_js(path):
    print(f"Corrigindo {path}...")
    with open(path, "r", encoding="utf-8") as f:
        c = f.read()

    # Ajuste do start()
    old_start = "$('#login-layer').hidden=true;$('#workspace').hidden=false;document.body.classList.remove('unauthenticated')"
    new_start = "$('#login-layer').hidden=true;$('#login-layer').style.display='none';$('#workspace').hidden=false;$('#workspace').style.display='';document.body.classList.remove('unauthenticated')"
    if old_start in c:
        c = c.replace(old_start, new_start)
        print("  -> start() atualizado com garantia inline de alternância.")

    # Ajuste do showLogin()
    old_login = "$('#login-layer').hidden=false;$('#workspace').hidden=true;document.body.classList.add('unauthenticated')"
    new_login = "$('#login-layer').hidden=false;$('#login-layer').style.display='';$('#workspace').hidden=true;$('#workspace').style.display='none';document.body.classList.add('unauthenticated')"
    if old_login in c:
        c = c.replace(old_login, new_login)
        print("  -> showLogin() atualizado com garantia inline de alternância.")

    with open(path, "w", encoding="utf-8") as f:
        f.write(c)
    print(f"  -> {path} gravado com sucesso.")

fix_html(r"web\index.html")
fix_html(r"hostinger_public_html\index.html")
fix_app_js(r"web\app.js")
fix_app_js(r"hostinger_public_html\app.js")

print("Correção aplicada com sucesso!")
