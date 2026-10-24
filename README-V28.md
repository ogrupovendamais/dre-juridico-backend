# DRE Juridico Scientist - PWA 2.8

## Escopo entregue

Aprimora a recuperacao de operacoes financeiras em caso de perda de resposta HTTP. A chave de idempotencia de lancamento, titulo, baixa, conciliacao e fechamento permanece no sessionStorage **da mesma aba** apos recarregamento; o cliente calcula SHA-256 do token de sessao, metodo, rota e corpo para referenciar a chave. Somente digest e chave aleatoria sao persistidos: **nenhuma descricao, contrato ou valor financeiro** e armazenado nessa fila. O corpo deve ser preenchido de novo exatamente igual para recuperar a mesma intencao.

- Em sucesso (2xx), a chave e removida.
- Em resposta 4xx definitiva, a chave e removida para evitar reenvios de uma operacao invalida.
- Em falha de rede ou resposta 5xx, a chave e mantida para reenvio.
- No logout ou perda de autenticacao (401), chaves locais da aba sao apagadas.
- Armazenamento limitado a uma aba; outro dispositivo, aba nova, janela privada ou sessao encerrada nao recuperam a chave.
- Recuperacao exige HTTPS ou localhost, por depender de crypto.subtle e crypto.randomUUID.

## Como testar

No diretorio raiz, com dependencias de requirements.txt instaladas e uma chave DRE_MFA_FERNET_KEY de teste configurada:

    PYTHONPATH=. pytest -q
    node --check web/app.js

Usar apenas dados ficticios. Provar com um teste de rede real antes da homologacao: submeter titulo em desktop, cortar a resposta apos o servidor confirmar, recarregar a mesma aba e reintroduzir os mesmos campos. Confirmar que somente um titulo foi criado. Testar em Windows/Android/iOS e com conexoes instaveis.

## Limites criticos

Esta versao NAO foi homologada para operacao comercial, sigilo juridico ou seguranca de producao. Nao inclui teste de concorrencia em PostgreSQL nem protocolo de reexecucao persistente entre dispositivos. Para preservar intent apos fechamento de navegador e navegacao entre sessoes, seria necessario fluxo de reconciliacao com estado servidor e protecoes extras. A idempotencia no backend cobre somente rotas listadas no README-V27; o frontend nao garante recuperacao sem o mesmo payload.

Mobile continua exclusivamente com interface de consulta; bloqueio da API para contas `viewer`. Contas administrativas continuam capazes de operar por outros meios em dispositivos moveis. DRE gerencial indicativa, nao demonstracao contabil oficial. Identidade da Venda+ Tech e links de rodape mantidos.
