import { Body, Controller, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators";
import type { AuthUser } from "../auth/auth.types";
import { SalaEsperaDto, SalaEsperaStatusDto, VincularSalaDto } from "./sala-espera.dto";
import { SalaEsperaService } from "./sala-espera.service";

/**
 * SALA DE ESPERA (pré-processo, antes da Liberação Admissional).
 *
 * SEM `@Roles`, como a esteira: quem opera a Sala é o consultor, e quem ENXERGA a tela é decidido
 * pelo diretor na liberação de menu (§A.23). As mutações são reivindicadas pelos menus, então o
 * `MenuGuard` cobra a permissão sem travar por papel.
 *
 * O catálogo de status vive sob `/sala-espera/status` e é reivindicado por um menu PRÓPRIO, do
 * Gerencial: manter a lista é administração, operar a fila não.
 */
@Controller("sala-espera")
export class SalaEsperaController {
  constructor(private readonly sala: SalaEsperaService) {}

  /** Catálogo completo (inclusive inativos): a tela de manutenção do Gerencial. */
  @Get("status")
  listarStatus() {
    return this.sala.listarStatus();
  }

  /** Só os ativos: alimenta os seletores da tela da Sala. */
  @Get("status/ativos")
  listarStatusAtivos() {
    return this.sala.listarStatusAtivos();
  }

  @Post("status")
  criarStatus(@Body() dto: SalaEsperaStatusDto) {
    return this.sala.criarStatus(dto);
  }

  @Patch("status/:id")
  atualizarStatus(@Param("id") id: string, @Body() dto: SalaEsperaStatusDto) {
    return this.sala.atualizarStatus(id, dto);
  }

  /**
   * SUGESTÕES de match para uma admissão do Pandapé. Busca por CPF (identidade), telefone e nome,
   * nessa ordem de confiança. Sem critério nenhum devolve vazio, de propósito: a fila inteira aqui
   * seria convite a vincular o registro errado.
   */
  @Get("match")
  buscarParaMatch(
    @Query("cpf") cpf?: string,
    @Query("nome") nome?: string,
    @Query("telefone") telefone?: string,
  ) {
    return this.sala.buscarParaMatch({ cpf, nome, telefone });
  }

  /** O que a tela usa para PRÉ-PREENCHER (ela só preenche o que estiver vazio). */
  @Get(":id/preencher")
  dadosParaPreencher(@Param("id") id: string) {
    return this.sala.dadosParaPreencher(id);
  }

  /**
   * Vincula o registro à admissão. O registro sai da fila na MESMA transação.
   *
   * `prePreencherAdmissao` diz de QUAL porta veio o match: da Sala (true, escreve cliente e cargo
   * vazios na admissão) ou da Liberação (false, o padrão, devolve os dados ao formulário aberto e
   * não toca na admissão). Não libera nem avança fase em nenhuma das duas.
   */
  @Post(":id/vincular")
  vincular(@Param("id") id: string, @Body() dto: VincularSalaDto, @CurrentUser() user: AuthUser) {
    return this.sala.vincular(id, dto.admissaoId, user, {
      prePreencherAdmissao: dto.prePreencherAdmissao === true,
    });
  }

  /**
   * ADMISSÕES DA FILA DE LIBERAÇÃO para o match partindo da Sala. Busca por nome ou CPF; sem busca,
   * devolve a fila inteira (ela é curta por natureza). Servida aqui, e não pela rota da Liberação,
   * para quem tem o menu da Sala não depender do menu da Liberação.
   */
  @Get("admissoes-para-vincular")
  admissoesParaVincular(@Query("busca") busca?: string) {
    return this.sala.admissoesParaVincular(busca);
  }

  /**
   * A fila em três abas: o padrão é a ativa; `recorte=vinculadas` traz quem virou admissão;
   * `recorte=inativadas` traz quem parou no caminho (status terminal, sem vínculo). `recorte=todos`
   * mostra tudo. `todos=1` continua funcionando: era o parâmetro da onda 2 e não se quebra contrato de
   * quem já chama.
   */
  @Get()
  listar(@Query("recorte") recorte?: string, @Query("todos") todos?: string) {
    if (recorte === "vinculadas" || recorte === "inativadas" || recorte === "todos") {
      return this.sala.listar(recorte);
    }
    return this.sala.listar(todos === "1" ? "todos" : "aguardando");
  }

  @Post()
  criar(@Body() dto: SalaEsperaDto, @CurrentUser() user: AuthUser) {
    return this.sala.criar(dto, user);
  }

  @Put(":id")
  atualizar(@Param("id") id: string, @Body() dto: SalaEsperaDto) {
    return this.sala.atualizar(id, dto);
  }
}
