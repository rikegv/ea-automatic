import "dotenv/config";
import { createDb } from "../../db/client";
import { conferirDatabase } from "./arnes-lote-fabricado";

/**
 * ─ SEED DE 3 VAGAS FICTÍCIAS (Digai/Pandapé), cada uma com um candidato APROVADO, pronto p/ enviar ─
 *
 * ┌─ O QUE ELE MONTA, E POR QUÊ ──────────────────────────────────────────────────────────────────┐
 * │ Três vagas sintéticas + um candidato sintético cada, deixados no ponto EXATO em que o time      │
 * │ pode clicar "enviar para admissão": candidatura em `etapa=APROVACAO`, `situacao=APROVADO`.      │
 * │ (APROVADO já ocupa posição; o envio a leva a ENVIADO_PARA_ADMISSAO, e a ponte A&S→ADM — em      │
 * │ construção por outra sessão — cria a admissão.)                                                  │
 * │                                                                                                  │
 * │ A VARIAÇÃO É DELIBERADA, para cobrir o RISCO A da ponte (vaga com e sem id do Pandapé):         │
 * │   SEED-1: COM `id_vacancy_pandape`  (mapeável direto)                                            │
 * │   SEED-2: COM `id_vacancy_pandape`                                                               │
 * │   SEED-3: SEM `id_vacancy_pandape`  (a ponte tem de resolver cliente/cargo por outro caminho)   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ §A.6: TUDO SINTÉTICO, E A FORMA DE CADA CAMPO DIZ ISSO SOZINHA ──────────────────────────────┐
 * │ NOME: começa com `SIMULADO`, caixa alta, palavra que não é nome de gente. É essa marca que faz  │
 * │       o candidato do ADM (quando a ponte o criar) cair na família de teste da limpeza.          │
 * │ CPF:  faixa `999...`, dígito verificador VÁLIDO (a ponte rejeita CPF quebrado — risco B). Bloco │
 * │       PEQUENO e fixo (3 CPFs), o que o veto do CPF admite; e a faixa `999` é a que a limpeza     │
 * │       varre.                                                                                     │
 * │ EMAIL: domínio `.invalid` (RFC 2606), inentregável. TELEFONE: onze zeros.                        │
 * │ ORIGEM: `DIGAI`, para a linha se ler como veio da ponte Digai/Pandapé.                           │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS TRAVAS (as mesmas do arnês) ──────────────────────────────────────────────────────────────┐
 * │ 1. FAIL-CLOSED POR NOME DE DATABASE (`conferirDatabase`): produção é recusada por allowlist.    │
 * │ 2. IDEMPOTENTE: ids fixos + ON CONFLICT DO NOTHING. Rodar 2x não duplica nada.                  │
 * │ 3. NÃO RODA SOZINHO: não é módulo/rota/import; `main()` só via `require.main === module`; o nome │
 * │    não casa com o padrão do vitest.                                                             │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ ATENÇÃO: NÃO RODAR ANTES DA PONTE A&S→ADM ────────────────────────────────────────────────────┐
 * │ Este seed deixa candidatos APROVADOS esperando o botão "enviar para admissão". Enquanto a ponte  │
 * │ não estiver de pé, o envio é inerte (`as_candidaturas.admissao_id` nasce nula). Rodar antes não  │
 * │ quebra nada, mas não há o que testar do outro lado. O coordenador dispara o run quando a ponte   │
 * │ entrar.                                                                                          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * COMO SE RODA (da raiz do repositório), QUANDO AUTORIZADO:
 *   DATABASE_URL='postgres://ea:...@127.0.0.1:5433/ea_automatic_homolog' \
 *     apps/backend/node_modules/.bin/tsx apps/backend/src/as/ingestao-pandape/arnes-seed-tres-vagas.ts
 */

// ══ CPF SINTÉTICO VÁLIDO ═══════════════════════════════════════════════════════════════════════
// Reimplementado localmente (o do arnês não é exportado, e editar código validado para exportá-lo
// dispara a §A.26). Pura função: mesma faixa `999` e mesmo dígito verificador.
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

// ══ AS TRÊS VAGAS (ids fixos p/ idempotência) ══════════════════════════════════════════════════
interface SeedVaga {
  vagaId: string;
  candidatoId: string;
  identidadeId: string;
  candidaturaId: string;
  codigo: string;
  titulo: string;
  sequencia: number; // alimenta o CPF e o identificador externo
  apelido: string;
  /** RISCO A: com valor => mapeável pelo id do Pandapé; null => a ponte resolve por outro caminho. */
  idVacancyPandape: number | null;
}

const SEEDS: SeedVaga[] = [
  {
    vagaId: "0daf40e3-418f-49f1-9f99-449dbfe7471a",
    candidatoId: "c8055758-96f1-4206-be45-8557fdb3b2af",
    identidadeId: "5c5cca8e-0424-482e-9b71-d85e165ecc76",
    candidaturaId: "f7d42052-f3cc-44cd-9fac-7e20367c8466",
    codigo: "ARNES-SEED-VAGA-1",
    titulo: "Operador De Loja",
    sequencia: 970001,
    apelido: "Seed Alfa",
    idVacancyPandape: 970001,
  },
  {
    vagaId: "dbcd719d-5d74-43f3-a90a-fa14b84d73d4",
    candidatoId: "d2fedb59-244c-4199-b33f-9c46b02c0af3",
    identidadeId: "48548c6f-a8f2-4582-8b4e-40beb4401f9c",
    candidaturaId: "777aa161-8c0d-42bb-912b-9a31936ce23c",
    codigo: "ARNES-SEED-VAGA-2",
    titulo: "Auxiliar De Limpeza",
    sequencia: 970002,
    apelido: "Seed Bravo",
    idVacancyPandape: 970002,
  },
  {
    vagaId: "36f3008b-4b06-4418-a304-e0ef988da306",
    candidatoId: "983e0751-9f48-424b-800c-257c24ecc663",
    identidadeId: "7aee102e-41fd-470d-a865-0a1f64013ecb",
    candidaturaId: "28e61469-318e-402e-995d-0c89451f7916",
    codigo: "ARNES-SEED-VAGA-3",
    titulo: "Repositor De Mercadorias",
    sequencia: 970003,
    apelido: "Seed Charlie",
    idVacancyPandape: null, // RISCO A: vaga SEM id do Pandapé
  },
];

