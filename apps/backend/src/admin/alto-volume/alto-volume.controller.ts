import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import type { AuthUser } from "../../auth/auth.types";
import { CurrentUser } from "../../auth/decorators";
import { AltoVolumeService } from "./alto-volume.service";
import { AltoVolumeVinculosService } from "./alto-volume-vinculos.service";
import { AltoVolumeAnaliseService } from "./alto-volume-analise.service";
import {
  AtualizarVinculoDto,
  CreateGrupoDto,
  CreateProjetoDto,
  CreateVagaDto,
  DetalharPorLojaDto,
  UpdateGrupoDto,
  UpdateProjetoDto,
  UpdateVagaDto,
  VincularAdmissaoDto,
  VincularEmLoteDto,
  RemoverVagasEmLoteDto,
  TrocarVinculosEmLoteDto,
  DesvincularEmLoteDto,
} from "./alto-volume.dto";

/**
 * ALTO VOLUME (onda 1): cadastro de projeto, grupos de entrada e vagas por cargo.
 *
 * RBAC POR OPERAÇÃO, na régua que o sistema já fixou depois do incidente da Liberação: NENHUM
 * `@Roles` em classe, LER é dado de trabalho e fica aberto a qualquer autenticado, ESCREVER é
 * governado pelo MENU (`alto-volume`, ver `domain/menus`).
 *
 * POR QUE A LEITURA NASCE ABERTA, e isto é decisão de desenho, não descuido: na onda 2 o modal da
 * Liberação vai listar os projetos do cliente para o consultor escolher. O consultor COMUM não terá
 * o menu `alto-volume` (que é do Gerencial, §A.23), então reivindicar a leitura por menu faria o
 * seletor tomar 403 na cara dele. É exatamente o que aconteceu com o dropdown do Gerador de Kit e
 * com cliente e cargo sumindo da Liberação. Aberto na leitura, fechado na escrita.
 *
 * ORDEM DAS ROTAS: as literais (`grupos/…`, `vagas/…`) vêm ANTES das de `:id`. O Nest casa na ordem
 * de declaração, e é a mesma precaução que a `AdmissoesController` documenta para `liberar-lote`.
 */
@Controller("admin/alto-volume")
export class AltoVolumeController {
  constructor(
    private readonly altoVolume: AltoVolumeService,
    private readonly vinculos: AltoVolumeVinculosService,
    private readonly analise: AltoVolumeAnaliseService,
  ) {}

  // ── Leitura (aberta a qualquer autenticado) ───────────────────────────────

  @Get()
  list() {
    return this.altoVolume.list();
  }

  /**
   * ALOCAÇÃO DE UMA ADMISSÃO EM ALTO VOLUME, lida da FICHA (item 3 da OST dos 3 itens).
   *
   * DECLARADA ANTES de `@Get(":id")` porque o Nest casa na ordem de declaração. São dois segmentos
   * (`admissao/:admissaoId`) contra um de `:id`, então não haveria colisão de qualquer forma; a
   * ordem fica pela mesma disciplina que o resto do controller já segue.
   *
   * FORA DAS OPERAÇÕES DO MENU, no mesmo regime de `analisar` e pelo mesmo motivo: o retorno é
   * rótulo de catálogo (projeto, grupo, cargo), código de cliente e a trilha do vínculo. NENHUM nome
   * de candidato e nenhum CPF, ao contrário de `listarVinculos`/`listarOrfaos`, que por isso seguem
   * fechadas. A ESCRITA (`vincular`, `desvincular`) continua reivindicada pelo menu `alto-volume`,
   * intacta: quem pode alocar é decisão do diretor (§A.23), e esta leitura não concede nada.
   */
  @Get("admissao/:admissaoId")
  alocacaoDaAdmissao(@Param("admissaoId") admissaoId: string) {
    return this.vinculos.alocacaoDaAdmissao(admissaoId);
  }

  @Get(":id")
  obter(@Param("id") id: string) {
    return this.altoVolume.obter(id);
  }

  // ── Vínculos por correção (onda 3) ────────────────────────────────────────
  //
  // ESTAS DUAS LEITURAS SÃO GATADAS POR MENU, ao contrário de `list`/`obter`, e a diferença é
  // proposital. `list`/`obter` nasceram abertas porque o seletor da Liberação precisa delas na mão
  // do consultor COMUM; estas devolvem NOME DE CANDIDATO e só servem à conferência do projeto, que é
  // tela do Gerencial. Aberto onde a operação precisa, fechado onde é PII sem uso operacional (§A.6).

  @Get(":id/vinculos")
  listarVinculos(@Param("id") id: string) {
    return this.vinculos.listarVinculos(id);
  }

  /**
   * ANÁLISE do projeto (onda 4): preenchimento por cargo, baldes, termômetro e alerta por grupo.
   * Leitura agregada, sem PII, gatada pelo mesmo menu das demais leituras de painel.
   */
  @Get(":id/analise")
  analisar(@Param("id") id: string) {
    return this.analise.analise(id);
  }

  /**
   * AS PESSOAS DE UMA LOJA no projeto, para o modal "Ver Pessoas" das duas tabelas do painel.
   *
   * A LOJA VAI POR QUERY e não por rota, porque o valor é o NOME dela (que é a chave do quadro) e
   * pode ter barra, espaço e acento. `loja` ausente é a linha "Sem Loja": quem está no projeto sem
   * loja vinculada.
   *
   * §A.6: devolve nome, cargo, data e o estado das frentes. CPF não sai daqui.
   */
  @Get(":id/lojas/pessoas")
  pessoasDaLoja(@Param("id") id: string, @Query("loja") loja?: string) {
    return this.analise.pessoasDaLoja(id, loja && loja.length > 0 ? loja : null);
  }

