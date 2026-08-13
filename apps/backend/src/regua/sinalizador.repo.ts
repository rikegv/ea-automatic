import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { admissoes, candidatos, dadosVagaFolha, documentosAdmissao } from "../db/schema";
import { calcSinalizadorPreenchimento } from "../domain/admissao";
import { CHAVES_PENDENCIA } from "../domain/pendencia-config";
import { pendenciasObrigatoriasSet } from "./pendencias-lote";

/**
 * REGRAVA `sinalizador_preenchimento` de UMA admissão, a partir da régua VIVA.
 *
 * POR QUE ELE SAIU DE DENTRO DO `admissoes.service` (§A.17 etapa 4): a tela de Benefícios passou a
 * editar o pacote do candidato, e editar o pacote muda a régua de pendências. Sem regravar o enum, a
 * COLUNA "Pendências Obrig." (que lê a régua viva, e enxerga o benefício novo na hora) diria uma
 * coisa e o KPI "Com Pendências Obrigatórias" (que lê o enum gravado) diria outra, sobre a MESMA
 * admissão. É exatamente a divergência que a §A.19 registra como já tendo acontecido uma vez.
 *
 * A ALTERNATIVA ERA COPIAR ESTAS QUINZE LINHAS para a tela nova, e copiar régua de contagem é a
 * divergência garantida na primeira mudança de regra. O `admissoes.service` continua com o mesmo
 * método, agora delegando aqui: o comportamento é o mesmo, byte a byte, e passa a ter um dono só.
 *
 * NÃO É A "PORTA ESTREITA" DA AUDITORIA. `auditoria.sinalizadorApenas` recalcula passando só o
 * salário da vaga, sem benefício, escala, centro de custo, setor nem gestor: usá-la depois de uma
 * edição marcaria cinco itens preenchidos como pendentes. Aqui quem decide é
 * `pendenciasObrigatoriasSet`, a MESMA função que pinta a coluna, então os dois números não têm como
 * discordar.
 *
 * DOCUMENTO INCONFORME DOMINA (§A.3, a mesma regra que `auditoria.recalcularSinalizador` já aplica).
 * Sem esta metade, qualquer edição de campo APAGARIA o sinal de inconformidade documental: uma
 * admissão com documento reprovado voltava a PARCIAL só porque alguém corrigiu um tamanho de
 * camiseta, e o time perdia de vista o documento que precisa ser reenviado. Foi exatamente o que a
 * prova da edição de uniforme pegou, e vale para os três caminhos que chamam esta função.
 *
 * ACEITA `tx`: chamado de dentro da transação da edição, para o dado e o sinalizador caírem juntos
 * ou não caírem.
 *
 * §A.6: opera por id e estado, sem PII em log.
 */
export async function recalcularSinalizadorDaAdmissao(db: Database, id: string): Promise<void> {
  const adm = await db.query.admissoes.findFirst({ where: eq(admissoes.id, id) });
  if (!adm) return;
  const cand = await db.query.candidatos.findFirst({
    where: eq(candidatos.cpf, adm.candidatoCpf),
  });
  const vaga = await db.query.dadosVagaFolha.findFirst({
    where: eq(dadosVagaFolha.admissaoId, id),
  });
  // A inconformidade documental é consultada ANTES, porque ela decide sozinha: havendo documento
  // reprovado, o cálculo de campos nem chega a valer.
  const docs = await db
    .select({ estado: documentosAdmissao.estado })
    .from(documentosAdmissao)
    .where(eq(documentosAdmissao.admissaoId, id));
  if (docs.some((d) => d.estado === "INCONFORME")) {
    await db
      .update(admissoes)
      .set({ sinalizadorPreenchimento: "INCONFORMIDADE", atualizadoEm: new Date() })
      .where(eq(admissoes.id, id));
    return;
  }

  const temPend = (await pendenciasObrigatoriasSet(db, [id])).has(id);
  const sinalizador = calcSinalizadorPreenchimento(
    {
      candidato: { nome: cand?.nome, cpf: cand?.cpf },
      codCliente: adm.codCliente,
      cargoId: adm.cargoId,
      dataAdmissao: adm.dataAdmissao,
      tipoContrato: adm.tipoContrato,
      vagaFolha: { salario: vaga?.salario },
    },
    // A régua completa já foi avaliada por `pendenciasObrigatoriasSet` (que consulta a config do
    // cliente); aqui o cálculo só precisa concordar com ela.
    temPend ? undefined : new Set(CHAVES_PENDENCIA),
  );
  await db
    .update(admissoes)
    .set({ sinalizadorPreenchimento: sinalizador as "PENDENTE", atualizadoEm: new Date() })
    .where(eq(admissoes.id, id));
}
