import "dotenv/config";
import { createDb } from "./client";
import { DeparaEtapaExternaService } from "../as/depara/depara-etapa-externa.service";

/**
 * PROVA DA FUNDAÇÃO UNIFICADORA, para a validação do diretor (§A.13 na parte que não tem tela).
 *
 * SÓ LEITURA. Não escreve nada em banco nenhum, e por isso pode rodar quantas vezes quiser.
 * §A.6: nenhum dado pessoal sai daqui. Os nomes impressos são de PASTA DE VAGA do Pandapé, e as
 * contagens são contagens.
 */

/** Os DEZ nomes reais, como a API do Pandapé os devolveu numa vaga de verdade da conta. */
const ETAPAS_REAIS_DO_PANDAPE = [
  "Lead",
  "Inscritos",
  "triados",
  "Pré-selecionadoS (MANTER SE HOUVER QUESTIONÁRIO)",
  "ENTREVISTA SOULAN",
  "SHORT LIST, ENCAMINHADOS CLIENTE",
  "Contratados",
  "RETORNO VAGA STAND BY",
  "RETORNO NEGATIVO",
  "Descartados",
];

/** As três grafias do mesmo nome, que provam que a digitação livre do Pandapé não quebra o de/para. */
const MESMO_NOME_TRES_GRAFIAS = ["triados", "TRIADOS", "  Triados  "];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido");
  const { sql, db } = createDb(url, 1);
  const servico = new DeparaEtapaExternaService(db);

  console.log("");
  console.log("PECA 3: O DE/PARA, passando os DEZ nomes reais do Pandape pelo tradutor");
  console.log("=".repeat(78));
  for (const nome of ETAPAS_REAIS_DO_PANDAPE) {
    const r = await servico.resolver("PANDAPE", nome);
    const destino = r.mapeada
      ? `etapa: ${(r.etapaCodigo ?? "nao muda").padEnd(18)} | desfecho: ${(r.situacao ?? "nenhum").padEnd(22)} | motivo: ${r.motivoPadrao ?? "nenhum"}`
      : "NAO MAPEADA (aguarda decisao do diretor)";
    console.log(`  ${nome.padEnd(48)} -> ${destino}`);
  }

  console.log("");
  console.log("A MESMA ETAPA EM TRES GRAFIAS tem de cair no MESMO lugar");
  console.log("=".repeat(78));
  for (const nome of MESMO_NOME_TRES_GRAFIAS) {
    const r = await servico.resolver("PANDAPE", nome);
    console.log(`  ${JSON.stringify(nome).padEnd(48)} -> ${r.mapeada ? r.etapaCodigo : "NAO MAPEADA"}`);
  }

  console.log("");
  console.log("FAIL-CLOSED: fonte que nao existe e nome vazio nao viram curinga");
  console.log("=".repeat(78));
  const inventada = await servico.resolver("FONTE_INVENTADA", "triados");
  const vazio = await servico.resolver("PANDAPE", "   ");
  console.log(`  fonte inventada  -> ${inventada.mapeada ? "MAPEOU (ERRADO)" : "NAO MAPEADA (certo)"}`);
  console.log(`  nome vazio       -> ${vazio.mapeada ? "MAPEOU (ERRADO)" : "NAO MAPEADA (certo)"}`);
  console.log("");

  await sql.end();
}

main().catch((err: unknown) => {
  console.error("[prova] falhou:", err instanceof Error ? err.message : "erro sem mensagem");
  process.exit(1);
});
