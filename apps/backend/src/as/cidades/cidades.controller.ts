import { Controller, Get, Query } from "@nestjs/common";
import type { AsCidade } from "@ea/shared-types";
import { CidadesService } from "./cidades.service";

/**
 * ─ AS CIDADES DO IBGE, POR UF. LEITURA DE CATÁLOGO, ABERTA A QUALQUER AUTENTICADO ──────────────
 *
 * NÃO É REIVINDICADA POR MENU NENHUM, e isso é deliberado, no mesmo tratamento das demais leituras
 * de catálogo do sistema (`domain/menus`: "LER catálogo é dado de TRABALHO e continua ABERTO a
 * qualquer autenticado"). Reivindicá-la fecharia o seletor de cidade da abertura de vaga para o
 * consultor COMUM, que é justamente quem abre vaga. A ausência é afirmada em
 * `cidades-menu.spec.ts`, porque ausência não se defende sozinha.
 *
 * NÃO EXISTE ESCRITA. Não há CRUD de município: a fonte é o IBGE, carregado por script
 * (`db/carga-cidades-ibge.ts`). Uma controller de administração aqui só criaria a chance de alguém
 * "corrigir" o nome de uma cidade e desmanchar o casamento com o código oficial.
 *
 * §A.6: nome de cidade, sigla de estado e um código público. Nenhum dado pessoal.
 */
@Controller("as/cidades")
export class CidadesController {
  constructor(private readonly cidades: CidadesService) {}

  /**
   * `GET /as/cidades?uf=SP`. A UF é OBRIGATÓRIA, e não um filtro opcional: sem ela a resposta seriam
   * os 5.571 municípios do país numa requisição só, que é uma lista que nenhuma tela usa (o seletor
   * encadeia estado -> cidade) e um payload que ninguém quer pagar a cada abertura de vaga.
   */
  @Get()
  listar(@Query("uf") uf: string): Promise<AsCidade[]> {
    return this.cidades.porUf(uf);
  }
}
