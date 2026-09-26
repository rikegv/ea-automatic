import { Controller, Get } from "@nestjs/common";
import { MotivosReenvioShortlistService } from "./motivos-reenvio-shortlist.service";

/**
 * ─ A LEITURA DO CATÁLOGO DE MOTIVOS DE REENVIO: ABERTA A QUALQUER AUTENTICADO ──────────────────
 *
 * CLASSE SEPARADA DA ESCRITA, E A SEPARAÇÃO É DE SEGURANÇA, NÃO DE ORGANIZAÇÃO. Tanto o `MenuGuard`
 * (que resolve por NOME DE CLASSE) quanto o `@Roles` do `RolesGuard` valem para a classe inteira:
 * uma classe só, com o `@Roles("SUPER_ADMIN")` da administração, daria 403 no seletor de motivo para
 * o consultor COMUM, que é justamente quem reenvia shortlist. É o mesmo desenho de
 * `MotivosDescarteController` contra o admin dele.
 *
 * SÓ OS ATIVOS SAEM POR AQUI. O inativo é o motivo que o diretor tirou de circulação: continua
 * existindo para a administração (e nas shortlists antigas, que apontam para ele pela FK) e não
 * volta a ser oferecido a quem está reenviando uma lista hoje.
 *
 * §A.6: nomes de motivo e um flag. Nenhum dado pessoal.
 */
@Controller("as/motivos-reenvio-shortlist")
export class MotivosReenvioShortlistController {
  constructor(private readonly motivos: MotivosReenvioShortlistService) {}

  @Get()
  listar() {
    return this.motivos.listarAtivos();
  }
}
