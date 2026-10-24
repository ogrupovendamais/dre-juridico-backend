# RC4 — Ambiente reproduzivel de homologacao (NAO COMERCIAL)

Este pacote adiciona um ambiente Docker Compose com PostgreSQL 16, backend FastAPI em porta ligada a 127.0.0.1 (sem acesso publico), e um ensaio de backup/restauracao **exclusivamente em banco descartavel**. Nenhum PostgreSQL/Docker ou servidor HTTPS estava disponivel para executar neste ambiente de desenvolvimento; NAO existe homologacao concluida.

## Uso em maquina isolada com Docker Compose

1. Copie `deploy/staging/env.example` para `deploy/staging/.env` e substitua **todas** as credenciais. Crie a chave com `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. Nunca suba `.env`, dumps e bancos ao Git. O Compose carrega `.env` da pasta de onde o comando e executado.
2. Rode `cd deploy/staging && docker compose config --quiet` e `docker compose up --build -d`.
3. `docker compose ps`; abra `http://127.0.0.1:8080` na propria maquina, com dados totalmente ficticios. API nao e publica pela porta de staging.
4. Rode `docker compose exec -T app python deployment_rc2.py`, depois `docker compose exec -T app python postgres_probe_rc3.py` **somente apos** definir `TEST_DATABASE_URL` corretamente para o banco de homologacao (a sonda nao usa DATABASE_URL automaticamente).
5. Execute testes de fluxo financeiro e multiempresa contra banco descartavel, valide migracoes, revise logs e corrija qualquer falha antes de autorizacao comercial.
6. Para ensaio backup: `I_CONFIRM_DISPOSABLE_STAGING=YES ./backup_restore_drill.sh ./staging-backup.dump` (exige dump novo e DB dre_restore_drill inexistente). Inspecione integridade e contagens no banco isolado, documente tempo e acesso, depois descarte o banco de teste manualmente.
7. `docker compose down` para parar. **NAO** use `docker compose down -v` sem decidir explicitamente descartar o volume do banco.

## Limites e riscos

- Nao ha HTTPS externo configurado neste Compose; localhost e apenas homologacao. Para HTTPS real utilizar dominio, certificado, proxy e politicas de seguranca revisadas independentemente. Nunca publique porta 8080 diretamente.
- O app atual ainda tem pendencias de seguranca, auditoria, LGPD e homologacao contabil; a disponibilizacao publica continua **BLOQUEADA**.
- O banco de staging e o banco de restauracao sao descartaveis: nunca coloque dados de clientes reais ou dados juridicos sigilosos.
- O ensaio de restauracao confirma execucao de pg_restore em banco separado, mas **nao** certifica compatibilidade de versoes, fluxos financeiros nem recuperacao em incidente. Verifique tudo manualmente.
- Senhas contendo caracteres especiais em URL exigem codificacao percentual no DATABASE_URL. O exemplo exige senha alfanumerica para evitar problemas acidentais; use secrets de Docker/gestor de segredos em implantacao madura.
- O conteudo frontend mantem marca Venda+ Tech, site e WhatsApp clicaveis. Modo `viewer` continua obrigatorio para consulta estritamente somente leitura.
