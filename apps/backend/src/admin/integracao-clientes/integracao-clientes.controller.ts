import { Body, Controller, Get, Post } from "@nestjs/common";
import { ArrayMinSize, IsArray, IsBoolean, IsString } from "class-validator";
import { IntegracaoClientesService } from "./integracao-clientes.service";

export class DefinirIntegracaoDto {
  @IsArray()
  @ArrayMinSize(1, { message: "Selecione ao menos um cliente." })
  @IsString({ each: true })
  codClientes!: string[];

  /** `true` volta ao default (exige); `false` tira o cliente da frente. */
  @IsBoolean()
  exige!: boolean;
}

/**
 * Integração obrigatória POR CLIENTE (onda 5). Configuração de régua, não dado de operação: a classe
 * herda o `@Roles` do módulo de administração, como os demais cadastros, e quem enxerga a TELA é
 * decidido pelo diretor na liberação de menu (§A.23).
 */
@Controller("admin/integracao-clientes")
export class IntegracaoClientesController {
  constructor(private readonly integracao: IntegracaoClientesService) {}

  /** Clientes ativos com a exigência de cada um (a tela filtra e seleciona em memória). */
  @Get()
  listar() {
    return this.integracao.listar();
  }

  /** Marca ou desmarca a exigência para os clientes selecionados. */
  @Post()
  definir(@Body() dto: DefinirIntegracaoDto) {
    return this.integracao.definir(dto.codClientes, dto.exige);
  }
}
