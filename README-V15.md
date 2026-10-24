# PWA 1.5 — Operação de backups e revisão de usabilidade

## Entregue

- `backup-rotate`: produz backup SQLite consistente, criptografa com Fernet, verifica a integridade e conserva apenas os N arquivos mais recentes gerados pela ferramenta no diretório configurado.
- `restore-drill`: verifica descriptografia e integridade de uma cópia isolada, SEM sobrescrever o banco ativo. É um ensaio técnico, não uma restauração homologada em produção.
- Testes para retenção, ensaio de restauração e ausência de chave.
- Ajustes pontuais de tamanhos de alvos interativos e legibilidade no painel mobile.

## Dependência crítica

Defina `DRE_MFA_FERNET_KEY` com uma chave Fernet válida. Guarde a chave em gerenciador de segredos separado dos backups. Sua perda torna backups anteriores indecifráveis. Faça cópias externas e teste recuperação em ambiente isolado.

## Comandos

```bash
python server.py backup-rotate --directory ./protected-backups --retain 14
python server.py restore-drill --file ./protected-backups/dre-backup-ARQUIVO.sqlite.enc
```

Para automatizar, configure cron (Linux) ou Agendador de Tarefas (Windows) externamente; o PWA **não instala tarefas agendadas**. Garanta que a conta do agendador tem acesso à chave e ao banco, e que a pasta não seja servida por HTTP. Retenção é por número de arquivos, não por dias.

## Limitações remanescentes

- Comandos abrangem **SQLite**, não PostgreSQL. Produção multiempresa precisa de backups e recuperação específicos do provedor do banco.
- Criptografia Fernet carrega o arquivo inteiro em memória; não usar para bancos volumosos.
- Não há cópia externa automática, rotação de chave, restauração automática, nem garantia de RPO/RTO.
- A trilha de auditoria de transações ainda é parcial e mutável por administrador do banco.
- MFA é experimental; aplicação ainda NÃO HOMOLOGADA para dados sigilosos reais.
- Mobile é visualização na interface, enquanto operações de escrita dependem da permissão do usuário, não do tipo de dispositivo.
