import "dotenv/config";
import { createDb } from "../db/client";

/**
 * ─ O ARNÊS DE SEMEADURA DE A&S PARA A CENTRAL DE AJUDA ──────────────────────────────────────────
 *
 * ┌─ POR QUE ELE EXISTE, E O NÚMERO QUE O ORIGINOU ──────────────────────────────────────────────┐
 * │ A Central De Ajuda tem 131 artigos e NENHUM print das telas de A&S, porque não há o que         │
 * │ fotografar. Medido na homologação em 30/09/2026: `as_candidatos` 0 linhas, `as_candidaturas` 0, │
 * │ `as_shortlist_itens` 0, `as_ingestao_conflitos` 0, `vagas` 1, `as_shortlists` 1. O motor de     │
 * │ captura recusa lista vazia por construção, e ele está certo: print de tela vazia parece pronto, │
 * │ que é pior do que print faltando.                                                              │
 * │ §A.43 autoriza: a homologação é ambiente de teste, e a fábrica SEMEIA dado sintético.           │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS RÉGUAS DE DADO, e cada uma fecha um jeito diferente de o gate recusar a imagem (§A.6) ────┐
 * │ NOME:      `SIMULADO <PALAVRA DO ALFABETO FONÉTICO>`, caixa alta. NENHUMA das palavras é        │
 * │            prenome ou sobrenome brasileiro: o detector de nome por LÉXICO do gate audita o      │
 * │            texto de CADA tela, e nome com forma de pessoa recusaria toda lista de candidato.    │
 * │            As seis primeiras palavras (ALFA..FOXTROT) são do arnês do manual na ADMISSÃO e não  │
 * │            são reusadas aqui, para os dois inventários continuarem separáveis.                  │
 * │ CPF:       família `999`, dígito verificador VÁLIDO, calculado. O gate só acusa 11 dígitos crus │
 * │            quando o verificador FECHA (`fechaVerificadorDeCpf`, apps/frontend/src/ajuda/pii.ts),│
 * │            então CPF sintético inválido passaria despercebido e não exercitaria a declaração.   │
 * │            A família `999` é dispensada pela asserção de população (`PREFIXOS_CPF_SINTETICO`).  │
 * │ TELEFONE:  11 dígitos cujo verificador de CPF NÃO fecha. Isto é a proposta escrita em `pii.ts`  │
 * │            (por volta da linha 672) sendo SEGUIDA, e não reinventada: celular de São Paulo tem  │
 * │            11 dígitos como CPF, e 1 em ~100 fecha o verificador por acaso, virando achado       │
 * │            `CPF` falso que trava o roteiro. O conserto certo é de DADO, e é aqui.               │
 * │ E-MAIL:    `@homolog.local`, família sintética que o gate dispensa. Domínio real, nunca.        │
 * │ AUTORIA:   TUDO da conta de captura (`manual.captura@homolog.local`). Nome de colega real em    │
 * │            campo de autoria faz o gate recusar a imagem pela denylist de equipe, e foi          │
 * │            exatamente isso que travou a captura em 30/09/2026.                                  │
 * │ SOLICITANTE DA VAGA: fica NULO de propósito. `vagas.solicitante` é fonte de régua `ASSERCAO`    │
 * │            (`REGUA_DAS_COLUNAS_DE_PESSOA`, apps/frontend/src/ajuda/lote.ts): linha ali fora do  │
 * │            padrão REPROVA o lote inteiro. Nulo é o único valor que não arrisca nada.            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS TRAVAS (as mesmas dos arneses que já existem) ───────────────────────────────────────────┐
 * │ 1. FAIL-CLOSED POR NOME DE DATABASE: produção (`ea_automatic`) é recusada, e nome desconhecido  │
 * │    também. Allowlist, nunca aceite por omissão. A URL NUNCA é impressa (ela tem a senha).       │
 * │ 2. ABORTA COM CATÁLOGO VAZIO: cliente, cargo, linha de serviço e etapas do funil são LIDOS do   │
 * │    banco, nunca inventados. Arnês que inventa catálogo injeta vocabulário naquilo em que o gate │
 * │    confia para dispensar nome.                                                                 │
 * │ 3. COLISÃO COM O TIME É FALHA DURA: antes de escrever, confere se algum nome sintético colide   │
 * │    com nome de usuário da homologação.                                                         │
 * │ 4. IDEMPOTENTE: ids fixos + ON CONFLICT DO NOTHING. Rodar 2x não duplica nada.                  │
 * │ 5. TRANSACIONAL: um BEGIN só; ou entra tudo, ou nada.                                          │
 * │ 6. NÃO RODA SOZINHO: não é módulo, não é rota, não é importado por nada, `main()` só dispara    │
 * │    por `require.main === module`, e o nome do arquivo não casa com o padrão do vitest.          │
 * │ 7. REVERSÍVEL POR UM PREDICADO: tudo o que ele escreve é alcançado pelas marcas `SIMULADO %`,   │
 * │    `999%` e `SIM-AS-%`. Ver `--remover`, que desfaz na ordem inversa das dependências.          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * COMO SE RODA (da raiz do repositório):
 *
 *   DATABASE_URL='postgres://...@127.0.0.1:5433/ea_automatic_homolog' \
 *     apps/backend/node_modules/.bin/tsx --tsconfig apps/backend/tsconfig.json \
 *     apps/backend/src/as/arnes-seed-as-manual.ts [--remover]
 *
 * PREDICADO ÚNICO (responde "isto está aqui dentro?"):
 *   select count(*) from as_candidatos where nome like 'SIMULADO %' and cpf like '99988%';
 */

