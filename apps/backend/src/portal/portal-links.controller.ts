import { Controller, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import type { LinkDoPortalParaCopiar } from "@ea/shared-types";
import { CurrentUser } from "../auth/decorators";
import type { AuthUser } from "../auth/auth.types";
import { PortalIdentidadeService } from "./portal-identidade.service";

/**
 * O LINK DO PORTAL, lado do TIME: emitir e revogar. São rotas INTERNAS, do consultor.
 *
 * ══ SEM `@Public()`, E ESSA É A DIFERENÇA QUE IMPORTA ══════════════════════════════════════════
 *
 * As rotas do CANDIDATO (`portal/identificar`, `portal/recuperacao`, `portal/credencial`,
 * `portal/confirmar`) são `@Public()` e protegidas por guard local. Estas duas são o oposto: exigem
 * usuário autenticado do EA, passam pelo `JwtAuthGuard` global e pelo `MenuGuard`, e o
 * `@CurrentUser()` é OBRIGATÓRIO nas duas porque os itens L1 e L2 da trilha exigem `autor_id`. Link
 * emitido ou revogado sem autor é rastro pela metade, e rastro pela metade não responde "quem".
 *
 * ┌─ O CUIDADO DE INFRA, E ELE É DE VERDADE ────────────────────────────────────────────────────┐
 * │ Elas moram sob `portal/`, que é o prefixo que a BARREIRA do Fernando vai allowlistar para o  │
 * │ candidato. A allowlist combinada é POR CAMINHO (o modelo já provado no vhost da `/vt`,       │
 * │ §A.17), então `portal/links/*` fica de fora dela e nunca é alcançável pela internet. O dia   │
 * │ em que alguém escrever a allowlist por PREFIXO em vez de por caminho, estas duas rotas       │
 * │ passam a ser alcançáveis de fora, e a de emitir link é a que fabrica credencial de acesso a  │
 * │ documento de candidato. A regra de allowlist é item de conferência do pacote do Fernando,    │
 * │ não detalhe de deploy. Ver o cabeçalho de `portal-pendencias.controller.ts`, que resolveu o  │
 * │ mesmo dilema mudando de prefixo.                                                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SEM `@Roles`: emitir e revogar link é trabalho de CONSULTOR, no mesmo padrão operacional das
 * rotas de auditoria e das pendências do portal. Quem governa é o MENU (§A.23), e o menu novo nasce
 * só para o SUPER_ADMIN, com o diretor liberando quem enxerga.
 *
 * ┌─ O ENVIO POR E-MAIL NÃO MORA MAIS AQUI, E A SAÍDA DELE FOI DELIBERADA ───────────────────────┐
 * │ Os handlers do disparo nasceram nesta classe para herdar o coringa do menu (S12), e um teste │
 * │ independente mostrou o preço disso: esta classe está sob `portal/`, que é exatamente o       │
 * │ prefixo que a S10 manda evitar para rota de operação, e o disparo é a rota que EMITE E       │
 * │ ENTREGA a credencial sem ninguém precisar ver a URL. Eles foram para o                       │
 * │ `PortalEnvioController`, sob `esteira/portal/envio`, reivindicado NOMINALMENTE pelo mesmo    │
 * │ menu `portal-links`: é o que a S12 admite, e cumpre a S10 junto.                             │
 * │                                                                                              │
 * │ ESTA CLASSE VOLTOU AO QUE ERA: emitir, revogar, bloquear, desbloquear. Ela não injeta mais o │
 * │ serviço de envio, e portanto não conhece o e-mail de ninguém. A ausência do nome daquele     │
 * │ serviço NESTE ARQUIVO, inclusive em comentário, é o que o teste de RBAC mede: a varredura    │
 * │ dele lista as controllers pela MENÇÃO ao serviço, no texto cru, antes de tirar os            │
 * │ comentários. Citá-lo aqui reporia esta classe na lista das que expõem o disparo.             │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
@Controller("portal/links")
export class PortalLinksController {
  constructor(private readonly identidade: PortalIdentidadeService) {}

  /**
   * Emite o link de 72 horas para uma admissão, REVOGANDO os anteriores dela.
   *
   * ┌─ ELA DEIXOU DE CHAMAR A EMISSÃO CRUA, E ESSA É A CORREÇÃO DESTA FRENTE ────────────────────┐
   * │ `emitirLink` REVOGA SEMPRE e nunca se abstém: um clique aqui, enquanto o candidato estava  │
   * │ com o portal aberto enviando documento, matava a sessão dele EM SILÊNCIO. Nada falhava,    │
   * │ nada logava, e a tela dele morria. Esta rota passa a usar o MESMO caminho da tela nova     │
   * │ (`emitirLinkParaCopiar`), que liga a abstenção da S15: link vivo JÁ ABERTO faz a emissão   │
   * │ se abster em vez de derrubar quem está no meio do upload.                                  │
   * │                                                                                             │
   * │ A ROTA NÃO FOI REMOVIDA, FOI APONTADA (decisão do diretor): se algum consumidor que não    │
   * │ enxergamos ainda a chama, apontar conserta o comportamento dele sem quebrá-lo.             │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ O CORPO É SUPERCONJUNTO DO ANTIGO, de propósito ──────────────────────────────────────────┐
   * │ No sucesso ele continua tendo `link` e `expiraEm` (ISO), byte a byte no formato de fio de  │
   * │ antes, e ganha `gerado` e `motivo`. Quem só lia os dois primeiros continua lendo os dois   │
   * │ primeiros. Na recusa, `link` vem NULO e o motivo é EXPLÍCITO, que é o que faltava: antes   │
   * │ não havia recusa nenhuma a relatar, porque não havia recusa nenhuma.                        │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * `SEM_ADMISSAO` é a recusa por FAROL (declínio, rescisão, pré-admissão não liberada), decidida
   * dentro da porta única de escrita. `LINK_VIVO_EM_USO` é a abstenção, e ela NÃO é falha: é o
   * desfecho certo, e quem a apresentar como erro está pedindo para alguém querer desligá-la.
   *
   * A URL volta UMA vez, no corpo desta resposta, e não é persistida em claro em lugar nenhum
   * (§A.6). Quem a perder emite outra, que é barato e mata a primeira.
   */
  @Post(":admissaoId")
  async emitir(
    @Param("admissaoId", ParseUUIDPipe) admissaoId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<LinkDoPortalParaCopiar> {
    const emissao = await this.identidade.emitirLinkParaCopiar(admissaoId, user.id);

    // A RECUSA POR FAROL VEM PRIMEIRO, e ela tem campo próprio na emissão justamente para não se
    // confundir com a abstenção: ali não existe link vivo nenhum a relatar.
    if (emissao.foraDoRecorte) {
      return { gerado: false, motivo: emissao.foraDoRecorte.motivo, link: null, expiraEm: null };
    }

    if (!emissao.emitido) {
      // QUEM ESCOLHE O CÓDIGO É QUEM SE ABSTEVE, dentro da transação, que é o único lugar que
      // enxerga o estado real da linha. `LINK_VIVO_EM_USO` é o padrão de leitura, e por este
      // caminho (sem a janela de reenvio) é o único que chega aqui.
      return {
        gerado: false,
        motivo: emissao.jaAtivo?.motivo ?? "LINK_VIVO_EM_USO",
        link: null,
        expiraEm: null,
      };
    }

    return {
      gerado: true,
      motivo: null,
      link: emissao.emitido.link,
      expiraEm: emissao.emitido.expiraEm.toISOString(),
    };
  }

  /**
   * Mata um link específico. O `jti` é o id da LINHA, que é o que a tela do time já tem em mãos.
   *
   * IDEMPOTENTE: revogar o que já está revogado não move o carimbo nem grava evento novo, então o
   * rastro guardado é o da PRIMEIRA revogação e não o do último clique de quem insistiu.
   */
  @Post(":jti/revogar")
  revogar(@Param("jti", ParseUUIDPipe) jti: string, @CurrentUser() user: AuthUser) {
    return this.identidade.revogarLink(jti, user.id);
  }

  /**
   * FECHA A PORTA AGORA, SEM MATAR O LINK. Reversível, ao contrário de revogar.
   *
   * ┌─ POR QUE ESTES DOIS HANDLERS NASCEM NESTA CLASSE, E NÃO EM UMA NOVA ────────────────────────┐
   * │ O menu `portal-links` reivindica `PortalLinksController.*`, e o coringa NÃO ALCANÇA classe  │
   * │ nova: o índice do `MenuGuard` é por `Controller.handler`, então operação que nenhum menu    │
   * │ reivindica passa LIVRE. Uma classe nova para "bloquear link" nasceria alcançável por        │
   * │ QUALQUER sessão autenticada, e o que ela faz é fechar e reabrir a porta do prontuário de um │
   * │ candidato. Nascendo aqui, ela já nasce governada pelo mesmo menu de quem emite o link, que  │
   * │ é o mesmo time e o mesmo trabalho.                                                           │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O `jti` é o id da LINHA, o mesmo parâmetro da revogação. `@CurrentUser()` é OBRIGATÓRIO: autor
   * é requisito da trilha, e bloqueio sem autor é rastro pela metade.
   *
   * IDEMPOTENTE: bloquear o que já está bloqueado devolve `false` e não move carimbo nem trilha.
   */
  @Post(":jti/bloquear")
  bloquear(@Param("jti", ParseUUIDPipe) jti: string, @CurrentUser() user: AuthUser) {
    return this.identidade.bloquearLinkManualmente(jti, user.id);
  }

  /**
   * REABRE A PORTA, e zera SÓ o bloqueio.
   *
   * Link REVOGADO continua revogado e link VENCIDO continua vencido depois disto: o desbloqueio
   * não toca `revogado_em` nem `expira_em`, senão o botão de reabrir viraria uma porta de
   * ressuscitar link morto, que é o oposto do que ele é.
   */
  @Post(":jti/desbloquear")
  desbloquear(@Param("jti", ParseUUIDPipe) jti: string, @CurrentUser() user: AuthUser) {
    return this.identidade.desbloquearLink(jti, user.id);
  }
}
