# DRE Juridico Scientist PWA 2.6 — Recuperacao de envio financeiro

## Implementado

- Protecao de idempotencia transacional obrigatoria tambem em `POST /api/bills` (criacao de titulos), alem de `POST /api/entries` e `POST /api/bills/{id}/settle` das versoes anteriores.
- Repeticao com mesma chave e payload devolve o mesmo identificador; mudanca dos dados com mesma chave resulta em HTTP 409. Chave ausente retorna HTTP 428.
- Interface retira a chave da fila somente apos **receber uma resposta HTTP**, mas preserva a mesma chave em memoria se ocorrer falha de rede ou timeout do fetch. Nova tentativa com mesmo endpoint e corpo reutiliza a mesma intencao.
- Testes incrementais de criacao de titulo, falta de chave e estrutura da interface; regressao: 34 testes aprovados em ambiente local.
- Marca Venda+ Tech e links do site e WhatsApp preservados; mobile de consulta, operacao no desktop.

## Cuidados e limitacoes

- O navegador nao possui persistencia da intencao atraves de recarregamento/fechamento de aba. Se a pagina for recarregada depois de um timeout, verificar o resultado no servidor antes de tentar criar outro lancamento. O cache intencional e apenas em memoria, sem gravar dados financeiros no armazenamento local.
- Falhas de rede **depois da resposta recebida** nao sao preservadas como pendencias.
- Validar concorrencia real com PostgreSQL e multiplas instancias. A presente suite foi executada com SQLite local.
- Outros endpoints financeiros (como conciliacao bancaria e fechamento) nao receberam idempotencia transacional nesta versao.
- Testes automatizados nao substituem testes em navegador real, PWA instalado nem homologacao financeira, LGPD ou avaliacao de seguranca independente.
- Piloto exclusivamente com dados ficticios; nao homologado para dados financeiros/juridicos sigilosos de clientes.

## Chave de idempotencia

`Idempotency-Key: bill_<identificador-unico>` (12 a 128 caracteres ASCII). Reutilizar a mesma chave exclusivamente para a mesma intencao. Uma nova operacao requer outra chave.

## Links institucionais

- Site: https://lp.grupovendamaistech.com.br/
- WhatsApp: https://wa.me/5515998417512
