"""Módulo de Naturezas de Operações Financeiras e DRE Gerencial em 3 Níveis.
Projeto: DRE Jurídico Scientist - Venda+ Tech.
"""
import json
import secrets
from decimal import Decimal
from typing import Literal, Optional
from fastapi import Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text

# Definição canônica dos 10 Grupos DRE + Grupo 99 (Não-DRE / Patrimonial)
SYSTEM_DRE_GROUPS = [
    ('G01', '01', 'Receitas Brutas de Serviços Jurídicos', 'receitas_brutas', 1, 1),
    ('G02', '02', 'Deduções da Receita Bruta', 'deducoes', 2, 1),
    ('G03', '03', 'Custos dos Serviços Jurídicos', 'custos_servicos', 3, 1),
    ('G04', '04', 'Despesas com Pessoal', 'despesas_operacionais', 4, 1),
    ('G05', '05', 'Despesas Administrativas', 'despesas_operacionais', 5, 1),
    ('G06', '06', 'Despesas Comerciais e Marketing Jurídico (OAB)', 'despesas_operacionais', 6, 1),
    ('G07', '07', 'Despesas Tecnológicas e Segurança', 'despesas_operacionais', 7, 1),
    ('G08', '08', 'Outras Receitas e Despesas Operacionais', 'outras_operacionais', 8, 1),
    ('G09', '09', 'Resultado Financeiro Líquido', 'resultado_financeiro', 9, 1),
    ('G10', '10', 'Tributos sobre o Lucro (IRPJ / CSLL)', 'tributos_lucro', 10, 1),
    ('G99', '99', 'Operações Patrimoniais e Fluxo (Não-DRE)', 'nao_dre', 99, 0),
]

# Naturezas padrão do sistema (identificadores estáveis)
SYSTEM_NATURES = [
    # G01 - Receitas Brutas
    ('NAT_0101', 'G01', 'receita', '01.01', 'Honorários contratuais', 'Honorários advocatícios fixos ou avençados em contrato.'),
    ('NAT_0102', 'G01', 'receita', '01.02', 'Honorários de êxito', 'Honorários decorrentes de resultado positivo na demanda.'),
    ('NAT_0103', 'G01', 'receita', '01.03', 'Honorários de sucumbência', 'Verbas de sucumbência pertencentes ao escritório.'),
    ('NAT_0104', 'G01', 'receita', '01.04', 'Consultas jurídicas', 'Remuneração por orientações e consultas jurídicas avulsas.'),
    ('NAT_0105', 'G01', 'receita', '01.05', 'Pareceres jurídicos', 'Elaboração técnica de pareceres e opiniões legais.'),
    ('NAT_0106', 'G01', 'receita', '01.06', 'Assessoria jurídica recorrente', 'Contratos de partido ou retenção mensal.'),
    ('NAT_0107', 'G01', 'receita', '01.07', 'Serviços consultivos', 'Assessoria preventiva e consultoria estratégica.'),
    ('NAT_0108', 'G01', 'receita', '01.08', 'Outros serviços jurídicos', 'Demais remunerações por serviços advocatícios.'),
    # G02 - Deduções da Receita
    ('NAT_0201', 'G02', 'despesa', '02.01', 'Tributos sobre faturamento', 'Simples Nacional, ISS, PIS e COFINS sobre receita bruta.'),
    ('NAT_0202', 'G02', 'despesa', '02.02', 'Cancelamentos de contratos', 'Anulação formal de faturamentos anteriormente emitidos.'),
    ('NAT_0203', 'G02', 'despesa', '02.03', 'Abatimentos concedidos', 'Reduções contratuais acordadas com clientes.'),
    ('NAT_0204', 'G02', 'despesa', '02.04', 'Descontos incondicionais', 'Descontos concedidos na emissão da cobrança.'),
    ('NAT_0205', 'G02', 'despesa', '02.05', 'Devoluções e estornos de receitas', 'Restituição de valores recebidos.'),
    # G03 - Custos dos Serviços Jurídicos
    ('NAT_0301', 'G03', 'custo', '03.01', 'Honorários de correspondentes', 'Pagamento a advogados correspondentes e prepostos.'),
    ('NAT_0302', 'G03', 'custo', '03.02', 'Serviços jurídicos terceirizados', 'Bancas parceiras e advogados associados subcontratados.'),
    ('NAT_0303', 'G03', 'custo', '03.03', 'Profissionais alocados a serviços', 'Custos diretos de advogados dedicados à produção jurídica.'),
    ('NAT_0304', 'G03', 'custo', '03.04', 'Perícias custeadas pelo escritório', 'Laudos periciais e assistentes técnicos custeados pela banca.'),
    ('NAT_0305', 'G03', 'custo', '03.05', 'Custos processuais próprios', 'Custas e despesas judiciais assumidas pelo escritório.'),
    ('NAT_0306', 'G03', 'custo', '03.06', 'Outros custos diretamente atribuíveis', 'Deslocamentos forenses e fotocópias de autos.'),
    # G04 - Despesas com Pessoal
    ('NAT_0401', 'G04', 'despesa', '04.01', 'Salários administrativos', 'Equipe de apoio, recepção, financeiro e controladoria.'),
    ('NAT_0402', 'G04', 'despesa', '04.02', 'Encargos trabalhistas', 'FGTS, INSS patronal, provisões de férias e 13º salário.'),
    ('NAT_0403', 'G04', 'despesa', '04.03', 'Benefícios', 'Vale transporte, alimentação, plano de saúde e odontológico.'),
    ('NAT_0404', 'G04', 'despesa', '04.04', 'Treinamentos e capacitação', 'Cursos, congressos e atualização técnica.'),
    ('NAT_0405', 'G04', 'despesa', '04.05', 'Recrutamento e seleção', 'Honorários de consultorias de RH e divulgação de vagas.'),
    ('NAT_0406', 'G04', 'despesa', '04.06', 'Outros gastos com pessoal', 'Eventos internos e uniformes.'),
    # G05 - Despesas Administrativas
    ('NAT_0501', 'G05', 'despesa', '05.01', 'Aluguel do escritório', 'Locação de imóvel e salas comerciais.'),
    ('NAT_0502', 'G05', 'despesa', '05.02', 'Condomínio e IPTU', 'Despesas condominiais e tributos prediais.'),
    ('NAT_0503', 'G05', 'despesa', '05.03', 'Energia elétrica', 'Contas de fornecimento de luz.'),
    ('NAT_0504', 'G05', 'despesa', '05.04', 'Água e saneamento', 'Despesas com abastecimento de água.'),
    ('NAT_0505', 'G05', 'despesa', '05.05', 'Internet e telefonia', 'Conexão dedicada, linhas telefônicas e planos celulares.'),
    ('NAT_0506', 'G05', 'despesa', '05.06', 'Contabilidade externa', 'Honorários da assessoria contábil do escritório.'),
    ('NAT_0507', 'G05', 'despesa', '05.07', 'Material de escritório e copa', 'Papelaria, insumos de impressão e suprimentos.'),
    ('NAT_0508', 'G05', 'despesa', '05.08', 'Limpeza e conservação', 'Serviços e materiais de higienização.'),
    ('NAT_0509', 'G05', 'despesa', '05.09', 'Manutenção predial e reparos', 'Consertos de equipamentos e instalações.'),
    ('NAT_0510', 'G05', 'despesa', '05.10', 'Seguros patrimoniais e D&O', 'Seguro de responsabilidade profissional e predial.'),
    # G06 - Despesas Comerciais
    ('NAT_0601', 'G06', 'despesa', '06.01', 'Marketing institucional', 'Identidade visual, branding e relacionamento institucional.'),
    ('NAT_0602', 'G06', 'despesa', '06.02', 'Publicidade jurídica permitida', 'Divulgação informativa nos limites do Provimento OAB.'),
    ('NAT_0603', 'G06', 'despesa', '06.03', 'Produção de conteúdo jurídico', 'Artigos, podcasts, newsletters e cartilhas educativas.'),
    ('NAT_0604', 'G06', 'despesa', '06.04', 'Gestão de campanhas digitais', 'Agências e tráfego pago educativo em conformidade OAB.'),
    ('NAT_0605', 'G06', 'despesa', '06.05', 'Ferramentas comerciais e CRM', 'Assinaturas de plataformas de CRM e prospecção.'),
    ('NAT_0606', 'G06', 'despesa', '06.06', 'Outras despesas comerciais permitidas', 'Participação e patrocínio em eventos do setor jurídico.'),
    # G07 - Despesas Tecnológicas
    ('NAT_0701', 'G07', 'despesa', '07.01', 'Software jurídico e ERP', 'Sistemas de gestão processual, CP-Pro, ProJuris, etc.'),
    ('NAT_0702', 'G07', 'despesa', '07.02', 'Assinaturas de sistemas e IA', 'Ferramentas de pesquisa jurisprudencial e inteligência artificial.'),
    ('NAT_0703', 'G07', 'despesa', '07.03', 'Segurança da informação e antivírus', 'Firewalls, licenças de segurança e certificados digitais.'),
    ('NAT_0704', 'G07', 'despesa', '07.04', 'Armazenamento digital e nuvem', 'Backup em nuvem, AWS, Azure, Google Workspace.'),
    ('NAT_0705', 'G07', 'despesa', '07.05', 'Infraestrutura de tecnologia', 'Servidores locais, redes e licenças de SO.'),
    ('NAT_0706', 'G07', 'despesa', '07.06', 'Suporte técnico em TI', 'Assessoria e manutenção de TI terceirizada.'),
    # G08 - Outras Receitas e Despesas Operacionais
    ('NAT_0801', 'G08', 'receita', '08.01', 'Outras receitas operacionais', 'Ganhos eventuais na venda de ativos operacionais ou palestras.'),
    ('NAT_0802', 'G08', 'despesa', '08.02', 'Despesas operacionais extraordinárias', 'Indenizações cíveis, acordos operacionais e perdas eventuais.'),
    ('NAT_0803', 'G08', 'despesa', '08.03', 'Ajustes operacionais', 'Ajustes de competências anteriores.'),
    ('NAT_0804', 'G08', 'despesa', '08.04', 'Perdas operacionais', 'Inadimplência de títulos prescritos.'),
    # G09 - Resultado Financeiro
    ('NAT_0901', 'G09', 'receita', '09.01', 'Rendimentos financeiros', 'Rendimento de aplicações financeiras e CDBs do escritório.'),
    ('NAT_0902', 'G09', 'receita', '09.02', 'Juros ativos e multas recebidas', 'Juros cobrados de clientes por atraso em honorários.'),
    ('NAT_0903', 'G09', 'despesa', '09.03', 'Juros passivos e encargos', 'Juros pagos sobre empréstimos ou contas em atraso.'),
    ('NAT_0904', 'G09', 'despesa', '09.04', 'Tarifas bancárias', 'Manutenção de contas correntes e tarifas de emissão de boletos.'),
    ('NAT_0905', 'G09', 'despesa', '09.05', 'Outras despesas financeiras', 'Descontos de duplicatas e taxas de cartão.'),
    # G10 - Tributos sobre o Lucro
    ('NAT_1001', 'G10', 'despesa', '10.01', 'IRPJ sobre o lucro', 'Imposto de Renda Pessoa Jurídica (Lucro Presumido/Real).'),
    ('NAT_1002', 'G10', 'despesa', '10.02', 'CSLL sobre o lucro', 'Contribuição Social sobre o Lucro Líquido.'),
    ('NAT_1003', 'G10', 'despesa', '10.03', 'Ajustes de tributos sobre o resultado', 'Provisões e ajustes contábeis de impostos s/ lucro.'),
    # G99 - Não-DRE / Patrimonial / Fluxo
    ('NAT_9901', 'G99', 'patrimonial', '99.01', 'Transferências entre contas', 'Movimentação interna entre contas correntes e aplicações.'),
    ('NAT_9902', 'G99', 'patrimonial', '99.02', 'Empréstimos recebidos', 'Ingresso de recursos de financiamentos bancários.'),
    ('NAT_9903', 'G99', 'patrimonial', '99.03', 'Amortização do principal de empréstimos', 'Pagamento do principal de dívidas (não inclui juros).'),
    ('NAT_9904', 'G99', 'patrimonial', '99.04', 'Aportes de capital social', 'Integralização de capital por sócios.'),
    ('NAT_9905', 'G99', 'patrimonial', '99.05', 'Distribuição de lucros aos sócios', 'Retirada de lucros isentos após apuração contábil.'),
    ('NAT_9906', 'G99', 'patrimonial', '99.06', 'Adiantamentos de clientes', 'Depósitos em garantia antes da execução do serviço.'),
    ('NAT_9907', 'G99', 'patrimonial', '99.07', 'Depósitos judiciais de terceiros', 'Valores depositados em juízo sob custódia.'),
    ('NAT_9908', 'G99', 'patrimonial', '99.08', 'Valores recebidos em nome de clientes', 'Alvarás, RPVs e precatórios levantados para repasse.'),
    ('NAT_9909', 'G99', 'patrimonial', '99.09', 'Repasses de recursos a clientes', 'Transferência ao cliente de valor de condenação levantado.'),
    ('NAT_9910', 'G99', 'patrimonial', '99.10', 'Aquisição de bens do imobilizado', 'Compra de computadores, mobiliário e reformas capitalizáveis.'),
    ('NAT_9911', 'G99', 'patrimonial', '99.11', 'Movimentações de contas transitórias', 'Lançamentos compensatórios pendentes de conciliação.')
]

