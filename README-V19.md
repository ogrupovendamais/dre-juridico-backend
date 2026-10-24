# PWA 1.9 — Auditoria de lançamentos e ensaio de atualização

- `POST /api/entries` e `DELETE /api/entries/{id}` agora gravam evento detalhado de auditoria no mesmo commit do lançamento. Para exclusão, são preservados valor em centavos, natureza, data e área previamente armazenados; descrições privadas não são duplicadas no JSON.
- O endpoint administrativo `/api/audit18` passa a incluir também eventos `entry.create` e `entry.delete`; a exportação permanece limitada ao próprio escritório. A trilha não é imutável nem cobre todos os módulos.
- `schema19.py` registra marcador incremental `19`; nunca faz rollback ou migração completa de esquema. Não há alteração na lógica de cálculo da DRE.
- Ensaio de atualização somente para SQLite: `python migration_drill19.py --database /caminho/para/pilot.db`. Uma cópia temporária é migrada, verificada e destruída; banco original não é atualizado. **Execute backup real antes de atualizar.** Não suporta ensaio de PostgreSQL.
- Desktop operacional; mobile continua leitura visual. Usuário `viewer` bloqueado de gravar na API; administrador conectado no celular mantém sua permissão de escrita.
- **Piloto técnico, não homologado para dados reais sigilosos.** Contagem de linhas não garante qualidade de migrações, preservação semântica ou segurança de produção.
