import { Controller, Get, Query } from "@nestjs/common";
import { GerencialService, type FiltrosGerencial } from "./gerencial.service";

/**
 * PAINEL DA DIRETORIA (OST do dashboard executivo). Um GET só, com o recorte inteiro na query.
 *
 * SEM `@Roles` de propósito, e a razão é a §A.23: quem enxerga o painel é decidido pelo DIRETOR, na
 * tela de permissão de menu, e o menu nasce só para o SUPER_ADMIN. Travar a controller por papel
 * tiraria dele a liberdade de conceder o painel a quem quiser (o RolesGuard barraria mesmo com o menu
 * concedido, como acontece com as telas de administração). Continua exigindo autenticação, e o que a
 * rota devolve é agregado: contagem por cliente, cargo e status, sem nenhum dado pessoal (§A.6).
 */
@Controller("gerencial")
export class GerencialController {
  constructor(private readonly gerencial: GerencialService) {}

  @Get()
  painel(
    @Query("de") de?: string,
    @Query("ate") ate?: string,
    @Query("codCliente") codCliente?: string,
    @Query("farol") farol?: string,
    @Query("contrato") contrato?: string,
    @Query("exame") exame?: string,
    @Query("cargoId") cargoId?: string,
    @Query("dia") dia?: string,
    @Query("mes") mes?: string,
    @Query("ano") ano?: string,
  ) {
    const numero = (v?: string) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    const filtros: FiltrosGerencial = {
      de: de || undefined,
      ate: ate || undefined,
      codCliente: codCliente || undefined,
      farol: farol || undefined,
      contrato: contrato || undefined,
      exame: exame || undefined,
      cargoId: cargoId || undefined,
      dia: numero(dia),
      mes: numero(mes),
      ano: numero(ano),
    };
    return this.gerencial.painel(filtros);
  }
}
