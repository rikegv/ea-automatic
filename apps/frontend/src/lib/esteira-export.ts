import { caixaAlta } from "@/lib/nome";
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
  clienteRazao: string;
  clienteOperacao?: string | null;
  projetoNome?: string | null;
  lojaNome?: string | null;
  cargoNome: string;
  tipoContrato: string | null;
  dataAdmissao: string | null;
  status: string;
  docsPendentes?: number;
  progressoObrigatorios?: { entregues: number; total: number; inconformes: number } | null;
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

const COMUNS: ColunaExport[] = [
  { chave: "candidato", rotulo: "Candidato", largura: 28 },
  { chave: "cliente", rotulo: "Cliente", largura: 28 },
  { chave: "operacao", rotulo: "Operação", largura: 20 },
  { chave: "projeto", rotulo: "Projeto", largura: 18 },
  { chave: "loja", rotulo: "Loja", largura: 18 },
  { chave: "cargo", rotulo: "Cargo", largura: 22 },
  { chave: "contrato", rotulo: "Tipo de Contrato", largura: 18 },
  { chave: "dataAdmissao", rotulo: "Data de Admissão", largura: 16 },
  { chave: "status", rotulo: "Status", largura: 22 },
];

const EXTRAS: Record<string, ColunaExport[]> = {
  auditoria: [
    { chave: "obrigatorios", rotulo: "Obrigatórios (Entregues/Total)", largura: 24 },
    { chave: "inconformes", rotulo: "Inconformes", largura: 12 },
    { chave: "docsPendentes", rotulo: "Documentos Pendentes", largura: 18 },
    { chave: "pendencias", rotulo: "Tem Pendências", largura: 14 },
  ],
  exame: [
    { chave: "exameData", rotulo: "Data do Exame", largura: 16 },
    { chave: "exameHorario", rotulo: "Horário", largura: 10 },
    { chave: "clinica", rotulo: "Clínica", largura: 24 },
    { chave: "local", rotulo: "Local", largura: 28 },
    { chave: "fornecedor", rotulo: "Fornecedor", largura: 14 },
    { chave: "asoEstado", rotulo: "Estado do ASO", largura: 16 },
    { chave: "asoValidado", rotulo: "ASO Validado", largura: 12 },
  ],
  cadastro: [
    { chave: "matricula", rotulo: "Matrícula", largura: 14 },
    { chave: "clicksign", rotulo: "Status da Assinatura", largura: 20 },
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

  const linhas: Linha[] = itens.map((it) => {
    const base: Linha = {
      candidato: caixaAlta(it.candidatoNome),
      cliente: it.clienteRazao ?? "",
      operacao: it.clienteOperacao ?? "",
      projeto: it.projetoNome ?? "MATRIZ",
      loja: it.lojaNome ?? "",
      cargo: it.cargoNome ?? "",
      contrato: it.tipoContrato ?? "",
      dataAdmissao: fmtData(it.dataAdmissao),
      status: rotuloStatus(it.status),
    };
    if (rota === "auditoria") {
      const p = it.progressoObrigatorios;
      base.obrigatorios = p ? `${p.entregues}/${p.total}` : "";
      base.inconformes = p ? String(p.inconformes) : "";
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
