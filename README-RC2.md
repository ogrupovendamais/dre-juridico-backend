# DRE Juridico Scientist 3.0 RC2 — Preparacao de homologacao

**Nao liberado comercialmente.** Esta entrega adiciona verificadores offline e um ensaio isolado de backup SQLite com dados sinteticos. Nao configura um servidor real nem emite certificados HTTPS.

## 1. Verificar configuracao sem exibir segredos

Em ambiente controlado, configurar `DATABASE_URL` (PostgreSQL dedicado), `DRE_MFA_FERNET_KEY` (Fernet guardada em cofre), `DRE_PUBLIC_URL` (dominio HTTPS) e `DRE_BACKUP_DIR` (destino protegido). Depois:

```sh
python deployment_rc2.py --output preflight.json
```

O retorno `all_configured=true` significa **apenas** que as variaveis parecem configuradas, **nao** que conexao, HTTPS, backup ou seguranca foram verificados.

## 2. Ensaio de backup isolado (SQLite, SEM dados reais)

```sh
python restore_drill_rc2.py --synthetic-only
```

Usa uma base sintetica temporaria, gera backup cifrado atraves de `operations15`, descriptografa e verifica integridade em diretorio isolado, descartando tudo no final. Para PostgreSQL e necessario validar `pg_dump`, `pg_restore` e restauracao numa instancia SEPARADA, medindo RPO/RTO e verificando integridade e permissao de acesso; essas operacoes NAO foram executadas nesta entrega.

## 3. Concorrencia PostgreSQL

Usar `postgres_drill29.py` **somente com TEST_DATABASE_URL de banco descartavel**, `--disposable`; cria e remove um schema temporario. Ele NAO testa todas as rotas de negocio. Em homologacao dedicada, executar tambem fluxos reais de titulos, baixas, conciliacao e fechamento entre duas sessoes simultaneas com valores sinteticos, conferir atomicidade, duplicidades e saldos.

## 4. Implantacao HTTPS

Provisionar dominio e proxy HTTPS com certificado valido; manter PostgreSQL inacessivel da Internet, secret manager, logs redigidos, politica de backup/rotacao, monitoramento e controles de acesso. Fazer pentest/revisao de seguranca e avaliacao LGPD antes de dados reais. Nao implantar somente porque o PWA anuncia suporte a HTTPS.

## 5. Release gate

`release_gate_rc1.py` permanece fail-closed e exige evidencias e aceite final. RC2 nao inventa ou autogera atestacoes. Uso inicial somente com dados ficticios.

## Marca e experiencia

Mantidos Venda+ Tech, site https://lp.grupovendamaistech.com.br/, WhatsApp https://wa.me/5515998417512, desktop operacional e perfil viewer somente leitura (sem bloqueio de escrita baseado no dispositivo).
