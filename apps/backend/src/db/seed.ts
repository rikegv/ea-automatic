import "dotenv/config";
import * as argon2 from "argon2";
import { createDb } from "./client";
import { frenteStatusCatalogo, tiposDocumento, usuarios } from "./schema";

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
  tipo: "AUDITORIA" | "EXAME" | "CADASTRO_CONTRATO";
  codigo: string;
  rotulo: string;
  conclui: boolean;
}> = [
  { tipo: "AUDITORIA", codigo: "ANALISE_PENDENTE", rotulo: "Análise pendente", conclui: false },
  {
    tipo: "AUDITORIA",
    codigo: "AGUARDA_REENVIO",
    rotulo: "Aguardando reenvio dos docs",
    conclui: false,
  },
  { tipo: "AUDITORIA", codigo: "ANALISE_OK", rotulo: "Análise OK", conclui: true },
  { tipo: "AUDITORIA", codigo: "DECLINOU", rotulo: "Declinou", conclui: false },
  { tipo: "EXAME", codigo: "A_AGENDAR", rotulo: "A agendar", conclui: false },
  { tipo: "EXAME", codigo: "AGENDADO", rotulo: "Agendado", conclui: false },
  { tipo: "EXAME", codigo: "APTO", rotulo: "Apto", conclui: true },
  { tipo: "EXAME", codigo: "CANCELADO", rotulo: "Cancelado", conclui: false },
  { tipo: "CADASTRO_CONTRATO", codigo: "A_CADASTRAR", rotulo: "A cadastrar", conclui: false },
  { tipo: "CADASTRO_CONTRATO", codigo: "CADASTRADO", rotulo: "Cadastrado", conclui: false },
  { tipo: "CADASTRO_CONTRATO", codigo: "ENVIAR", rotulo: "Enviar", conclui: false },
  { tipo: "CADASTRO_CONTRATO", codigo: "ENVIADO", rotulo: "Enviado", conclui: false },
  { tipo: "CADASTRO_CONTRATO", codigo: "INTEGRACAO", rotulo: "Integração", conclui: true },
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
  await db
    .insert(frenteStatusCatalogo)
    .values(comOrdem)
    .onConflictDoNothing({
      target: [frenteStatusCatalogo.tipo, frenteStatusCatalogo.codigo],
    });
  console.log(`[seed] status por frente: ${STATUS_FRENTE.length}`);

  await sql.end();
  console.log("[seed] concluído.");
}

main().catch((err) => {
  console.error("[seed] falhou:", err);
  process.exit(1);
});
