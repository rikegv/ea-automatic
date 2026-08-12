import "dotenv/config";
import * as argon2 from "argon2";
// `sql` da drizzle sob alias: o `sql` do escopo é o cliente postgres.js do `createDb`, que sombrearia
// este e faria o `excluded.*` virar uma query solta em vez de um fragmento SQL.
import { sql as fragmento } from "drizzle-orm";
import { createDb } from "./client";
import { frenteStatusCatalogo, salaEsperaStatus, tiposDocumento, usuarios } from "./schema";

// 21 tipos de documento da base admissional (§A.3 / A.4 — TipoDocumento).
const TIPOS_DOCUMENTO: Array<{ codigo: string; nome: string }> = [
  { codigo: "RG", nome: "RG (documento de identidade)" },
  { codigo: "CPF", nome: "CPF" },
  { codigo: "CTPS", nome: "Carteira de Trabalho (CTPS)" },
  { codigo: "TITULO_ELEITOR", nome: "Título de Eleitor" },
  { codigo: "COMPROVANTE_RESIDENCIA", nome: "Comprovante de Residência" },
  { codigo: "CERTIDAO_NASCIMENTO", nome: "Certidão de Nascimento" },
  { codigo: "CERTIDAO_CASAMENTO", nome: "Certidão de Casamento" },
  { codigo: "COMPROVANTE_ESCOLARIDADE", nome: "Comprovante de Escolaridade" },
  { codigo: "FOTO_3X4", nome: "Foto 3x4" },
  { codigo: "PIS_PASEP", nome: "PIS/PASEP" },
  { codigo: "RESERVISTA", nome: "Carteira de Reservista" },
  { codigo: "CNH", nome: "CNH" },
  { codigo: "CERTIDAO_NASCIMENTO_FILHOS", nome: "Certidão de Nascimento dos Filhos" },
  { codigo: "VACINA_FILHOS", nome: "Carteira de Vacinação dos Filhos" },
  { codigo: "DADOS_BANCARIOS", nome: "Comprovante de Conta Bancária" },
  { codigo: "ASO", nome: "Atestado de Saúde Ocupacional (ASO)" },
  { codigo: "ANTECEDENTES", nome: "Certidão de Antecedentes Criminais" },
  { codigo: "VINCULO_ESOCIAL", nome: "Comprovante de Vínculo (eSocial)" },
  { codigo: "DEPENDENTES_IR", nome: "Declaração de Dependentes (IR)" },
  { codigo: "VACINA_COVID", nome: "Comprovante de Vacinação COVID-19" },
  { codigo: "CURRICULO", nome: "Currículo" },
  // Documento de formalização da admissão de banco (§A.3 / Fase 4 complemento). Arquivado no
  // Drive na subpasta ADMISSÃO. O arquivo-modelo será fornecido pelo diretor.
  { codigo: "TERMO_BANCO", nome: "Termo de Banco" },
];

