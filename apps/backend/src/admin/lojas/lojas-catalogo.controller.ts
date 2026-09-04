import { Controller, Get } from "@nestjs/common";
import { LojasService } from "./lojas.service";

/**
 * CATÁLOGO GLOBAL DE LOJAS, só leitura, para o filtro de Loja da Esteira e do Gerenciador.
 *
 * CONTROLLER SEPARADO e não mais um método no `LojasController`, porque aquele é aninhado em
 * `admin/clientes/:codCliente/lojas` de propósito (a rota carrega o dono, e é isso que impede a tela
 * de mandar a loja de um cliente para outro). Este é global por natureza: as duas telas filtram por
 * loja sem ter um cliente escolhido. Misturar os dois na mesma rota diluiria aquela garantia.
 *
 * SÓ `GET`, e nunca escrita: escrita continua exigindo o cliente na URL.
 *
 * ACESSO ABERTO A QUALQUER AUTENTICADO, como o catálogo por cliente (decisão do diretor, Q3,
 * 01/09/2026) e como o catálogo de projetos que alimenta o filtro vizinho. Quem opera a Esteira é
 * perfil COMUM, e um filtro que só a administração enxerga não filtra a fila de ninguém. NADA de
 * `@Roles` e nada reivindicado em `domain/menus`: o `JwtAuthGuard` global continua exigindo sessão.
 *
 * §A.6: nome de loja e de cliente. Nenhum dado pessoal.
 */
@Controller("admin/lojas")
export class LojasCatalogoController {
  constructor(private readonly lojas: LojasService) {}

  @Get()
  listarTodasAtivas() {
    return this.lojas.listarTodasAtivas();
  }
}
