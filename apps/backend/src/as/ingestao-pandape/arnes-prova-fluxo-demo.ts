import "dotenv/config";
import { createDb } from "../../db/client";
import { EtapasFunilService } from "../etapas/etapas-funil.service";
import { VagaStatusService } from "../vaga-status/vaga-status.service";
import { VagasService } from "../vagas/vagas.service";
import { CandidatosService } from "../candidatos/candidatos.service";
import { AdmissoesService } from "../../admissoes/admissoes.service";
import { conferirDatabase } from "./arnes-lote-fabricado";

/**
 * PROVA DE FLUXO DA VAGA DE DEMONSTRACAO (homolog), fim a fim, sem travar.
 *
 * MUTA o estado da demo de proposito: libera a vaga, vincula um solto, move, aprova e envia para
 * admissao. Depois de rodar esta prova, RE-LIMPAR + RE-SEMEAR para devolver o estado pristino
 * (vaga em PENDENTE_REVISAO, 2 vinculados, 2 soltos), que e o ponto de partida da demo ao vivo.
 * Fail-closed por nome de banco: producao e recusada.
 */

const VAGA_ID = "aa000000-0000-4000-8000-0000000000a1";
const LARISSA = "aa000000-0000-4000-8000-0000000000c3"; // solta
const CAND_CAMILA = "aa000000-0000-4000-8000-0000000000d1"; // candidatura da Camila (vinculada)

const user = {
  id: "83f009a8-4593-406a-b297-a477e1654067",
  papel: "SUPER_ADMIN",
  nome: "Usuario 04 Homolog",
} as never;
const envioStub = { enviarParaCandidaturas: async () => ({ recusados: [] }) } as never;

function ok(msg: string) {
  // eslint-disable-next-line no-console
  console.log(`  OK  ${msg}`);
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  conferirDatabase(url);
  const { db, sql } = createDb(url, 1);
  const etapas = new EtapasFunilService(db);
  const statusVaga = new VagaStatusService(db);
  const vagas = new VagasService(db, etapas, statusVaga);
  const admissoes = new AdmissoesService(db);
  const candidatos = new CandidatosService(db, etapas, statusVaga, envioStub, admissoes);

  try {
    // eslint-disable-next-line no-console
    console.log("PASSO 1: a vaga esta na FILA de revisao (tela Liberar Vaga)");
    const fila = await vagas.pendentesDeRevisao();
    const naFila = (fila as { id: string; codigo?: string; status?: string }[]).find(
      (v) => v.id === VAGA_ID,
    );
    if (!naFila) throw new Error("vaga demo NAO esta na fila de revisao");
    ok(`fila tem a vaga ${naFila.codigo} (status ${naFila.status})`);

    // eslint-disable-next-line no-console
    console.log("PASSO 2: LIBERAR a vaga (sem corpo, obrigatorios ja preenchidos)");
    const liberada = await vagas.liberarPendenteRevisao(VAGA_ID, user);
    ok(`vaga liberada, status agora = ${liberada.status}`);
    if (liberada.status !== "ABERTA") throw new Error("vaga nao ficou ABERTA");

    // eslint-disable-next-line no-console
    console.log("PASSO 3: os 2 VINCULADOS aparecem no funil da vaga");
    let painel = await candidatos.painelVaga(VAGA_ID);
    ok(
      `funil tem ${painel.candidaturas.length} candidatura(s): ` +
        painel.candidaturas
          .map((c) => `${c.candidatoNome}[${c.etapa}/${c.situacao}]`)
          .join(", "),
    );
    if (painel.candidaturas.length !== 2) throw new Error("esperava 2 candidaturas no funil");

    // eslint-disable-next-line no-console
    console.log("PASSO 4: VINCULAR um SOLTO ao vivo (Larissa)");
    const nova = await candidatos.alocar(LARISSA, { vagaId: VAGA_ID } as never, user.id);
    ok(`Larissa vinculada, candidatura ${nova.id} etapa=${nova.etapa} situacao=${nova.situacao}`);
    painel = await candidatos.painelVaga(VAGA_ID);
    if (painel.candidaturas.length !== 3) throw new Error("esperava 3 candidaturas apos vincular");
    ok(`funil agora tem ${painel.candidaturas.length} candidaturas`);

    // eslint-disable-next-line no-console
    console.log("PASSO 5: MOVER Camila no funil (TRIAGEM para ENTREVISTA_SOULAN)");
    const movida = await candidatos.moverEtapa(
      CAND_CAMILA,
      { etapa: "ENTREVISTA_SOULAN" } as never,
      user.id,
    );
    ok(`Camila movida para ${movida.etapa}`);

    // eslint-disable-next-line no-console
    console.log("PASSO 6: APROVAR Camila (consome posicao)");
    const aprovada = await candidatos.aprovar(CAND_CAMILA, user.id);
    ok(`Camila aprovada, situacao=${aprovada.situacao}`);

    // eslint-disable-next-line no-console
    console.log("PASSO 7: ENVIAR Camila PARA ADMISSAO (ponte A&S para Esteira)");
    const enviada = await candidatos.registrarSaida(
      CAND_CAMILA,
      { situacao: "ENVIADO_PARA_ADMISSAO", motivo: "Aprovada, enviada para admissao (demo)" } as never,
      user,
    );
    ok(`Camila enviada, situacao=${enviada.situacao}`);

    const cand = (await sql.unsafe(
      `select admissao_id from as_candidaturas where id = $1`,
      [CAND_CAMILA],
    )) as unknown as { admissao_id: string | null }[];
    if (!cand[0]?.admissao_id) throw new Error("ponte NAO criou admissao (admissao_id nulo)");
    const adm = (await sql.unsafe(
      `select id, farol_global, cod_cliente, cargo_id from admissoes where id = $1`,
      [cand[0].admissao_id],
    )) as unknown as { id: string; farol_global: string; cod_cliente: string; cargo_id: string }[];
    ok(
      `admissao criada id=${adm[0].id} farol=${adm[0].farol_global} cliente=${adm[0].cod_cliente} cargo=${adm[0].cargo_id}`,
    );

    // eslint-disable-next-line no-console
    console.log("");
    // eslint-disable-next-line no-console
    console.log(
      "FLUXO COMPLETO PROVADO SEM TRAVAR: liberar, funil, vincular, mover, aprovar, enviar para admissao.",
    );
  } finally {
    await sql.end();
  }
}

if (require.main === module) {
  main().catch((e) => {
    // eslint-disable-next-line no-console
    console.error("PROVA FALHOU:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