// Status por frente (§A.3) — alimenta os seletores da esteira (F8). `conclui` marca o status
// terminal que conclui a frente (insumo do gate do Cadastro, regra 3).
const STATUS_FRENTE: Array<{
  tipo: "AUDITORIA" | "EXAME" | "CADASTRO_CONTRATO" | "INTEGRACAO";
  codigo: string;
  rotulo: string;
  conclui: boolean;
}> = [
  { tipo: "AUDITORIA", codigo: "ANALISE_PENDENTE", rotulo: "Análise Pendente", conclui: false },
  {
    tipo: "AUDITORIA",
    codigo: "AGUARDA_REENVIO",
    rotulo: "Aguardando Reenvio Dos Docs",
    conclui: false,
  },
  // "Análise Finalizada" (decisão do diretor): os três rótulos da coluna de status contam a
  // MESMA história (Entrega pendente · Análise em andamento · Análise finalizada). É rótulo de
  // catálogo, dado de seed; o CÓDIGO `ANALISE_OK` e a máquina de estados seguem intactos.
  { tipo: "AUDITORIA", codigo: "ANALISE_OK", rotulo: "Análise Finalizada", conclui: true },
  { tipo: "AUDITORIA", codigo: "DECLINOU", rotulo: "Declinou", conclui: false },
  { tipo: "EXAME", codigo: "A_AGENDAR", rotulo: "A Agendar", conclui: false },
  { tipo: "EXAME", codigo: "AGENDADO", rotulo: "Agendado", conclui: false },
  { tipo: "EXAME", codigo: "APTO", rotulo: "Apto", conclui: true },
  { tipo: "EXAME", codigo: "CANCELADO", rotulo: "Cancelado", conclui: false },
  { tipo: "CADASTRO_CONTRATO", codigo: "A_CADASTRAR", rotulo: "A Cadastrar", conclui: false },
  // Único status além de "A Cadastrar", e é o CONCLUINTE (migration 0026). Base nova nasce com o
  // catálogo já reorganizado; base existente é migrada pela 0026 (o seed é onConflictDoNothing e
  // não corrigiria sozinho).
  { tipo: "CADASTRO_CONTRATO", codigo: "CADASTRADO", rotulo: "Cadastrado", conclui: true },
  // INTEGRAÇÃO, a ÚLTIMA etapa da esteira (decisão do diretor). O catálogo mora aqui, e não numa
  // migration, porque o Postgres não deixa USAR um valor de enum na mesma transação em que ele foi
  // criado, e o migrator roda tudo numa transação só. O seed é o dono desta tabela por desenho.
  { tipo: "INTEGRACAO", codigo: "A_AGENDAR", rotulo: "A Agendar", conclui: false },
  { tipo: "INTEGRACAO", codigo: "AGENDADO", rotulo: "Agendado", conclui: false },
  // REALIZADO conclui: é o fim da esteira, a admissão passa a viver no Gerenciador.
  { tipo: "INTEGRACAO", codigo: "REALIZADO", rotulo: "Realizado", conclui: true },
  // DESCONSIDERADA: concluiu o onboarding SEM passar pela integração. Também CONCLUI a frente (sai
  // da fila e conta como admissão concluída), mas não é o terminal de êxito.
  {
    tipo: "INTEGRACAO",
    codigo: "DESCONSIDERADA",
    rotulo: "Concluída Sem Integração",
    conclui: true,
  },
  // Desfechos. NÃO concluem, pelo mesmo motivo do declínio das outras frentes: não falsear êxito.
  { tipo: "INTEGRACAO", codigo: "DECLINOU", rotulo: "Declinou", conclui: false },
  { tipo: "INTEGRACAO", codigo: "RESCISAO", rotulo: "Rescisão", conclui: false },
];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");

  const { sql, db } = createDb(url, 1);

  // 1) Admin inicial — senha vem do env (nunca hardcoded).
  const email = process.env.EA_ADMIN_EMAIL;
  const password = process.env.EA_ADMIN_PASSWORD;
  const nome = process.env.EA_ADMIN_NOME ?? "Administrador EA";
  if (!email || !password) {
    throw new Error("EA_ADMIN_EMAIL / EA_ADMIN_PASSWORD não definidos no .env");
  }
  const senhaHash = await argon2.hash(password);
  await db
    .insert(usuarios)
    .values({ nome, email, senhaHash, papel: "SUPER_ADMIN", ativo: true })
    .onConflictDoNothing({ target: usuarios.email });
  console.log(`[seed] admin garantido: ${email} (SUPER_ADMIN)`);

  // 2) 21 TipoDocumento.
  await db.insert(tiposDocumento).values(TIPOS_DOCUMENTO).onConflictDoNothing({
    target: tiposDocumento.codigo,
  });
  console.log(`[seed] tipos de documento: ${TIPOS_DOCUMENTO.length}`);

  // 3) Status por frente.
  const comOrdem = STATUS_FRENTE.map((s, i) => ({ ...s, ordem: i }));
  // CONVERGE o catálogo, em vez de só inserir o que falta. Era `onConflictDoNothing`, e por isso
  // corrigir um RÓTULO aqui não chegava a uma base já semeada (foi o que obrigou a migration 0026 a
  // reorganizar o Cadastro na mão). Agora o seed é a fonte de verdade do catálogo: rodar de novo
  // alinha rótulo, ordem e `conclui`. A chave (tipo + código) NUNCA é tocada, e o seed é o ÚNICO
  // escritor desta tabela (não há CRUD de status de frente), então não há edição manual a atropelar.
  await db
    .insert(frenteStatusCatalogo)
    .values(comOrdem)
    .onConflictDoUpdate({
      target: [frenteStatusCatalogo.tipo, frenteStatusCatalogo.codigo],
      set: {
        rotulo: fragmento`excluded.rotulo`,
        ordem: fragmento`excluded.ordem`,
        conclui: fragmento`excluded.conclui`,
      },
    });
  console.log(`[seed] status por frente: ${STATUS_FRENTE.length}`);

  // 4) Status da SALA DE ESPERA. `encerra` marca o terminal (some da fila ativa), e é o que permite
  // a lista ser editável sem virar bug: o sistema não deduz pelo nome quem encerra.
  const STATUS_SALA = [
    { nome: "Aguardando confirmação do link", encerra: false },
    { nome: "Aguardando candidatura na vaga", encerra: false },
    { nome: "Aguardando retorno do candidato", encerra: false },
    { nome: "Declinou", encerra: true },
    { nome: "Desistiu", encerra: true },
    // CANCELADAS (decisão do diretor): o cadastro errado, ou o registro que não avança e não é
    // declínio nem desistência do candidato. Terminal como os outros dois, então manda o registro
    // para a aba Inativadas em vez de sumir da tela.
    { nome: "Canceladas", encerra: true },
  ];
  await db
    .insert(salaEsperaStatus)
    .values(STATUS_SALA.map((x, i) => ({ ...x, ordem: i })))
    // Só INSERE o que falta: a lista é editável pelo diretor, então converger rótulo/ordem aqui
    // desfaria a edição dele no próximo deploy.
    .onConflictDoNothing({ target: salaEsperaStatus.nome });
  console.log(`[seed] status da sala de espera: ${STATUS_SALA.length}`);

  await sql.end();
  console.log("[seed] concluído.");
}

main().catch((err) => {
  console.error("[seed] falhou:", err);
  process.exit(1);
});
