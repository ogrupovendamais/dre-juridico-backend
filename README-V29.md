# DRE Jurídico Scientist — PWA 2.9 | Preparação de homologação PostgreSQL

## Novo: ensaio de concorrência PostgreSQL real, isolado

O script `postgres_drill29.py` cria um **schema aleatório temporário dentro de um banco exclusivamente de teste**, dispara duas operações concorrentes com a mesma chave e verifica que apenas uma fica registrada; depois simula duas baixas concorrentes sobre saldo limitado e exige que apenas uma seja aceita. Ao final, remove o schema criado.

Este teste demonstra primitivas transacionais no PostgreSQL. **Não** homologa automaticamente as rotas financeiras atuais do PWA, que ainda exigem ensaios integrados e revisão de concorrência para toda operação de baixa, conciliação e fechamento. Não executar em banco com dados reais. O script só é executado com confirmação explícita e `TEST_DATABASE_URL` PostgreSQL.

```bash
export TEST_DATABASE_URL='postgresql+psycopg://usuario:senha@localhost:5432/dre_teste_descartavel'
python postgres_drill29.py --disposable
```

Para rodar os testes Python unitários da aplicação:

```bash
export DRE_MFA_FERNET_KEY='CHAVE_FERNET_VALIDA_GERADA_LOCALMENTE'
pytest -q
```

Gere uma chave Fernet com `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`, guarde-a fora do repositório e configure-a no ambiente de testes. Não utilizar a chave de produção nos testes.

## Backup PostgreSQL: procedimento de homologação, NÃO implementado como agendador

1. Provisionar PostgreSQL de teste com TLS, usuário de menor privilégio e backups externos separados da infraestrutura da aplicação.
2. Configurar backups via ferramentas oficiais PostgreSQL (`pg_dump` para cópia lógica consistente e `pg_restore` para ensaio em banco DESCARTÁVEL); para recuperação a ponto no tempo, projetar backup físico e arquivamento WAL com equipe de infraestrutura.
3. Restaurar um dump real do ambiente de homologação em um banco novo e executar verificações de consistência, permissões e fluxo financeiro.
4. Documentar RPO/RTO, retenção, rotação de chaves e runbook de resposta a incidentes.
5. **Nunca** usar `backup-sqlite` ou `backup-rotate` do aplicativo sobre uma base PostgreSQL; são específicos para SQLite.

## Estado de homologação

- Foi adicionada a capacidade de ensaio isolado de concorrência PostgreSQL; sua execução exige servidor PostgreSQL e credenciais de teste.
- O suporte a `DATABASE_URL` já existia e não significa homologação dos módulos no PostgreSQL.
- Migração versionada com rollback e teste integrado de concorrência nas rotas de API seguem pendentes.
- A interface desktop/móvel, a identidade Venda+ Tech, os links de rodapé e os módulos financeiros anteriores foram preservados.
- Uso comercial com informações reais e sigilosas continua **não autorizado** sem homologação contábil, testes funcionais, testes de segurança independentes e infraestrutura apropriada.
