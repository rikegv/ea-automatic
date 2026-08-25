import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import {
  beneficiosCatalogo,
  cargos,
  clienteBeneficioPadrao,
  clientes,
  clinicasCatalogo,
  escalasCatalogo,
  frenteStatusCatalogo,
  motivosContratacao,
  motivosDeclinio,
  usuarios,
  reguaDocumental,
  tiposDocumento,
} from "../../db/schema";

/** Dados de referência (somente leitura) usados pelas telas — visíveis a qualquer autenticado. */
@Injectable()
export class CatalogosService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  listTiposDocumento() {
    return this.db.select().from(tiposDocumento).orderBy(asc(tiposDocumento.nome));
  }

  listFrenteStatus() {
    return this.db
      .select()
      .from(frenteStatusCatalogo)
      .orderBy(asc(frenteStatusCatalogo.tipo), asc(frenteStatusCatalogo.ordem));
  }

  /** Clientes ativos para o wizard (F6). `q` filtra (case-insensitive) razão/cnpj/operação/código. */
  listClientes(q?: string) {
    const termo = q?.trim();
    const filtro = termo
      ? and(
          eq(clientes.ativo, true),
          or(
            ilike(clientes.razaoSocial, `%${termo}%`),
            ilike(clientes.cnpj, `%${termo}%`),
            ilike(clientes.nomeOperacao, `%${termo}%`),
            ilike(clientes.codCliente, `%${termo}%`),
          ),
        )
      : eq(clientes.ativo, true);

    return this.db
      .select({
        codCliente: clientes.codCliente,
        cnpj: clientes.cnpj,
        razaoSocial: clientes.razaoSocial,
        nomeOperacao: clientes.nomeOperacao,
        empresaGrupo: clientes.empresaGrupo,
        regiao: clientes.regiao,
        descricaoRegiao: clientes.descricaoRegiao,
        beneficiosPadrao: clientes.beneficiosPadrao,
        escalaPadrao: clientes.escalaPadrao,
        enderecoPadrao: clientes.enderecoPadrao,
      })
      .from(clientes)
      .where(filtro)
      .orderBy(asc(clientes.razaoSocial));
  }

  /**
   * Clientes ATIVOS que ainda NÃO têm NENHUMA linha de régua documental (item 1). Alimenta a tela
   * de administração para sinalizar quais clientes precisam de checklist. Ordenado por razão social.
   */
  listClientesSemRegua() {
    return this.db
      .select({
        codCliente: clientes.codCliente,
        razaoSocial: clientes.razaoSocial,
        nomeOperacao: clientes.nomeOperacao,
      })
      .from(clientes)
      .where(
        and(
          eq(clientes.ativo, true),
          sql`NOT EXISTS (SELECT 1 FROM ${reguaDocumental} r WHERE r.cod_cliente = ${clientes.codCliente})`,
        ),
      )
      .orderBy(asc(clientes.razaoSocial));
  }

  /**
   * Clientes ATIVOS que JÁ têm régua documental cadastrada (§A.12, painel "Com régua"). Traz a
   * contagem de cargos distintos com checklist, para o CRUD (listar/buscar/editar/inativar). `q`
   * filtra (case-insensitive) por razão/operação/código. Ordenado por razão social.
   */
  listClientesComRegua(q?: string) {
    const termo = q?.trim();
    const filtroBusca = termo
      ? or(
          ilike(clientes.razaoSocial, `%${termo}%`),
          ilike(clientes.nomeOperacao, `%${termo}%`),
          ilike(clientes.codCliente, `%${termo}%`),
        )
      : undefined;
    return this.db
      .select({
        codCliente: clientes.codCliente,
        razaoSocial: clientes.razaoSocial,
        nomeOperacao: clientes.nomeOperacao,
        cargos: sql<number>`count(distinct ${reguaDocumental.cargoId})::int`,
      })
      .from(clientes)
      .innerJoin(reguaDocumental, eq(reguaDocumental.codCliente, clientes.codCliente))
      .where(filtroBusca ? and(eq(clientes.ativo, true), filtroBusca) : eq(clientes.ativo, true))
      .groupBy(clientes.codCliente, clientes.razaoSocial, clientes.nomeOperacao)
      .orderBy(asc(clientes.razaoSocial));
  }

  /**
   * Valores PADRÃO de VR/AM de um cliente (item 4) — só os que já foram salvos. Retorna um objeto
   * `Record<string,string>` (ex.: `{ "VR": "500,00", "AM": "300,00" }`) para pré-preencher o wizard.
   */
  async getBeneficiosPadraoCliente(codCliente: string): Promise<Record<string, string>> {
    const cod = codCliente?.trim();
    if (!cod) throw new BadRequestException("codCliente é obrigatório");
    const rows = await this.db
      .select({ beneficio: clienteBeneficioPadrao.beneficio, valor: clienteBeneficioPadrao.valor })
      .from(clienteBeneficioPadrao)
      .where(eq(clienteBeneficioPadrao.codCliente, cod));
    const out: Record<string, string> = {};
    for (const r of rows) out[r.beneficio] = r.valor;
    return out;
  }

  /** Cargos ativos para o wizard (F6). */
  listCargos() {
    return this.db
      .select({ id: cargos.id, nome: cargos.nome })
      .from(cargos)
      .where(eq(cargos.ativo, true))
      .orderBy(asc(cargos.nome));
  }

  /**
   * Cargos DISTINTOS que têm régua cadastrada para um cliente (item 1 / F6). Restringe o seletor de
   * cargo do wizard aos cargos com checklist para aquele cliente; `temRegua` sinaliza ao frontend se
   * cai no fallback (catálogo global `listCargos`) quando o cliente ainda não tem régua.
   */
  async listCargosPorCliente(
    codCliente: string,
  ): Promise<{ temRegua: boolean; cargos: { id: string; nome: string }[] }> {
    const cod = codCliente?.trim();
    if (!cod) throw new BadRequestException("codCliente é obrigatório");
    const rows = await this.db
      .selectDistinct({ id: cargos.id, nome: cargos.nome })
      .from(reguaDocumental)
      .innerJoin(cargos, eq(cargos.id, reguaDocumental.cargoId))
      .where(and(eq(reguaDocumental.codCliente, cod), eq(cargos.ativo, true)))
      .orderBy(asc(cargos.nome));
    return { temRegua: rows.length > 0, cargos: rows };
  }

  /** Régua resolvida do par (cliente + cargo) com JOIN no tipo de documento (§A.3 regra 4 / F4). */
  listRegua(codCliente: string, cargoId: string) {
    return this.db
      .select({
        tipoDocumentoId: reguaDocumental.tipoDocumentoId,
        codigo: tiposDocumento.codigo,
        nome: tiposDocumento.nome,
        exigencia: reguaDocumental.exigencia,
      })
      .from(reguaDocumental)
      .innerJoin(tiposDocumento, eq(reguaDocumental.tipoDocumentoId, tiposDocumento.id))
      .where(and(eq(reguaDocumental.codCliente, codCliente), eq(reguaDocumental.cargoId, cargoId)))
      .orderBy(asc(tiposDocumento.nome));
  }

  // ── Catálogos abertos do wizard (W2/W3/W4) ────────────────────────────────
  listMotivos() {
    return this.db
      .select({ id: motivosContratacao.id, nome: motivosContratacao.nome })
      .from(motivosContratacao)
      .where(eq(motivosContratacao.ativo, true))
      .orderBy(asc(motivosContratacao.nome));
  }

  // `exigeValor` vai junto de propósito: é a régua "este benefício precisa de quanto?", e as telas
  // que montam o pacote (wizard, Liberação, modal do Gerenciador) precisam dela para decidir se
  // mostram o campo de valor. Antes elas deduziam do NOME (constante do shared-types); agora leem o
  // CADASTRO, a mesma fonte que o backend valida.
  listBeneficios() {
    return this.db
      .select({
        id: beneficiosCatalogo.id,
        nome: beneficiosCatalogo.nome,
        exigeValor: beneficiosCatalogo.exigeValor,
      })
      .from(beneficiosCatalogo)
      .where(eq(beneficiosCatalogo.ativo, true))
      .orderBy(asc(beneficiosCatalogo.nome));
  }

  /**
   * CLÍNICAS ATIVAS (OST Onda 2, item 4): alimenta o seletor do modal de Agendamento do Exame.
   * Leitura aberta a qualquer autenticado, como os demais catálogos operacionais: quem agenda é o
   * consultor (perfil Comum), então exigir Master aqui tiraria o agendamento do ar para ele.
   */
  listClinicas() {
    return this.db
      .select({
        id: clinicasCatalogo.id,
        nome: clinicasCatalogo.nome,
        fornecedor: clinicasCatalogo.fornecedor,
        // ENDEREÇO CADASTRADO (migração 0064), para o agendamento PRÉ-PREENCHER ao escolher a
        // clínica. Ele já existia no cadastro e não saía daqui, então a tela não tinha como
        // oferecer o que o time já havia cadastrado. Nulo é comum: a maioria das clínicas ainda
        // está sem endereço, e nesse caso o campo simplesmente nasce vazio, como hoje.
        endereco: clinicasCatalogo.endereco,
      })
      .from(clinicasCatalogo)
      .where(eq(clinicasCatalogo.ativo, true))
      .orderBy(asc(clinicasCatalogo.nome));
  }

  /**
   * CONSULTORES que podem conduzir uma INTEGRAÇÃO (decisão do diretor): COMUM e MASTER, ativos.
   *
   * O SUPER ADMIN fica FORA da lista de propósito. Ele é perfil de administração do sistema, não de
   * operação da esteira, e oferecê-lo como responsável por uma integração convidaria a atribuir
   * trabalho operacional a quem não o executa.
   *
   * Autenticado e sem restrição de papel, como os demais catálogos operacionais: qualquer consultor
   * opera a aba da Integração (decisão do diretor), então qualquer um precisa montar o seletor.
   * §A.6: só id e nome, sem e-mail nem qualquer outro dado de contato.
   */
  listConsultores() {
    return this.db
      .select({ id: usuarios.id, nome: usuarios.nome })
      .from(usuarios)
      .where(and(eq(usuarios.ativo, true), inArray(usuarios.papel, ["COMUM", "MASTER"])))
      .orderBy(asc(usuarios.nome));
  }

  listEscalas() {
    return this.db
      .select({ id: escalasCatalogo.id, nome: escalasCatalogo.nome })
      .from(escalasCatalogo)
      .where(eq(escalasCatalogo.ativo, true))
      .orderBy(asc(escalasCatalogo.nome));
  }

  // Motivos de declínio ativos (catálogo motivos_declinio, o MESMO que o modal do olho exibe e a
  // admin mantém). GET aberto, como os demais catálogos operacionais: o modal do lápis (Gerenciador,
  // perfil Comum) carrega a lista para vincular o motivo ao marcar declínio (§A.14, item 3 da OST).
  listMotivosDeclinio() {
    return this.db
      .select({ id: motivosDeclinio.id, nome: motivosDeclinio.nome })
      .from(motivosDeclinio)
      .where(eq(motivosDeclinio.ativo, true))
      .orderBy(asc(motivosDeclinio.nome));
  }

  /** Acrescenta um item ao catálogo (só Master/Super Admin — guard no controller). */
  async addMotivo(nome: string) {
    return this.addCatalogo("motivo", nome);
  }
  async addBeneficio(nome: string) {
    return this.addCatalogo("beneficio", nome);
  }
  async addEscala(nome: string) {
    return this.addCatalogo("escala", nome);
  }

  private async addCatalogo(tipo: "motivo" | "beneficio" | "escala", nomeRaw: string) {
    const nome = nomeRaw?.trim();
    if (!nome) throw new BadRequestException("Nome obrigatório");
    const tabela =
      tipo === "motivo"
        ? motivosContratacao
        : tipo === "beneficio"
          ? beneficiosCatalogo
          : escalasCatalogo;
    const [row] = await this.db
      .insert(tabela)
      .values({ nome })
      .onConflictDoNothing({ target: tabela.nome })
      .returning({ id: tabela.id, nome: tabela.nome });
    if (row) return row;
    // já existia — devolve o existente.
    const [existente] = await this.db
      .select({ id: tabela.id, nome: tabela.nome })
      .from(tabela)
      .where(eq(tabela.nome, nome));
    return existente;
  }
}