# Subcategorias padrão do sistema pré-cadastradas para a advocacia
SYSTEM_SUBCATEGORIES = [
    # G01 - Receitas Brutas
    ('SUB_0101_01', 'NAT_0101', 'Cível e Contratos'),
    ('SUB_0101_02', 'NAT_0101', 'Trabalhista e Previdenciário'),
    ('SUB_0101_03', 'NAT_0101', 'Tributário e Fiscal'),
    ('SUB_0101_04', 'NAT_0101', 'Societário e M&A'),
    ('SUB_0101_05', 'NAT_0101', 'Família e Sucessões'),
    ('SUB_0101_06', 'NAT_0101', 'Imobiliário e Ambiental'),
    ('SUB_0101_07', 'NAT_0101', 'Penal Empresarial'),
    ('SUB_0101_08', 'NAT_0101', 'Administrativo e Regulatório'),
    
    ('SUB_0102_01', 'NAT_0102', 'Êxito em Ações Trabalhistas'),
    ('SUB_0102_02', 'NAT_0102', 'Êxito em Recuperação Tributária'),
    ('SUB_0102_03', 'NAT_0102', 'Êxito em Ações Cíveis Indenizatórias'),
    ('SUB_0102_04', 'NAT_0102', 'Êxito em Arbitragem e Mediação'),

    ('SUB_0103_01', 'NAT_0103', 'Sucumbência Justiça Estadual'),
    ('SUB_0103_02', 'NAT_0103', 'Sucumbência Justiça do Trabalho'),
    ('SUB_0103_03', 'NAT_0103', 'Sucumbência Justiça Federal'),

    ('SUB_0104_01', 'NAT_0104', 'Consulta Trabalhista / RH Preventivo'),
    ('SUB_0104_02', 'NAT_0104', 'Consulta Tributária e Planejamento'),
    ('SUB_0104_03', 'NAT_0104', 'Consulta Cível e Contratual'),

    ('SUB_0105_01', 'NAT_0105', 'Parecer de Risco Tributário'),
    ('SUB_0105_02', 'NAT_0105', 'Parecer de Conformidade Trabalhista'),
    ('SUB_0105_03', 'NAT_0105', 'Parecer Societário e Fusões'),

    ('SUB_0106_01', 'NAT_0106', 'Partido Jurídico Mensal (Retainer)'),
    ('SUB_0106_02', 'NAT_0106', 'Consultoria Preventiva Mensal'),
    ('SUB_0106_03', 'NAT_0106', 'Compliance e LGPD Recorrente'),

    # G02 - Deduções da Receita (Tributos sobre Faturamento do Escritório de Advocacia)
    ('SUB_0201_01', 'NAT_0201', 'DAS - Simples Nacional (Anexo IV)'),
    ('SUB_0201_02', 'NAT_0201', 'ISSQN Fixo / Sociedade Uniprofissional (SUP)'),
    ('SUB_0201_03', 'NAT_0201', 'ISSQN Variável s/ Faturamento de Honorários'),
    ('SUB_0201_04', 'NAT_0201', 'PIS s/ Faturamento (0,65% - Lucro Presumido)'),
    ('SUB_0201_05', 'NAT_0201', 'COFINS s/ Faturamento (3,00% - Lucro Presumido)'),
    ('SUB_0201_06', 'NAT_0201', 'Retenção na Fonte IRRF (1,5% por Clientes PJ)'),
    ('SUB_0201_07', 'NAT_0201', 'Retenção na Fonte CSRF (4,65% PIS/COFINS/CSLL)'),
    ('SUB_0201_08', 'NAT_0201', 'Carnê-Leão Mensal (IRPF - Advogado Autônomo)'),
    ('SUB_0203_01', 'NAT_0203', 'Abatimento Comercial Concedido'),
    ('SUB_0204_01', 'NAT_0204', 'Desconto Pontualidade'),

    # G03 - Custos dos Serviços Jurídicos
    ('SUB_0301_01', 'NAT_0301', 'Audiências (Correspondentes)'),
    ('SUB_0301_02', 'NAT_0301', 'Diligências e Despachos Judiciais'),
    ('SUB_0301_03', 'NAT_0301', 'Fotocópias e Protocolos Forenses'),

    ('SUB_0302_01', 'NAT_0302', 'Pareceristas Externos'),
    ('SUB_0302_02', 'NAT_0302', 'Bancas Parceiras Estratégicas'),
    ('SUB_0302_03', 'NAT_0302', 'Cálculos Judiciais Terceirizados'),

    ('SUB_0303_01', 'NAT_0303', 'Advogados Associados Alocados'),
    ('SUB_0303_02', 'NAT_0303', 'Estagiários de Direito em Produção'),

    ('SUB_0304_01', 'NAT_0304', 'Perícia Contábil e Financeira'),
    ('SUB_0304_02', 'NAT_0304', 'Perícia Médica e Insalubridade'),
    ('SUB_0304_03', 'NAT_0304', 'Perícia Grafotécnica'),
    ('SUB_0304_04', 'NAT_0304', 'Perícia de Engenharia e Avaliação'),

    ('SUB_0305_01', 'NAT_0305', 'Custas Judiciais Iniciais'),
    ('SUB_0305_02', 'NAT_0305', 'Preparo e Custas Recursais'),
    ('SUB_0305_03', 'NAT_0305', 'Condução de Oficial de Justiça'),
    ('SUB_0305_04', 'NAT_0305', 'Certidões e Emolumentos de Cartório'),

    # G04 - Despesas com Pessoal
    ('SUB_0401_01', 'NAT_0401', 'Financeiro e Controladoria'),
    ('SUB_0401_02', 'NAT_0401', 'Recepção e Secretariado'),
    ('SUB_0401_03', 'NAT_0401', 'Estagiários Administrativos'),

    ('SUB_0402_01', 'NAT_0402', 'FGTS de Equipe de Apoio'),
    ('SUB_0402_02', 'NAT_0402', 'INSS Patronal (CPP 20% Pró-labore - Anexo IV DCTFWeb)'),
    ('SUB_0402_03', 'NAT_0402', 'IRRF s/ Pró-labore dos Advogados e Sócios'),
    ('SUB_0402_04', 'NAT_0402', 'Provisão de 13º e Férias de Colaboradores'),

    ('SUB_0403_01', 'NAT_0403', 'Vale Alimentação e Refeição'),
    ('SUB_0403_02', 'NAT_0403', 'Plano de Saúde e Odontológico'),
    ('SUB_0403_03', 'NAT_0403', 'Vale Transporte'),

    ('SUB_0404_01', 'NAT_0404', 'Cursos e Pós-Graduações'),
    ('SUB_0404_02', 'NAT_0404', 'Congressos e Seminários'),

    # G05 - Despesas Administrativas
    ('SUB_0501_01', 'NAT_0501', 'Sede Principal'),
    ('SUB_0501_02', 'NAT_0501', 'Filial ou Sala de Reuniões'),
    ('SUB_0501_03', 'NAT_0501', 'Coworking'),

    ('SUB_0502_01', 'NAT_0502', 'Taxa de Condomínio'),
    ('SUB_0502_02', 'NAT_0502', 'IPTU Predial'),
    ('SUB_0502_03', 'NAT_0502', 'Anuidade OAB (Sociedade de Advogados)'),
    ('SUB_0502_04', 'NAT_0502', 'Anuidade OAB (Advogados Sócios e Associados)'),
    ('SUB_0502_05', 'NAT_0502', 'Taxa de Fiscalização e Funcionamento Municipal (TFE)'),

    ('SUB_0503_01', 'NAT_0503', 'Energia Elétrica Matriz'),
    ('SUB_0503_02', 'NAT_0503', 'Energia Elétrica Filial'),

    ('SUB_0505_01', 'NAT_0505', 'Link de Internet Dedicado'),
    ('SUB_0505_02', 'NAT_0505', 'Telefonia Móvel Corporativa'),
    ('SUB_0505_03', 'NAT_0505', 'Telefonia Fixa e VoIP'),

    ('SUB_0506_01', 'NAT_0506', 'Honorários Contábeis Mensais'),
    ('SUB_0506_02', 'NAT_0506', 'Auditoria e Regularidade Fiscal'),

    ('SUB_0507_01', 'NAT_0507', 'Papelaria, Pastas e Impressão'),
    ('SUB_0507_02', 'NAT_0507', 'Copa, Café e Água'),

    ('SUB_0508_01', 'NAT_0508', 'Serviço de Limpeza'),
    ('SUB_0508_02', 'NAT_0508', 'Materiais de Higiene e Descarte'),

    # G06 - Despesas Comerciais e Marketing OAB
    ('SUB_0601_01', 'NAT_0601', 'Identidade Visual e Branding'),
    ('SUB_0601_02', 'NAT_0601', 'Website e Manutenção Digital'),
    ('SUB_0601_03', 'NAT_0601', 'Material Institucional'),

    ('SUB_0602_01', 'NAT_0602', 'Artigos e Publicações Educativas OAB'),
    ('SUB_0602_02', 'NAT_0602', 'Informativos e Newsletters Jurídicas'),

    ('SUB_0603_01', 'NAT_0603', 'Podcasts e Vídeos Informativos'),
    ('SUB_0603_02', 'NAT_0603', 'Cartilhas Educativas para Clientes'),

    ('SUB_0604_01', 'NAT_0604', 'Agência de Marketing Jurídico'),
    ('SUB_0604_02', 'NAT_0604', 'Campanhas de Tráfego Educativo Google Ads'),

    # G07 - Despesas Tecnológicas
    ('SUB_0701_01', 'NAT_0701', 'Software de Gestão Processual'),
    ('SUB_0701_02', 'NAT_0701', 'Software de Diários e Recortes'),
    ('SUB_0701_03', 'NAT_0701', 'Automação de Petições e Documentos'),

    ('SUB_0702_01', 'NAT_0702', 'Plataforma de Inteligência Artificial'),
    ('SUB_0702_02', 'NAT_0702', 'Pesquisa Jurisprudencial (Jusbrasil / RT)'),

    ('SUB_0703_01', 'NAT_0703', 'Certificados Digitais (A1 / Token A3)'),
    ('SUB_0703_02', 'NAT_0703', 'Antivírus Corporativo e Firewall'),

    ('SUB_0704_01', 'NAT_0704', 'Google Workspace / Microsoft 365'),
    ('SUB_0704_02', 'NAT_0704', 'Servidor Cloud e Backup Criptografado'),

    # G09 - Resultado Financeiro
    ('SUB_0901_01', 'NAT_0901', 'Rendimento de Aplicação CDB / Renda Fixa'),
    ('SUB_0904_01', 'NAT_0904', 'Tarifas de Emissão de Boleto'),
    ('SUB_0904_02', 'NAT_0904', 'Tarifas de Manutenção de Conta'),
    ('SUB_0904_03', 'NAT_0904', 'Tarifas de Transações PIX e TED'),

    # G10 - Tributos sobre o Lucro
    ('SUB_1001_01', 'NAT_1001', 'IRPJ Trimestral (Lucro Presumido/Real)'),
    ('SUB_1001_02', 'NAT_1001', 'IRPJ Provisão Mensal por Competência'),
    ('SUB_1002_01', 'NAT_1002', 'CSLL Trimestral (Lucro Presumido/Real)'),
    ('SUB_1002_02', 'NAT_1002', 'CSLL Provisão Mensal por Competência'),

    # G99 - Não-DRE / Patrimonial / Fluxo
    ('SUB_9901_01', 'NAT_9901', 'Transferência Operacional / Aplicação'),
    ('SUB_9901_02', 'NAT_9901', 'Transferência Matriz / Filiais'),
    ('SUB_9904_01', 'NAT_9904', 'Aporte de Capital em Dinheiro'),
    ('SUB_9905_01', 'NAT_9905', 'Distribuição Mensal de Lucros'),
    ('SUB_9905_02', 'NAT_9905', 'Distribuição de Lucros de Exercício Anterior'),
    ('SUB_9908_01', 'NAT_9908', 'Alvará Judicial Trabalhista'),
    ('SUB_9908_02', 'NAT_9908', 'Alvará Judicial Cível'),
    ('SUB_9908_03', 'NAT_9908', 'Precatório ou RPV Levantado'),
    ('SUB_9909_01', 'NAT_9909', 'Repasse de Alvará ao Cliente (PIX/TED)'),
    ('SUB_9909_02', 'NAT_9909', 'Prestação de Contas de Condenação')
]


