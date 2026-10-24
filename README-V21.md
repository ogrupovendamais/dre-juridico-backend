# PWA 2.1 — Candidata a ensaios de homologação

## Escopo efetivamente implementado

- `GET /api/admin/readiness`: inventário conservador apenas para administrador; **sempre** retorna `production_approved=false`. Verifica esquema e referências locais; evidências de HTTPS, auditoria externa, restauração externa, testes físicos e homologação contábil ficam pendentes.
- Marcador aditivo `schema_history.version=21`; não há migração reversível.
- Novo teste ponta a ponta com dados fictícios: plano de contas → cliente → contrato → título → baixa parcial → competência em setembro e caixa em outubro → conciliação interna, segregação multiempresa e viewer sem escrita.
- Ensaio SQLite `migration_drill19.py` atualizado para a versão 21, sempre sobre cópia descartável.

## Executar os testes (ambiente de desenvolvimento)

```bash
python -m pip install -r requirements.txt pytest httpx
export DATABASE_URL=sqlite:////tmp/dre-pwa-v21-tests.sqlite
export DRE_MFA_FERNET_KEY="$(python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"
PYTHONPATH=.:tests pytest -q tests
```

Utilizar arquivo temporário novo, sem dados reais, por execução. Não usar o banco operacional. Em Windows, definir as variáveis por PowerShell e executar os comandos equivalentes. A chave acima destina-se **apenas a testes**. Não armazenar chaves reais no repositório.

## Itens necessários antes do uso real

- PostgreSQL implantado e testado com permissões mínimas e migrações versionadas.
- HTTPS real, segurança de cookies/tokens, MFA obrigatório conforme política e gestão de segredo.
- Backup remoto com retenção, recuperação ensaiada e monitoramento de falhas.
- Auditoria financeira abrangente/imutável e revisão de integridade de todos os módulos.
- Testes reais em desktop/tablet/mobile; verificação no servidor de perfil somente leitura para usuários mobile.
- LGPD, sigilo profissional, contrato de tratamento de dados e homologação das regras contábeis.

**Não homologado para dados de clientes reais ou sigilosos.**
