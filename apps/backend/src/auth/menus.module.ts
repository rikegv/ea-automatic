import { Global, Module } from "@nestjs/common";
import { MenuAreasService } from "./menu-areas.service";
import { MenusCatalogoService } from "./menus-catalogo.service";
import { MenusService } from "./menus.service";

/**
 * Permissão de menu (OST). Global porque três lugares consomem o MESMO serviço: o `MenuGuard`
 * (guard global, autorização por requisição), o `/auth/me` (visão da tela) e a tela de Usuários
 * (configuração). Só depende do DRIZZLE (já global), então não há acoplamento novo.
 */
@Global()
@Module({
  // `MenusCatalogoService` converge a TABELA de menus a partir do registro em código no boot, para
  // menu novo nascer listável na tela de liberação. Registra, NUNCA concede acesso (§A.23).
  // `MenuAreasService` é a FONTE da autorização por área (tabela + cache). Global junto dos demais
  // porque os DOIS guards globais o consomem, além do `/auth/me` e da tela do diretor.
  providers: [MenusService, MenusCatalogoService, MenuAreasService],
  exports: [MenusService, MenusCatalogoService, MenuAreasService],
})
export class MenusModule {}
