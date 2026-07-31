import { Module } from "@nestjs/common";
import { GerencialController } from "./gerencial.controller";
import { GerencialService } from "./gerencial.service";

/** Painel da diretoria (OST do dashboard executivo). Só leitura agregada; nenhuma escrita. */
@Module({
  controllers: [GerencialController],
  providers: [GerencialService],
})
export class GerencialModule {}
