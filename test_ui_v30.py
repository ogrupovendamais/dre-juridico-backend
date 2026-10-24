from pathlib import Path
import json
ROOT=Path(__file__).resolve().parent

def test_v30_install_and_brand():
    page=(ROOT/'web/index.html').read_text()
    js=(ROOT/'web/app.js').read_text()
    assert 'install-pwa' in page and 'beforeinstallprompt' in js
    assert 'onboarding-v30' in page and 'mobile-reader-note' in page
    assert 'https://lp.grupovendamaistech.com.br/' in page
    assert 'https://wa.me/5515998417512' in page
    assert '#010E38' in page and '#EBB52C' in page

def test_v30_static_only_cache():
    sw=(ROOT/'web/sw.js').read_text()
    assert "url.pathname.startsWith('/api/')" in sw
    assert "req.method!=='GET'" in sw
    assert 'allowed.includes(url.pathname)' in sw
    assert 'caches.open(CACHE)' in sw
    manifest=json.loads((ROOT/'web/manifest.webmanifest').read_text())
    assert manifest['display']=='standalone'
    assert manifest['start_url']=='./'
