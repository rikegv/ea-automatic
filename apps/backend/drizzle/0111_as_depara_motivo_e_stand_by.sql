-- FUNDAÇÃO DA PLATAFORMA UNIFICADORA, A VIRADA DO DE/PARA: o motivo por etapa externa, a sexta
-- etapa do funil e as CINCO traduções que faltavam.
--
-- ┌─ ESTA MIGRATION EXISTE PORQUE A 0110 JÁ FOI APLICADA, e o texto dela ficou velho ──────────────┐
-- │ A 0110 diz, em caixa alta, que cinco pastas do Pandapé estão DELIBERADAMENTE sem mapeamento e  │
-- │ que "ninguém deve consertar isto depois". Aquilo estava certo quando foi escrito: faltava a    │
-- │ decisão do diretor, e escolher por ele escreveria na trilha de pessoas reais um movimento que  │
-- │ ninguém decidiu.                                                                                │
-- │                                                                                                 │
-- │ A DECISÃO SAIU EM 17/09/2026, e é ela que este arquivo aplica. A 0110 NÃO é editada: ela já    │
-- │ consta como aplicada no `_journal.json` e roda em bancos que já a executaram, então mexer no    │
-- │ texto dela mudaria só o que se lê, nunca o que o banco tem. O registro da virada mora AQUI, que │
-- │ é o único lugar honesto: quem for ler a 0110 amanhã encontra a proibição, e é este comentário   │
-- │ que explica por que ela caiu.                                                                   │
-- └─────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- §A.6: nada de pessoal entra aqui. Código de etapa, nome de pasta de vaga, situação e um texto de
-- motivo escrito por quem configura. Nenhum dado de candidato passa por este arquivo.

-- ══ 1. O MOTIVO PADRÃO DA TRADUÇÃO ═══════════════════════════════════════════════════════════
--
-- ┌─ POR QUE UMA COLUNA, E NÃO UMA REGRA NO CÓDIGO DA INGESTÃO ────────────────────────────────────┐
-- │ O diretor aceitou a proposta inteira e acrescentou UMA distinção: `RETORNO NEGATIVO` e         │
-- │ `Descartados` NÃO podem cair no mesmo lugar. Os dois são descarte, mas um é "o cliente         │
-- │ recusou" e o outro é "a seleção descartou", e quem lê a tela depois precisa saber qual foi.    │
-- │                                                                                                 │
-- │ A situação sozinha não consegue dizer isso: `DESCARTADO` é UM valor do vocabulário fechado de  │
-- │ `CANDIDATURA_SITUACOES`, e inventar um segundo valor de situação só para separar as duas       │
-- │ origens contaminaria o vocabulário do funil inteiro (filtros, contagens, tela) com uma          │
-- │ distinção que só existe na tradução de UMA fonte. O motivo é o campo certo: ele já existe em   │
-- │ `as_candidaturas.motivo_descarte`, é exatamente a pergunta "por quê", e é ali que a ingestão   │
-- │ vai gravar este texto quando a pasta externa chegar.                                            │
-- │                                                                                                 │
-- │ NULO É O NORMAL: pasta que não é descarte não tem motivo, e forçar um texto ali encheria a     │
-- │ candidatura de motivo para quem nunca foi descartado.                                           │
-- └─────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ A CONDIÇÃO DO PARECER DE SEGURANÇA VALE AQUI IGUAL, e está repetida de propósito ─────────────┐
-- │ O `seguranca` exigiu, sobre `rotulo_externo`, que ele seja alimentado por CONFIGURAÇÃO         │
-- │ REVISADA e NUNCA por cópia automática de campo vindo da API. `motivo_padrao` herda a exigência │
-- │ inteira, e por um motivo mais forte: o valor desta coluna é COPIADO PARA DENTRO DA CANDIDATURA │
-- │ de uma pessoa. Um pipeline que jogasse aqui o texto livre que o ATS devolvesse transformaria   │
-- │ este campo num duto de dado de terceiro para dentro da nossa base, sem ninguém ler o que passa,│
-- │ e é assim que dado pessoal entra onde não devia (§A.6, minimização).                            │
-- │ 120 caracteres é frase curta de classificação, e o tamanho é parte da trava.                    │
-- └─────────────────────────────────────────────────────────────────────────────────────────────────┘
ALTER TABLE "as_depara_etapa_externa" ADD COLUMN IF NOT EXISTS "motivo_padrao" varchar(120);--> statement-breakpoint

