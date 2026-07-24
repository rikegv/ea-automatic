import { Body, Controller, Delete, Get, Post, Put, Query } from "@nestjs/common";
import { ReguaService } from "./regua.service";
import { UpsertReguaDto } from "./regua.dto";

@Controller("admin/regua")
export class ReguaController {
  constructor(private readonly regua: ReguaService) {}

  @Get()
  list(@Query("codCliente") codCliente: string, @Query("cargoId") cargoId: string) {
    return this.regua.list(codCliente, cargoId);
  }

  /**
   * Pares (cliente + cargo) usados por admissões e SEM nenhuma régua: alvo da aplicação em massa do
   * padrão. Só leitura, alimenta a confirmação na tela. Herda o @Roles da classe (administração).
   */
  @Get("pendentes-padrao")
  pendentesPadrao() {
    return this.regua.paresPendentesPadrao();
  }

  /**
   * Aplica os documentos padrão nos pares pendentes. SÓ adiciona onde não há nada: par com régua já
   * cadastrada fica intocado, nada é sobrescrito nem apagado. O alvo é recalculado no servidor, não
   * vem do cliente.
   */
  @Post("aplicar-padrao-pendentes")
  aplicarPadraoPendentes() {
    return this.regua.aplicarPadraoNosPendentes();
  }

  @Put()
  upsert(@Body() dto: UpsertReguaDto) {
    return this.regua.upsert(dto);
  }

  @Delete()
  remove(
    @Query("codCliente") codCliente: string,
    @Query("cargoId") cargoId: string,
    @Query("tipoDocumentoId") tipoDocumentoId: string,
  ) {
    return this.regua.remove(codCliente, cargoId, tipoDocumentoId);
  }

  // Inativa toda a régua de um cliente (§A.12, painel "Com régua"): devolve o cliente à lista sem régua.
  @Delete("cliente")
  removeCliente(@Query("codCliente") codCliente: string) {
    return this.regua.removeCliente(codCliente);
  }
}
