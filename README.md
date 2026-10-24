# Versao 2.6

Leia `README-V26.md` para as alteracoes, os limites de idempotencia e recuperacao apos falhas de rede.

## Atualização v2.5

Veja [README-V25.md](README-V25.md): idempotência nas rotas de lançamento e baixa, testes e limites.

> Atualizacao da identidade visual e rodapes: consulte [README-V23.md](README-V23.md).

> v0.8: veja também [README-V08.md](README-V08.md) para profissionais, horas e custos gerenciais.

**Atualização v0.7:** consulte [README-V07.md](README-V07.md) para indicadores, metas e especialidades.

# DRE Jurídico Scientist — PWA piloto 0.2

Atualização do protótipo 0.1 com API FastAPI, banco relacional via SQLAlchemy (SQLite para avaliação local, PostgreSQL configurável), autenticação com senha PBKDF2 e token de sessão aleatório, isolamento de dados por escritório nos endpoints e papéis `admin`, `editor`, `viewer`.

## Instalação local para desenvolvimento

Requer Python 3.10+:

```bash
python -m venv .venv
. .venv/bin/activate   # no Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
python server.py create-office --office "Escritorio Piloto" --email admin@exemplo.test
# Anote o office_id retornado
python server.py create-viewer --office-id ID_RETORNADO --email viewer@exemplo.test
uvicorn server:app --host 127.0.0.1 --port 8080
```

Abra http://127.0.0.1:8080. A conta `viewer` é realmente só de leitura em qualquer dispositivo. O mesmo servidor atende todos os dispositivos autenticados, mas acesso remoto requer hospedagem HTTPS adequada.

## PostgreSQL

Definir a variável de ambiente `DATABASE_URL=postgresql+psycopg://usuario:senha@host:5432/dre` antes de iniciar. Criar o banco, gerir secrets e permissões e executar migrações adequadas antes de qualquer implantação pública. SQLite é apenas para o piloto local.

## Segurança e limitações

- Esta é uma prova de conceito, **não pronta para produção**, dados reais sigilosos ou conformidade LGPD. TLS/HTTPS, MFA, recuperação de contas, proteção contra brute force, logs, backups testados, migrações, segregação de privilégios e revisão independente de segurança estão pendentes.
- O isolamento por escritório é aplicado em consultas, inclusões e exclusões; testar novamente antes de produção. API nunca aceita `office_id` de lançamento vindo do usuário.
- Usuário `viewer`: GET autorizado e escrita bloqueada com HTTP 403. Contas `admin/editor` podem chamar operações de escrita pela API de qualquer dispositivo autorizado; o layout mobile oculta formulários, mas **não é tecnicamente confiável garantir bloqueio por tipo físico de dispositivo usando apenas navegador/PWA**. Para garantia estrita, usar só contas `viewer` no celular e contas de edição no desktop. Uma única conta editor acessada pelo celular não deve ser tratada como seguramente somente leitura.
- Login usa token mantido em `sessionStorage`; é intencional que não funcione offline e que a sessão expire em 8 horas. Ainda são necessários headers de segurança e endurecimento contra XSS.
- Exclusão grava evento de auditoria, mas não gera estorno histórico; implantar soft-delete/livro razão imutável antes de usar financeiramente.
- O cálculo é **DRE gerencial simplificada com base em lançamentos classificados**, não contabilidade por competência. Não inclui impostos, repasses de terceiros, honorários condicionais, balanço, conciliação ou auditoria. Nunca descrevê-la como DRE oficial.
- Não há integração com WhatsApp nem leitura de dados do WhatsApp.
- Não há importação de planilhas nem a IA neste protótipo 0.2. Essas capacidades permanecem na Skill e exigem integração controlada.

## Testes

`pytest -q` para testar autenticação, isolamento por escritório, escrita proibida para viewer e cálculo.

## Versao 0.9

Consulte `README-V09.md` para uso e limitacoes do novo modulo de capacidade e rateio exploratorio. Nao misturar rateios com o resultado contabil automaticamente.

## Versao 1.0

Consulte `README-V10.md` para governanca, CSV, testes e limitacoes do piloto.

## Versão 1.2 — Segurança de acesso e backups (piloto)
Consulte `README-V12.md` para limitação de tentativas, redefinição administrativa de senha e backup SQLite. A aplicação ainda não está homologada para dados reais/sigilosos.


### Atualização 1.3
Leia `README-V13.md`: MFA TOTP opcional, revogação de sessões e conferência de backups.


## Versao 1.4
Consulte `README-V14.md` para configuracao obrigatoria da chave Fernet e novos controles de MFA.


## Evolucao 1.5
Veja [README-V15.md](README-V15.md) para backup com retencao e ensaio de restauracao.


## Atualização 1.6
Veja `README-V16.md` para os filtros de consulta e limites.


## V1.7
Consultar README-V17.md.

## Versão 1.8

Consulte `README-V18.md` para trilha de auditoria operacional por escritório, exportação CSV e marcador incremental do esquema. Antes de atualizar uma instalação existente, execute e teste um backup. Ainda é protótipo, sem homologação para dados sigilosos reais.


## Novidades v1.9
Consulte `README-V19.md` para auditoria de lançamentos e ensaio seguro de atualização SQLite.

## Versão 2.0 — ver README-V20.md
Candidata técnica para testes, sem homologação comercial ou contábil. Configuração requer a chave externa `DRE_MFA_FERNET_KEY` (ver README-V14). A leitura no mobile não implica bloqueio de API por dispositivo: contas `viewer` são obrigatórias para garantir ausência de gravação.

## Evolução 2.1
Consulte [README-V21.md](README-V21.md) para a conferência operacional, testes ponta a ponta e requisitos ainda pendentes para produção.


## Atualização 2.2

Consulte [README-V22.md](README-V22.md) para as melhorias de navegação e feedback do PWA.


### Atualização v2.4
Consultar `README-V24.md` para melhorias de UX e limitações de homologação.

## Versão 2.7
Consulte README-V27.md para mudanças e cuidados da migração.

## Atualizacao 2.8

Consulte [README-V28.md](README-V28.md) para recuperacao segura na mesma aba apos atualizacao, criterios de reenvio e limitacoes para homologacao.

## PWA 2.9 — Homologação de concorrência PostgreSQL (ensaio opcional)
Leia `README-V29.md`. Foi acrescentado um ensaio em banco PostgreSQL **descartável**; sua existência não significa teste do PostgreSQL executado nem certificação de produção.


## V3.0 — Experiência de instalação e onboarding
Consulte `README-V30.md`. A versão 3.0 continua piloto técnico, sem autorização para dados reais.


## 3.0 RC1 — Gate de homologacao
Consulte [README-RC1.md](README-RC1.md) e execute `release_gate_rc1.py` para obter os criterios bloqueantes sem declarar homologacao automatica.


## RC2

Consulte [README-RC2.md](README-RC2.md). Continua bloqueado para uso comercial com dados sigilosos.

## RC3 — Protocolo de PostgreSQL

Leia `README-RC3.md` e execute `postgres_probe_rc3.py` apenas no ambiente dedicado de homologacao. Sonda apenas conectividade sem escrita; todas as pendencias comerciais permanecem ate evidencia formal.

## RC4 — staging reproduzivel

Veja [README-RC4.md](README-RC4.md). Homologacao comercial continua bloqueada.
