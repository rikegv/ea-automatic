import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { CurrentUser } from "../../auth/decorators";
import type { AuthUser } from "../../auth/auth.types";
import { EnviarShortlistDto } from "./shortlists.dto";
import { ShortlistsService } from "./shortlists.service";

/**
 * ─ A SHORTLIST DA VAGA (Frente E, pontos 10 e 11) ──────────────────────────────────────────────
 *
 * ┌─ A ROTA PENDURA NA VAGA, E NÃO NO CANDIDATO ─────────────────────────────────────────────────┐
 * │ Shortlist é da VAGA: "estas pessoas foram ao cliente para esta vaga". Pendurá-la no candidato │
 * │ faria a pergunta virar "em quais listas esta pessoa entrou", que é outra pergunta (legítima,  │
 * │ e não é a desta frente).                                                                       │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE UMA CONTROLLER PRÓPRIA, E NÃO MAIS DUAS ROTAS NA `VagasController` ──────────────────┐
 * │ O `MenuGuard` resolve a permissão por NOME DE CLASSE, e a `VagasController` é reivindicada    │
 * │ pelo menu `as-vagas`. Esta classe é reivindicada pelo MESMO menu (ver `domain/menus`), então  │
 * │ o alcance de permissão é idêntico e a separação NÃO afrouxa nada: ela é de TAMANHO. A         │
 * │ `VagasService` tem 4.400 linhas e é instanciada por treze specs; acrescentar a shortlist lá   │
 * │ mudaria a assinatura de construtor que todas elas usam (§A.26), sem nenhum ganho.              │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SEM `@Roles`, como as demais rotas de operação de vaga e candidato: montar e mandar a shortlist é
 * o trabalho normal do consultor COMUM, e um papel exigido aqui barraria justamente quem opera. As
 * guardas que dependem do ESTADO (a vaga está em processo? estes candidatos são desta vaga e estão
 * vivos?) moram no service, que é o único lugar que lê a linha.
 *
 * §A.6: o corpo carrega IDS de candidatura, uma data e uma frase de processo. A leitura devolve o
 * NOME de quem foi à lista (é o que uma shortlist é) e nada mais da pessoa.
 */
@Controller("as/vagas/:vagaId/shortlists")
export class ShortlistsController {
  constructor(private readonly shortlists: ShortlistsService) {}

  /** AS SHORTLISTS DESTA VAGA, na ordem do envio, com quem estava em cada uma. */
  @Get()
  listar(@Param("vagaId", ParseUUIDPipe) vagaId: string) {
    return this.shortlists.listar(vagaId);
  }

  /**
   * ENVIAR (ou REENVIAR) A SHORTLIST. Uma rota para os dois, porque é o mesmo fato: quem decide se
   * este envio é o primeiro é o SERVIDOR, contando sob a linha da vaga travada, nunca a tela.
   *
   * 409 COM `needsConfirmation` quando a PRIMEIRA lista tem menos de três candidatos. É AVISO e não
   * trava (decisão do diretor): a tela mostra a pergunta com o número e reenvia a MESMA chamada com
   * `cienteShortlistCurta: true`.
   */
  @Post()
  enviar(
    @Param("vagaId", ParseUUIDPipe) vagaId: string,
    @Body() dto: EnviarShortlistDto,
    @CurrentUser() user: AuthUser,
  ) {
    // QUEM ENVIOU vem da SESSÃO, nunca do corpo: autoria é trilha, e aceitá-la do corpo faria dela
    // um campo editável de formulário. Mesma disciplina do resto do módulo.
    return this.shortlists.enviar(vagaId, dto, user.id);
  }
}
