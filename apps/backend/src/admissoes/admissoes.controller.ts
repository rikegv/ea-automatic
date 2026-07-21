import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser, Roles } from "../auth/decorators";
import type { AuthUser } from "../auth/auth.types";
import { parseMulti } from "../common/parse-multi";
import { AdmissoesService } from "./admissoes.service";
import { CreateAdmissaoDto } from "./dto/create-admissao.dto";
import { LiberarAdmissaoDto } from "./dto/liberar-admissao.dto";
import { LiberarEmLoteDto } from "./dto/liberar-lote.dto";
import { UpdateAdmissaoDto } from "./dto/update-admissao.dto";

// Operacional do wizard (F6/F11) e do Gerenciador (F10/F7). Autenticado, sem restrição de papel
// (esteira/gerenciador são coletivos — §A.3), EXCETO a deleção, que é destrutiva (Master/Super Admin).
@Controller("admissoes")
export class AdmissoesController {
  constructor(private readonly admissoes: AdmissoesService) {}

  /**
   * PARTE C (§A.17 etapa 4): último pacote de benefícios alocado para um cliente+cargo.
   *
   * O wizard chama ao escolher cliente e cargo, para SUGERIR o pacote (benefícios e valores) da
   * última vez. É sugestão editável: o consultor confirma ou ajusta. Par sem histórico devolve
   * lista vazia e a tela não sugere nada.
   *
   * Vem ANTES de @Get(":id") de propósito: senão "padrao-cliente-cargo" cairia na rota de id.
   */
  @Get("padrao-cliente-cargo")
  padraoClienteCargo(@Query("codCliente") codCliente: string, @Query("cargoId") cargoId: string) {
    return this.admissoes.pacotePadraoClienteCargo(codCliente, cargoId);
  }

  /** F10/F7 — Gerenciador: lista paginada com filtros, busca global e KPIs. */
  @Get()
  listar(
    @Query("q") q?: string,
    @Query("codCliente") codCliente?: string,
    @Query("cargoId") cargoId?: string,
    @Query("tipoContrato") tipoContrato?: string,
    @Query("farol") farol?: string,
    @Query("sinalizador") sinalizador?: string,
    @Query("concluido") concluido?: string,
    @Query("comPendencias") comPendencias?: string,
    @Query("emAndamento") emAndamento?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.admissoes.listar({
      q,
      codCliente: parseMulti(codCliente),
      cargoId: parseMulti(cargoId),
      tipoContrato: parseMulti(tipoContrato),
      farol: parseMulti(farol),
      sinalizador: parseMulti(sinalizador),
      concluido: concluido === "true",
      comPendencias: comPendencias === "true",
      emAndamento: emAndamento === "true",
      from,
      to,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get("candidato/:cpf")
  lookupCandidato(@Param("cpf") cpf: string) {
    return this.admissoes.lookupCandidato(cpf);
  }

  /**
   * Liberação Admissional — fila das pré-admissões (farol AGUARDANDO_LIBERACAO). Autenticado, sem
   * restrição de papel: liberar é operacional (a restrição de Master é só para RECUSAR, Parte 2).
   * Vem ANTES de @Get(":id") de propósito.
   */
  @Get("aguardando-liberacao")
  aguardandoLiberacao() {
    return this.admissoes.listarAguardandoLiberacao();
  }

  /** Liberação Admissional — fila das RECUSADAS (Parte 2). Antes de @Get(":id"). */
  @Get("recusadas")
  recusadas() {
    return this.admissoes.listarRecusadas();
  }

  /** Contagem leve de aguardando liberação (Parte 3: badge + polling do popup). Antes de @Get(":id"). */
  @Get("aguardando-liberacao/contagem")
  contagemAguardando() {
    return this.admissoes.contarAguardandoLiberacao();
  }

  /** F10 — campos editáveis (prefill do formulário de edição). */
  @Get(":id")
  obter(@Param("id") id: string) {
    return this.admissoes.obter(id);
  }

  @Post()
  create(@Body() dto: CreateAdmissaoDto, @CurrentUser() user: AuthUser) {
    return this.admissoes.create(dto, user);
  }

  /**
   * Liberação Admissional EM LOTE: mesmo cliente+cargo para N pré-admissões, cada uma nascendo pelo
   * MESMO miolo da liberação individual. SEM @Roles, espelhando a individual (liberar é fluxo
   * operacional, qualquer perfil autenticado libera; só recusar/reativar são de administração).
   *
   * DECLARADA ANTES do @Patch(":id"): o Nest casa rotas na ordem de declaração e o `:id` engoliria
   * "liberar-lote" como se fosse um id. Mesmo cuidado das rotas GET de liberação acima.
   */
  @Patch("liberar-lote")
  liberarEmLote(@Body() dto: LiberarEmLoteDto, @CurrentUser() user: AuthUser) {
    const { admissaoIds, ...campos } = dto;
    return this.admissoes.liberarEmLote(admissaoIds, campos, user);
  }

  /** F10 — edita vaga/folha + contrato/data/matrícula/farol (não toca CPF/cod_cliente). */
  @Patch(":id")
  editar(@Param("id") id: string, @Body() dto: UpdateAdmissaoDto, @CurrentUser() user: AuthUser) {
    return this.admissoes.editar(id, dto, user);
  }

  /** Liberação Admissional — atribui cliente+cargo e faz a pré-admissão nascer na esteira. */
  @Patch(":id/liberar")
  liberar(@Param("id") id: string, @Body() dto: LiberarAdmissaoDto, @CurrentUser() user: AuthUser) {
    return this.admissoes.liberar(id, dto, user);
  }

  /** Liberação Admissional Parte 2 — RECUSA (destrutivo-ish/manual): só Master/Super Admin. */
  @Patch(":id/recusar")
  @Roles("MASTER", "SUPER_ADMIN")
  recusar(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.admissoes.recusarLiberacao(id, user);
  }

  /** Liberação Admissional Parte 2 — REATIVA uma recusada (volta à fila): só Master/Super Admin. */
  @Patch(":id/reativar-recusada")
  @Roles("MASTER", "SUPER_ADMIN")
  reativarRecusada(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.admissoes.reativarRecusada(id, user);
  }

  /** F10 — deleta a admissão (ação destrutiva): só Master/Super Admin. */
  @Delete(":id")
  @Roles("MASTER", "SUPER_ADMIN")
  deletar(@Param("id") id: string) {
    return this.admissoes.deletar(id);
  }
}
