import "dotenv/config";
import { createDb } from "../../db/client";
import { conferirDatabase } from "./arnes-lote-fabricado";

/**
 * SEED DA VAGA DE DEMONSTRACAO (A&S), UMA VAGA + QUATRO CANDIDATOS, PARA O DIRETOR VALIDAR AO VIVO.
 *
 * O QUE ELE MONTA, E POR QUE:
 *   . UMA vaga em PENDENTE_REVISAO, ja com TODOS os obrigatorios preenchidos (cliente, cargo, codigo,
 *     nome de divulgacao, posicoes oficiais, natureza, sazonalidade, linha de servico, data de
 *     abertura e previsao de entrega). Ela nasce na FILA da tela "Liberar Vaga" e sai de la com UM
 *     clique de liberacao, sem o diretor ter de preencher formulario: a demo comeca pelo gesto de
 *     liberar, nao pelo cadastro.
 *   . QUATRO candidatos sinteticos com nome de pessoa realista, CPF sintetico da faixa 999 (digito
 *     valido), email .invalid e telefone com zeros:
 *       - DOIS ja VINCULADOS na vaga (candidatura em TRIAGEM, situacao ATIVO): apos a liberacao eles
 *         aparecem no funil, prontos para o diretor mover, aprovar e enviar para admissao.
 *       - DOIS SOLTOS (so as_candidatos, sem candidatura): o diretor os vincula ao vivo na tela.
 *
 * O NOME E DE PESSOA E O CPF E DA FAIXA 999 DE PROPOSITO. Na esteira A&S a limpeza apaga toda a
 * tabela (grupo A), entao o nome nao precisa de marca. Do lado da ADMISSAO, quando o diretor enviar
 * um candidato para admissao, a ponte cria um candidato do ADM com este MESMO CPF 999, e e essa
 * faixa que a limpeza (`arnes-limpeza-homolog.ts`) varre. Assim a demo tem cara realista e continua
 * 100% removivel. Email .invalid (RFC 2606) e telefone de zeros reforcam que e sintetico (§A.6).
 *
 * AS TRAVAS (as mesmas dos arneses):
 *   1. FAIL-CLOSED POR NOME DE DATABASE (`conferirDatabase`): producao (`ea_automatic`) e recusada.
 *   2. IDEMPOTENTE: ids fixos + ON CONFLICT DO NOTHING. Rodar 2x nao duplica nada.
 *   3. TRANSACIONAL: um BEGIN so; ou entra tudo, ou nada.
 *   4. NAO RODA SOZINHO: nao e modulo/rota/import; `main()` so via `require.main === module`; o nome
 *      nao casa com o padrao do vitest.
 *   5. CODIGO DA VAGA COM PREFIXO `SIM-`: mantem a limpeza re-executavel (a assercao dela so aceita
 *      a familia sintetica SIM-/ARNES- na esteira A&S).
 *
 * COMO SE RODA (da raiz do repositorio):
 *   DATABASE_URL='postgres://ea:...@127.0.0.1:5433/ea_automatic_homolog' \
 *     apps/backend/node_modules/.bin/tsx --tsconfig apps/backend/tsconfig.json \
 *     apps/backend/src/as/ingestao-pandape/arnes-seed-demo-uma-vaga.ts
 */

// ── CPF SINTETICO VALIDO (faixa 999, digito verificador correto) ────────────────────────────────
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

// ── OS IDS FIXOS DA DEMO (idempotencia) ─────────────────────────────────────────────────────────
const VAGA_ID = "aa000000-0000-4000-8000-0000000000a1";
const CODIGO_VAGA = "SIM-2026-0501";

interface CandidatoDemo {
  id: string;
  nome: string;
  sequenciaCpf: number;
  apelidoEmail: string;
  dataNascimento: string;
  vincular: boolean; // true = nasce com candidatura na vaga; false = solto
  candidaturaId?: string;
}

const CANDIDATOS: CandidatoDemo[] = [
  {
    id: "aa000000-0000-4000-8000-0000000000c1",
    nome: "Camila Ferreira dos Santos",
    sequenciaCpf: 970101,
    apelidoEmail: "camila.ferreira",
    dataNascimento: "1996-04-12",
    vincular: true,
    candidaturaId: "aa000000-0000-4000-8000-0000000000d1",
  },
  {
    id: "aa000000-0000-4000-8000-0000000000c2",
    nome: "Bruno Carvalho Oliveira",
    sequenciaCpf: 970102,
    apelidoEmail: "bruno.carvalho",
    dataNascimento: "1993-11-03",
    vincular: true,
    candidaturaId: "aa000000-0000-4000-8000-0000000000d2",
  },
  {
    id: "aa000000-0000-4000-8000-0000000000c3",
    nome: "Larissa Moraes Pereira",
    sequenciaCpf: 970103,
    apelidoEmail: "larissa.moraes",
    dataNascimento: "1999-07-21",
    vincular: false,
  },
  {
    id: "aa000000-0000-4000-8000-0000000000c4",
    nome: "Diego Ramos Teixeira",
    sequenciaCpf: 970104,
    apelidoEmail: "diego.ramos",
    dataNascimento: "1991-02-28",
    vincular: false,
  },
];

// A etapa inicial do funil em que os vinculados nascem. TRIAGEM (nao a primeira, CAPTACAO) para a
// demo mostrar movimento pelo funil sem partir do comeco absoluto.
const ETAPA_INICIAL = "TRIAGEM";

