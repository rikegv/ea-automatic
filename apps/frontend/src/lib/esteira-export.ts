import { caixaAlta } from "@/lib/nome";
import { rotuloDaAuditoria } from "@/lib/rotulo-auditoria";
import type { ColunaExport } from "@/components/ui/ExportarExcelButton";

/**
 * Montagem das colunas e linhas da exportação Excel das abas da Esteira (OST das ondas, Onda 2).
 *
 * Fica fora da página de propósito: a página só passa os itens JÁ VISÍVEIS (depois do filtro do
 * browser) e o tradutor de status, e recebe pronto o que o botão manda ao backend. Cada aba exporta
 * as colunas que correspondem ao que ela mostra; o vazio fica vazio (o Excel filtra melhor assim).
 */

/** Campos que a exportação lê do item da esteira (subconjunto do EsteiraItem da página). */
export interface ItemEsteiraExport {
  candidatoNome: string;
  candidatoCpf?: string | null;
  candidatoEmail?: string | null;
  candidatoTelefone?: string | null;
  // CONSULTOR RESPONSÁVEL da frente (Onda 2): coluna selecionável nas três abas de trabalho.
  consultorResponsavelNome?: string | null;
  clienteRazao: string;
  clienteOperacao?: string | null;
  projetoNome?: string | null;
  lojaNome?: string | null;
  cargoNome: string;
  tipoContrato: string | null;
  dataAdmissao: string | null;
  status: string;
  docsPendentes?: number;
  progressoObrigatorios?: {
    entregues: number;
    total: number;
    inconformes: number;
    recebidos: number;
  } | null;
  temPendencias?: boolean;
  agendamento?: {
    data: string | null;
    horario: string | null;
    nomeClinica: string | null;
    local: string | null;
    fornecedor: string | null;
  } | null;
  asoEstado?: string | null;
  asoValidado?: boolean;
  matricula?: string | null;
  clicksignStatus?: string | null;
  integracao?: {
    data: string | null;
    horario: string | null;
    tipo: string | null;
    consultorNome: string | null;
  } | null;
}

type Linha = Record<string, string | number | null>;

