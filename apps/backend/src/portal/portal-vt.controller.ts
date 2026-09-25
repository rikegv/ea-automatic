import {
  Controller,
  Get,
  NotFoundException,
  Req,
  Res,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../auth/decorators";
import { VtLinkService } from "../vt-coleta/vt-link.service";
import { PortalLinkVivoService } from "./portal-link-vivo.service";
import { PortalSessaoGuard, type RequestComPortal } from "./portal-sessao.guard";
import { PortalTrilhaService } from "./portal-trilha.service";

/**
 * A FRASE ÚNICA DESTA PORTA, E ELA É UMA SÓ DE PROPÓSITO.
 *
 * Link morto, admissão inexistente e candidato inexistente respondem exatamente isto. Distinguir os
 * três diria, a quem está do lado de fora, o que existe na nossa base: é a mesma régua do
 * `PortalDocumentosService` (itens F9 e L6), e é por ela ser literalmente a MESMA constante nos dois
 * pontos (a recusa do link e o "não encontrado") que a igualdade não depende de ninguém lembrar.
 */
const VT_INDISPONIVEL = "Formulário de vale-transporte indisponível";

/**
 * ══ O PRAZO DO TOKEN DO CANDIDATO: HORAS, E NÃO O PRAZO DO CONSULTOR ═════════════════════════
 *
 * SEIS HORAS, e o número tem uma razão que não é gosto: **reemitir custa um clique**. O candidato
 * chega aqui pela tela da Sol, com a sessão do portal aberta; se o token do VT vencer antes de ele
 * preencher, ele volta à tela e pede outro, enquanto o link do portal dele viver. Um prazo curto
 * não fecha porta nenhuma, e um prazo longo não abre nada que o curto não abra: só aumenta a
 * janela de uma credencial que NÃO TEM REVOGAÇÃO e que carrega CPF e nome em claro.
 *
 * O CONTRASTE É O ARGUMENTO. Pelo caminho do consultor o prazo é do ambiente (`VT_LINK_TTL_DIAS`,
 * e a produção está em 30 dias, medido), porque lá o link vai por e-mail e a pessoa responde
 * quando puder. Aqui não há espera: o botão diz "abrir o formulário agora". Seis horas cobrem o
 * dia de trabalho inteiro de quem clicou e foi buscar os comprovantes de condução, e continuam
 * sendo uma fração das 72 horas do link do portal.
 *
 * ELE É CONSTANTE DE CÓDIGO, E NÃO VARIÁVEL DE AMBIENTE, pela lição que originou o veto: o prazo
 * desta porta não pode ser esticado sem alguém passar por aqui e ler este comentário.
 */
export const VT_TTL_HORAS_DO_CANDIDATO = 6;

/**
 * ══ O CONTRATO, EM TIPO LOCAL ATÉ O COORDENADOR PUBLICÁ-LO ════════════════════════════════════
 *
 * `packages/shared-types/src/index.ts` tem DONO ÚNICO (§A.39), e não é este agente. É a mesma
 * forma do `LinkVtGerado` do backend e do `LinkDoPortalGerado` do contrato, e some no dia em que
 * entrar lá.
 */
export interface LinkDoVtParaOCandidato {
  /** A URL do app externo do VT, com o token na QUERY STRING. Ver o aviso de §A.6 abaixo. */
  link: string;
  /**
   * ISO. Quando o token do VT deixa de valer.
   *
   * SEM NÚMERO ESCRITO AQUI, de propósito: esta rota emite com `VT_TTL_HORAS_DO_CANDIDATO`, e o
   * caminho do consultor emite com `VT_LINK_TTL_DIAS` do ambiente. O comentário anterior dizia
   * "7 dias" e estava errado havia tempo, porque a produção está em 30: prazo em prosa envelhece
   * calado no dia em que alguém mexe na variável, e foi exatamente isso que a auditoria mediu.
   */
  expiraEm: string;
}

/**
 * Portal do Candidato, A PONTE PARA O FORMULÁRIO DE VT. Uma rota só, e ela só devolve um endereço.
 *
 * ┌─ O QUE ESTA PONTE É, E O QUE ELA DELIBERADAMENTE NÃO É ──────────────────────────────────────┐
 * │ O formulário de VT NÃO foi trazido para dentro do Portal (decisão do diretor: um parecer     │
 * │ mediu que trazê-lo é caro). O que existe aqui é o botão: a tela da Sol pede o endereço, o    │
 * │ candidato sai para o app do VT que JÁ está em produção, preenche lá, e a varredura da coleta │
 * │ (`vt-coleta.service.ts`) dá baixa no `FORMULARIO_VT` sozinha, com autor SISTEMA, pelo mesmo  │
 * │ caminho de sempre. NADA precisou ser construído do lado da baixa, e nada foi.                │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * MESMO MOLDE DO `PortalDocumentosController`: `@Public()` porque quem opera é o CANDIDATO, que
 * não é usuário do sistema e não tem senha; `@Public()` só tira o `JwtAuthGuard` global (e, por
 * consequência, o `MenuGuard`) do caminho, e quem autoriza é o `PortalSessaoGuard` local, que
 * confere o bilhete Ed25519.
 *
 * ┌─ POR QUE ELA MORA SOB `portal/`, E NÃO SOB `esteira/` ───────────────────────────────────────┐
 * │ É a pergunta que esta frente já respondeu três vezes, e a régua é o OPERADOR, não o assunto: │
 * │ rota do CANDIDATO fica sob `portal/`, que é o prefixo que a barreira do Fernando allowlista  │
 * │ POR CAMINHO; rota do TIME fica sob `esteira/`, fora do alcance da internet                   │
 * │ (`portal-pendencias.controller.ts` mudou de prefixo por isso, e `portal-envio.controller.ts` │
 * │ saiu do `portal/` pelo motivo inverso). Quem opera esta aqui é o candidato, com a sessão     │
 * │ dele, então é `portal/`. A rota do consultor para o MESMO link continua existindo e continua │
 * │ onde estava: `POST vt-coleta/admissao/:id/gerar-link`, autenticada, intocada por esta frente.│
 * │                                                                                              │
 * │ ELA PRECISA ENTRAR NA ALLOWLIST DA BARREIRA (item F7), como as outras rotas do candidato.    │
 * │ Rota nova não avisada ao Fernando quebra em produção, em silêncio.                           │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ╔═ §A.6: ESTE LINK LEVA CPF, NOME E DATA DE NASCIMENTO NA QUERY STRING, E ISSO É O CONTRÁRIO ═╗
 * ║ DO QUE O RESTO DO PORTAL FAZ. Não é descuido, e o próximo a mexer precisa saber disso.      ║
 * ║                                                                                              ║
 * ║ O link do PORTAL carrega o token no FRAGMENTO (`#t=`), e o motivo está escrito no código: o  ║
 * ║ fragmento NÃO é enviado ao servidor, logo não cai em log de proxy, não cai na barreira e não ║
 * ║ cai no cabeçalho `Referer`. O link do VT usa `?t=` (`montarLinkVt`), e o token dele carrega  ║
 * ║ CPF, nome e um hash da data de nascimento (`ClaimsTokenVt`): uma query string viaja ao       ║
 * ║ servidor do app externo, entra no log dele, no histórico do navegador e no `Referer` da      ║
 * ║ página seguinte.                                                                             ║
 * ║                                                                                              ║
 * ║ NÃO É REGRESSÃO: o link do VT já é assim hoje, e é entregue à mão pelo consultor. O que esta ║
 * ║ rota faz é aumentar o VOLUME desse caminho e colocá-lo dentro de um produto cuja régua é a   ║
 * ║ inversa. Mudar o formato do link exigiria mexer no app do Firebase (que lê `?t=`), e isso é  ║
 * ║ outra frente, do diretor.                                                                    ║
 * ║                                                                                              ║
 * ║ O QUE ESTA CLASSE GARANTE, e é o que estava ao alcance dela:                                 ║
 * ║  · NÃO LOGA nada, em ramo nenhum, nem em erro: nem o link, nem o token, nem CPF, nome ou     ║
 * ║    data de nascimento. Não há `Logger` aqui, e a ausência é deliberada;                      ║
 * ║  · NÃO PERSISTE o link em lugar nenhum. O caminho do consultor que REGISTRA o pedido é o     ║
 * ║    registro de solicitação do time, e ele não é usado aqui: pedido do candidato para si      ║
 * ║    mesmo não é solicitação do time, e gravar uma linha por toque de botão encheria a fila    ║
 * ║    de quem opera com ruído;                                                                  ║
 * ║  · MAS DEIXA RASTRO, e isto mudou por veto da auditoria (item F4). Registro em arquivo é uma ║
 * ║    coisa, TRILHA é outra: a emissão grava `PORTAL_VT_LINK_EMITIDO` pelo mesmo caminho        ║
 * ║    sanitizado das outras portas (`montarEventoPortal`, allowlist fechada), com o `jti` do    ║
 * ║    link e o `exp` do token. Sem essa linha, um token do VT que aparecesse onde não devia era ║
 * ║    impossível de localizar: esta é a única rota do portal que emite credencial com CPF, e    ║
 * ║    era a única sem trilha. Nada do candidato atravessa a allowlist;                          ║
 * ║  · `no-store, private`, porque a resposta É uma credencial. Ela não fica em cache de proxy   ║
 * ║    nem em disco de navegador, mesmo tratamento da trilha e do arquivo da reauditoria.        ║
 * ║                                                                                              ║
 * ║ E O QUE ELA NÃO EXPÕE A MAIS: a admissão vem do BILHETE, e o CPF que entra no token é o do   ║
 * ║ candidato daquela admissão. Quem chega aqui já provou CPF e data de nascimento em            ║
 * ║ `portal/identificar`, então o token não lhe conta nada que ele já não soubesse.              ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════════════╝
 */
@Controller("portal")
export class PortalVtController {
  constructor(
    private readonly vtLink: VtLinkService,
    /** A pergunta "o link ainda está vivo?", a mesma das outras portas. Ver o veto F1. */
    private readonly linkVivo: PortalLinkVivoService,
    /** A trilha sanitizada do portal. É por ela que a emissão deixa rastro (veto F4). */
    private readonly trilha: PortalTrilhaService,
  ) {}

  /**
   * O endereço do formulário de VT DA ADMISSÃO DO BILHETE.
   *
   * SEM PARÂMETRO DE ADMISSÃO, nem opcional, nem para depuração, pela mesma razão escrita no
   * `portal-documentos.controller.ts` e com o agravante de que aqui a resposta é uma CREDENCIAL
   * COM CPF: id de admissão é adivinhável por enumeração e não é segredo, então um `?admissaoId=`
   * transformaria qualquer link válido do portal numa máquina de emitir token com o CPF alheio. A
   * admissão vem do `req.portal`, escrito pelo guard a partir do bilhete assinado, e de lugar
   * nenhum mais.
   *
   * `GET`, e não `POST`, apesar de a chamada CUNHAR um token: o verbo descreve o que a tela faz
   * (pedir um endereço) e nada é gravado no prontuário.
   *
   * CSRF NÃO SE APLICA, E O MOTIVO É A SESSÃO NÃO VIVER EM COOKIE. A auditoria corrigiu a
   * justificativa antiga, que dizia "a resposta não é legível entre origens": isso é consequência
   * do CORS e não é a defesa. A defesa é que o `PortalSessaoGuard` só aceita o bilhete no cabeçalho
   * `Authorization`, e um formulário ou uma tag de outro site não conseguem acrescentá-lo. Como o
   * navegador não anexa nada sozinho (não há cookie de sessão aqui), a requisição forjada chega sem
   * credencial e morre no guard, antes de qualquer token ser cunhado.
   *
   * A URL desta rota é fixa e não carrega dado nenhum, então ela pode aparecer em log de proxy sem
   * consequência: o que é sensível viaja no CORPO.
   */
  @Get("vt-link")
  @Public()
  @UseGuards(PortalSessaoGuard)
  async link(
    @Req() req: RequestComPortal,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LinkDoVtParaOCandidato> {
    res.set({ "Cache-Control": "no-store, private" });
    const contexto = { jtiLink: req.portal!.jtiLink, ip: this.ipDaBarreira(req) };
    try {
      // ── (1) O LINK AINDA ESTÁ VIVO? VEM ANTES DE TUDO (veto F1) ─────────────────────────────
      //
      // A MESMA RÉGUA DAS OUTRAS PORTAS, pelo mesmo `estadoDaLinha`, e com a MESMA frase de recusa.
      // Aqui ela pesa mais do que em qualquer outra: o produto desta rota é um token verificado
      // OFFLINE pelo app do Firebase, sem revogação possível. Depois de cunhado, nada o alcança.
      await this.linkVivo.exigirVivo(contexto, VT_INDISPONIVEL);

      // ── (2) SEM TRILHA, NÃO SE CUNHA ────────────────────────────────────────────────────────
      //
      // FAIL-CLOSED, no molde da emissão de credencial: conceder uma credencial irrevogável com CPF
      // dentro e não conseguir registrar que ela foi emitida é emitir sem dono. O candidato recebe
      // o mesmo 503 do canal indisponível, que é a resposta honesta (o serviço está mal
      // configurado), e nada é assinado.
      if (!this.trilha.configurada()) {
        throw new ServiceUnavailableException("trilha do portal não configurada");
      }

      // ── (3) A EMISSÃO ───────────────────────────────────────────────────────────────────────
      //
      // REUSO DIRETO, sem uma segunda assinatura de token no sistema: `gerarParaAdmissao` já
      // carrega o candidato, já assina o Ed25519, já recusa quem não tem CPF ou data de
      // nascimento e já é INERTE sem `VT_LINK_PRIVATE_KEY`. Reimplementar qualquer parte disso
      // aqui criaria um segundo emissor da mesma credencial, com régua própria para divergir.
      //
      // O PRAZO É O DESTA PORTA, em horas (veto F2), e não o do consultor, em dias.
      const gerado = await this.vtLink.gerarParaAdmissao(req.portal!.admissaoId, {
        ttlHoras: VT_TTL_HORAS_DO_CANDIDATO,
      });

      // ── (4) O RASTRO, DEPOIS DE A CREDENCIAL EXISTIR (veto F4) ──────────────────────────────
      //
      // DEPOIS, e não antes: registrar a emissão que ainda não aconteceu encheria a trilha de
      // linhas de 503 e de 422, e a pergunta que ela responde é "este token saiu daqui?".
      await this.registrarEmissao(contexto, gerado.expiraEm);

      return gerado;
    } catch (erro) {
      throw this.paraOCandidato(erro);
    }
  }

  /**
   * A LINHA QUE LOCALIZA A EMISSÃO, e só ela.
   *
   * §A.6: vai o `jti` do link do portal (de qual link saiu), o `exp` do token (até quando aquela
   * credencial vale) e o IP pelo caminho de sempre, que hasheia com sal mensal e manda o endereço
   * completo para a tabela restrita. NÃO vai o token, não vai a URL, não vai CPF nem nome: os dois
   * campos usados já estavam na allowlist de `montarEventoPortal`, que não foi alargada.
   *
   * SEM `try`, ao contrário do registro de abertura da trilha do candidato, e a assimetria é a
   * mesma da emissão de credencial: ler a própria lista não pode falhar por causa do log, mas
   * CUNHAR CREDENCIAL IRREVOGÁVEL sem conseguir registrar, sim. Na prática o `registrar` engole
   * falha de banco sozinho (vira ERRO no log dele) e só lança com o pepper ausente, que é o caso
   * que o passo (2) já barrou antes de qualquer assinatura.
   */
  private async registrarEmissao(
    contexto: { jtiLink?: string | null; ip?: string | null },
    expiraEm: string,
  ): Promise<void> {
    await this.trilha.registrar(
      "PORTAL_VT_LINK_EMITIDO",
      { jtiLink: contexto.jtiLink, exp: Math.floor(new Date(expiraEm).getTime() / 1000) },
      contexto.ip,
    );
  }

  /**
   * IP do candidato, e ele só existe se a BARREIRA o escrever. Cópia deliberada do
   * `PortalDocumentosController`, que por sua vez copiou o `PortalController`: o valor NÃO decide
   * nada, não limita e não autoriza, só alimenta a trilha, onde entra hasheado com sal mensal. Sem
   * `trust proxy`, o socket é sempre `127.0.0.1` e o `x-forwarded-for` que chega é o que o cliente
   * mandar.
   */
  private ipDaBarreira(req: RequestComPortal): string | null {
    const cabecalho = req.headers["x-forwarded-for"];
    const bruto = (Array.isArray(cabecalho) ? cabecalho[0] : cabecalho)?.split(",")[0]?.trim();
    if (!bruto) return null;
    return bruto.replace(/^::ffff:/, "").slice(0, 45);
  }

  /**
   * As recusas do emissor são escritas PARA O CONSULTOR, e esta rota fala com o CANDIDATO.
   *
   * O 503 original diz "gerador de link do VT não configurado", que é diagnóstico interno numa
   * superfície pública: conta a quem estiver do lado de fora qual variável de ambiente falta. O
   * 422 manda "completar o cadastro", coisa que o candidato não tem como fazer. Então os dois são
   * reescritos, preservando o CÓDIGO HTTP (a tela distingue por ele) e trocando só o texto.
   *
   * O 503 É O CASO REAL, e ele não é hipótese: `VT_LINK_PRIVATE_KEY` está preenchida na produção e
   * VAZIA na homologação, medido. Na 3120 esta rota responde 503, e isso é o comportamento certo:
   * não existe fallback, não se gera link sem chave e não se copia segredo de ambiente nenhum.
   *
   * O 422 é improvável AQUI, e vale dizer por quê: o candidato do portal necessariamente tem CPF e
   * data de nascimento, porque é com os dois que ele se identifica em `portal/identificar`. Ele
   * sobrevive por honestidade, para o caso de o cadastro ter sido esvaziado depois.
   *
   * §A.6: nenhuma das mensagens repete dado do candidato, e o erro original não é logado.
   */
  private paraOCandidato(erro: unknown): unknown {
    if (erro instanceof ServiceUnavailableException) {
      return new ServiceUnavailableException(
        "O formulário de vale-transporte está indisponível no momento. Fale com o RH.",
      );
    }
    if (erro instanceof UnprocessableEntityException) {
      return new UnprocessableEntityException(
        "Não foi possível abrir o formulário de vale-transporte. Fale com o RH.",
      );
    }
    // Mensagem única e sem detalhe, no molde do `cabecalho` da trilha: dizer "admissão
    // inexistente" a diferenciaria de "admissão de outro", que é o oráculo que o portal evita.
    if (erro instanceof NotFoundException) {
      return new NotFoundException(VT_INDISPONIVEL);
    }
    return erro;
  }
}