const PREFIXO_SIMULADO = "SIMULADO";

async function main(): Promise<void> {
  const nomeDoBanco = conferirDatabase(process.env.DATABASE_URL);
  console.log(`[seed] database: ${nomeDoBanco} (allowlist conferida)`);
  const { sql } = createDb(process.env.DATABASE_URL as string, 1);
  try {
    // Cargo e cliente REAIS do catálogo da homologação, resolvidos em runtime (sobrevivem a re-clone).
    // A vaga precisa deles para ser plausível e para a ponte ter o que mapear.
    const cargo = (await sql.unsafe(`select id from cargos order by nome limit 1`))[0] as unknown as
      | { id: string }
      | undefined;
    const cliente = (await sql.unsafe(`select cod_cliente from clientes where ativo order by cod_cliente limit 1`))[0] as unknown as
      | { cod_cliente: string }
      | undefined;
    if (!cargo || !cliente) {
      throw new Error("Seed aborta: catálogo de cargo/cliente vazio na homologação. Carregue as bases antes.");
    }
    const cargoId = cargo.id;
    const codCliente = cliente.cod_cliente;

    await sql.begin(async (tx) => {
      for (const s of SEEDS) {
        const cpf = cpfSintetico(s.sequencia);
        const nome = `${PREFIXO_SIMULADO} ${s.apelido}`;
        const email = `arnes.${s.apelido.replace(/\s+/g, ".").toLowerCase()}@exemplo.invalid`;
        const idExterno = `ARNES-SEED-${String(s.sequencia).padStart(6, "0")}`;

        // 1) VAGA (Digai/Pandapé). status ABERTA para receber candidato aprovado.
        await tx.unsafe(
          `insert into vagas
             (id, codigo, cargo_id, nome_divulgacao, cod_cliente, status, sazonalidade, genero,
              confidencial, divulgar_empresa, enviar_para_admissao, posicoes_banco, posicoes_oficiais,
              id_vacancy_pandape, criado_em, atualizado_em)
           values
             ($1, $2, $3, $4, $5, 'ABERTA', 'OPERACAO_PADRAO', 'INDIFERENTE',
              false, true, false, 0, 1,
              $6, now(), now())
           on conflict (id) do nothing`,
          [s.vagaId, s.codigo, cargoId, `${PREFIXO_SIMULADO} ${s.titulo}`, codCliente, s.idVacancyPandape],
        );

        // 2) CANDIDATO A&S (sintético, origem DIGAI).
        await tx.unsafe(
          `insert into as_candidatos
             (id, nome, cpf, email, telefone, origem, banco_talentos, criado_em, atualizado_em)
           values
             ($1, $2, $3, $4, '00000000000', 'DIGAI', false, now(), now())
           on conflict (id) do nothing`,
          [s.candidatoId, nome, cpf, email],
        );

        // 3) IDENTIDADE EXTERNA (o predicado único do lote: ARNES-*).
        await tx.unsafe(
          `insert into as_identidades_externas
             (id, candidato_id, fonte, identificador, coletado_em, criado_em, atualizado_em)
           values
             ($1, $2, 'DIGAI', $3, now(), now(), now())
           on conflict (fonte, identificador) do nothing`,
          [s.identidadeId, s.candidatoId, idExterno],
        );

        // 4) CANDIDATURA no ponto de ENVIAR PARA ADMISSÃO: APROVACAO / APROVADO (ocupa posição).
        await tx.unsafe(
          `insert into as_candidaturas
             (id, candidato_id, vaga_id, etapa, situacao, alocado_em, criado_em, atualizado_em)
           values
             ($1, $2, $3, 'APROVACAO', 'APROVADO'::candidatura_situacao, now(), now(), now())
           on conflict (id) do nothing`,
          [s.candidaturaId, s.candidatoId, s.vagaId],
        );
      }
    });

    console.log("");
    console.log("SEED PLANTADO (idempotente)");
    console.log("=".repeat(60));
    for (const s of SEEDS) {
      console.log(
        `  ${s.codigo.padEnd(20)} id_vacancy_pandape=${s.idVacancyPandape ?? "(sem)"} ` +
          `candidato=${PREFIXO_SIMULADO} ${s.apelido} cpf=${cpfSintetico(s.sequencia)} etapa=APROVACAO/APROVADO`,
      );
    }
    console.log("");
    console.log("Predicado único: select count(*) from as_identidades_externas where identificador like 'ARNES-SEED-%';  -- deve dar 3");
  } finally {
    await sql.end();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(`[seed] falhou: ${err instanceof Error ? err.message : "erro sem mensagem"}`);
    process.exit(1);
  });
}
