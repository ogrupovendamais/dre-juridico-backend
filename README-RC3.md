# Release Candidate 3.0 RC3 — Instrumentacao PostgreSQL

**NAO LIBERADA COMERCIALMENTE.** A RC3 traz uma sonda de conexao PostgreSQL de leitura apenas, protegida contra divulgacao de senhas, e preserva o ensaio isolado de concorrencia da RC2. Nenhuma verificacao remota foi executada sem infraestrutura de homologacao.

## 1. Ambiente externo isolado

Disponibilizar servidor PostgreSQL de homologacao com banco dedicado, dados sinteticos e conta com privilegios minimos. Nao utilizar banco com dados de clientes. Configurar `TEST_DATABASE_URL` de forma segura, com TLS exigido pela infraestrutura (por exemplo `sslmode=verify-full` com CA confiavel). Nao colocar senhas em linhas de comando, relatorios ou controle de versao.

## 2. Sonda sem alteracoes

`python postgres_probe_rc3.py --output postgres-readonly.json`

Usa uma transacao `READ ONLY` e consulta `SHOW server_version` / `SELECT 1`. Sem conectividade, gera retorno BLOQUEADO ou FAILED, sem divulgar segredos. Passar nesse teste **nao homologa rotas financeiras, HTTPS, backup, autenticacao nem isolamento multiempresa**.

## 3. Concorrencia somente em ambiente descartavel

`python postgres_drill29.py --disposable`

O programa exige `TEST_DATABASE_URL` de um banco descartavel e cria um schema temporario. E necessario avaliar manualmente a adequacao do destino antes de executar. Um resultado positivo testa apenas tabelas sinteticas, **nao as rotas reais de negocio**.

## 4. Roteiro de verificacoes obrigatorias em ambiente de homologacao

- Subir o backend em ambiente separado com PostgreSQL dedicado, HTTPS valido e chaves protegidas.
- Criar dois escritórios ficticios e verificar leitura e escrita cruzadas negadas.
- Concorrer baixas parciais de um mesmo titulo e conferir ausencia de saldo negativo, transacoes atomicas e chaves idempotentes.
- Repetir conciliacoes e fechamentos; reconciliar somas com extratos e registros sinteticos.
- Aplicar migracoes em copia restauravel e conferir reconciliação antes/depois.
- Executar `pg_dump` e restaurar com `pg_restore` em **outro banco vazio e isolado**; verificar integridade, permissoes e tempo de recuperacao.
- Validar HTTPS externamente, cabecalhos, protecao de credenciais e backup externo.
- Executar suites com navegador real, revisao contábil, LGPD e aceite formal.

O bloqueio comercial no `release_gate_rc1.py` deve permanecer ate haver evidencias revisadas de TODOS os criterios. Nao anexar tokens, strings de conexao ou dados financeiros reais em relatorios de homologacao.
