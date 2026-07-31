import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { createDb } from "./client";
import { admissoes, candidatos, cargos, clientes, frentesAdmissao } from "./schema";

/**
 * CANDIDATO DE TESTE DA ASSINATURA (INT-4).
 *
 * PARA QUE SERVE: provar o disparo de envelope ponta a ponta na Clicksign SANDBOX sem mandar e-mail
 * para candidato de verdade. O `criarEnvelope` exige e-mail do candidato (o requirement de
 * autenticação é por e-mail), então o teste precisa de alguém com e-mail que o DIRETOR controle.
 *
 * O QUE CRIA: um candidato com dados fake + uma admissão com as TRÊS frentes já concluídas, que é o
 * gate F12. Assim a admissão nasce na aba "Prontos para solicitar" do menu de assinaturas e o
 * disparo pode ser feito pela tela, exatamente como um caso real.
 *
 * COMO RODAR (na pasta apps/backend):
 *   npx tsx src/db/seed-candidato-teste.ts                          # cria/atualiza (e-mail padrão)
 *   npx tsx src/db/seed-candidato-teste.ts fulano@empresa.com       # cria/atualiza com outro e-mail
 *   npx tsx src/db/seed-candidato-teste.ts --remover                # apaga o candidato e a admissão
 *
 * IDEMPOTENTE: rodar de novo atualiza o e-mail e reafirma as frentes, sem duplicar. Se a admissão de
 * teste já tiver envelope (`clicksign_envelope_id`), o script NÃO mexe no estado da assinatura: um
 * teste em andamento não é sobrescrito por engano.
 *
 * §A.6: o CPF é fake e o nome deixa explícito que é teste. Nada aqui é PII de pessoa real.
 */

/**
 * CPF FAKE com dígito verificador válido. Precisa ser válido porque o `cpf_valido` do sistema e a
 * própria Clicksign recusam dígito inconsistente. Este é o CPF canônico de teste já usado nos testes
 * deste repositório, não é de pessoa real.
 */
const CPF_TESTE = "11144477735";

/** Nome propositalmente inconfundível: ninguém confunde com candidato de verdade em fila nenhuma. */
const NOME_TESTE = "CANDIDATO TESTE CLICKSIGN";

/** E-mail padrão: caixa do diretor com marcador, para o convite de assinatura cair identificado. */
const EMAIL_PADRAO = "henrique.vieira+clicksign-teste@soulan.com.br";

/** Frentes na configuração CONCLUÍDA, que é o gate F12 (`kitLiberado`). */
const FRENTES_CONCLUIDAS = [
  { tipo: "AUDITORIA" as const, status: "ANALISE_OK" },
  { tipo: "EXAME" as const, status: "APTO" },
  { tipo: "CADASTRO_CONTRATO" as const, status: "CADASTRADO" },
];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");

  const arg = process.argv[2];
  const remover = arg === "--remover";
  const email = !arg || remover ? EMAIL_PADRAO : arg.trim();

  const { sql, db } = createDb(url, 1);
  try {
    if (remover) {
      // A admissão cai por CASCADE nas frentes; o candidato sai depois das admissões.
      const apagadas = await db
        .delete(admissoes)
        .where(eq(admissoes.candidatoCpf, CPF_TESTE))
        .returning({ id: admissoes.id });
      await db.delete(candidatos).where(eq(candidatos.cpf, CPF_TESTE));
      console.log(
        `[candidato-teste] removido: ${apagadas.length} admissão(ões) e o candidato de teste.`,
      );
      return;
    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error(`E-mail inválido: "${email}". Passe um e-mail que você controle.`);
    }

    // Cliente e cargo REAIS do catálogo: a admissão precisa deles para resolver régua e pasta do
    // Drive. Não criamos cliente/cargo de teste para não sujar catálogo que a operação usa.
    const cliente = await db.query.clientes.findFirst({
      where: eq(clientes.codCliente, "631"),
    });
    if (!cliente) throw new Error("Cliente 631 (SOULAN) não encontrado no catálogo.");
    const cargo = await db.query.cargos.findFirst({ where: eq(cargos.ativo, true) });
    if (!cargo) throw new Error("Nenhum cargo ativo no catálogo.");

    // 1) Candidato (upsert pelo CPF).
    await db
      .insert(candidatos)
      .values({ cpf: CPF_TESTE, nome: NOME_TESTE, email })
      .onConflictDoUpdate({
        target: candidatos.cpf,
        set: { nome: NOME_TESTE, email, atualizadoEm: new Date() },
      });
    console.log(`[candidato-teste] candidato ${NOME_TESTE} (CPF fake ${CPF_TESTE}) com e-mail ${email}.`);

    // 2) Admissão. Reusa a que já existir, para não acumular teste sobre teste.
    let adm = await db.query.admissoes.findFirst({
      where: eq(admissoes.candidatoCpf, CPF_TESTE),
    });
    if (adm) {
      console.log(`[candidato-teste] admissão de teste já existe: ${adm.id}`);
      if (adm.clicksignEnvelopeId) {
        console.log(
          `[candidato-teste] ATENÇÃO: já tem envelope (status ${adm.clicksignStatus}). ` +
            `O estado da assinatura NÃO foi tocado. Use --remover para começar do zero.`,
        );
      }
    } else {
      const [nova] = await db
        .insert(admissoes)
        .values({
          candidatoCpf: CPF_TESTE,
          codCliente: cliente.codCliente,
          cargoId: cargo.id,
          tipoContrato: "Temporário",
          farolGlobal: "EM_ADMISSAO",
          origem: "MANUAL",
        })
        .returning({ id: admissoes.id });
      adm = { ...(nova as unknown as typeof admissoes.$inferSelect) };
      console.log(`[candidato-teste] admissão criada: ${nova.id}`);
    }

    // 3) As três frentes CONCLUÍDAS (gate F12 aberto).
    const agora = new Date();
    for (const f of FRENTES_CONCLUIDAS) {
      const existente = await db.query.frentesAdmissao.findFirst({
        where: and(eq(frentesAdmissao.admissaoId, adm.id), eq(frentesAdmissao.tipo, f.tipo)),
      });
      if (existente) {
        await db
          .update(frentesAdmissao)
          .set({ status: f.status, concluida: true, dataConclusao: agora, atualizadoEm: agora })
          .where(eq(frentesAdmissao.id, existente.id));
      } else {
        await db.insert(frentesAdmissao).values({
          admissaoId: adm.id,
          tipo: f.tipo,
          status: f.status,
          concluida: true,
          dataInicio: agora,
          dataConclusao: agora,
        });
      }
    }
    console.log("[candidato-teste] três frentes concluídas (gate F12 aberto).");
    console.log(
      `[candidato-teste] pronto. A admissão aparece em Gerenciamento de assinatura, aba ` +
        `"Prontos para solicitar". Suba um PDF qualquer em "Solicitar" para disparar o envelope ` +
        `na SANDBOX; o convite vai para ${email}.`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("[candidato-teste] falhou:", err);
  process.exit(1);
});
