import { Controller, Get } from "@nestjs/common";
import { MotivosDescarteService } from "./motivos-descarte.service";

/**
 * ─ A LEITURA DO CATÁLOGO DE MOTIVOS DE DESCARTE: ABERTA A QUALQUER AUTENTICADO ──────────────────
 *
 * CLASSE SEPARADA DA ESCRITA, E A SEPARAÇÃO É DE SEGURANÇA, NÃO DE ORGANIZAÇÃO. Tanto o `MenuGuard`
 * (que resolve por NOME DE CLASSE) quanto o `@Roles` do `RolesGuard` valem para a classe inteira:
 * uma classe só, com o `@Roles("SUPER_ADMIN")` da administração, daria 403 no seletor de motivo para
 * o consultor COMUM, que é justamente quem descarta candidato. É o mesmo desenho de
 * `MotivosCancelamentoVagaController` contra o admin dele.
 *
 * SEM `@Roles` AQUI, E A AUSÊNCIA É A REGRA: o consultor precisa ler a lista para preencher o
 * desfecho. O que ele NÃO pode é editar a lista, e isso mora na outra classe.
 *
 * SÓ OS ATIVOS SAEM POR AQUI. O inativo é o motivo que o diretor tirou de circulação: continua
 * existindo para a administração (e nas candidaturas antigas, que guardam o NOME) e não volta a ser
 * oferecido a quem está descartando alguém hoje.
 *
 * §A.6: nomes de motivo e um flag. Nenhum dado pessoal.
 */
@Controller("as/motivos-descarte")
export class MotivosDescarteController {
  constructor(private readonly motivos: MotivosDescarteService) {}

  @Get()
  listar() {
    return this.motivos.listarAtivos();
  }
}