// ══ A TRAVA DE ENDEREÇO ════════════════════════════════════════════════════════════════════════

/** Só bancos de ensaio. O sufixo é o que separa o banco de verdade dos bancos de teste. */
const DATABASES_DO_ARNES = /^ea_automatic_(homolog|arnes|ensaio|teste)[a-z0-9_]*$/;
const DATABASE_DE_PRODUCAO = "ea_automatic";

/**
 * Devolve o NOME do database, ou LANÇA. Nunca devolve "provavelmente pode".
 * A URL não sai daqui em lugar nenhum: ela carrega a senha do banco (§A.6).
 */
function conferirDatabase(url: string | undefined): string {
  const texto = (url ?? "").trim();
  if (texto === "") throw new Error("O arnês recusou: DATABASE_URL não está definida.");
  let nome: string;
  try {
    nome = decodeURIComponent(new URL(texto).pathname.replace(/^\//, "")).trim();
  } catch {
    throw new Error("O arnês recusou: DATABASE_URL ilegível.");
  }
  if (nome === DATABASE_DE_PRODUCAO) {
    throw new Error(
      `O arnês recusou: "${DATABASE_DE_PRODUCAO}" é o database de PRODUÇÃO. O arnês escreve, e o que ele escreve é fabricado.`,
    );
  }
  if (!DATABASES_DO_ARNES.test(nome)) {
    throw new Error(
      `O arnês recusou o database "${nome}": fora da allowlist (${DATABASES_DO_ARNES.source}). Fail-closed.`,
    );
  }
  return nome;
}

// ══ OS GERADORES DE DADO SINTÉTICO ═════════════════════════════════════════════════════════════

/** Os dois dígitos verificadores de um CPF, calculados de verdade (o gate exige que fechem). */
function digitosVerificadores(base9: string): string {
  const calcular = (digitos: string, pesoInicial: number): number => {
    let soma = 0;
    for (let i = 0; i < digitos.length; i += 1) soma += Number(digitos[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = calcular(base9, 10);
  const d2 = calcular(`${base9}${d1}`, 11);
  return `${d1}${d2}`;
}

function cpfSintetico(sequencia: number): string {
  const base = `999${String(sequencia).padStart(6, "0")}`;
  return `${base}${digitosVerificadores(base)}`;
}

/**
 * A MESMA função do gate (`fechaVerificadorDeCpf`, apps/frontend/src/ajuda/pii.ts), copiada de
 * propósito: o backend não importa do frontend, e o que interessa aqui é gerar telefone que aquela
 * função REJEITE. Copiar a régua e afirmar o resultado é mais honesto do que supor.
 */
function fechaVerificadorDeCpf(digitos: string): boolean {
  if (!/^\d{11}$/.test(digitos)) return false;
  if (/^(\d)\1{10}$/.test(digitos)) return false;
  const d = [...digitos].map(Number);
  for (const [ate, peso] of [
    [9, 10],
    [10, 11],
  ] as const) {
    let soma = 0;
    for (let i = 0; i < ate; i += 1) soma += (d[i] as number) * (peso - i);
    if (((soma * 10) % 11) % 10 !== d[ate]) return false;
  }
  return true;
}

/**
 * Celular de São Paulo (11 dígitos, `1199...`) cujo verificador de CPF NÃO fecha. Se o primeiro
 * candidato fechar por acaso, o último dígito anda até não fechar mais. Falha dura se não achar,
 * porque telefone que o gate lê como CPF trava o roteiro inteiro e é melhor gritar aqui.
 */
function telefoneSintetico(sequencia: number): string {
  const prefixo = `1199${String(sequencia).padStart(5, "0").slice(-5)}`;
  for (let d = 0; d < 10; d += 1) {
    const numero = `${prefixo}${d}${(d + 7) % 10}`.slice(0, 11);
    if (numero.length === 11 && !fechaVerificadorDeCpf(numero)) return numero;
  }
  throw new Error(`Não foi possível gerar telefone com verificador de CPF inválido para ${sequencia}.`);
}

// ══ O INVENTÁRIO ═══════════════════════════════════════════════════════════════════════════════

/** A conta de captura. TODA autoria deste arnês é dela, e de mais ninguém. */
const CONTA_DE_CAPTURA = "d8850966-b50e-4f61-be72-725b3a990311";
const EMAIL_DA_CAPTURA = "manual.captura@homolog.local";

/**
 * OS IDS SÃO FIXOS (é isso que torna o arnês idempotente) e MONTADOS EM BLOCOS de 2 dígitos hex, e
 * não concatenados com letra solta: UUID tem largura fixa, e `t` + sufixo estourava os 12 dígitos do
 * último grupo, com o Postgres recusando a linha inteira. Bloco `00` é a entidade, `10`/`11` a
 * trilha, `20` o item de shortlist.
 */
const uid = (bloco: string, sufixo: string) => `a5000000-0000-4000-8000-00000000${bloco}${sufixo}`;
const id = (sufixo: string) => uid("00", sufixo);

/** As três vagas. Código com prefixo `SIM-AS-`, que é a marca que a remoção alcança. */
const VAGA_ABERTA = id("f1");
const VAGA_CANCELADA = id("f2");
const VAGA_RASCUNHO = id("f3");
const CODIGO_ABERTA = "SIM-AS-2026-0601";
const CODIGO_CANCELADA = "SIM-AS-2026-0602";
const CODIGO_RASCUNHO = "SIM-AS-2026-0603";
const SHORTLIST = id("e1");
const CONFLITO = id("e2");

type Desfecho =
  | "ATIVO"
  | "APROVADO"
  | "ALOCADO"
  | "DESCARTADO"
  | "DESISTIU"
  | "ENVIADO_PARA_ADMISSAO";

interface Pessoa {
  sufixo: string;
  /** A palavra do alfabeto fonético. NENHUMA é prenome ou sobrenome brasileiro. */
  apelido: string;
  sequencia: number;
  /** Ausente = candidato SOLTO, sem candidatura (a Central De Candidatos precisa dos dois casos). */
  candidatura?: { sufixo: string; etapa: string; situacao: Desfecho; motivoSaida?: string };
  bancoTalentos?: boolean;
  /** A origem varia de propósito: o filtro de origem da Central De Candidatos precisa de conteúdo. */
  origem: "MANUAL" | "DIGAI" | "PANDAPE" | "INDICACAO";
}

/**
 * ─ A POPULAÇÃO, e cada bloco existe porque um artigo precisa dele ───────────────────────────────
 *
 * 1..7   UMA candidatura em CADA UMA das 7 etapas do funil, inclusive a inativa (`TRIAGEM`) e a de
 *        destino do cancelamento (`STAND_BY`): sem isso o cilindro do painel da vaga vem zerado e os
 *        cards de etapa não ensinam nada.
 * 8..12  UM desfecho ENCERRADO de cada tipo (aprovado, alocado, enviado para admissão, descartado,
 *        desistiu), para o escopo de histórico e os cards de desfecho terem conteúdo.
 * 13..15 SOLTOS, sem candidatura, um deles em banco de talentos: a Central De Candidatos tem linha
 *        sem vaga, e é ela que ensina o vínculo manual.
 *
 * A ETAPA das encerradas não é decorativa: é de onde a pessoa SAIU, e é isso que o histórico mostra.
 */
const PESSOAS: Pessoa[] = [
  { sufixo: "01", apelido: "GOLF", sequencia: 880001, origem: "DIGAI",
    candidatura: { sufixo: "a1", etapa: "CANDIDATURA", situacao: "ATIVO" } },
  { sufixo: "02", apelido: "HOTEL", sequencia: 880002, origem: "DIGAI",
    candidatura: { sufixo: "a2", etapa: "CAPTACAO", situacao: "ATIVO" } },
  { sufixo: "03", apelido: "INDIA", sequencia: 880003, origem: "PANDAPE",
    candidatura: { sufixo: "a3", etapa: "TRIAGEM", situacao: "ATIVO" } },
  { sufixo: "04", apelido: "JULIET", sequencia: 880004, origem: "MANUAL",
    candidatura: { sufixo: "a4", etapa: "ENTREVISTA_SOULAN", situacao: "ATIVO" } },
  { sufixo: "05", apelido: "KILO", sequencia: 880005, origem: "MANUAL",
    candidatura: { sufixo: "a5", etapa: "ENTREVISTA_CLIENTE", situacao: "ATIVO" } },
  { sufixo: "06", apelido: "YANKEE", sequencia: 880006, origem: "INDICACAO",
    candidatura: { sufixo: "a6", etapa: "APROVACAO", situacao: "ATIVO" } },
  { sufixo: "07", apelido: "MIKE", sequencia: 880007, origem: "DIGAI",
    candidatura: { sufixo: "a7", etapa: "STAND_BY", situacao: "ATIVO" } },

  { sufixo: "08", apelido: "NOVEMBER", sequencia: 880008, origem: "DIGAI",
    candidatura: { sufixo: "b1", etapa: "APROVACAO", situacao: "APROVADO" } },
  { sufixo: "09", apelido: "ZULU", sequencia: 880009, origem: "PANDAPE",
    candidatura: { sufixo: "b2", etapa: "APROVACAO", situacao: "ALOCADO" } },
  { sufixo: "10", apelido: "PAPA", sequencia: 880010, origem: "PANDAPE",
    candidatura: { sufixo: "b3", etapa: "APROVACAO", situacao: "ENVIADO_PARA_ADMISSAO" } },
  { sufixo: "11", apelido: "QUEBEC", sequencia: 880011, origem: "MANUAL",
    candidatura: { sufixo: "b4", etapa: "CAPTACAO", situacao: "DESCARTADO", motivoSaida: "Sem Perfil" } },
  { sufixo: "12", apelido: "SIERRA", sequencia: 880012, origem: "MANUAL",
    candidatura: { sufixo: "b5", etapa: "ENTREVISTA_SOULAN", situacao: "DESISTIU", motivoSaida: "Desistente" } },

  { sufixo: "13", apelido: "TANGO", sequencia: 880013, origem: "MANUAL" },
  { sufixo: "14", apelido: "UNIFORM", sequencia: 880014, origem: "INDICACAO", bancoTalentos: true },
  { sufixo: "15", apelido: "XRAY", sequencia: 880015, origem: "DIGAI" },
];

const nomeDaPessoa = (p: Pessoa) => `SIMULADO ${p.apelido}`;
const emailDaPessoa = (p: Pessoa) => `simulado.${p.apelido.toLowerCase()}@homolog.local`;

/** Os itens da shortlist: quem chegou à etapa do cliente e quem foi aprovado. */
const ITENS_DA_SHORTLIST = ["a5", "a6", "b1"];

// ══ A SEMEADURA ════════════════════════════════════════════════════════════════════════════════

const achatar = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

async function semear(sql: ReturnType<typeof createDb>["sql"]): Promise<void> {
  /**
   * TRAVA 3: colisão com o time é FALHA DURA. A asserção de população não aplica a denylist às linhas
   * da base, então um nome sintético que contivesse o nome de um colega passaria por ela e depois
   * recusaria TODA tela de lista, com a fábrica achando que o gate regrediu.
   */
  const usuarios = (await sql.unsafe(
    `select nome from usuarios where nome is not null`,
  )) as unknown as Array<{ nome: string }>;
  const colisoes = PESSOAS.filter((p) => {
    const nome = achatar(nomeDaPessoa(p));
    return usuarios.some((u) => {
      const doTime = achatar(u.nome);
      return !!doTime && (doTime.includes(nome) || nome.includes(doTime));
    });
  });
  if (colisoes.length > 0) {
    throw new Error(
      `Aborta: ${colisoes.length} nome(s) sintético(s) colidem com nome de usuário da homologação. ` +
        `Renomeie o apelido do arnês (valores omitidos, §A.6).`,
    );
  }

  // TRAVA 2: catálogo LIDO, nunca inventado. Vazio aborta.
  const cliente = (
    await sql.unsafe(
      `select cod_cliente from clientes where ativo
        order by (cod_cliente <> '26360'), cod_cliente limit 1`,
    )
  )[0] as unknown as { cod_cliente: string } | undefined;
  const cargo = (await sql.unsafe(`select id, nome from cargos where ativo order by nome limit 1`))[0] as
    unknown as { id: string; nome: string } | undefined;
  const linha = (await sql.unsafe(`select id from as_linhas_servico where ativo order by id limit 1`))[0] as
    unknown as { id: number } | undefined;
  const etapas = (await sql.unsafe(`select codigo from as_etapas_funil`)) as unknown as Array<{
    codigo: string;
  }>;
  const motivoCancelamento = (
    await sql.unsafe(`select nome from motivos_cancelamento_vaga where ativo order by nome limit 1`)
  )[0] as unknown as { nome: string } | undefined;

  if (!cliente || !cargo || !linha || etapas.length === 0) {
    throw new Error(
      "Aborta: catálogo de cliente, cargo, linha de serviço ou etapa do funil vazio na homologação. " +
        "Carregue as bases antes: arnês que inventa catálogo injeta vocabulário no que o gate confia.",
    );
  }
  const codigosDeEtapa = new Set(etapas.map((e) => e.codigo));
  const faltando = [...new Set(PESSOAS.map((p) => p.candidatura?.etapa).filter(Boolean))].filter(
    (e) => !codigosDeEtapa.has(e as string),
  );
  if (faltando.length > 0) {
    throw new Error(
      `Aborta: etapa(s) do funil inexistente(s) nesta base: ${faltando.join(", ")}. ` +
        `O catálogo de etapas diverge entre produção e homologação, e a FK derruba a inserção.`,
    );
  }

  console.log(
    `[seed-as] catálogo: cliente=${cliente.cod_cliente} cargo="${cargo.nome}" linha=${linha.id} etapas=${etapas.length}`,
  );

  await sql.begin(async (tx) => {
    // ── 1) AS TRÊS VAGAS ────────────────────────────────────────────────────────────────────────
    // `solicitante_*` fica NULO: é fonte de régua ASSERCAO e linha fora do padrão reprova o lote.
    await tx.unsafe(
      `insert into vagas
         (id, codigo, cargo_id, nome_divulgacao, cod_cliente, status,
          natureza, sazonalidade, linha_servico_id, genero,
          posicoes_oficiais, posicoes_banco, data_abertura, data_limite,
          salario_abertura, horario_escala, local_trabalho, centro_custo,
          confidencial, divulgar_empresa, enviar_para_admissao,
          aberto_por_id, consultor_id, recruiter_id, envio_shortlist,
          criado_em, atualizado_em)
       values
         ($1, $2, $3, $4, $5, 'ABERTA',
          'EFETIVA', 'OPERACAO_PADRAO', $6, 'INDIFERENTE',
          3, 1, current_date - interval '12 days', current_date + interval '18 days',
          2000.00, '12x36 diurno', 'Unidade de simulação, São Paulo, SP', 'CC-SIMULADO',
          false, true, false,
          $7, $7, $7, current_date - interval '4 days',
          now() - interval '12 days', now())
       on conflict (id) do nothing`,
      [VAGA_ABERTA, CODIGO_ABERTA, cargo.id, "Vaga Simulada Do Manual (Funil Povoado)", cliente.cod_cliente, linha.id, CONTA_DE_CAPTURA],
    );

    await tx.unsafe(
      `insert into vagas
         (id, codigo, cargo_id, nome_divulgacao, cod_cliente, status,
          natureza, sazonalidade, linha_servico_id, genero,
          posicoes_oficiais, posicoes_banco, data_abertura, data_limite,
          salario_abertura, horario_escala, local_trabalho,
          confidencial, divulgar_empresa, enviar_para_admissao,
          aberto_por_id, consultor_id,
          cancelada_por_id, cancelada_em, cancelamento_motivo, cancelamento_observacao, encerrada_em,
          criado_em, atualizado_em)
       values
         ($1, $2, $3, $4, $5, 'CANCELADA',
          'EFETIVA', 'OPERACAO_PADRAO', $6, 'INDIFERENTE',
          2, 0, current_date - interval '30 days', current_date - interval '5 days',
          2000.00, '12x36 diurno', 'Unidade de simulação, São Paulo, SP',
          false, true, false,
          $7, $7,
          $7, now() - interval '5 days', $8, 'Cancelamento simulado, para o artigo de reabrir a vaga.', now() - interval '5 days',
          now() - interval '30 days', now())
       on conflict (id) do nothing`,
      [VAGA_CANCELADA, CODIGO_CANCELADA, cargo.id, "Vaga Simulada Cancelada (Para Reabrir)", cliente.cod_cliente, linha.id, CONTA_DE_CAPTURA,
       motivoCancelamento?.nome ?? "Cliente Cancelou A Requisicao"],
    );

    // O RASCUNHO nasce MAGRO de propósito: é isso que o artigo de continuar rascunho ensina, a vaga
    // que ainda não tem tudo. Só o que o banco exige (status) mais cliente e cargo.
    await tx.unsafe(
      `insert into vagas
         (id, codigo, cargo_id, nome_divulgacao, cod_cliente, status,
          sazonalidade, genero, posicoes_oficiais, posicoes_banco,
          confidencial, divulgar_empresa, enviar_para_admissao,
          aberto_por_id, criado_em, atualizado_em)
       values
         ($1, $2, $3, $4, $5, 'RASCUNHO',
          'OPERACAO_PADRAO', 'INDIFERENTE', 1, 0,
          false, true, false,
          $6, now() - interval '2 days', now() - interval '2 days')
       on conflict (id) do nothing`,
      [VAGA_RASCUNHO, CODIGO_RASCUNHO, cargo.id, "Vaga Simulada Em Rascunho", cliente.cod_cliente, CONTA_DE_CAPTURA],
    );

    /*
     * ── 2) OS CANDIDATOS ───────────────────────────────────────────────────────────────────────
     *
     * ┌─ A CLÁUSULA `anonimizado_em`, E POR QUE ELA É EXIGIDA DE TODO ESCRITOR DESTA TABELA ───────┐
     * │ `as_candidatos` guarda dado de pessoa com PRAZO DE RETENÇÃO: passado o prazo, uma rotina    │
     * │ ANONIMIZA a linha e carimba `anonimizado_em`. Não há trava no schema nem gatilho no banco,  │
     * │ então a única coisa que impede uma escrita posterior de DEVOLVER o dado pessoal à linha é    │
     * │ cada escritor carregar a cláusula. É por isso que a guarda é POR ESCRITOR, e é por isso que  │
     * │ ela cobra até o arnês: aquela tabela já foi expurgada de 410 pessoas reais em 29/09/2026, e  │
     * │ uma escrita cega depois do expurgo desfaria a retenção em silêncio.                          │
     * │                                                                                              │
     * │ ESTE ARNÊS CUMPRE EM DOIS NÍVEIS, e o segundo existe porque o primeiro é fraco demais para   │
     * │ se confiar:                                                                                  │
     * │   1. o `insert` é `on conflict (id) do nothing`, então ele NUNCA sobrescreve linha existente, │
     * │      anonimizada ou não. Sozinho isso já bastaria, e é o que o torna seguro hoje;            │
     * │   2. a CONFERÊNCIA ABAIXO, que ABORTA a semeadura inteira se algum id do arnês já estiver    │
     * │      anonimizado. Ela existe porque o `do nothing` protege o DADO e não avisa NADA: o arnês  │
     * │      passaria, a tela continuaria sem aquela pessoa, e ninguém saberia por quê. Pior, a       │
     * │      limpeza (`--remover`) casa por NOME, e o nome de uma linha anonimizada não é mais        │
     * │      `SIMULADO ...`, então aquela linha ficaria órfã no banco para sempre.                    │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const idsDasPessoas = PESSOAS.map((p) => id(p.sufixo));
    const jaAnonimizados = await tx.unsafe<{ id: string }[]>(
      `select id from as_candidatos where id = any($1::uuid[]) and anonimizado_em is not null`,
      [idsDasPessoas],
    );
    if (jaAnonimizados.length > 0) {
      throw new Error(
        `ARNÊS ABORTADO: ${jaAnonimizados.length} candidato(s) do arnês já foram ANONIMIZADOS pela ` +
          "rotina de retenção. Semear por cima devolveria dado pessoal a uma linha que o sistema já " +
          "expurgou, e a limpeza por nome não os alcança mais. Apague essas linhas pelo id antes de " +
          "semear de novo.",
      );
    }

    for (const p of PESSOAS) {
      await tx.unsafe(
        `insert into as_candidatos
           (id, nome, cpf, email, telefone, data_nascimento, cidade, uf, origem,
            criado_por_id, banco_talentos, criado_em, atualizado_em)
         values
           ($1, $2, $3, $4, $5, $6, 'São Paulo', 'SP', $7::as_candidato_origem,
            $8, $9, now() - interval '10 days', now())
         on conflict (id) do nothing`,
        [
          id(p.sufixo),
          nomeDaPessoa(p),
          cpfSintetico(p.sequencia),
          emailDaPessoa(p),
          telefoneSintetico(p.sequencia),
          `199${String(p.sequencia % 10)}-0${(p.sequencia % 9) + 1}-1${p.sequencia % 9}`,
          p.origem,
          CONTA_DE_CAPTURA,
          p.bancoTalentos ?? false,
        ],
      );
    }

    // ── 3) AS CANDIDATURAS ──────────────────────────────────────────────────────────────────────
    for (const p of PESSOAS) {
      const c = p.candidatura;
      if (!c) continue;
      await tx.unsafe(
        `insert into as_candidaturas
           (id, candidato_id, vaga_id, etapa, situacao, motivo_descarte, posicao_lado,
            pretensao_salarial, alocado_em, alocado_por_id, ultimo_contato_em, criado_em, atualizado_em)
         values
           ($1, $2, $3, $4, $5::candidatura_situacao, $6, 'OFICIAL',
            2000.00, now() - interval '9 days', $7, now() - interval '3 days',
            now() - interval '9 days', now())
         on conflict (id) do nothing`,
        [id(c.sufixo), id(p.sufixo), VAGA_ABERTA, c.etapa, c.situacao, c.motivoSaida ?? null, CONTA_DE_CAPTURA],
      );

      /**
       * A TRILHA. Sem ela o escopo de histórico do painel abre vazio, e é ele que o artigo de
       * histórico fotografa. Duas linhas: a entrada no funil e o movimento até a etapa atual.
       */
      await tx.unsafe(
        `insert into as_candidatura_etapas
           (id, candidatura_id, etapa_de, etapa_para, situacao, motivo, por_id, vaga_para,
            posicao_lado, ocorrido_em, criado_em)
         values
           ($1, $2, null, 'CANDIDATURA', 'ATIVO'::candidatura_situacao, null, $3, $4,
            'OFICIAL', now() - interval '9 days', now() - interval '9 days')
         on conflict (id) do nothing`,
        [uid("10", c.sufixo), id(c.sufixo), CONTA_DE_CAPTURA, VAGA_ABERTA],
      );
      if (c.etapa !== "CANDIDATURA" || c.situacao !== "ATIVO") {
        await tx.unsafe(
          `insert into as_candidatura_etapas
             (id, candidatura_id, etapa_de, etapa_para, situacao, motivo, por_id, vaga_para,
              posicao_lado, ocorrido_em, criado_em)
           values
             ($1, $2, 'CANDIDATURA', $3, $4::candidatura_situacao, $5, $6, $7,
              'OFICIAL', now() - interval '3 days', now() - interval '3 days')
           on conflict (id) do nothing`,
          [uid("11", c.sufixo), id(c.sufixo), c.etapa, c.situacao, c.motivoSaida ?? null, CONTA_DE_CAPTURA, VAGA_ABERTA],
        );
      }
    }

    // ── 4) A SHORTLIST COM ITENS ────────────────────────────────────────────────────────────────
    // `numero = 1` obriga `motivo_reenvio_id` NULO (ck_as_shortlists_motivo_reenvio).
    await tx.unsafe(
      `insert into as_shortlists
         (id, vaga_id, numero, enviada_em, enviada_por_id, aviso_curta_aceito, motivo_reenvio_id,
          criado_em, atualizado_em)
       values ($1, $2, 1, current_date - interval '4 days', $3, false, null,
               now() - interval '4 days', now())
       on conflict (id) do nothing`,
      [SHORTLIST, VAGA_ABERTA, CONTA_DE_CAPTURA],
    );
    for (const sufixo of ITENS_DA_SHORTLIST) {
      await tx.unsafe(
        `insert into as_shortlist_itens (id, shortlist_id, candidatura_id, criado_em)
         values ($1, $2, $3, now() - interval '4 days')
         on conflict (id) do nothing`,
        [uid("20", sufixo), SHORTLIST, id(sufixo)],
      );
    }

    // ── 5) O CONFLITO DE INGESTÃO ───────────────────────────────────────────────────────────────
    // A fila de liberação lê esta tabela; vazia, ela não ensina nada. `identificador` com a marca
    // `SIM-AS-` para a remoção alcançar sem depender do candidato.
    await tx.unsafe(
      `insert into as_ingestao_conflitos
         (id, candidato_id, fonte, identificador, resolvido_em, criado_em, atualizado_em)
       values ($1, $2, 'DIGAI', 'SIM-AS-CONFLITO-0001', null, now() - interval '1 day', now())
       on conflict (id) do nothing`,
      [CONFLITO, id("03")],
    );

    // ── 6) O CONTATO REGISTRADO ─────────────────────────────────────────────────────────────────
    // Autoria da conta de captura, texto sem nome de pessoa e sem número que pareça documento.
    await tx.unsafe(
      `insert into as_contatos
         (id, candidatura_id, tipo, resumo, ocorrido_em, registrado_por_id, criado_em)
       values ($1, $2, 'LIGACAO'::as_contato_tipo,
               'Contato simulado para o manual: alinhamento de horário da etapa seguinte.',
               now() - interval '3 days', $3, now() - interval '3 days')
       on conflict (id) do nothing`,
      [id("c1"), id("a5"), CONTA_DE_CAPTURA],
    );
  });
}

// ══ A REMOÇÃO (o arnês é reversível, e a reversão é do próprio arnês) ══════════════════════════

async function remover(sql: ReturnType<typeof createDb>["sql"]): Promise<void> {
  await sql.begin(async (tx) => {
    // Ordem inversa das dependências. A marca é sempre a sintética; nada genérico.
    await tx.unsafe(`delete from as_ingestao_conflitos where identificador like 'SIM-AS-%'`);
    await tx.unsafe(
      `delete from as_contatos where candidatura_id in (
         select id from as_candidaturas where vaga_id in (
           select id from vagas where codigo like 'SIM-AS-%'))`,
    );
    await tx.unsafe(
      `delete from as_shortlist_itens where shortlist_id in (
         select id from as_shortlists where vaga_id in (
           select id from vagas where codigo like 'SIM-AS-%'))`,
    );
    await tx.unsafe(
      `delete from as_shortlists where vaga_id in (select id from vagas where codigo like 'SIM-AS-%')`,
    );
    await tx.unsafe(
      `delete from as_candidatura_etapas where candidatura_id in (
         select id from as_candidaturas where vaga_id in (
           select id from vagas where codigo like 'SIM-AS-%'))`,
    );
    await tx.unsafe(
      `delete from as_candidaturas where vaga_id in (select id from vagas where codigo like 'SIM-AS-%')`,
    );
    await tx.unsafe(`delete from as_candidatos where nome like 'SIMULADO %' and cpf like '99988%'`);
    await tx.unsafe(`delete from vagas where codigo like 'SIM-AS-%'`);
  });
}

// ══ A CASCA ════════════════════════════════════════════════════════════════════════════════════

const CONTAGENS = [
  "as_candidatos",
  "as_candidaturas",
  "as_candidatura_etapas",
  "as_shortlists",
  "as_shortlist_itens",
  "as_ingestao_conflitos",
  "as_contatos",
  "vagas",
] as const;

async function contar(sql: ReturnType<typeof createDb>["sql"]): Promise<Record<string, number>> {
  const saida: Record<string, number> = {};
  for (const tabela of CONTAGENS) {
    const linha = (await sql.unsafe(`select count(*)::int as n from ${tabela}`))[0] as unknown as {
      n: number;
    };
    saida[tabela] = linha.n;
  }
  return saida;
}

async function main(): Promise<void> {
  const nomeDoBanco = conferirDatabase(process.env.DATABASE_URL);
  const removendo = process.argv.includes("--remover");
  console.log(`[seed-as] database: ${nomeDoBanco} (allowlist conferida)`);
  const { sql } = createDb(process.env.DATABASE_URL as string, 1);
  try {
    const antes = await contar(sql);
    if (removendo) await remover(sql);
    else await semear(sql);
    const depois = await contar(sql);

    console.log("");
    console.log(removendo ? "ARNÊS DE A&S REMOVIDO" : "ARNÊS DE A&S PLANTADO (idempotente)");
    console.log("=".repeat(72));
    for (const tabela of CONTAGENS) {
      console.log(
        `  ${tabela.padEnd(24)} antes=${String(antes[tabela]).padStart(5)}  depois=${String(depois[tabela]).padStart(5)}`,
      );
    }
    if (!removendo) {
      console.log("");
      console.log(`  VAGAS   ${CODIGO_ABERTA} (ABERTA)  ${CODIGO_CANCELADA} (CANCELADA)  ${CODIGO_RASCUNHO} (RASCUNHO)`);
      console.log(`  AUTORIA ${EMAIL_DA_CAPTURA} em tudo (consultor, abertura, shortlist, contato, trilha)`);
      console.log("");
      console.log("  INVENTÁRIO PARA A ALLOWLIST (tools/ajuda/allowlist-arnes.json):");
      for (const p of PESSOAS) {
        console.log(
          `    ${nomeDaPessoa(p).padEnd(18)} cpf=${cpfSintetico(p.sequencia)}  tel=${telefoneSintetico(p.sequencia)}  ${emailDaPessoa(p)}`,
        );
      }
      console.log("");
      console.log(
        "  Predicado único: select count(*) from as_candidatos where nome like 'SIMULADO %' and cpf like '99988%';",
      );
      console.log("  Reversão:       o mesmo arquivo com `--remover`.");
    }
  } finally {
    await sql.end();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(`[seed-as] falhou: ${err instanceof Error ? err.message : "erro sem mensagem"}`);
    process.exit(1);
  });
}