def setup(app, db, auth, editor, utc):
    """Inicializa as tabelas de naturezas de operações e registra as rotas da API."""
    with db() as c:
        # 1. Grupos da DRE (Nível 1)
        c.execute(text('''
            CREATE TABLE IF NOT EXISTS dre_groups (
                id VARCHAR(40) PRIMARY KEY,
                code VARCHAR(10) NOT NULL UNIQUE,
                name VARCHAR(150) NOT NULL,
                section VARCHAR(50) NOT NULL,
                presentation_order INTEGER NOT NULL,
                affects_dre INTEGER NOT NULL DEFAULT 1
            )
        '''))
        # 2. Naturezas de Operações (Nível 2)
        c.execute(text('''
            CREATE TABLE IF NOT EXISTS operation_natures (
                id VARCHAR(40) PRIMARY KEY,
                office_id VARCHAR(40),
                group_id VARCHAR(40) NOT NULL,
                operation_type VARCHAR(20) NOT NULL,
                code VARCHAR(20) NOT NULL,
                name VARCHAR(160) NOT NULL,
                description VARCHAR(255),
                is_system_default INTEGER NOT NULL DEFAULT 0,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at VARCHAR(40) NOT NULL,
                UNIQUE(office_id, code)
            )
        '''))
        # 3. Subcategorias Gerenciais (Nível 3)
        try:
            info = c.execute(text("PRAGMA table_info(operation_subcategories)")).fetchall()
            is_not_null = any(col[1] == 'office_id' and col[3] == 1 for col in info)
            if is_not_null:
                c.execute(text('''
                    CREATE TABLE IF NOT EXISTS operation_subcategories_v3 (
                        id VARCHAR(40) PRIMARY KEY,
                        office_id VARCHAR(40),
                        nature_id VARCHAR(40) NOT NULL,
                        name VARCHAR(160) NOT NULL,
                        is_system_default INTEGER NOT NULL DEFAULT 0,
                        is_active INTEGER NOT NULL DEFAULT 1,
                        created_at VARCHAR(40) NOT NULL,
                        UNIQUE(office_id, nature_id, name)
                    )
                '''))
                c.execute(text('''
                    INSERT OR IGNORE INTO operation_subcategories_v3 (id, office_id, nature_id, name, is_system_default, is_active, created_at)
                    SELECT id, office_id, nature_id, name, 0, is_active, created_at FROM operation_subcategories
                '''))
                c.execute(text('DROP TABLE operation_subcategories'))
                c.execute(text('ALTER TABLE operation_subcategories_v3 RENAME TO operation_subcategories'))
        except Exception:
            pass

        c.execute(text('''
            CREATE TABLE IF NOT EXISTS operation_subcategories (
                id VARCHAR(40) PRIMARY KEY,
                office_id VARCHAR(40),
                nature_id VARCHAR(40) NOT NULL,
                name VARCHAR(160) NOT NULL,
                is_system_default INTEGER NOT NULL DEFAULT 0,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at VARCHAR(40) NOT NULL,
                UNIQUE(office_id, nature_id, name)
            )
        '''))
        # 4. Auditoria de Alterações nas Naturezas
        c.execute(text('''
            CREATE TABLE IF NOT EXISTS operation_nature_audit_logs (
                id VARCHAR(40) PRIMARY KEY,
                office_id VARCHAR(40) NOT NULL,
                user_id VARCHAR(40) NOT NULL,
                action VARCHAR(50) NOT NULL,
                nature_id VARCHAR(40) NOT NULL,
                changes_json TEXT NOT NULL,
                timestamp VARCHAR(40) NOT NULL
            )
        '''))

        # Carga dos grupos padrão
        for gid, code, name, sec, order, affects in SYSTEM_DRE_GROUPS:
            if not c.execute(text('SELECT 1 FROM dre_groups WHERE id=:id'), {'id': gid}).first():
                c.execute(text('''
                    INSERT INTO dre_groups (id, code, name, section, presentation_order, affects_dre)
                    VALUES (:id, :code, :name, :sec, :order, :affects)
                '''), {'id': gid, 'code': code, 'name': name, 'sec': sec, 'order': order, 'affects': affects})

        # Carga das naturezas padrão do sistema (office_id = NULL)
        now = utc()
        for nid, gid, op_type, code, name, desc in SYSTEM_NATURES:
            if not c.execute(text('SELECT 1 FROM operation_natures WHERE id=:id'), {'id': nid}).first():
                c.execute(text('''
                    INSERT INTO operation_natures (id, office_id, group_id, operation_type, code, name, description, is_system_default, is_active, created_at)
                    VALUES (:id, NULL, :gid, :op, :code, :name, :desc, 1, 1, :created)
                '''), {'id': nid, 'gid': gid, 'op': op_type, 'code': code, 'name': name, 'desc': desc, 'created': now})

        # Carga e atualização das subcategorias padrão do sistema (office_id = NULL, is_system_default = 1)
        for sid, nid, sname in SYSTEM_SUBCATEGORIES:
            existing = c.execute(text('SELECT 1 FROM operation_subcategories WHERE id=:id'), {'id': sid}).first()
            if not existing:
                c.execute(text('''
                    INSERT INTO operation_subcategories (id, office_id, nature_id, name, is_system_default, is_active, created_at)
                    VALUES (:id, NULL, :nid, :name, 1, 1, :created)
                '''), {'id': sid, 'nid': nid, 'name': sname, 'created': now})
            else:
                c.execute(text('''
                    UPDATE operation_subcategories SET name=:name, nature_id=:nid, is_system_default=1, is_active=1 WHERE id=:id
                '''), {'id': sid, 'nid': nid, 'name': sname})

    # Modelos Pydantic para Request/Response
    class NatureCreateIn(BaseModel):
        group_id: str
        operation_type: Literal['receita', 'despesa', 'custo', 'patrimonial']
        code: str = Field(min_length=2, max_length=20)
        name: str = Field(min_length=2, max_length=160)
        description: Optional[str] = Field(default='', max_length=255)

    class NatureUpdateIn(BaseModel):
        name: str = Field(min_length=2, max_length=160)
        description: Optional[str] = Field(default='', max_length=255)
        is_active: bool = True

    class SubcategoryIn(BaseModel):
        name: str = Field(min_length=2, max_length=160)

    # ----------------------------------------------------
    # ENDPOINTS DE LEITURA E GESTÃO DE NATUREZAS
    # ----------------------------------------------------

    @app.get('/api/dre-groups')
    def list_dre_groups(u=Depends(auth)):
        with db() as c:
            rows = c.execute(text('''
                SELECT id, code, name, section, presentation_order, affects_dre
                FROM dre_groups ORDER BY presentation_order
            ''')).mappings().all()
            return [dict(r) for r in rows]

    @app.get('/api/operation-natures')
    def list_operation_natures(
        operation_type: Optional[str] = None,
        group_id: Optional[str] = None,
        search: Optional[str] = None,
        only_active: bool = True,
        u=Depends(auth)
    ):
        with db() as c:
            q = '''
                SELECT n.id, n.office_id, n.group_id, n.operation_type, n.code, n.name,
                       n.description, n.is_system_default, n.is_active, n.created_at,
                       g.code as group_code, g.name as group_name, g.affects_dre,
                       (SELECT count(*) FROM entries e WHERE e.office_id=:o AND e.nature_id=n.id) as entries_count,
                       (SELECT count(*) FROM bills b WHERE b.office_id=:o AND b.nature_id=n.id) as bills_count
                FROM operation_natures n
                JOIN dre_groups g ON g.id = n.group_id
                WHERE (n.office_id IS NULL OR n.office_id = :o)
            '''
            params = {'o': u['office_id']}
            if only_active:
                q += ' AND n.is_active = 1'
            if operation_type:
                q += ' AND n.operation_type = :op'
                params['op'] = operation_type
            if group_id:
                q += ' AND n.group_id = :gid'
                params['gid'] = group_id
            if search:
                q += ' AND (LOWER(n.name) LIKE :s OR LOWER(n.code) LIKE :s)'
                params['s'] = f"%{search.strip().lower()}%"
            q += ' ORDER BY g.presentation_order, n.code'
            rows = c.execute(text(q), params).mappings().all()
            
            # Subcategorias do escritório e padrão do sistema
            sub_rows = c.execute(text('''
                SELECT id, nature_id, name, is_system_default, office_id, is_active FROM operation_subcategories
                WHERE (office_id IS NULL OR office_id=:o) AND is_active=1 ORDER BY is_system_default DESC, name ASC
            '''), {'o': u['office_id']}).mappings().all()
            sub_map = {}
            for s in sub_rows:
                sub_map.setdefault(s['nature_id'], []).append(dict(s))

            result = []
            for r in rows:
                item = dict(r)
                item['linked_records_count'] = item['entries_count'] + item['bills_count']
                item['subcategories'] = sub_map.get(item['id'], [])
                result.append(item)
            return result

    @app.post('/api/operation-natures', status_code=201)
    def create_custom_nature(data: NatureCreateIn, u=Depends(editor)):
        with db() as c:
            # Validação do grupo
            group = c.execute(text('SELECT id, affects_dre FROM dre_groups WHERE id=:id'), {'id': data.group_id}).first()
            if not group:
                raise HTTPException(422, 'Grupo da DRE inexistente')
            if group[1] == 0 and data.operation_type != 'patrimonial':
                raise HTTPException(422, 'O grupo 99 (Não-DRE) aceita apenas o tipo patrimonial')
            if group[1] == 1 and data.operation_type == 'patrimonial':
                raise HTTPException(422, 'Operações patrimoniais pertencem exclusivamente ao grupo 99 (Não-DRE)')

            # Validação de código duplicado no escritório
            code_clean = data.code.strip()
            if c.execute(text('''
                SELECT 1 FROM operation_natures
                WHERE (office_id=:o OR office_id IS NULL) AND code=:code
            '''), {'o': u['office_id'], 'code': code_clean}).first():
                raise HTTPException(409, f'Código de natureza {code_clean} já existe neste escritório ou no sistema')

            nature_id = 'NAT_' + secrets.token_hex(12)
            now_iso = utc()
            c.execute(text('''
                INSERT INTO operation_natures (id, office_id, group_id, operation_type, code, name, description, is_system_default, is_active, created_at)
                VALUES (:id, :o, :gid, :op, :code, :name, :desc, 0, 1, :created)
            '''), {
                'id': nature_id, 'o': u['office_id'], 'gid': data.group_id,
                'op': data.operation_type, 'code': code_clean, 'name': data.name.strip(),
                'desc': data.description.strip(), 'created': now_iso
            })

            # Auditoria
            c.execute(text('''
                INSERT INTO operation_nature_audit_logs (id, office_id, user_id, action, nature_id, changes_json, timestamp)
                VALUES (:id, :o, :u, 'create', :nid, :json, :at)
            '''), {
                'id': secrets.token_hex(16), 'o': u['office_id'], 'u': u['id'],
                'nid': nature_id, 'json': json.dumps(data.model_dump(), ensure_ascii=False), 'at': now_iso
            })
            return {'id': nature_id, 'code': code_clean}

    @app.put('/api/operation-natures/{nature_id}')
    def update_custom_nature(nature_id: str, data: NatureUpdateIn, u=Depends(editor)):
        with db() as c:
            existing = c.execute(text('''
                SELECT id, office_id, is_system_default, name, description, is_active
                FROM operation_natures WHERE id=:id AND (office_id=:o OR office_id IS NULL)
            '''), {'id': nature_id, 'o': u['office_id']}).mappings().first()
            if not existing:
                raise HTTPException(404, 'Natureza de operação não encontrada')
            if existing['is_system_default']:
                raise HTTPException(403, 'Naturezas padrão do sistema não podem ser renomeadas ou alteradas; use a inativação se necessário')

            now_iso = utc()
            c.execute(text('''
                UPDATE operation_natures
                SET name=:name, description=:desc, is_active=:active
                WHERE id=:id AND (office_id=:o OR (is_system_default=1 AND office_id IS NULL))
            '''), {
                'id': nature_id, 'o': u['office_id'],
                'name': data.name.strip(),
                'desc': data.description.strip(),
                'active': 1 if data.is_active else 0
            })

            c.execute(text('''
                INSERT INTO operation_nature_audit_logs (id, office_id, user_id, action, nature_id, changes_json, timestamp)
                VALUES (:id, :o, :u, 'update', :nid, :json, :at)
            '''), {
                'id': secrets.token_hex(16), 'o': u['office_id'], 'u': u['id'],
                'nid': nature_id, 'json': json.dumps(data.model_dump(), ensure_ascii=False), 'at': now_iso
            })
            return {'ok': True, 'id': nature_id}

    @app.post('/api/operation-natures/{nature_id}/toggle-active')
    def toggle_nature_status(nature_id: str, u=Depends(editor)):
        with db() as c:
            row = c.execute(text('''
                SELECT id, is_active FROM operation_natures
                WHERE id=:id AND (office_id=:o OR office_id IS NULL)
            '''), {'id': nature_id, 'o': u['office_id']}).first()
            if not row:
                raise HTTPException(404, 'Natureza não encontrada')
            new_status = 0 if row[1] == 1 else 1
            c.execute(text('''
                UPDATE operation_natures SET is_active=:s
                WHERE id=:id AND (office_id=:o OR (is_system_default=1 AND office_id IS NULL))
            '''), {'s': new_status, 'id': nature_id, 'o': u['office_id']})
            c.execute(text('''
                INSERT INTO operation_nature_audit_logs (id, office_id, user_id, action, nature_id, changes_json, timestamp)
                VALUES (:id, :o, :u, 'toggle_active', :nid, :json, :at)
            '''), {
                'id': secrets.token_hex(16), 'o': u['office_id'], 'u': u['id'],
                'nid': nature_id, 'json': json.dumps({'is_active': bool(new_status)}), 'at': utc()
            })
            return {'id': nature_id, 'is_active': bool(new_status)}

    @app.delete('/api/operation-natures/{nature_id}')
    def delete_custom_nature(nature_id: str, u=Depends(editor)):
        with db() as c:
            row = c.execute(text('''
                SELECT id, office_id, is_system_default, name FROM operation_natures WHERE id=:id
            '''), {'id': nature_id}).mappings().first()
            if not row:
                raise HTTPException(404, 'Natureza não encontrada')

            # Natureza padrão do sistema não pode ser excluída via endpoint DELETE
            if row['is_system_default']:
                raise HTTPException(403, 'Naturezas padrão do sistema não podem ser excluídas; utilize a inativação se necessário')

            # Verificação estrita de lançamentos vinculados
            entries_n = c.execute(text('SELECT count(*) FROM entries WHERE nature_id=:nid'), {'nid': nature_id}).scalar() or 0
            bills_n = c.execute(text('SELECT count(*) FROM bills WHERE nature_id=:nid'), {'nid': nature_id}).scalar() or 0
            if entries_n + bills_n > 0:
                raise HTTPException(409, f'Esta natureza possui {entries_n + bills_n} lançamento(s) vinculado(s) e não pode ser excluída para preservar o histórico contábil. Inative-a se não for mais utilizá-la.')

            if row['office_id'] != u['office_id']:
                raise HTTPException(403, 'Operação não autorizada para este escritório')

            c.execute(text('DELETE FROM operation_subcategories WHERE nature_id=:nid AND office_id=:o'), {'nid': nature_id, 'o': u['office_id']})
            c.execute(text('DELETE FROM operation_natures WHERE id=:nid AND office_id=:o'), {'nid': nature_id, 'o': u['office_id']})
            c.execute(text('''
                INSERT INTO operation_nature_audit_logs (id, office_id, user_id, action, nature_id, changes_json, timestamp)
                VALUES (:id, :o, :u, 'delete', :nid, '{}', :at)
            '''), {'id': secrets.token_hex(16), 'o': u['office_id'], 'u': u['id'], 'nid': nature_id, 'at': utc()})
            return {'ok': True, 'action': 'deleted', 'id': nature_id}

    # ----------------------------------------------------
    # SUBCATEGORIAS GERENCIAIS (Nível 3)
    # ----------------------------------------------------

    @app.post('/api/operation-natures/{nature_id}/subcategories', status_code=201)
    def add_subcategory(nature_id: str, data: SubcategoryIn, u=Depends(editor)):
        with db() as c:
            if not c.execute(text('SELECT 1 FROM operation_natures WHERE id=:id'), {'id': nature_id}).first():
                raise HTTPException(404, 'Natureza pai não encontrada')
            sub_id = 'SUB_' + secrets.token_hex(12)
            c.execute(text('''
                INSERT INTO operation_subcategories (id, office_id, nature_id, name, is_system_default, is_active, created_at)
                VALUES (:id, :o, :nid, :name, 0, 1, :at)
            '''), {'id': sub_id, 'o': u['office_id'], 'nid': nature_id, 'name': data.name.strip(), 'at': utc()})
            return {'id': sub_id, 'name': data.name.strip(), 'nature_id': nature_id, 'is_system_default': 0}

    @app.put('/api/operation-subcategories/{sub_id}')
    def update_subcategory(sub_id: str, data: SubcategoryIn, u=Depends(editor)):
        with db() as c:
            sub = c.execute(text('SELECT id, is_system_default, office_id FROM operation_subcategories WHERE id=:id'), {'id': sub_id}).first()
            if not sub:
                raise HTTPException(404, 'Subcategoria não encontrada')
            name_clean = data.name.strip()
            if not name_clean:
                raise HTTPException(422, 'Nome da subcategoria é obrigatório')
            c.execute(text('''
                UPDATE operation_subcategories SET name=:name WHERE id=:id AND (office_id=:o OR (is_system_default=1 AND office_id IS NULL))
            '''), {'id': sub_id, 'name': name_clean, 'o': u['office_id']})
            return {'ok': True, 'id': sub_id, 'name': name_clean}

    @app.delete('/api/operation-subcategories/{sub_id}')
    def delete_subcategory(sub_id: str, u=Depends(editor)):
        with db() as c:
            sub = c.execute(text('SELECT is_system_default, office_id FROM operation_subcategories WHERE id=:id'), {'id': sub_id}).first()
            if not sub:
                raise HTTPException(404, 'Subcategoria não encontrada')
            # Soft delete/inativação
            c.execute(text('UPDATE operation_subcategories SET is_active=0 WHERE id=:id AND (office_id=:o OR office_id IS NULL)'), {'id': sub_id, 'o': u['office_id']})
            return {'ok': True, 'inactivated': sub_id}

    # ----------------------------------------------------
    # DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO (DRE ESTRUTURADA)
    # ----------------------------------------------------

    @app.get('/api/dre/complete')
    def complete_dre(month: Optional[str] = Query(None, pattern=r'^20\d{2}-(0[1-9]|1[0-2])$'), u=Depends(auth)):
        with db() as c:
            # Consulta combinada de títulos (bills) e lançamentos operacionais/demonstrativos (entries) por competência
            # Unifica ambas as fontes de dados para que os lançamentos do escritório comuniquem integralmente com a DRE
            params = {'o': u['office_id']}
            month_filter_b = ''
            month_filter_e = ''
            if month:
                month_filter_b = ' AND b.competence = :m'
                month_filter_e = ' AND SUBSTR(e.entry_date, 1, 7) = :m'
                params['m'] = month

            q = f'''
                SELECT 
                    sub.group_code, sub.group_name, sub.section, sub.presentation_order, sub.affects_dre,
                    sub.nature_id, sub.nature_code, sub.nature_name, sub.operation_type,
                    SUM(sub.cents) as total_cents
                FROM (
                    -- Títulos corporativos (bills)
                    SELECT 
                        COALESCE(g.code, CASE 
                            WHEN a.kind = 'receita' THEN '01'
                            WHEN a.kind = 'custo' THEN '03'
                            WHEN a.kind = 'despesa' THEN '05'
                            ELSE '99' END) as group_code,
                        COALESCE(g.name, CASE 
                            WHEN a.kind = 'receita' THEN 'Receita Bruta com Serviços Jurídicos'
                            WHEN a.kind = 'custo' THEN 'Custos dos Serviços Jurídicos'
                            WHEN a.kind = 'despesa' THEN 'Despesas Gerais e Administrativas'
                            ELSE 'Operações Patrimoniais e Fluxo (Não-DRE)' END) as group_name,
                        COALESCE(g.section, CASE 
                            WHEN a.kind = 'receita' THEN 'receita_bruta'
                            WHEN a.kind = 'custo' THEN 'custos'
                            WHEN a.kind = 'despesa' THEN 'despesas_operacionais'
                            ELSE 'nao_dre' END) as section,
                        COALESCE(g.presentation_order, CASE 
                            WHEN a.kind = 'receita' THEN 1
                            WHEN a.kind = 'custo' THEN 3
                            WHEN a.kind = 'despesa' THEN 5
                            ELSE 99 END) as presentation_order,
                        COALESCE(g.affects_dre, CASE WHEN a.kind IN ('receita', 'custo', 'despesa') THEN 1 ELSE 0 END) as affects_dre,
                        COALESCE(n.id, 'NAT_UNCLASSIFIED_' || a.kind) as nature_id,
                        COALESCE(n.code, 'SEM_NATUREZA') as nature_code,
                        COALESCE(n.name, 'Lançamentos sem Natureza (' || a.name || ')') as nature_name,
                        COALESCE(n.operation_type, a.kind) as operation_type,
                        b.cents
                    FROM bills b
                    JOIN ledger_accounts a ON a.id = b.account_id
                    LEFT JOIN operation_natures n ON n.id = b.nature_id
                    LEFT JOIN dre_groups g ON g.id = n.group_id
                    WHERE b.office_id = :o
                    {month_filter_b}

                    UNION ALL

                    -- Lançamentos operacionais e demonstrativos (entries)
                    SELECT 
                        COALESCE(g.code, CASE 
                            WHEN e.kind = 'receita' THEN '01'
                            WHEN e.kind = 'custo' THEN '03'
                            WHEN e.kind = 'despesa' THEN '05'
                            ELSE '99' END) as group_code,
                        COALESCE(g.name, CASE 
                            WHEN e.kind = 'receita' THEN 'Receita Bruta com Serviços Jurídicos'
                            WHEN e.kind = 'custo' THEN 'Custos dos Serviços Jurídicos'
                            WHEN e.kind = 'despesa' THEN 'Despesas Gerais e Administrativas'
                            ELSE 'Operações Patrimoniais e Fluxo (Não-DRE)' END) as group_name,
                        COALESCE(g.section, CASE 
                            WHEN e.kind = 'receita' THEN 'receita_bruta'
                            WHEN e.kind = 'custo' THEN 'custos'
                            WHEN e.kind = 'despesa' THEN 'despesas_operacionais'
                            ELSE 'nao_dre' END) as section,
                        COALESCE(g.presentation_order, CASE 
                            WHEN e.kind = 'receita' THEN 1
                            WHEN e.kind = 'custo' THEN 3
                            WHEN e.kind = 'despesa' THEN 5
                            ELSE 99 END) as presentation_order,
                        COALESCE(g.affects_dre, CASE WHEN e.kind IN ('receita', 'custo', 'despesa') THEN 1 ELSE 0 END) as affects_dre,
                        COALESCE(n.id, 'NAT_ENTRY_' || e.kind) as nature_id,
                        COALESCE(n.code, 'LANC_DEMO') as nature_code,
                        COALESCE(n.name, e.description) as nature_name,
                        COALESCE(n.operation_type, e.kind) as operation_type,
                        e.cents
                    FROM entries e
                    LEFT JOIN operation_natures n ON n.id = e.nature_id
                    LEFT JOIN dre_groups g ON g.id = n.group_id
                    WHERE e.office_id = :o
                    {month_filter_e}
                ) sub
                GROUP BY 
                    sub.group_code, sub.group_name, sub.section, sub.presentation_order, sub.affects_dre,
                    sub.nature_id, sub.nature_code, sub.nature_name, sub.operation_type
                ORDER BY sub.presentation_order, sub.nature_code
            '''
            rows = c.execute(text(q), params).mappings().all()
            try:
                total_contratos = c.execute(text("SELECT COUNT(*) FROM contracts WHERE office_id=:o"), {'o': u['office_id']}).scalar() or 0
                contratos_mkt = c.execute(text("SELECT COUNT(*) FROM contracts WHERE office_id=:o AND (origin='marketing' OR origin='mkt')"), {'o': u['office_id']}).scalar() or 0
                contratos_desk = c.execute(text("SELECT COUNT(*) FROM contracts WHERE office_id=:o AND (origin='atendimento' OR origin='desk' OR origin IS NULL OR origin='')"), {'o': u['office_id']}).scalar() or 0
            except Exception:
                total_contratos = 0
                contratos_mkt = 0
                contratos_desk = 0

        # Agrupamento estruturado
        group_totals = {f"G{i:02d}": 0 for i in range(1, 11)}
        group_totals['G99'] = 0
        groups_detail = {}

        for r in rows:
            raw_code = str(r['group_code'] or '99').strip()
            if raw_code.upper().startswith('G') and raw_code[1:].isdigit():
                gcode = f"G{int(raw_code[1:]):02d}"
            elif raw_code.isdigit():
                gcode = f"G{int(raw_code):02d}"
            else:
                gcode = 'G99'

            cents = int(r['total_cents'])
            group_totals[gcode] = group_totals.get(gcode, 0) + cents
            
            gentry = groups_detail.setdefault(gcode, {
                'code': r['group_code'],
                'name': r['group_name'],
                'section': r['section'],
                'affects_dre': bool(r['affects_dre']),
                'total_cents': 0,
                'natures': []
            })
            gentry['total_cents'] += cents
            gentry['natures'].append({
                'nature_id': r['nature_id'],
                'nature_code': r['nature_code'],
                'nature_name': r['nature_name'],
                'operation_type': r['operation_type'],
                'total_cents': cents,
                'total_reais': float(Decimal(cents) / 100)
            })

        # Cálculo da DRE por Competência conforme CPC / Contabilidade Gerencial Jurídica
        receita_bruta = group_totals['G01']
        deducoes = group_totals['G02']
        receita_liquida = receita_bruta - deducoes

        custos_servicos = group_totals['G03']
        resultado_bruto = receita_liquida - custos_servicos

        desp_pessoal = group_totals['G04']
        desp_admin = group_totals['G05']
        desp_comercial = group_totals['G06']
        desp_tecno = group_totals['G07']
        outras_operacionais = group_totals['G08']
        total_desp_operacionais = desp_pessoal + desp_admin + desp_comercial + desp_tecno
        resultado_operacional_ebit = resultado_bruto - total_desp_operacionais - outras_operacionais

        resultado_financeiro = group_totals['G09']
        resultado_antes_tributos_lair = resultado_operacional_ebit - resultado_financeiro

        tributos_lucro = group_totals['G10']
        resultado_liquido = resultado_antes_tributos_lair - tributos_lucro

        # Operações Não-DRE / Patrimoniais
        movimentacoes_patrimoniais = group_totals['G99']

        def to_r(cents):
            return float(Decimal(cents) / 100)

        desp_comercial_reais = to_r(desp_comercial)
        receita_bruta_reais = to_r(receita_bruta)

        # CAC 1: Custo de Aquisição Comercial (Marketing e Captação - G06)
        divisor_mkt = contratos_mkt if contratos_mkt > 0 else 0
        if divisor_mkt > 0:
            cac_unitario = round(desp_comercial_reais / divisor_mkt, 2)
        else:
            cac_unitario = 0.0 if desp_comercial_reais == 0 else desp_comercial_reais

        cac_sobre_receita_pct = round((desp_comercial_reais / receita_bruta_reais * 100), 2) if receita_bruta_reais > 0 else 0.0

        if desp_comercial_reais == 0:
            cac_status = 'Sem despesas comerciais registradas no período (Grupo G06)'
            cac_status_class = 'neutral'
        elif divisor_mkt == 0:
            cac_status = 'Sem contratos de marketing cadastrados para rateio do CAC Comercial'
            cac_status_class = 'warning'
        elif cac_sobre_receita_pct <= 10.0:
            cac_status = 'Dentro da faixa recomendada (3% a 10% da receita bruta)'
            cac_status_class = 'positive'
        elif cac_sobre_receita_pct <= 20.0:
            cac_status = 'Atenção ao prazo de retorno dos investimentos'
            cac_status_class = 'warning'
        else:
            cac_status = 'Investimento comercial superior a 20% da receita bruta'
            cac_status_class = 'negative'

        indicadores_cac = {
            'despesas_comerciais_g06': desp_comercial_reais,
            'total_contratos': total_contratos,
            'contratos_cadastrados': total_contratos,
            'contratos_marketing': contratos_mkt,
            'contratos_atendimento': contratos_desk,
            'novos_clientes': contratos_mkt,
            'cac_unitario': cac_unitario,
            'cac_sobre_receita_pct': cac_sobre_receita_pct,
            'status': cac_status,
            'status_class': cac_status_class
        }

        # CAC 2: CAC Operacional / Custo Estrutural por Contrato (Despesas do Escritório - G04 a G08)
        despesas_escritorio_cents = total_desp_operacionais + outras_operacionais
        despesas_escritorio_reais = to_r(despesas_escritorio_cents)

        divisor_desk = contratos_desk if contratos_desk > 0 else 0
        if divisor_desk > 0:
            cac_operacional_unitario = round(despesas_escritorio_reais / divisor_desk, 2)
        else:
            cac_operacional_unitario = 0.0 if despesas_escritorio_reais == 0 else despesas_escritorio_reais

        cac_operacional_sobre_receita_pct = round((despesas_escritorio_reais / receita_bruta_reais * 100), 2) if receita_bruta_reais > 0 else 0.0

        if despesas_escritorio_reais == 0:
            cac_op_status = 'Sem despesas operacionais registradas no período'
            cac_op_status_class = 'neutral'
        elif divisor_desk == 0:
            cac_op_status = 'Sem contratos de atendimento cadastrados para rateio unitário'
            cac_op_status_class = 'warning'
        elif cac_operacional_sobre_receita_pct <= 30.0:
            cac_op_status = 'Estrutura operacional altamente enxuta e escalável (<= 30% da receita bruta)'
            cac_op_status_class = 'positive'
        elif cac_operacional_sobre_receita_pct <= 50.0:
            cac_op_status = 'Faixa equilibrada de sustentação operacional para escritórios (30% a 50%)'
            cac_op_status_class = 'positive'
        elif cac_operacional_sobre_receita_pct <= 65.0:
            cac_op_status = 'Atenção ao custo estrutural e despesas administrativas (50% a 65%)'
            cac_op_status_class = 'warning'
        else:
            cac_op_status = 'Sobrecarga operacional crítica (> 65% da receita consumida em estrutura)'
            cac_op_status_class = 'negative'

        indicadores_cac_operacional = {
            'despesas_escritorio_total': despesas_escritorio_reais,
            'despesas_pessoal': to_r(desp_pessoal),
            'despesas_administrativas': to_r(desp_admin),
            'despesas_comerciais': to_r(desp_comercial),
            'despesas_tecnologia': to_r(desp_tecno),
            'outras_operacionais': to_r(outras_operacionais),
            'total_contratos': total_contratos,
            'contratos_cadastrados': total_contratos,
            'contratos_marketing': contratos_mkt,
            'contratos_atendimento': contratos_desk,
            'novos_clientes': contratos_desk,
            'cac_unitario': cac_operacional_unitario,
            'cac_sobre_receita_pct': cac_operacional_sobre_receita_pct,
            'status': cac_op_status,
            'status_class': cac_op_status_class
        }

        # CAC 3: CAC Total Integrado da Banca (Comercial G06 + Operacional G04 a G08 no Contexto DRE)
        despesas_totais_cac_reais = desp_comercial_reais + despesas_escritorio_reais
        divisor_tot = (contratos_mkt + contratos_desk) if (contratos_mkt + contratos_desk) > 0 else (total_contratos if total_contratos > 0 else 0)
        cac_total_unitario = round(despesas_totais_cac_reais / divisor_tot, 2) if divisor_tot > 0 else (0.0 if despesas_totais_cac_reais == 0 else despesas_totais_cac_reais)
        cac_total_sobre_receita_pct = round((despesas_totais_cac_reais / receita_bruta_reais * 100), 2) if receita_bruta_reais > 0 else 0.0

        if despesas_totais_cac_reais == 0:
            cac_tot_status = 'Sem despesas de aquisição ou manutenção registradas no período'
            cac_tot_status_class = 'neutral'
        elif divisor_tot == 0:
            cac_tot_status = 'Sem contratos cadastrados para rateio do CAC total'
            cac_tot_status_class = 'warning'
        elif cac_total_sobre_receita_pct <= 40.0:
            cac_tot_status = 'Equilíbrio financeiro e alta sustentabilidade (<= 40% da receita em aquisição e suporte)'
            cac_tot_status_class = 'positive'
        elif cac_total_sobre_receita_pct <= 60.0:
            cac_tot_status = 'Faixa moderada de sustentação global dos contratos (40% a 60%)'
            cac_tot_status_class = 'positive'
        else:
            cac_tot_status = 'Atenção: custos globais de aquisição e suporte consomem mais de 60% da receita bruta'
            cac_tot_status_class = 'warning'

        indicadores_cac_total = {
            'despesas_totais_cac': despesas_totais_cac_reais,
            'despesas_comerciais_g06': desp_comercial_reais,
            'despesas_escritorio_total': despesas_escritorio_reais,
            'total_contratos': total_contratos,
            'contratos_cadastrados': total_contratos,
            'contratos_marketing': contratos_mkt,
            'contratos_atendimento': contratos_desk,
            'novos_clientes': divisor_tot,
            'cac_unitario': cac_total_unitario,
            'cac_sobre_receita_pct': cac_total_sobre_receita_pct,
            'status': cac_tot_status,
            'status_class': cac_tot_status_class
        }

        return {
            'competencia': month or 'todas',
            'dre': {
                'receita_bruta': to_r(receita_bruta),
                'deducoes_receita': to_r(deducoes),
                'receita_liquida': to_r(receita_liquida),
                'custos_servicos': to_r(custos_servicos),
                'resultado_bruto': to_r(resultado_bruto),
                'despesas_operacionais': {
                    'pessoal': to_r(desp_pessoal),
                    'administrativas': to_r(desp_admin),
                    'comerciais_oab': to_r(desp_comercial),
                    'tecnologicas': to_r(desp_tecno),
                    'outras': to_r(outras_operacionais),
                    'total': to_r(total_desp_operacionais + outras_operacionais)
                },
                'resultado_operacional_ebit': to_r(resultado_operacional_ebit),
                'resultado_financeiro': to_r(resultado_financeiro),
                'resultado_antes_tributos_lair': to_r(resultado_antes_tributos_lair),
                'tributos_sobre_lucro': to_r(tributos_lucro),
                'resultado_liquido_exercicio': to_r(resultado_liquido),
                'margem_liquida_pct': round(float(resultado_liquido) / float(receita_bruta) * 100, 2) if receita_bruta > 0 else 0.0,
                'cac': indicadores_cac,
                'cac_operacional': indicadores_cac_operacional,
                'cac_total': indicadores_cac_total
            },
            'indicadores_comerciais': indicadores_cac,
            'indicadores_cac_operacional': indicadores_cac_operacional,
            'indicadores_cac_total': indicadores_cac_total,
            'operacoes_nao_dre_patrimoniais': {
                'total': to_r(movimentacoes_patrimoniais),
                'detalhes': groups_detail.get('G99', {'natures': []})['natures'],
                'aviso': 'Essas movimentações patrimoniais/transitórias não afetam a DRE e pertencem ao fluxo financeiro.'
            },
            'grupos_detalhe': groups_detail
        }

    @app.get('/api/dre/items')
    def get_dre_items(group: str = Query('ALL'),
                      month: Optional[str] = Query(None, pattern=r'^20\d{2}-(0[1-9]|1[0-2])$'),
                      u=Depends(auth)):
        with db() as c:
            params = {'o': u['office_id']}
            month_filter_b = ''
            month_filter_e = ''
            if month:
                month_filter_b = ' AND b.competence = :m'
                month_filter_e = ' AND SUBSTR(e.entry_date, 1, 7) = :m'
                params['m'] = month

            target_list = [g.strip().upper() for g in group.split(',') if g.strip()]
            group_filter = ''
            if target_list and 'ALL' not in target_list:
                normalized = []
                for tg in target_list:
                    if tg.startswith('G'): normalized.append(tg)
                    elif tg.isdigit(): normalized.append(f'G{int(tg):02d}')
                    else: normalized.append(tg)
                in_placeholders = ', '.join(f':grp_{i}' for i in range(len(normalized)))
                for i, val in enumerate(normalized):
                    params[f'grp_{i}'] = val
                group_filter = f'WHERE sub.normalized_group IN ({in_placeholders})'

            q = f'''
                SELECT 
                    sub.source, sub.id, sub.date, sub.description, sub.area, sub.kind, sub.cents,
                    sub.normalized_group as group_code, sub.group_name,
                    sub.nature_id, sub.nature_code, sub.nature_name,
                    sub.subcategory_id, sub.subcategory_name
                FROM (
                    SELECT 
                        'bill' as source,
                        b.id,
                        COALESCE(b.due_date, b.competence || '-01') as date,
                        b.description,
                        a.name as area,
                        a.kind as kind,
                        b.cents,
                        COALESCE(g.id, CASE 
                            WHEN a.kind = 'receita' THEN 'G01'
                            WHEN a.kind = 'custo' THEN 'G03'
                            WHEN a.kind = 'despesa' THEN 'G05'
                            ELSE 'G99' END) as normalized_group,
                        COALESCE(g.name, CASE 
                            WHEN a.kind = 'receita' THEN 'Receita Bruta com Serviços Jurídicos'
                            WHEN a.kind = 'custo' THEN 'Custos dos Serviços Jurídicos'
                            WHEN a.kind = 'despesa' THEN 'Despesas Gerais e Administrativas'
                            ELSE 'Operações Patrimoniais e Fluxo (Não-DRE)' END) as group_name,
                        n.id as nature_id,
                        n.code as nature_code,
                        n.name as nature_name,
                        s.id as subcategory_id,
                        s.name as subcategory_name
                    FROM bills b
                    JOIN ledger_accounts a ON a.id = b.account_id
                    LEFT JOIN operation_natures n ON n.id = b.nature_id
                    LEFT JOIN operation_subcategories s ON s.id = b.subcategory_id
                    LEFT JOIN dre_groups g ON g.id = n.group_id
                    WHERE b.office_id = :o
                    {month_filter_b}

                    UNION ALL

                    SELECT 
                        'entry' as source,
                        e.id,
                        e.entry_date as date,
                        e.description,
                        e.area,
                        e.kind,
                        e.cents,
                        COALESCE(g.id, CASE 
                            WHEN e.kind = 'receita' THEN 'G01'
                            WHEN e.kind = 'custo' THEN 'G03'
                            WHEN e.kind = 'despesa' THEN 'G05'
                            ELSE 'G99' END) as normalized_group,
                        COALESCE(g.name, CASE 
                            WHEN e.kind = 'receita' THEN 'Receita Bruta com Serviços Jurídicos'
                            WHEN e.kind = 'custo' THEN 'Custos dos Serviços Jurídicos'
                            WHEN e.kind = 'despesa' THEN 'Despesas Gerais e Administrativas'
                            ELSE 'Operações Patrimoniais e Fluxo (Não-DRE)' END) as group_name,
                        n.id as nature_id,
                        n.code as nature_code,
                        n.name as nature_name,
                        s.id as subcategory_id,
                        s.name as subcategory_name
                    FROM entries e
                    LEFT JOIN operation_natures n ON n.id = e.nature_id
                    LEFT JOIN operation_subcategories s ON s.id = e.subcategory_id
                    LEFT JOIN dre_groups g ON g.id = n.group_id
                    WHERE e.office_id = :o
                    {month_filter_e}
                ) sub
                {group_filter}
                ORDER BY sub.date DESC, sub.id DESC
            '''
            rows = c.execute(text(q), params).mappings().all()
            total_cents = sum(int(r['cents']) for r in rows)
            return {
                'month': month or 'todas',
                'target_groups': target_list,
                'count': len(rows),
                'total_cents': total_cents,
                'total_reais': float(Decimal(total_cents) / 100),
                'items': [{
                    'id': r['id'],
                    'source': r['source'],
                    'source_label': 'Lançamento' if r['source'] == 'entry' else 'Título Financeiro',
                    'date': r['date'],
                    'description': r['description'],
                    'area': r['area'] or 'Geral',
                    'kind': r['kind'],
                    'cents': r['cents'],
                    'amount': float(Decimal(r['cents']) / 100),
                    'group_code': r['group_code'],
                    'group_name': r['group_name'],
                    'nature_code': r['nature_code'] or '—',
                    'nature_name': r['nature_name'] or 'Sem classificação padronizada',
                    'subcategory_name': r['subcategory_name'] or '—'
                } for r in rows]
            }

