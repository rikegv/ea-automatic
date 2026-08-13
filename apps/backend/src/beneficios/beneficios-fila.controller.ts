import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { parseMulti } from "../common/parse-multi";
import { AvancarBeneficioDto, EditarPacoteDto } from "./beneficios-fila.dto";
import { BeneficiosFilaService } from "./beneficios-fila.service";

/**
 * BENEFÍCIOS (§A.17 etapa 4): a fila de quem tem benefício a cadastrar.
 *
 * ROTA PRÓPRIA e não um campo a mais no Gerenciador (§A.26): a pergunta é outra, o recorte é outro
 * (quem fechou o Cadastro) e o payload é outro. Uma leitura nova não alcança nada do que já funciona.
 *
 * SEM @Roles: o gate é o MENU (§A.23). O menu `beneficios-fila` nasce só para o SUPER_ADMIN, e quem
 * libera para os demais é o diretor, pela tela de menu por usuário. É o mesmo regime das telas de
 * gestão da operação.
 */
@Controller("beneficios-fila")
export class BeneficiosFilaController {
  constructor(private readonly fila: BeneficiosFilaService) {}

  @Get()
  listar(
    @Query("q") q?: string,
    @Query("codCliente") codCliente?: string,
    @Query("com") com?: string,
    @Query("sem") sem?: string,
    @Query("pacote") pacote?: string,
    @Query("aba") aba?: string,
    @Query("ordenarPor") ordenarPor?: string,
    @Query("direcao") direcao?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.fila.listar({
      q,
      // `parseMulti` é o mesmo tratamento de multi-select das demais telas: aceita repetição do
      // parâmetro e lista separada por vírgula, sem cada tela inventar o seu.
      codCliente: parseMulti(codCliente),
      com: parseMulti(com),
      sem: parseMulti(sem),
      // Valor fora do par conhecido é IGNORADO em vez de virar erro: filtro é conveniência de tela,
      // e uma URL antiga no favorito de alguém não pode derrubar a lista.
      pacote: pacote === "ESTRUTURADO" || pacote === "IMPORTADO" ? pacote : undefined,
      // Aba desconhecida cai na fila de trabalho, que é a tela que o time abre para trabalhar.
      aba: aba === "FINALIZADOS" ? "FINALIZADOS" : aba === "TODOS" ? "TODOS" : "FILA",
      // A coluna é validada no serviço, contra a lista fechada; aqui só a direção é normalizada.
      ordenarPor,
      direcao: direcao === "asc" ? "asc" : direcao === "desc" ? "desc" : undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  /**
   * AVANÇA O ESTÁGIO de uma ou de várias admissões. O MESMO endpoint serve o clique da linha e o
   * lote, porque a regra é a mesma: um id ou N ids, a régua da sequência decide quem anda.
   */
  @Post("avancar")
  avancar(@Body() dto: AvancarBeneficioDto) {
    return this.fila.avancar(dto.ids ?? [], dto.para);
  }

  /** Edita o pacote de benefícios da admissão, gravando no cadastro do candidato. */
  @Patch(":admissaoId/pacote")
  editarPacote(@Param("admissaoId") admissaoId: string, @Body() dto: EditarPacoteDto) {
    return this.fila.editarPacote(admissaoId, dto.itens ?? []);
  }
}
