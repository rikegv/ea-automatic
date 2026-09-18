-- O DE/PARA DAS ETAPAS QUE FALTAVAM: as QUATRO que o diretor fechou e as ONZE que a fábrica propõe.
-- Decisão e proposta em `docs/MAPA-ALCANCE-VAGA-PENDENTE-REVISAO.md`, seção "DECISÃO 3".
--
-- ┌─ MIGRATION NOVA, E AS ANTERIORES NÃO SE EDITAM ────────────────────────────────────────────────┐
-- │ A 0110, a 0111 e a 0113 já constam como aplicadas no `_journal.json` e já rodaram em            │
-- │ homologação: mexer no texto delas mudaria só o que se lê, nunca o que o banco tem. A virada     │
-- │ mora aqui, que é o único lugar honesto, e a forma é a mesma das duas sementes anteriores:       │
-- │ INSERT com `ON CONFLICT ("fonte", "chave_externa") DO NOTHING`, nunca `DO UPDATE`. Num banco em │
-- │ que alguém já tenha configurado uma destas pastas, a configuração DELE ganha: deploy não        │
-- │ sobrescreve operação, e é por isso que rodar de novo não desfaz nada.                            │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ AS CHAVES SÃO A SAÍDA REAL DE `normalizarChaveExterna`, CONFERIDA UMA A UMA ──────────────────┐
-- │ `domain/as-etapa-externa.ts`: sem acento, sem o que está entre parênteses, minúsculas,          │
-- │ pontuação virando espaço, espaços colapsados. É ela que faz `TRIADOS`, `triados` e `Triados`    │
-- │ caírem na MESMA linha. As quinze chaves abaixo foram passadas pela função antes de escritas, e  │
-- │ as quinze saem idênticas ao que está aqui. Chave digitada de memória casa em NADA, e o sintoma  │
-- │ é indistinguível do fail-closed legítimo: nada acontece, e ninguém investiga.                    │
-- │                                                                                                 │
-- │ O `rotulo_externo` GUARDA A FORMA LEGÍVEL DA PASTA, e é CONFIGURAÇÃO REVISADA À MÃO, jamais     │
-- │ cópia automática de campo vindo da API (condição do parecer de segurança sobre esta coluna, e   │
-- │ sobre o `motivo_padrao`, que é COPIADO PARA DENTRO da candidatura de uma pessoa). A medição que │
-- │ levantou estas quinze registrou a chave NORMALIZADA, não a grafia crua de cada vaga, então o    │
-- │ rótulo aqui é o nome legível da pasta, e não uma grafia inventada de uma vaga específica: a     │
-- │ grafia crua varia DE VAGA PARA VAGA, e é justamente por isso que quem casa é a chave.           │
-- └─────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- §A.6: nada de pessoal entra aqui. Código de etapa, nome de pasta de vaga, situação, um texto curto
-- de motivo escrito por quem configura e um booleano. Nenhum dado de candidato passa por este arquivo.

-- ══ 1. AS QUATRO QUE O DIRETOR FECHOU ════════════════════════════════════════════════════════
--
-- DUAS nascem ATIVAS e a terceira nasce DESLIGADA, e a terceira e o caso que exigiu decisao:
--   `entrevista inteligente`        -> etapa CAPTACAO (é a pasta de maior peso da entrada: 325 vagas
--                                     e 29,5% das inscrições da amostra estavam presas nela);
--   `pre selecionado`               -> etapa TRIAGEM (o SINGULAR; o plural `pre selecionados` já foi
--                                     semeado na 0111, e as duas grafias são pastas distintas no
--                                     ATS, logo duas linhas: a chave é a PASTA, não a etapa);
--   `retorno negativo etapa soulan` -> desfecho DESCARTADO com motivo proprio, porem INATIVA.
--
-- POR QUE O `retorno negativo etapa soulan` NASCE DESLIGADA (decisao do diretor, 18/09/2026).
-- Ela e a UNICA das tres que escreve DESFECHO, e o `seguranca` mediu o que isso custa. Gravar
-- `situacao` carimba `as_candidaturas.atualizado_em`, e esse carimbo e o RELOGIO do expurgo: a
-- escrita empurra o prazo de 2 anos para frente, a contar do instante da volta, para TODA pessoa
-- alcancada. Ao mesmo tempo, `DESCARTADO` nao esta em `SITUACOES_VIVAS`, entao a protecao de
-- "vivo em vaga nao encerrada" CAI.
--
-- Somando as duas: uma linha de de/para converteria, de uma volta para a outra, "protegido
-- enquanto a vaga viver" em "expurgavel dois anos a contar de agora", para uma populacao inteira,
-- por efeito colateral. Nao apaga ninguem hoje, e nisso o erro cai para o lado de nao apagar, mas
-- REESCREVE O RELOGIO DE RETENCAO de gente que ninguem tocou.
--
-- O diretor decidiu deixa-la DESLIGADA por isso, sabendo do efeito. Liga-la e um
-- `UPDATE ... SET ativo = true`, e quem ligar precisa ler este bloco antes.
--
-- ┌─ POR QUE O `retorno negativo etapa soulan` TEM `etapa_codigo` NULO ────────────────────────────┐
-- │ Quem é descartado NÃO MUDA DE LUGAR no funil, ele SAI dele. Escrever uma etapa ali registraria │
-- │ no histórico da pessoa um movimento que não aconteceu, e trilha de seleção não se desfaz. O    │
-- │ CHECK `etapa_codigo IS NOT NULL OR situacao IS NOT NULL` continua satisfeito pela SITUAÇÃO.    │
-- │                                                                                                │
-- │ O MOTIVO É O QUE O SEPARA DOS OUTROS DESCARTES, e é a mesma razão da 0111: `DESCARTADO` é UM   │
-- │ valor do vocabulário fechado de `CANDIDATURA_SITUACOES`, e três pastas caem nele (`RETORNO     │
-- │ NEGATIVO`, `Descartados` e esta). Sem o motivo, quem lê a tela depois não sabe qual foi.        │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
INSERT INTO "as_depara_etapa_externa"
  ("fonte", "chave_externa", "rotulo_externo", "etapa_codigo", "situacao", "motivo_padrao", "ativo")
