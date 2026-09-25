import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { portalLinks } from "../db/schema";
import { estadoDaLinha } from "../domain/portal-identidade";
import { COLUNAS_DO_LINK } from "./portal-link-colunas";
import { PortalTrilhaService } from "./portal-trilha.service";

/**
 * "O LINK AINDA ESTÁ VIVO?", A PERGUNTA DAS PORTAS DO CANDIDATO, NUM SERVIÇO INJETÁVEL.
 *
 * ┌─ POR QUE ESTE ARQUIVO NASCEU (veto F1 da auditoria da ponte do VT) ─────────────────────────┐
 * │ A ponte `portal/vt-link` chamava o emissor DIRETO, sem perguntar nada sobre a linha do link. │
 * │ O motivo mais comum de revogar é "o link foi para a pessoa errada", e era exatamente essa    │
 * │ pessoa que continuava sendo atendida por até 30 minutos, o que dura a sessão.                 │
 * │                                                                                               │
 * │ E ALI O ESTRAGO NÃO ACABA COM A SESSÃO, que é o que torna aquela porta pior que as outras: o │
 * │ produto dela é um token Ed25519 verificado OFFLINE pelo app do Firebase, que nunca contata o │
 * │ EA. Não existe revogação. Revogar o link, desligar o EA ou apagar a linha não alcança um     │
 * │ token já emitido, e ele carrega CPF e nome em claro (base64url de JSON, qualquer um decodifica│
 * │ ). A pergunta ANTES de cunhar é a única defesa que existe.                                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ╔═ NENHUMA RÉGUA NOVA NASCE AQUI, E ESSE É O PONTO INTEIRO DO ARQUIVO ════════════════════════╗
 * ║ O veredito é `estadoDaLinha` (`domain/portal-identidade.ts`), o MESMO das outras portas, e a ║
 * ║ projeção é `COLUNAS_DO_LINK` (`portal-link-colunas.ts`), a MESMA constante que as cinco      ║
 * ║ leituras espalham. Aquele arquivo escreveu, antes desta frente existir, o que se esperava da ║
 * ║ próxima porta: "a sexta porta, quando nascer, nasce certa sem ninguém lembrar". É o que este ║
 * ║ serviço faz, e é por isso que ele não tem nem um `if` sobre data: quem decide revogado,      ║
 * ║ bloqueado, suspenso e vencido continua sendo uma função só, no domínio.                      ║
 * ║                                                                                              ║
 * ║ ELE É A ÚNICA LEITURA INJETÁVEL, E NÃO A ÚNICA LEITURA (consolidação, 21/09/2026). A primeira║
 * ║ redação desta caixa dizia "a única leitura que existe", e a auditoria mostrou que era FALSO: ║
 * ║ `portal-identidade.service.ts` e `portal-credencial.service.ts` seguem com leitura própria   ║
 * ║ de `portal_links` chamando `estadoDaLinha`, e a própria suíte diz isso em voz alta ao listar ║
 * ║ QUATRO arquivos espalhando `COLUNAS_DO_LINK`. A frase importa porque cabeçalho é memória de  ║
 * ║ régua: afirmar unicidade que não existe diz ao próximo que a consolidação acabou, e ele para ║
 * ║ de procurar as outras. O que de fato acabou foi a CÓPIA DA PORTA DA TRILHA. Nasceu convivendo║
 * ║ cópia: `PortalDocumentosService` tinha a MESMA leitura num método privado (`exigirLinkVivo`).║
 * ║ As duas não divergiam (mesma função de domínio, mesma projeção), e foi exatamente por isso   ║
 * ║ que a consolidação pôde ser feita sem mudar comportamento nenhum: a porta da trilha passou a ║
 * ║ CONSUMIR este serviço, com a frase dela, e o método privado deixou de existir.               ║
 * ║                                                                                              ║
 * ║ OS DOIS TESTES QUE TRAVAVAM "A RÉGUA MORA LÁ" TRAVAM "A RÉGUA MORA AQUI" (`portal-documentos ║
 * ║ .spec.ts` e `portal-link-bloqueio.spec.ts`): a afirmação MUDOU DE ARQUIVO, não foi afrouxada,║
 * ║ e ganhou o par negativo, que o arquivo antigo NÃO voltou a ler `portal_links` por conta.     ║
 ╚══════════════════════════════════════════════════════════════════════════════════════════════╝
 */
