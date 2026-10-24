# PWA 1.2 — Segurança operacional do piloto

## Entregas
- Limite de tentativas de login **por e-mail normalizado**, persistente no banco: cinco falhas numa janela de 15 minutos bloqueiam a conta por 15 minutos. Respostas genéricas para contas inexistentes. Retorno HTTP 429 com Retry-After.
- Recuperação **local por operador autorizado com acesso ao servidor**, via `python server.py reset-user-password --email usuario@exemplo.test`. Solicita nova senha sem exibir no terminal e invalida as sessões anteriores. Isto **não é autoatendimento nem prova da identidade do usuário**: o operador precisa verificar identidade por processo externo documentado.
- Backup pontual de SQLite usando a API nativa consistente do SQLite: `python server.py backup-sqlite --output /caminho/seguro/backup-20261017.sqlite`. Verifica `PRAGMA integrity_check`, proíbe sobrescrever arquivo existente e restringe permissões POSIX a 0600. Backups contêm dados confidenciais e hashes de senha: cifrar, restringir acesso, transportar e reter com segurança.
- Login bem-sucedido e redefinição administrativa registrados na tabela de auditoria existente. Novos testes com isolamento de permissões e restauração lógica da cópia.

## Limites e riscos importantes
- O limitador por e-mail não substitui defesa contra ataques distribuídos, rate limiting de IP/rede, WAF e observabilidade; sob concorrência em múltiplos servidores será necessário um mecanismo transacional mais robusto.
- Ainda não existe MFA, redefinição de senha segura por e-mail, recuperação com tokens, política de backups agendados, restauração ensaiada em ambiente segregado, infraestrutura HTTPS, rotação de chaves, gestão formal de segredos, migrações Alembic, autenticação dedicada por dispositivo nem trilha imutável.
- A função de backup da aplicação suporta **somente SQLite**. No PostgreSQL usar `pg_dump`/backups gerenciados com documentação operacional. Não copie diretamente bancos SQLite em uso.
- Não usar com dados reais sigilosos; este é um piloto técnico e não está homologado para produção.

## Testes
`python -m pytest -q tests`