VALUES
  ('PANDAPE', 'entrevista inteligente',        'Entrevista Inteligente',        'CAPTACAO', NULL,         NULL,               true),
  ('PANDAPE', 'pre selecionado',               'Pre-selecionado',               'TRIAGEM',  NULL,         NULL,               true),
  ('PANDAPE', 'retorno negativo etapa soulan', 'Retorno Negativo Etapa Soulan', NULL,       'DESCARTADO', 'Retorno negativo', false)
ON CONFLICT ("fonte", "chave_externa") DO NOTHING;--> statement-breakpoint

-- ══ 2. `finalistas`: LINHA INATIVA, QUE É "IGNORADA" E NÃO "DESCARTE" ════════════════════════
--
-- ┌─ O DIRETOR ESCREVEU "NÃO usam, tratar como descarte/ignorada", E AS DUAS SÃO OPOSTAS ──────────┐
-- │ DESCARTE ESCREVE: carimba `DESCARTADO` na candidatura de uma pessoa, entra no funil e mexe no  │
-- │ relógio de retenção dela. IGNORADA NÃO ESCREVE NADA, que é o fail-closed da casa.               │
-- │                                                                                                 │
-- │ A FÁBRICA ADOTA IGNORADA, porque é o lado SEGURO E REVERSÍVEL: marcar como descartada gente que │
-- │ ninguém descartou falsearia a história de 174 vagas, e desfazer isso depois é caro. Ativar uma  │
-- │ linha é barato; apagar desfecho gravado em candidatura de pessoa, não.                           │
-- └─────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ A FORMA É LINHA INATIVA, E NÃO A AUSÊNCIA DE LINHA, DE PROPÓSITO ─────────────────────────────┐
-- │ Sem linha nenhuma, `finalistas` seria indistinguível das chaves que ninguém olhou ainda, e a    │
-- │ decisão do diretor viraria esquecimento aos olhos de quem ler isto em seis meses. A linha       │
-- │ INATIVA registra a decisão DELIBERADA.                                                           │
-- │                                                                                                 │
-- │ LINHA INATIVA É NÃO MAPEADA, E ISSO TEM DUAS FECHADURAS, as duas já no lugar antes deste        │
-- │ arquivo: `IngestaoRepositorio.deParaEtapa` filtra `ativo = true` na CONSULTA, então a linha nem │
-- │ sai do banco; e `lerLinhaDePara` (`domain/as-etapa-externa.ts`) devolve `NAO_MAPEADA` para      │
-- │ `linha.ativo === false`, então nem por outro caminho de leitura ela vira ordem. O efeito é      │
-- │ EXATAMENTE o de não haver linha: a inscrição não é ingerida, ninguém é escrito, e a chave volta │
-- │ no resumo da volta para o diretor decidir.                                                       │
-- └─────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- O DESTINO GRAVADO NA LINHA INATIVA É O `DESCARTADO`, e ele é INERTE enquanto `ativo = false`. Ele
-- está aqui porque o CHECK `etapa_codigo IS NOT NULL OR situacao IS NOT NULL` exige um destino, e
-- porque a OUTRA metade da frase do diretor era justamente "descarte": ligar esta linha passa a ser
-- o gesto dele escolhendo aquela metade, com a tradução já pronta. Enquanto ele não ligar, nada
-- acontece.
INSERT INTO "as_depara_etapa_externa"
  ("fonte", "chave_externa", "rotulo_externo", "etapa_codigo", "situacao", "motivo_padrao", "ativo")