  @Get(":id/orfaos")
  listarOrfaos(@Param("id") id: string) {
    return this.vinculos.listarOrfaos(id);
  }

  /** Lote: declarada ANTES de `:id/vinculos` porque o Nest casa na ordem de declaração. */
  @Post(":id/vinculos/lote")
  vincularEmLote(
    @Param("id") id: string,
    @Body() dto: VincularEmLoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vinculos.vincularEmLote(id, dto, user);
  }

  @Post(":id/vinculos")
  vincular(
    @Param("id") id: string,
    @Body() dto: VincularAdmissaoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vinculos.vincular(id, dto, user);
  }

  // ── Escrita de GRUPO e VAGA (rotas literais primeiro) ─────────────────────

  @Patch("grupos/:grupoId")
  atualizarGrupo(@Param("grupoId") grupoId: string, @Body() dto: UpdateGrupoDto) {
    return this.altoVolume.atualizarGrupo(grupoId, dto);
  }

  @Delete("grupos/:grupoId")
  removerGrupo(@Param("grupoId") grupoId: string) {
    return this.altoVolume.removerGrupo(grupoId);
  }

  /**
   * DETALHA um cargo por loja: recebe a distribuição inteira e SUBSTITUI a meta daquele cargo.
   *
   * Lista vazia desfaz o detalhamento. Vai tudo de uma vez porque a operação é distribuir, não criar
   * cota a cota: parcial deixaria o cargo com dois níveis de meta no meio do caminho.
   */
  @Post(":id/cargos/:cargoId/lojas")
  detalharPorLoja(
    @Param("id") id: string,
    @Param("cargoId") cargoId: string,
    @Body() dto: DetalharPorLojaDto,
  ) {
    return this.altoVolume.detalharVagasPorLoja(id, cargoId, dto.cotas);
  }

  @Patch("vagas/:vagaId")
  atualizarVaga(@Param("vagaId") vagaId: string, @Body() dto: UpdateVagaDto) {
    return this.altoVolume.atualizarVaga(vagaId, dto);
  }

  /**
   * REMOVER VÁRIAS linhas de vagas. É `POST` e não `DELETE` porque leva a lista no corpo, e corpo em
   * `DELETE` não atravessa proxy de forma confiável. Mesmo desenho do lote de vínculos logo acima.
   */
  @Post(":id/vagas/lote/remover")
  removerVagasEmLote(@Param("id") id: string, @Body() dto: RemoverVagasEmLoteDto) {
    return this.altoVolume.removerVagasEmLote(id, dto);
  }

  @Delete("vagas/:vagaId")
  removerVaga(@Param("vagaId") vagaId: string) {
    return this.altoVolume.removerVaga(vagaId);
  }

  /**
   * TROCAR e DESVINCULAR EM MASSA (peça 4 do pacote). São `POST` pelo mesmo motivo do lote de vagas:
   * levam a lista no corpo. O `:id` é o projeto de ORIGEM, e é ele que delimita o que o lote pode
   * tocar: a tela de um projeto não mexe no vínculo de outro.
   */
  @Post(":id/vinculos/lote/trocar")
  trocarVinculosEmLote(
    @Param("id") id: string,
    @Body() dto: TrocarVinculosEmLoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vinculos.trocarEmLote(id, dto, user);
  }

  @Post(":id/vinculos/lote/desvincular")
  desvincularEmLote(@Param("id") id: string, @Body() dto: DesvincularEmLoteDto) {
    return this.vinculos.desvincularEmLote(id, dto);
  }

  /** Troca o projeto e/ou o grupo de um vínculo já existente (onda 3). */
  @Patch("vinculos/:vinculoId")
  atualizarVinculo(
    @Param("vinculoId") vinculoId: string,
    @Body() dto: AtualizarVinculoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vinculos.atualizarVinculo(vinculoId, dto, user);
  }

  /** Desvincula a admissão do projeto. A admissão não é tocada: só a linha de vínculo sai. */
  @Delete("vinculos/:vinculoId")
  desvincular(@Param("vinculoId") vinculoId: string) {
    return this.vinculos.desvincular(vinculoId);
  }

  // ── Escrita de PROJETO ────────────────────────────────────────────────────

  @Post()
  create(@Body() dto: CreateProjetoDto, @CurrentUser() user: AuthUser) {
    return this.altoVolume.create(dto, user);
  }

  @Post(":id/grupos")
  criarGrupo(@Param("id") id: string, @Body() dto: CreateGrupoDto) {
    return this.altoVolume.criarGrupo(id, dto);
  }

  @Post(":id/vagas")
  criarVaga(@Param("id") id: string, @Body() dto: CreateVagaDto) {
    return this.altoVolume.criarVaga(id, dto);
  }

  /** Reativa o projeto (volta às opções selecionáveis da liberação, onda 2). */
  @Patch(":id/reativar")
  reativar(@Param("id") id: string) {
    return this.altoVolume.reativar(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateProjetoDto) {
    return this.altoVolume.update(id, dto);
  }

  /**
   * INATIVAÇÃO (exclusão lógica). O DELETE só seta `ativo=false`: grupos, vagas e os vínculos já
   * feitos permanecem, e o projeto continua consultável. Reversível pela reativação.
   */
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.altoVolume.inativar(id);
  }
}