@Injectable()
export class PortalLinkVivoService {
  private readonly log = new Logger(PortalLinkVivoService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly trilhaLog: PortalTrilhaService,
  ) {}

  /**
   * Deixa passar quando o link está vivo; recusa com `NotFoundException(mensagem)` quando não está.
   *
   * A MENSAGEM É DO CHAMADOR, E ELA TEM DE SER A MESMA DO "NÃO ENCONTRADO" DAQUELA ROTA. É a régua
   * das outras portas (itens F9 e L6): quem está com um link morto não pode descobrir por aqui se a
   * admissão existe. Por isso o texto não é escrito neste arquivo: cada porta tem a sua frase única,
   * e o que este serviço garante é que a recusa use exatamente aquela, e não uma sua.
   *
   * SEM `jtiLink` NÃO HÁ O QUE CONFERIR, e isso não é brecha: quem preenche o contexto é o
   * controller, a partir do `req.portal` escrito pelo `PortalSessaoGuard`, onde o `jti` é claim
   * OBRIGATÓRIA do bilhete assinado (`claims incompletos` recusa antes). Mesma porta de saída que o
   * `PortalDocumentosService` já usa.
   */
  async exigirVivo(
    contexto: { jtiLink?: string | null; ip?: string | null },
    mensagem: string,
  ): Promise<void> {
    const jtiLink = contexto.jtiLink;
    if (!jtiLink) return;

    const [linha] = await this.db
      // A PROJEÇÃO DO ESTADO VEM DE UM LUGAR SÓ (`COLUNAS_DO_LINK`): coluna esquecida aqui vira
      // "sem restrição" dentro de `estadoDaLinha`, e a porta fica aberta sem nada falhar.
      .select({ ...COLUNAS_DO_LINK })
      .from(portalLinks)
      .where(eq(portalLinks.id, jtiLink));

    // LINHA AUSENTE É LINK MORTO, a mesma direção segura das outras portas.
    const estado = estadoDaLinha(linha, Date.now());
    if (estado.vivo) return;

    // A recusa vai para a trilha, e no MESMO molde não fail-closed das outras: log quebrado não
    // pode transformar uma recusa em entrega. §A.6: só o `jti` e o código, nada da pessoa.
    //
    // ┌─ O MOTIVO É O DO ESTADO REAL, E ISSO FOI DEFEITO (achado S28) ─────────────────────────┐
    // │ Aqui se gravava `"EXPIRADA"` FIXO, então link REVOGADO, BLOQUEADO à mão ou SUSPENSO     │
    // │ chegava à Sala De Segurança como "expirada": a trilha dizia que o prazo acabou sobre um │
    // │ link que alguém tinha fechado de propósito. Quem nomeia agora é `motivoDoLinkMorto`, a  │
    // │ função pura do domínio que mora ao lado de `estadoDaLinha`, e não um `switch` daqui.    │
    // │                                                                                          │
    // │ `motivoCodigo` só é nulo quando o link está VIVO, e esse caminho já retornou acima. Não │
    // │ há `?? "EXPIRADA"` de propósito: um valor de segurança aqui reintroduziria, para um caso │
    // │ inalcançável, exatamente a mentira que este conserto tirou.                              │
    // └──────────────────────────────────────────────────────────────────────────────────────────┘
    try {
      await this.trilhaLog.registrar(
        "PORTAL_LINK_RECUSADO",
        { jtiLink, motivoCodigo: estado.motivoCodigo },
        contexto.ip,
      );
    } catch (erro) {
      this.log.error("falha ao registrar a recusa de uma porta do portal", erro as Error);
    }

    throw new NotFoundException(mensagem);
  }
}
