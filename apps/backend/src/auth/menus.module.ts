import { Global, Module } from "@nestjs/common";
import { MenusService } from "./menus.service";

/**
 * Permissão de menu (OST). Global porque três lugares consomem o MESMO serviço: o `MenuGuard`
 * (guard global, autorização por requisição), o `/auth/me` (visão da tela) e a tela de Usuários
 * (configuração). Só depende do DRIZZLE (já global), então não há acoplamento novo.
 */
@Global()
@Module({
  providers: [MenusService],
  exports: [MenusService],
})
export class MenusModule {}
