import sys, os, re

sys.stdout.reconfigure(encoding='utf-8')

print("Iniciando correção completa de UX/UI para Mobile Login...")

# 1. Definição do CSS Mobile First para a tela de Login
LOGIN_MOBILE_CSS = """
/* ==========================================================================
   VENDA+ TECH DESIGN SYSTEM · MOBILE LOGIN UX/UI REVOLUTION
   Garantia de visibilidade, touch target WCAG AAA e ocultamento da barra mobile
   ========================================================================== */
#login-layer:not([hidden]) ~ .mobile-nav,
body.unauthenticated .mobile-nav,
body:has(#login-layer:not([hidden])) .mobile-nav {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

#login-layer.login-overlay {
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
}

.login-box {
  width: 100% !important;
  max-width: 420px !important;
  margin: auto !important;
  padding: 28px 24px !important;
  background: #0A1636 !important;
  border: 1px solid rgba(235, 181, 44, 0.32) !important;
  border-radius: 18px !important;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.65), 0 0 20px rgba(235, 181, 44, 0.12) !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 13px !important;
  box-sizing: border-box !important;
}

.login-box .brand-signature {
  justify-content: center !important;
  margin-bottom: 2px !important;
}

.login-box h1 {
  font-size: 22px !important;
  font-weight: 900 !important;
  color: #FFFFFF !important;
  text-align: center !important;
  margin: 0 !important;
  letter-spacing: -0.3px !important;
}

.login-box p {
  font-size: 13px !important;
  color: #94A3B8 !important;
  text-align: center !important;
  margin: 0 0 4px 0 !important;
}

.login-box label {
  display: flex !important;
  flex-direction: column !important;
  gap: 6px !important;
  font-size: 12.5px !important;
  font-weight: 700 !important;
  color: #CBD5E1 !important;
  text-align: left !important;
}

.login-box input {
  width: 100% !important;
  padding: 12px 14px !important;
  border-radius: 10px !important;
  border: 1px solid #233A6B !important;
  background: #0D1E45 !important;
  color: #FFFFFF !important;
  font-size: 14px !important;
  box-sizing: border-box !important;
  transition: all 0.2s ease !important;
}

.login-box input:focus {
  border-color: #EBB52C !important;
  outline: none !important;
  box-shadow: 0 0 0 2px rgba(235, 181, 44, 0.3) !important;
}

#login-submit-btn {
  width: 100% !important;
  min-height: 52px !important;
  margin-top: 6px !important;
  background: linear-gradient(135deg, #EBB52C 0%, #D97706 100%) !important;
  color: #010E38 !important;
  font-size: 14.5px !important;
  font-weight: 900 !important;
  letter-spacing: 0.6px !important;
  text-transform: uppercase !important;
  border-radius: 12px !important;
  border: 1px solid #F5C842 !important;
  box-shadow: 0 4px 18px rgba(235, 181, 44, 0.42), 0 1px 3px rgba(0, 0, 0, 0.3) !important;
  cursor: pointer !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 8px !important;
  transition: all 0.18s ease !important;
  -webkit-appearance: none !important;
}

#login-submit-btn:hover,
#login-submit-btn:focus-visible {
  background: linear-gradient(135deg, #F5C842 0%, #EBB52C 100%) !important;
  box-shadow: 0 6px 24px rgba(235, 181, 44, 0.55) !important;
  transform: translateY(-1px) !important;
}

#login-submit-btn:active {
  transform: translateY(1px) !important;
  box-shadow: 0 2px 8px rgba(235, 181, 44, 0.35) !important;
}

.login-security-badge {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 6px !important;
  font-size: 11px !important;
  color: #94A3B8 !important;
  margin: 6px 0 0 !important;
}

.login-footer {
  display: flex !important;
  justify-content: center !important;
  gap: 16px !important;
  margin-top: 4px !important;
}

.login-footer a {
  font-size: 11.5px !important;
  color: #CBD5E1 !important;
  text-decoration: underline !important;
  text-underline-offset: 3px !important;
}

@media (max-width: 480px) {
  #login-layer.login-overlay {
    padding: 16px 12px calc(24px + env(safe-area-inset-bottom)) !important;
  }
  .login-box {
    padding: 22px 18px !important;
    gap: 11px !important;
  }
  .login-box h1 {
    font-size: 20px !important;
  }
  #login-submit-btn {
    min-height: 50px !important;
    font-size: 14px !important;
  }
}
"""

