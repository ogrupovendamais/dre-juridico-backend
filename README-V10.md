# PWA DRE Juridico Scientist 1.0 - piloto integrado

## Novidades verificadas

- Tela de governanca com lista de usuarios do escritorio (somente administrador no desktop).
- Cadastro de contas viewer, editor e admin por administrador autenticado. Nao existe fluxo de convite ou recuperacao de senha; a senha e definida pelo administrador e deve ser substituida em uma solucao futura.
- Consulta aos ultimos 100 eventos da tabela legada `audit`, restrita ao escritorio do administrador.
- Exportacao CSV de `entries` (lancamentos simplificados legados), com autorizacao no backend. Nao inclui titulos, liquidacoes, extratos ou relatorios da DRE gerencial integrada.
- Nove testes automatizados aprovados, incluindo teste de administracao, tenant isolation e exportacao.

## Limites e riscos

**Ainda nao e um produto homologado:** o historico de auditoria e PARCIAL; varios fluxos das versoes 0.3-0.9 nao escrevem nesse historico e a tabela nao e imutavel. Nao ha MFA, politica robusta de segredos, rotacao/recuperacao de credenciais, backups validados, migracoes de producao, contabilidade oficial, testes de penetracao nem liberacao LGPD. O banco SQLite local e apenas para testes.

A UI mobile oculta formularios, mas um administrador/editor autenticado no celular ainda pode enviar requests de escrita via API. Para consultas apenas, usar conta **viewer** separada, que o backend proibe de gravar. Nao tratar a deteccao de dispositivo por largura de tela como seguranca.

A exportacao CSV oferece uma saida auditavel apenas dos lancamentos legados. O aplicativo nao representa que isso seja exportacao contábil completa.

## Executar e validar

```sh
pip install -r requirements.txt
python server.py create-office --office "Piloto" --email admin@exemplo.test
uvicorn server:app --host 127.0.0.1 --port 8080
python -m pytest -q
```

Para testes: use dados ficticios. Requer `pytest` e `httpx` disponiveis no ambiente para rodar TestClient.

## Proximos passos

Fluxo seguro de convite/MFA e senhas, migracoes, trilha de eventos completa e imutavel, exportacoes de todos os modulos com rastreabilidade e hardening HTTPS/CSRF/XSS/sessoes antes de uso com dados reais.
