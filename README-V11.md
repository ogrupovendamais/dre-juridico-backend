# PWA 1.1 — Experiência e segurança de contas (piloto)

## Entregas verificáveis
- Alteração de senha autenticada, exigindo senha atual e uma nova com ao menos 12 caracteres.
- Encerramento de todas as sessões após alteração de senha, com auditoria do evento.
- Cabeçalhos de segurança básicos e respostas API com `Cache-Control: no-store`.
- Formulário de troca de senha no desktop, link para saltar ao conteúdo e suporte a movimento reduzido.
- Conservação de todos os módulos e regras financeiras da 1.0; mobile permanece consultivo para perfil `viewer`.

## Limitações
Não há MFA, recuperação de senha, limite persistente de tentativas de login, HTTPS integrado, backups homologados, migrações versionadas ou auditoria imutável. Este pacote **não está apto a produção**. O backend não consegue assegurar somente leitura para um admin que reutiliza a mesma conta no mobile. Não usar dados reais ou sigilosos.

## Execução e testes
Siga `README.md`. Após instalar dependências, rode `python -m pytest -q tests`.
