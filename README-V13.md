# Versão 1.3 — MFA opcional e preparação de segurança

- MFA TOTP RFC 6238, com configuração explícita, confirmação, código no login e revogação das sessões ao ativar.
- Limite de tentativas de login da versão 1.2 permanece; falhas de TOTP também contam.
- Tela desktop permite iniciar o cadastro MFA e revogar sessões. O segredo de cadastro aparece durante a configuração; proteja-o, não capture imagens ou compartilhe-o.
- API de status e desativação MFA (desativar exige senha atual e código TOTP); não há recuperação automatizada de MFA.
- Controle de esquema preliminar registra `schema_versions` (13). Não é sistema completo de migrações com rollback.
- `python server.py verify-backup --file arquivo.sqlite`: abre uma cópia SQLite em modo somente leitura, verifica integridade e tabelas essenciais. Não restaura o backup no banco ativo.
- Modo mobile segue de visualização, porém a garantia de escrita é por papel viewer, não por hardware.

## Limitações críticas

Esta versão NÃO está pronta para produção. Os segredos MFA são guardados sem criptografia de campo; faltam chaves de criptografia gerenciadas, códigos de recuperação, recuperação segura após perda do autenticador, MFA obrigatório por política, banco de dados versionado com rollback, testes reais de desastre, backup remoto cifrado, auditoria integral, implantação HTTPS e revisão profissional de segurança. A proteção TOTP precisa de testes extras de concorrência e de relógio. O painel continua sendo demonstrativo.

Para testar use ambiente isolado e dados fictícios. Execute `pytest -q` com `DATABASE_URL` apontando para um banco SQLite limpo.
