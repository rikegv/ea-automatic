import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { CurrentUser, Roles } from "../auth/decorators";
import type { AuthUser } from "../auth/auth.types";
import { parseMulti } from "../common/parse-multi";
import { AdmissoesService } from "./admissoes.service";
import { CreateAdmissaoDto } from "./dto/create-admissao.dto";
import { LiberarAdmissaoDto } from "./dto/liberar-admissao.dto";
import { LiberarEmLoteDto } from "./dto/liberar-lote.dto";
import { TrocarClienteDto } from "./dto/trocar-cliente.dto";
import { CorrigirCpfDto } from "./dto/corrigir-cpf.dto";
import { UpdateAdmissaoDto } from "./dto/update-admissao.dto";
import { AtualizarUniformeDto } from "./dto/atualizar-uniforme.dto";
import { AplicarMatriculasDto } from "./dto/aplicar-matriculas.dto";

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
    @Query("grupoClienteId") grupoClienteId?: string,
    @Query("projetoId") projetoId?: string,
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
    @Query("ordenarPor") ordenarPor?: string,
    @Query("direcao") direcao?: string,
  ) {
    return this.admissoes.listar({
      q,
      codCliente: parseMulti(codCliente),
      cargoId: parseMulti(cargoId),
      // GRUPO (cenário 2, etapa 4): múltiplo desde o nascimento (§A.28), pelo mesmo `parseMulti` dos
      // demais. Vazio ou ausente = sem filtro, como todos os outros.
      grupoClienteId: parseMulti(grupoClienteId),
      // PROJETO (etapa 5): múltiplo como os demais. `MATRIZ` viaja como valor e é interpretado nos
      // filtros, onde ele vira a ausência de vínculo.
      projetoId: parseMulti(projetoId),
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
      // A coluna é validada no serviço, contra a lista fechada; aqui só a direção é normalizada.
      ordenarPor,
      direcao: direcao === "asc" ? "asc" : direcao === "desc" ? "desc" : undefined,
    });
  }

  /**
   * RELATÓRIO EXPORTÁVEL DE CANDIDATOS EM XLSX (melhorias EAC, item 11c).
   *
   * MESMOS PARÂMETROS DE FILTRO DO `listar` acima, de propósito: a tela reaproveita a query string
   * que já monta para a lista e acrescenta só `colunas`, então o arquivo sai com o recorte que está
   * na tela. `page`/`pageSize` não entram, o arquivo leva o conjunto filtrado inteiro.
   *
   * ABERTO A TODO USUÁRIO AUTENTICADO (decisão do diretor): exportar é operação, não administração.
   * Sem trilha de exportação, também por decisão do diretor. Vem ANTES de @Get(":id").
   */
  @Get("relatorio")
  async relatorio(
    @Res({ passthrough: true }) res: Response,
    @Query("colunas") colunas?: string,
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
    @Query("ordenarPor") ordenarPor?: string,
    @Query("direcao") direcao?: string,
  ): Promise<StreamableFile> {
    const { buffer, nomeArquivo } = await this.admissoes.exportarRelatorio(
      {
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
        ordenarPor,
        direcao: direcao === "asc" ? "asc" : direcao === "desc" ? "desc" : undefined,
      },
      parseMulti(colunas) ?? [],
    );
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    });
    return new StreamableFile(buffer);
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
  /**
   * PRÉVIA da importação de matrículas (melhoria EAC, item 11d).
   *
   * DECLARADA ANTES do `@Patch(":id")`, pelo mesmo motivo do `liberar-lote`: o Nest casa rotas na
   * ordem de declaração, e o `:id` engoliria "matriculas" como se fosse um id de admissão. Foi
   * exatamente o que aconteceu na primeira tentativa, e o erro que aparecia era o do DTO errado. Recebe a planilha e devolve o que
   * VAI acontecer, sem gravar nada: quem casou, com a matrícula que está lá hoje, e quem ficou de
   * fora com o motivo.
   *
   * O ARQUIVO NÃO É PERSISTIDO (§A.6): é lido em memória e descartado ao fim da requisição, no mesmo
   * princípio do documento efêmero (§A.3 regra 7).
   */
  @Post("matriculas/previa")
  @UseInterceptors(FileInterceptor("file"))
  previaMatriculas(@UploadedFile() file?: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException("Envie a planilha.");
    // O BUFFER vai inteiro: quem decide se é xlsx ou csv é o serviço, pelos magic bytes.
    return this.admissoes.previaMatriculas(file.buffer);
  }

  /** Aplica as matrículas conferidas na prévia, em lote transacional com trilha. */
  @Patch("matriculas")
  aplicarMatriculas(@Body() dto: AplicarMatriculasDto, @CurrentUser() user: AuthUser) {
    return this.admissoes.aplicarMatriculas(dto.itens ?? [], user);
  }

  @Patch(":id")
  editar(@Param("id") id: string, @Body() dto: UpdateAdmissaoDto, @CurrentUser() user: AuthUser) {
    return this.admissoes.editar(id, dto, user);
  }

  /** Liberação Admissional — atribui cliente+cargo e faz a pré-admissão nascer na esteira. */
  /**
   * TROCA CLIENTE E CARGO de uma admissão em andamento (OST da correção do cliente errado).
   *
   * ROTA PRÓPRIA, e não campo no `@Patch(":id")` genérico, por dois motivos: o RBAC fica no método
   * certo (só MASTER/SUPER_ADMIN troca cliente, consultor não) e a troca tem efeitos colaterais
   * (limpar o vínculo antigo, acender o aviso de revisão, registrar a trilha) que não cabem numa
   * edição comum de campos.
   */
  @Patch(":id/trocar-cliente")
  @Roles("MASTER", "SUPER_ADMIN")
  trocarCliente(
    @Param("id") id: string,
    @Body() dto: TrocarClienteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.admissoes.trocarCliente(id, dto, user);
  }

  /**
   * ATUALIZA O UNIFORME depois da liberação (melhoria EAC, item 11b).
   *
   * ROTA PRÓPRIA e não campo no `@Patch(":id")` genérico, pelo mesmo critério da troca de cliente: a
   * escrita tem efeito colateral próprio (regravar o sinalizador, porque uniforme entra na régua de
   * pendências) e um payload que só ela usa.
   *
   * SEM `@Roles`, ao contrário da troca de cliente: corrigir tamanho de camiseta é trabalho de
   * consultor, é o que a operação faz o dia inteiro, e a trilha registra quem mudou o quê. O gate é o
   * MENU `esteira`, onde a operação está reivindicada, porque a edição vive no modal daquela tela.
   */
  @Patch(":id/uniforme")
  atualizarUniforme(
    @Param("id") id: string,
    @Body() dto: AtualizarUniformeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.admissoes.atualizarUniforme(id, dto, user);
  }

  /**
   * O consultor dá a troca por revisada e o aviso vermelho some. SEM `@Roles`: quem confere os
   * documentos é o consultor comum, e é ele quem precisa poder fechar o aviso. A ação fica na trilha
   * com o nome dele, que é o controle aqui (responsabilização, não impedimento).
   */
  @Patch(":id/troca-cliente/revisado")
  marcarTrocaRevisada(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.admissoes.marcarTrocaRevisada(id, user);
  }

  /**
   * CORRIGE O CPF da admissão (item 9, Frente B). ROTA PRÓPRIA e só MASTER/SUPER_ADMIN, pelo mesmo
   * motivo da troca de cliente: o RBAC fica no método certo e a correção reaponta a admissão para
   * outra linha de candidato, o que não cabe numa edição comum de campos.
   */
  @Patch(":id/corrigir-cpf")
  @Roles("MASTER", "SUPER_ADMIN")
  corrigirCpf(@Param("id") id: string, @Body() dto: CorrigirCpfDto, @CurrentUser() user: AuthUser) {
    return this.admissoes.corrigirCpf(id, dto, user);
  }

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
