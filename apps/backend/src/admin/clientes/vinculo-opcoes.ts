/**
 * Catálogo de OPÇÕES VÁLIDAS de vínculo cliente↔empresa Soulan (usado na edição do cliente para
 * TROCAR a empresa/tipo). Cada opção determina por completo a resolução: empresa (código base), tipo
 * de serviço, filial e a entidade Soulan empregadora — e, por consequência, o CNPJ que a view
 * `vw_vinculo_empresa_cnpj` resolve. CNPJs vêm do diretor (mesma fonte do seed) — NUNCA inventados.
 *
 * Temporário/Terceiro variam o CNPJ por filial → uma opção por filial conhecida. Interno e Estágio
 * têm CNPJ fixo da entidade. FOPAG usa o CNPJ do PRÓPRIO cliente (entidade = null).
 */

export type TipoServico = "TEMPORARIO" | "TERCEIRO" | "ESTAGIO" | "INTERNO" | "FOPAG";

export interface VinculoOpcao {
  /** Id estável para o select do frontend. */
  id: string;
  /** Rótulo legível (inclui o CNPJ para o diretor ver qual é). */
  label: string;
  tipoServico: TipoServico;
  /** Código "Empresa" da base gravado no vínculo (representa o tipo). */
  empresaCodigo: string;
  /** Filial (só Temporário/Terceiro). null para Interno/Estágio/FOPAG. */
  filial: string | null;
  isFopag: boolean;
  /** Nome EXATO da entidade Soulan empregadora (resolve `entidade_id`). null para FOPAG. */
  entidadeNome: string | null;
}

const CONSULTORIA = "SOULAN CONSULTORIA E MAO DE OBRA TEMPORARIA LTDA";
const ADMINISTRACAO = "SOULAN ADMINISTRACAO E ASSESSORIA EM RECURSOS HUMANOS LTDA";
const NEAT = "NEAT SOLUCOES E TECNOLOGIA PARA RH LTDA";
const CENTRAL_ESTAGIOS = "SOULAN CENTRAL DE ESTAGIOS LTDA";

/** Fonte única das opções — espelha as regras/CNPJs do seed-entidades-soulan. */
export const VINCULO_OPCOES: VinculoOpcao[] = [
  // Temporário — SOULAN CONSULTORIA, CNPJ por filial.
  {
    id: "TEMP_F1",
    label: "Temporário — SOULAN CONSULTORIA (filial 1) · 59.749.705/0002-30",
    tipoServico: "TEMPORARIO",
    empresaCodigo: "1",
    filial: "1",
    isFopag: false,
    entidadeNome: CONSULTORIA,
  },
  {
    id: "TEMP_F2",
    label: "Temporário — SOULAN CONSULTORIA (filial 2) · 59.749.705/0001-59",
    tipoServico: "TEMPORARIO",
    empresaCodigo: "1",
    filial: "2",
    isFopag: false,
    entidadeNome: CONSULTORIA,
  },
  {
    id: "TEMP_F4",
    label: "Temporário — SOULAN CONSULTORIA (filial 4) · 59.749.705/0004-00",
    tipoServico: "TEMPORARIO",
    empresaCodigo: "1",
    filial: "4",
    isFopag: false,
    entidadeNome: CONSULTORIA,
  },
  {
    id: "TEMP_F5",
    label: "Temporário — SOULAN CONSULTORIA (filial 5) · 59.749.705/0006-63",
    tipoServico: "TEMPORARIO",
    empresaCodigo: "1",
    filial: "5",
    isFopag: false,
    entidadeNome: CONSULTORIA,
  },
  {
    id: "TEMP_F7",
    label: "Temporário — SOULAN CONSULTORIA (filial 7) · 59.749.705/0007-44",
    tipoServico: "TEMPORARIO",
    empresaCodigo: "1",
    filial: "7",
    isFopag: false,
    entidadeNome: CONSULTORIA,
  },
  // Terceiro — SOULAN ADMINISTRAÇÃO, CNPJ por filial.
  {
    id: "TERC_F1",
    label: "Terceiro — SOULAN ADMINISTRAÇÃO (filial 1) · 59.051.086/0001-24",
    tipoServico: "TERCEIRO",
    empresaCodigo: "2",
    filial: "1",
    isFopag: false,
    entidadeNome: ADMINISTRACAO,
  },
  {
    id: "TERC_F2",
    label: "Terceiro — SOULAN ADMINISTRAÇÃO (filial 2) · 59.051.086/0001-24",
    tipoServico: "TERCEIRO",
    empresaCodigo: "2",
    filial: "2",
    isFopag: false,
    entidadeNome: ADMINISTRACAO,
  },
  {
    id: "TERC_F4",
    label: "Terceiro — SOULAN ADMINISTRAÇÃO (filial 4) · 59.051.086/0002-05",
    tipoServico: "TERCEIRO",
    empresaCodigo: "2",
    filial: "4",
    isFopag: false,
    entidadeNome: ADMINISTRACAO,
  },
  // Estágio — CNPJ fixo da CENTRAL DE ESTÁGIOS.
  {
    id: "ESTAGIO",
    label: "Estágio — SOULAN CENTRAL DE ESTÁGIOS · 02.489.512/0001-99",
    tipoServico: "ESTAGIO",
    empresaCodigo: "4",
    filial: null,
    isFopag: false,
    entidadeNome: CENTRAL_ESTAGIOS,
  },
  // Interno — CNPJ fixo da entidade.
  {
    id: "INTERNO_ADM",
    label: "Interno — SOULAN ADMINISTRAÇÃO · 59.051.086/0001-24",
    tipoServico: "INTERNO",
    empresaCodigo: "5",
    filial: null,
    isFopag: false,
    entidadeNome: ADMINISTRACAO,
  },
  {
    id: "INTERNO_NEAT",
    label: "Interno — NEAT · 11.063.100/0001-83",
    tipoServico: "INTERNO",
    empresaCodigo: "6",
    filial: null,
    isFopag: false,
    entidadeNome: NEAT,
  },
  // FOPAG — usa o CNPJ do próprio cliente.
  {
    id: "FOPAG",
    label: "FOPAG — CNPJ do próprio cliente",
    tipoServico: "FOPAG",
    empresaCodigo: "99",
    filial: null,
    isFopag: true,
    entidadeNome: null,
  },
];

/** Vínculo atual de um cliente → id da opção correspondente (para pré-selecionar no select). */
export function opcaoIdDoVinculo(v: {
  tipoServico: string | null;
  empresaCodigo: string | null;
  filial: string | null;
  isFopag: boolean;
}): string | null {
  let candidato: string | null = null;
  if (v.isFopag) candidato = "FOPAG";
  else if (v.tipoServico === "ESTAGIO") candidato = "ESTAGIO";
  else if (v.tipoServico === "INTERNO")
    candidato = v.empresaCodigo === "6" ? "INTERNO_NEAT" : "INTERNO_ADM";
  else if (v.tipoServico === "TEMPORARIO") candidato = `TEMP_F${v.filial ?? ""}`;
  else if (v.tipoServico === "TERCEIRO") candidato = `TERC_F${v.filial ?? ""}`;
  // Só retorna se for uma opção do catálogo (ex.: TERC_F10 não existe → null, sem CNPJ conhecido).
  return VINCULO_OPCOES.some((o) => o.id === candidato) ? candidato : null;
}
