# PWA 1.6 — Navegação e filtros de consulta

## Mudanças
- Menu desktop com seções visuais de resumos, operação financeira e inteligência.
- Pesquisa dos lançamentos demonstrativos por descrição/área, filtros por tipo e mês e contador de itens exibidos.
- Limpeza de filtros e estado sem correspondências.
- Os filtros são client-side e atuam somente nas linhas visíveis. **Não alteram os totais, a DRE ou os registros do banco**. A listagem completa é obtida pela API com autorização por escritório.
- Desktop mantém formulários de escrita; mobile oculta os formulários e oferece consulta. Perfis `viewer` são somente leitura na API, mas um administrador pode ainda usar a API fora da interface mobile.

## Pendências
- Auditoria abrangente/imutável, migrações automáticas, paginação e filtros de títulos/bancos, validação de responsividade em dispositivos físicos e homologação LGPD/segurança.
- Não utilizar dados sigilosos ou financeiros reais no piloto.