-- ══ 2. A SEXTA ETAPA DO FUNIL: STAND BY ══════════════════════════════════════════════════════
--
-- Ela é a tradução de `RETORNO VAGA STAND BY`, a pasta em que o cliente segura o candidato sem
-- recusar e sem aprovar. O diretor aprovou criá-la, e ela é ETAPA e não desfecho justamente por
-- isso: quem está em stand by continua VIVO no processo, e transformá-lo em descarte apagaria da
-- fila gente que ainda pode ser chamada.
--
-- ┌─ É CATÁLOGO DO DIRETOR, E A FÁBRICA NÃO VOLTA AQUI ────────────────────────────────────────────┐
-- │ Rótulo, ordem, tom e o próprio ligar/desligar são EDITÁVEIS na tela do funil. Ele pode          │
-- │ renomear para o que o time chama no dia a dia, trocar a cor, empurrar para outra posição ou     │
-- │ INATIVAR, e nada neste arquivo precisa mudar: a semente é o ponto de partida, nunca a verdade   │
-- │ permanente. O de/para aponta para o CÓDIGO `STAND_BY`, que é imutável, e não para o rótulo.     │
-- └─────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- AS MESMAS TRÊS TRAVAS DA 0110, e pelas mesmas razões:
--   1. `ON CONFLICT (codigo) DO NOTHING`, nunca `DO UPDATE`: um `DO UPDATE` desfaria a edição do
--      diretor a cada deploy, em silêncio, devolvendo o catálogo ao que a fábrica achou em setembro.
--   2. `ativa` NÃO aparece no INSERT: com o `DO NOTHING`, uma etapa que ele tenha inativado não
--      ressuscita e não volta ao seletor de quem move candidato.
--   3. `inicial = false`, e nenhum UPDATE de inicial aqui: a porta de entrada do funil é a Captação,
--      decidida na 0110, e o índice parcial único `as_etapas_funil_inicial_unica` recusaria a
--      segunda inicial derrubando a migration inteira.
--
-- ORDEM 6 porque ela vem depois da Aprovação na lista, e a ordem NÃO é única no catálogo: se o
-- diretor já tiver criado algo na posição 6, as duas convivem e ele reordena na tela.
--
-- POR QUE ELA NÃO ENTRA EM `ETAPAS_FUNIL_SEMENTE` (`@ea/shared-types`): aquela constante é o
-- vocabulário compartilhado das CINCO originais, tem dono único (§A.39, o coordenador) e é conferida
-- por teste contra a semente da 0110. Esta etapa nasce de uma decisão de catálogo, não de
-- vocabulário de código: nenhuma linha de TypeScript precisa saber que `STAND_BY` existe para o
-- funil funcionar, porque quem lê as etapas lê a TABELA.
INSERT INTO "as_etapas_funil" ("codigo", "rotulo", "ordem", "tom", "inicial")
VALUES ('STAND_BY', 'Stand By', 6, 'wn', false)
ON CONFLICT ("codigo") DO NOTHING;--> statement-breakpoint

-- ══ 3. AS CINCO TRADUÇÕES QUE FALTAVAM ═══════════════════════════════════════════════════════
--
-- As chaves abaixo são a saída REAL de `normalizarChaveExterna` (`domain/as-etapa-externa.ts`) para
-- cada nome, e não uma normalização feita de cabeça: o parêntese de
-- `Pré-selecionadoS (MANTER SE HOUVER QUESTIONÁRIO)` some inteiro (é instrução para quem opera a
-- vaga, não nome de etapa), o acento cai, a caixa vira minúscula e a pontuação vira espaço
-- colapsado. Chave digitada de memória casa em nada e o sintoma é idêntico ao do fail-closed
-- legítimo: nada acontece, e ninguém investiga.
--
-- ┌─ AS DUAS ÚLTIMAS TÊM `etapa_codigo` NULO DE PROPÓSITO ─────────────────────────────────────────┐
-- │ Quem é descartado NÃO MUDA DE LUGAR no funil, ele SAI dele. Escrever uma etapa ali registraria │
-- │ no histórico da pessoa um movimento que não aconteceu, e trilha de seleção não se desfaz. O    │
-- │ CHECK `etapa_codigo IS NOT NULL OR situacao IS NOT NULL` continua satisfeito pela SITUAÇÃO, que │
-- │ é a informação verdadeira dessas duas linhas.                                                   │
-- │                                                                                                 │
-- │ E É AQUI QUE A DECISÃO DO DIRETOR APARECE NO BANCO: as duas caem na MESMA situação              │
-- │ (`DESCARTADO`, porque desfecho de descarte é um só) e em MOTIVOS DIFERENTES. É o motivo que     │
-- │ separa "o cliente recusou" de "a seleção descartou", que era exatamente o que ele pediu.        │
-- └─────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- `Contratados` vira APROVACAO mais ENVIADO_PARA_ADMISSAO, e os dois juntos são o ponto: a etapa diz
-- ONDE a pessoa parou no funil de seleção, e a situação diz que ela ATRAVESSOU para a esteira de
-- admissão. Só a etapa deixaria um aprovado parado na Aprovação para sempre; só a situação apagaria
-- do funil o caneco em que ele terminou.
--
-- `ON CONFLICT DO NOTHING` pela mesma razão da 0110: num banco em que alguém já configurou uma
-- dessas pastas na tela futura, a configuração DELE ganha. Deploy não sobrescreve operação.
INSERT INTO "as_depara_etapa_externa"
  ("fonte", "chave_externa", "rotulo_externo", "etapa_codigo", "situacao", "motivo_padrao")
VALUES
  ('PANDAPE', 'pre selecionados',       'Pré-selecionadoS (MANTER SE HOUVER QUESTIONÁRIO)', 'TRIAGEM',   NULL,                     NULL),
  ('PANDAPE', 'contratados',            'Contratados',                                      'APROVACAO', 'ENVIADO_PARA_ADMISSAO',  NULL),
  ('PANDAPE', 'retorno vaga stand by',  'RETORNO VAGA STAND BY',                            'STAND_BY',  NULL,                     NULL),
  ('PANDAPE', 'retorno negativo',       'RETORNO NEGATIVO',                                 NULL,        'DESCARTADO',             'Retorno negativo do cliente'),
  ('PANDAPE', 'descartados',            'Descartados',                                      NULL,        'DESCARTADO',             'Descartado na seleção')
ON CONFLICT ("fonte", "chave_externa") DO NOTHING;