function fmtData(d?: string | null): string {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function simNao(b?: boolean | null): string {
  return b === true ? "Sim" : b === false ? "Não" : "";
}

const TIPO_INTEGRACAO: Record<string, string> = {
  ONLINE: "Online",
  PRESENCIAL: "Presencial",
};

// OBRIGATÓRIAS SEMPRE (Onda 3.1): Nome, Telefone e E-mail entram em todo Excel, marcadas e sem
// como desmarcar. O CPF é opcional (só sai se o usuário marcar).
const COMUNS: ColunaExport[] = [
  { chave: "candidato", rotulo: "Nome Completo", largura: 28, obrigatoria: true },
  { chave: "telefone", rotulo: "Telefone", largura: 16, obrigatoria: true },
  { chave: "email", rotulo: "E-mail", largura: 26, obrigatoria: true },
  { chave: "cpf", rotulo: "CPF", largura: 16 },
  { chave: "cliente", rotulo: "Cliente", largura: 28 },
  { chave: "operacao", rotulo: "Operação", largura: 20 },
  { chave: "projeto", rotulo: "Projeto", largura: 18 },
  { chave: "loja", rotulo: "Loja", largura: 18 },
  { chave: "cargo", rotulo: "Cargo", largura: 22 },
  { chave: "contrato", rotulo: "Tipo de Contrato", largura: 18 },
  { chave: "dataAdmissao", rotulo: "Data de Admissão", largura: 16 },
  { chave: "status", rotulo: "Status", largura: 22 },
];

// Coluna CONSULTOR RESPONSÁVEL (Onda 2), selecionável nas três abas de trabalho.
const COL_CONSULTOR: ColunaExport = {
  chave: "consultorResp",
  rotulo: "Consultor Responsável",
  largura: 24,
};

const EXTRAS: Record<string, ColunaExport[]> = {
  auditoria: [
    // Onda 3.2: o status concatenado da tela vira colunas separadas. "Aprovados" e "Reprovados"
    // levam SÓ o número e ficam vazios quando a admissão não tem substatus (ex.: só Análise
    // Pendente). O "Status" (coluna comum) já traz o rótulo principal derivado.
    { chave: "aprovados", rotulo: "Aprovados", largura: 12 },
    { chave: "reprovados", rotulo: "Reprovados", largura: 12 },
    { chave: "docsPendentes", rotulo: "Documentos Pendentes", largura: 18 },
    { chave: "pendencias", rotulo: "Tem Pendências", largura: 14 },
    COL_CONSULTOR,
  ],
  exame: [
    { chave: "exameData", rotulo: "Data do Exame", largura: 16 },
    { chave: "exameHorario", rotulo: "Horário", largura: 10 },
    { chave: "clinica", rotulo: "Clínica", largura: 24 },
    { chave: "local", rotulo: "Local", largura: 28 },
    { chave: "fornecedor", rotulo: "Fornecedor", largura: 14 },
    { chave: "asoEstado", rotulo: "Estado do ASO", largura: 16 },
    { chave: "asoValidado", rotulo: "ASO Validado", largura: 12 },
    COL_CONSULTOR,
  ],
  cadastro: [
    { chave: "matricula", rotulo: "Matrícula", largura: 14 },
    { chave: "clicksign", rotulo: "Status da Assinatura", largura: 20 },
    COL_CONSULTOR,
  ],
  integracao: [
    { chave: "integracaoData", rotulo: "Data da Integração", largura: 16 },
    { chave: "integracaoHorario", rotulo: "Horário", largura: 10 },
    { chave: "integracaoTipo", rotulo: "Tipo", largura: 12 },
    { chave: "consultor", rotulo: "Consultor", largura: 22 },
  ],
};

const ABA_ROTULO: Record<string, string> = {
  auditoria: "Auditoria",
  exame: "Exames",
  cadastro: "Cadastro",
  integracao: "Integração",
};

/**
 * Devolve colunas, linhas e nome do arquivo para a aba. `rotuloStatus` traduz o código de status no
 * rótulo que a tela mostra (vem do catálogo carregado na página).
 */
export function montarExportEsteira(
  rota: string,
  itens: ItemEsteiraExport[],
  rotuloStatus: (codigo: string) => string,
): { aba: string; colunas: ColunaExport[]; nomeArquivo: string; linhas: Linha[] } {
  const colunas = [...COMUNS, ...(EXTRAS[rota] ?? [])];

  const temConsultor = rota === "auditoria" || rota === "exame" || rota === "cadastro";

  const linhas: Linha[] = itens.map((it) => {
    const base: Linha = {
      candidato: caixaAlta(it.candidatoNome),
      telefone: it.candidatoTelefone ?? "",
      email: it.candidatoEmail ?? "",
      cpf: it.candidatoCpf ?? "",
      cliente: it.clienteRazao ?? "",
      operacao: it.clienteOperacao ?? "",
      projeto: it.projetoNome ?? "MATRIZ",
      loja: it.lojaNome ?? "",
      cargo: it.cargoNome ?? "",
      contrato: it.tipoContrato ?? "",
      dataAdmissao: fmtData(it.dataAdmissao),
      status: rotuloStatus(it.status),
    };
    if (temConsultor) {
      base.consultorResp = it.consultorResponsavelNome ? caixaAlta(it.consultorResponsavelNome) : "";
    }
    if (rota === "auditoria") {
      const p = it.progressoObrigatorios;
      // Substatus presente = tem régua obrigatória com algum total. Sem substatus (ex.: só "Análise
      // Pendente"), Aprovados/Reprovados ficam VAZIOS (não zero), como pediu o diretor.
      const temSubstatus = !!p && p.total > 0;
      // Coluna Status casa com a TELA: quando há substatus e a frente está em ANALISE_PENDENTE, o
      // rótulo é o derivado (Entrega Pendente / Análise Em Andamento / Análise Finalizada).
      base.status =
        temSubstatus && it.status === "ANALISE_PENDENTE" ? rotuloDaAuditoria(p!) : rotuloStatus(it.status);
      base.aprovados = temSubstatus ? String(p!.entregues) : "";
      base.reprovados = temSubstatus ? String(p!.inconformes) : "";
      base.docsPendentes = it.docsPendentes === undefined ? "" : String(it.docsPendentes);
      base.pendencias = simNao(it.temPendencias);
    } else if (rota === "exame") {
      base.exameData = fmtData(it.agendamento?.data);
      base.exameHorario = it.agendamento?.horario ?? "";
      base.clinica = it.agendamento?.nomeClinica ?? "";
      base.local = it.agendamento?.local ?? "";
      base.fornecedor = it.agendamento?.fornecedor ?? "";
      base.asoEstado = it.asoEstado ?? "";
      base.asoValidado = simNao(it.asoValidado);
    } else if (rota === "cadastro") {
      base.matricula = it.matricula ?? "";
      base.clicksign = it.clicksignStatus ?? "";
    } else if (rota === "integracao") {
      base.integracaoData = fmtData(it.integracao?.data);
      base.integracaoHorario = it.integracao?.horario ?? "";
      base.integracaoTipo = it.integracao?.tipo ? (TIPO_INTEGRACAO[it.integracao.tipo] ?? it.integracao.tipo) : "";
      base.consultor = it.integracao?.consultorNome ? caixaAlta(it.integracao.consultorNome) : "";
    }
    return base;
  });

  const hoje = new Date();
  const d2 = (n: number) => String(n).padStart(2, "0");
  const dia = `${hoje.getFullYear()}-${d2(hoje.getMonth() + 1)}-${d2(hoje.getDate())}`;

  return {
    aba: ABA_ROTULO[rota] ?? "Esteira",
    colunas,
    nomeArquivo: `esteira-${rota}-${dia}.xlsx`,
    linhas,
  };
}
