from pathlib import Path
import json
WEB=Path(__file__).resolve().parents[1]/'web'
def test_official_brand_and_footer():
    html=(WEB/'index.html').read_text(encoding='utf-8')
    assert '#010E38' in html and '#EBB52C' in html and '#F1F4F9' in html
    assert html.count('https://lp.grupovendamaistech.com.br/')>=2
    assert html.count('https://wa.me/5515998417512')>=2
    assert 'class="corporate-footer"' in html and 'class="login-footer"' in html
    assert 'rel="noopener noreferrer"' in html
    manifest=json.loads((WEB/'manifest.webmanifest').read_text(encoding='utf-8'))
    assert manifest['theme_color']=='#010E38'
def test_mobile_read_only_layout():
    html=(WEB/'index.html').read_text(encoding='utf-8')
    assert 'class="mobile-nav"' in html and 'class="desktop-only"' in html
    assert 'class="footer-links"' in html
