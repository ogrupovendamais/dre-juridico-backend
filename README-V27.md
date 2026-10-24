# PWA 2.7 — Conciliação e fechamento idempotentes

Mantém funcionalidades e identidade visual da versão 2.6. As rotas POST /api/bank/match e POST /api/finance/close exigem Idempotency-Key (12–128 caracteres ASCII). A mesma chave e mesmo payload retornam o resultado anterior; uso com payload diferente devolve HTTP 409. A interface mantém a chave em memória em caso de erro de rede, enquanto a página estiver aberta.

Conciliação usa índice exclusivo (office_id, matched_movement) para impedir vincular um movimento a mais de uma linha bancária, inclusive sob concorrência, e UPDATE condicional para evitar substituição. O fechamento tem chave única (office_id, month), transação e reenvio idempotente.

AVISOS: índice UNIQUE pode exigir saneamento de dados existentes duplicados antes da atualização; não há migração reversível. Não é fechamento contábil oficial. Não há persistência segura da intenção após recarregar a página, nem teste PostgreSQL real ou navegador físico; contagem de testes locais não equivale à homologação. Mobile permanece para consulta, usando conta viewer para bloquear escrita na API. Testar somente com dados fictícios.
