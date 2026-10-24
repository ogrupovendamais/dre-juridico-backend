# DRE Jurídico Scientist — PWA 2.0 (candidato técnico, não homologado)

## Incremento verificado da versão 1.9
- Preserva módulos, endpoints financeiros e modelo multiempresa da versão anterior.
- Novo endpoint `GET /api/admin/preflight`: acesso apenas ao administrador autenticado. Retorna contagens globais **sem informações identificáveis**, marcadores 18–20, conferência simples de lançamentos órfãos e sessões órfãs, e ressalva explícita de que não é certificação. Contagens globais destinam-se somente à operação interna e não devem ser expostas a clientes na versão comercial.
- Atualização aditiva para o marcador de esquema **20**, idempotente. Não reverte migrações nem testa PostgreSQL.
- Cabeçalhos adicionais `Permissions-Policy` e `Cross-Origin-Resource-Policy` na aplicação.
- Identificação visual do piloto 2.0. A interface mobile segue apenas consultiva; escrita está bloqueada apenas para contas `viewer`, não por detecção confiável do aparelho.

## Testes e critérios de implantação
Execute com dependências instaladas e chave Fernet temporária de teste:
```
export DATABASE_URL="sqlite:////caminho/isolado/para/teste.sqlite"
export DRE_MFA_FERNET_KEY="<chave-de-teste-gerada-conforme-README-V14>"
PYTHONPATH=. pytest -q tests
```
Não reutilize um banco persistente preenchido para executar testes que criam escritórios com e-mails fixos.

**Pendências bloqueadoras para produção:** validação de backups e restauração em infraestrutura real, migrações transacionais completas PostgreSQL, autenticação/sessões endurecidas e testadas, isolamento de privilégios e autorização de escrita no mobile por contas exclusivas viewer, gestão de chaves e segredos, auditoria abrangente e resistente a alterações, monitoramento, revisão profissional de segurança e LGPD, validação contábil e testes reais desktop/mobile. Este pacote não comprova esses controles.