def update_html(file_path):
    print(f"Atualizando HTML: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Injetar CSS de login se ainda não estiver presente
    if "/* VENDA+ TECH DESIGN SYSTEM · MOBILE LOGIN UX/UI REVOLUTION */" not in content:
        # Inserir antes de </head>
        content = content.replace("</head>", f"<style>\n{LOGIN_MOBILE_CSS}\n</style>\n</head>", 1)
        print("  -> CSS Mobile Login injetado com sucesso.")
    else:
        print("  -> CSS Mobile Login já presente.")

    # 2. Otimizar markup do botão e MFA no formulário
    # Vamos verificar o botão #login-submit-btn
    old_btn = '<button class="btn" type="submit" id="login-submit-btn">Entrar</button>'
    new_btn = (
        '<button class="btn" type="submit" id="login-submit-btn">'
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'
        '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>'
        '</svg>'
        '<span>Entrar no Sistema</span>'
        '</button>'
    )
    if old_btn in content:
        content = content.replace(old_btn, new_btn)
        print("  -> Botão #login-submit-btn enriquecido com SVG e label acessível.")

    # 3. Campo MFA em container toggle para telas pequenas
    old_mfa = '<label>Código autenticador (se MFA ativo)<input id="login-otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 dígitos (opcional)" /></label>'
    new_mfa = (
        '<div id="login-mfa-container" style="display:grid;gap:5px;">'
        '<div style="display:flex;justify-content:space-between;align-items:center;">'
        '<label for="login-otp" style="font-size:12px;font-weight:700;color:#CBD5E1;margin:0;">Código autenticador MFA</label>'
        '<button type="button" id="btn-toggle-mfa" style="background:transparent;border:none;color:#EBB52C;font-size:11px;font-weight:700;cursor:pointer;padding:2px 4px;text-decoration:underline;">Opcional ▾</button>'
        '</div>'
        '<input id="login-otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 dígitos (se configurado)" />'
        '</div>'
    )
    if old_mfa in content:
        content = content.replace(old_mfa, new_mfa)
        print("  -> Campo MFA atualizado com container inteligente.")

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  -> {file_path} salvo com sucesso!")

def update_app_js(file_path):
    print(f"Atualizando JS: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Garantir que no logout e start as classes de body sejam atualizadas
    # 1. No logout: $('#login-layer').hidden=false;$('#workspace').hidden=true
    old_logout_pattern = "$('#login-layer').hidden=false;$('#workspace').hidden=true"
    new_logout_pattern = "$('#login-layer').hidden=false;$('#workspace').hidden=true;document.body.classList.add('unauthenticated')"
    if old_logout_pattern in content and "document.body.classList.add('unauthenticated')" not in content:
        content = content.replace(old_logout_pattern, new_logout_pattern)
        print("  -> Adicionado document.body.classList.add('unauthenticated') no logout.")

    # 2. No start: $('#login-layer').hidden=true;$('#workspace').hidden=false
    old_start_pattern = "$('#login-layer').hidden=true;$('#workspace').hidden=false"
    new_start_pattern = "$('#login-layer').hidden=true;$('#workspace').hidden=false;document.body.classList.remove('unauthenticated')"
    if old_start_pattern in content and "document.body.classList.remove('unauthenticated')" not in content:
        content = content.replace(old_start_pattern, new_start_pattern)
        print("  -> Adicionado document.body.classList.remove('unauthenticated') no start.")

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  -> {file_path} salvo com sucesso!")

# Atualizar Web
update_html(r"web\index.html")
update_app_js(r"web\app.js")

# Atualizar Hostinger public_html
update_html(r"hostinger_public_html\index.html")
update_app_js(r"hostinger_public_html\app.js")

# Agora verificar se TimeStudio precisa de reforço
ts_html = r"web\timestudio\index.html"
with open(ts_html, "r", encoding="utf-8") as f:
    ts_c = f.read()

ts_css = """
/* Time Studio Mobile Login Enhancements */
#screen-login .card {
  max-width: 440px !important;
  margin: 10px auto !important;
  box-shadow: 0 16px 45px rgba(0, 0, 0, 0.6), 0 0 20px rgba(235, 181, 44, 0.15) !important;
  border: 1px solid rgba(235, 181, 44, 0.3) !important;
}
#screen-login .btn-gold {
  min-height: 50px !important;
  font-size: 14.5px !important;
  font-weight: 900 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.5px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 8px !important;
  box-shadow: 0 4px 18px rgba(235, 181, 44, 0.45) !important;
}
"""
if "/* Time Studio Mobile Login Enhancements */" not in ts_c:
    ts_c = ts_c.replace("</head>", f"<style>\n{ts_css}\n</style>\n</head>", 1)
    with open(ts_html, "w", encoding="utf-8") as f:
        f.write(ts_c)
    # Também atualizar no hostinger
    ts_hostinger = r"hostinger_public_html\timestudio\index.html"
    with open(ts_hostinger, "w", encoding="utf-8") as f:
        f.write(ts_c)
    print("  -> TimeStudio Mobile Login reforçado com sucesso em web e hostinger.")


print("Todas as correções de UX/UI Mobile Login foram concluídas com êxito!")