VALUES
  ('PANDAPE', 'finalistas', 'Finalistas', NULL, 'DESCARTADO', 'Finalistas', false)
ON CONFLICT ("fonte", "chave_externa") DO NOTHING;--> statement-breakpoint

-- ══ 3. AS ONZE MARGINAIS, FECHADAS PELO DIRETOR, TODAS ATIVAS ════════════════════════════════
--
-- O DIRETOR FECHOU AS ONZE EM 18/09/2026, ENTAO ELAS NASCEM LIGADAS.
-- A proposta da fabrica foi levada a ele uma a uma, com a razao de cada uma, e ele aprovou a
-- tabela inteira. Elas deixam de ser proposta e passam a ser traducao vigente.
--
-- NENHUMA DELAS ESCREVE DESFECHO, e e por isso que liga-las e barato: dez gravam so ETAPA, que
-- move a pessoa dentro do funil sem tocar `situacao`. A unica com situacao e `admissao`, e ela
-- grava `ENVIADO_PARA_ADMISSAO`, que ESTA em `SITUACOES_VIVAS`: a pessoa segue protegida, ao
-- contrario do que aconteceria com um descarte (ver o bloco do `retorno negativo` acima).
--
-- CADA UMA APARECE EM 1 OU 2 VAGAS, entao o efeito de volume e pequeno. Quem move a agulha e a
-- `entrevista inteligente` da secao 1, com 325 vagas e 29,5% das inscricoes.
--
-- A RAZAO DE CADA UMA, como foi levada ao diretor e aprovada:
--   `triagem`, `triado`            o nome é a etapa; `triado` é variação de `triados`, já mapeada;
--   `testes`                       teste é instrumento de triagem, não etapa própria;
--   `entrevistas soulan`           plural de `entrevista soulan`, já mapeada na 0110;
--   `entrevista`                   ambígua; na dúvida, a NOSSA, que é a que o time conduz;
--   `entrevista cliente`           o nome é a etapa;
--   `enviados para cliente`,
--   `encaminhados cliente`         variações de `short list encaminhados cliente`, já mapeada;
--   `etapa inteligente`            irmã de `entrevista inteligente`, que o diretor mandou p/ CAPTACAO;
--   `admissao`                     mesmo destino de `contratados` (0111): a etapa diz ONDE ela parou
--                                  no funil, e a situação diz que ATRAVESSOU para a esteira;
--   `abordados`                    primeiro contato, como `lead` e `inscritos` (0110).
INSERT INTO "as_depara_etapa_externa"
  ("fonte", "chave_externa", "rotulo_externo", "etapa_codigo", "situacao", "motivo_padrao", "ativo")
VALUES
  ('PANDAPE', 'triagem',               'Triagem',               'TRIAGEM',            NULL,                    NULL, true),
  ('PANDAPE', 'triado',                'Triado',                'TRIAGEM',            NULL,                    NULL, true),
  ('PANDAPE', 'testes',                'Testes',                'TRIAGEM',            NULL,                    NULL, true),
  ('PANDAPE', 'entrevistas soulan',    'Entrevistas Soulan',    'ENTREVISTA_SOULAN',  NULL,                    NULL, true),
  ('PANDAPE', 'entrevista',            'Entrevista',            'ENTREVISTA_SOULAN',  NULL,                    NULL, true),
  ('PANDAPE', 'entrevista cliente',    'Entrevista Cliente',    'ENTREVISTA_CLIENTE', NULL,                    NULL, true),
  ('PANDAPE', 'enviados para cliente', 'Enviados Para Cliente', 'ENTREVISTA_CLIENTE', NULL,                    NULL, true),
  ('PANDAPE', 'encaminhados cliente',  'Encaminhados Cliente',  'ENTREVISTA_CLIENTE', NULL,                    NULL, true),
  ('PANDAPE', 'etapa inteligente',     'Etapa Inteligente',     'CAPTACAO',           NULL,                    NULL, true),
  ('PANDAPE', 'admissao',              'Admissao',              'APROVACAO',          'ENVIADO_PARA_ADMISSAO', NULL, true),
  ('PANDAPE', 'abordados',             'Abordados',             'CAPTACAO',           NULL,                    NULL, true)
ON CONFLICT ("fonte", "chave_externa") DO NOTHING;