async function main(): Promise<void> {
  const nomeDoBanco = conferirDatabase(process.env.DATABASE_URL);
  console.log(`[seed-demo] database: ${nomeDoBanco} (allowlist conferida)`);
  const { sql } = createDb(process.env.DATABASE_URL as string, 1);
  try {
    // Cliente e cargo REAIS do catalogo da homologacao, resolvidos em runtime (sobrevivem a re-clone).
    // Preferencia por um cliente/cargo de varejo, com fallback para o primeiro ativo se o preferido
    // nao existir naquela base.
    const cliente = (
      await sql.unsafe(
        `select cod_cliente, coalesce(nullif(btrim(nome_operacao), ''), razao_social) as rotulo
           from clientes where ativo
          order by (cod_cliente <> '26360'), cod_cliente
          limit 1`,
      )
    )[0] as unknown as { cod_cliente: string; rotulo: string } | undefined;
    const cargo = (
      await sql.unsafe(
        `select id, nome from cargos where ativo
          order by (nome not ilike '%farmácia%' and nome not ilike '%farmacia%'), nome
          limit 1`,
      )
    )[0] as unknown as { id: string; nome: string } | undefined;
    const linha = (
      await sql.unsafe(`select id from as_linhas_servico where ativo order by id limit 1`)
    )[0] as unknown as { id: number } | undefined;

    if (!cliente || !cargo || !linha) {
      throw new Error(
        "Seed aborta: catalogo de cliente/cargo/linha vazio na homologacao. Carregue as bases antes.",
      );
    }

    console.log(
      `[seed-demo] cliente=${cliente.cod_cliente} (${cliente.rotulo}) cargo="${cargo.nome}" linha=${linha.id}`,
    );

    await sql.begin(async (tx) => {
      // 1) A VAGA NA FILA DE REVISAO, com TODOS os obrigatorios preenchidos para liberar num clique.
      await tx.unsafe(
        `insert into vagas
           (id, codigo, cargo_id, nome_divulgacao, cod_cliente, status,
            natureza, sazonalidade, linha_servico_id, genero,
            posicoes_oficiais, posicoes_banco,
            data_abertura, data_limite,
            salario_abertura, horario_escala, local_trabalho,
            confidencial, divulgar_empresa, enviar_para_admissao,
            id_vacancy_pandape, criado_em, atualizado_em)
         values
           ($1, $2, $3, $4, $5, 'PENDENTE_REVISAO',
            'EFETIVA', 'OPERACAO_PADRAO', $6, 'INDIFERENTE',
            3, 0,
            current_date, current_date + interval '30 days',
            2200.00, '12x36 diurno', 'Loja Corifeu, São Paulo, SP',
            false, true, false,
            null, now(), now())
         on conflict (id) do nothing`,
        [VAGA_ID, CODIGO_VAGA, cargo.id, "Auxiliar Administrativo de Farmácia (Loja Corifeu)", cliente.cod_cliente, linha.id],
      );

      // 2) OS QUATRO CANDIDATOS (sinteticos, origem DIGAI para lerem como vindos da ponte de captacao).
      for (const c of CANDIDATOS) {
        const cpf = cpfSintetico(c.sequenciaCpf);
        const email = `${c.apelidoEmail}@exemplo.invalid`;
        await tx.unsafe(
          `insert into as_candidatos
             (id, nome, cpf, email, telefone, data_nascimento, origem, banco_talentos, criado_em, atualizado_em)
           values
             ($1, $2, $3, $4, '00000000000', $5, 'DIGAI', false, now(), now())
           on conflict (id) do nothing`,
          [c.id, c.nome, cpf, email, c.dataNascimento],
        );
      }

      // 3) AS DUAS CANDIDATURAS DOS VINCULADOS: etapa TRIAGEM, situacao ATIVO (em selecao, no funil).
      for (const c of CANDIDATOS) {
        if (!c.vincular || !c.candidaturaId) continue;
        await tx.unsafe(
          `insert into as_candidaturas
             (id, candidato_id, vaga_id, etapa, situacao, alocado_em, criado_em, atualizado_em)
           values
             ($1, $2, $3, $4, 'ATIVO'::candidatura_situacao, now(), now(), now())
           on conflict (id) do nothing`,
          [c.candidaturaId, c.id, VAGA_ID, ETAPA_INICIAL],
        );
      }
    });

    console.log("");
    console.log("SEED DA DEMO PLANTADO (idempotente)");
    console.log("=".repeat(64));
    console.log(`  VAGA  ${CODIGO_VAGA}  status=PENDENTE_REVISAO  id=${VAGA_ID}`);
    for (const c of CANDIDATOS) {
      console.log(
        `  ${c.vincular ? "VINCULADO" : "SOLTO    "}  ${c.nome.padEnd(28)} cpf=${cpfSintetico(c.sequenciaCpf)}` +
          (c.vincular ? `  candidatura=${c.candidaturaId} etapa=${ETAPA_INICIAL}/ATIVO` : ""),
      );
    }
    console.log("");
    console.log(
      "Conferencia: select count(*) from as_candidaturas where vaga_id = '" + VAGA_ID + "';  -- deve dar 2",
    );
  } finally {
    await sql.end();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(`[seed-demo] falhou: ${err instanceof Error ? err.message : "erro sem mensagem"}`);
    process.exit(1);
  });
}
