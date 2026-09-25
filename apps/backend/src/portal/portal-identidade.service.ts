import { createHash, createPrivateKey, createPublicKey, randomUUID, type KeyObject } from "node:crypto";
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ThrottlerStorage } from "@nestjs/throttler";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import {
  PORTAL_FRAGMENTO_LINK,
  PORTAL_IDENTIFICACAO_NAO_CASOU,
  PORTAL_LINK_MORTO,
  type CodigoErroIdentificacao,
  type ErroDaIdentificacao,
  type LinkDoPortalGerado,
  type MotivoDeRecusaDeEnvio,
  type OrigemDeEnvioDoLink,
  type SessaoDoCandidato,
} from "@ea/shared-types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { admissoes, candidatos, portalLinks } from "../db/schema";
import {
  cunharLink,
  cunharSessao,
  decisaoDaIdentificacao,
  estadoDaLinha,
  minutosDaSessao,
  PORTAL_LINK_TTL_HORAS,
  PORTAL_SESSAO_TTL_MINUTOS,
  verificarLink,
} from "../domain/portal-identidade";
import { entregueHaPouco } from "../domain/portal-envio";
import type { PortalMotivo } from "../domain/portal-evento";
import { COLUNAS_DO_LINK } from "./portal-link-colunas";
import { PortalTrilhaService } from "./portal-trilha.service";

/**
 * O QUE A EMISSÃO DEVOLVE PARA QUEM VAI ENVIAR O LINK. Exatamente um dos dois campos vem
 * preenchido, e o outro vem nulo.
 *
 * `emitido` traz o `jti` porque quem envia precisa CARIMBAR o envio na linha e precisa saber o que
 * revogar se o e-mail não sair. `jaAtivo` é a abstenção da exigência S15: a admissão já tem link
 * vivo que o candidato JÁ ABRIU, então reemitir mataria a sessão dele no meio do upload.
 *
 * §A.6: `link` é CREDENCIAL. Ele atravessa em memória, vai para dentro do corpo do e-mail e morre
 * ali. Não é persistido, não é logado e não volta em resposta de rota de envio.
 */
export interface EmissaoParaEnvio {
  emitido: { jti: string; link: string; expiraEm: Date } | null;
  jaAtivo: {
    jti: string;
    expiraEm: Date;
    enviadoEm: Date | null;
    /**
     * POR QUE ESTA EMISSÃO SE ABSTEVE, e são DUAS abstenções diferentes, não uma.
     *
     * `LINK_VIVO_EM_USO` é o link vivo que o candidato JÁ ABRIU: reemitir mataria a sessão de
     * quem está enviando documento naquele instante. `ENVIADO_HA_POUCO` é a janela: o link está
     * vivo, ninguém abriu, e o e-mail acabou de sair, então um segundo envio revogaria a
     * mensagem que está na caixa do candidato. A frase que a tela diz é diferente nas duas.
     *
     * OPCIONAL, e o padrão de quem lê é `LINK_VIVO_EM_USO`: é o que este campo significava antes
     * de existir, e é o que os dublês desta casa continuam simulando. Quem PRODUZ a abstenção
     * (logo abaixo) sempre o preenche.
     */
    motivo?: Extract<MotivoDeRecusaDeEnvio, "LINK_VIVO_EM_USO" | "ENVIADO_HA_POUCO">;
  } | null;
}

/**
 * A IDENTIDADE DO PORTAL: o consultor emite o link, o candidato troca CPF e nascimento por uma
 * sessão curta. É a camada que tira a tela da inércia, e é a única coisa entre um link que anda
 * pelo WhatsApp e a trilha documental de uma pessoa.
 *
 * Fonte, e nada aqui foi inventado: `docs/DESENHO-PORTAL-REGRAS-DE-SEGURANCA.md`, decisões 2 (72
 * horas), 3 (o link NÃO é de uso único), 4 (revogação), 5 (5 tentativas em 15 minutos com bloqueio
 * progressivo e válvula de recuperação) e 10 (segredo próprio), mais os itens L1, L2, L3, L5, L6,
 * L7, L8, L9 e L18 do catálogo da seção 9.
 *
 * ══ A ORDEM DA IDENTIFICAÇÃO, E ELA É CONDIÇÃO DE SAÍDA DA AUDITORIA ═══════════════════════════
 *
 *   (a) limite por TOKEN, que é o balde barato. A chave é o HASH DO TOKEN INTEIRO, nunca o `jti`
 *       declarado: antes da assinatura fechar, nada aqui sabe de quem é o link;
 *   (b) assinatura, algoritmo, `typ` e `exp` do bilhete, SEMPRE, inclusive com o balde estourado;
 *   (c) só AGORA o limite por LINK (`bilhete.jti`), que é o balde que DECIDE e do qual sai a
 *       escalada que grava `suspenso_ate`;
 *   (d) a LINHA viva em `portal_links` (não revogada, não expirada, não suspensa) E do MESMO dono
 *       que o bilhete diz;
 *   (e) o limite por CPF, que RECUSA e NÃO alimenta a escalada (ver o bloco (e) do método);
 *   (f) o casamento.
 *
 * TODA DECISÃO DURÁVEL NASCE DEPOIS DE (b), E O BALDE QUE DECIDE TAMBÉM (achado S37). Suspender um
 * link é escrita, e nem a escrita nem a DECISÃO que leva a ela podem sair de campo que ninguém
 * verificou: contar no balde do `jti` declarado já era decidir por ele, porque o estouro daquele
 * balde é a única entrada da escalada.
 *
 * E A MESMA RÉGUA VALE PARA O BALDE DO CPF, que é a segunda porta da mesma família: a chave dele é
 * escolhida por CAMPO DE FORMULÁRIO, então ela RECUSA (429 de 15 minutos) e não escala. Só escalam
 * os baldes cuja chave o atacante não consegue escolher: o hash do token e o `jti` assinado.
 *
 * E ESCALAM SÓ CONTRA QUEM ERRA A CREDENCIAL (terceira rodada da mesma família). O casamento é
 * calculado ANTES de decidir a escalada, e ela é dispensada quando ele fecha: quem adivinha
 * continua sendo punido igual, porque por definição não acerta; quem é ALVO do balde global do CPF
 * acerta sempre, e era ele, de tanto insistir, que acabava com o próprio link suspenso por 24
 * horas. A resposta é o MESMO 429 nos dois ramos, e a diferença existe só dentro da trilha.
 *
 * POR QUE O CPF VEM DEPOIS DO LINK, e a primeira versão tinha isto invertido: contar por CPF antes
 * de provar que o requisitante tem link algum deixa QUALQUER UM trancar o CPF que quiser por 15
 * minutos, sem link nenhum, e o candidato legítimo bate no bloqueio do próprio CPF sem ter errado
 * nada. O balde do token é o que custa barato e o que o atacante não consegue escolher.
 *
 * ══ O QUE A AUDITORIA PRÉVIA ACHOU, E É O CONSERTO MAIS IMPORTANTE DA FRENTE ═══════════════════
 *
 * A sessão vale 30 minutos e, até aqui, NINGUÉM reconsultava a linha do link depois de emiti-la. O
 * consultor revogava às 14h00 e quem tivesse uma sessão das 13h59 continuava escrevendo no
 * armazenamento até 14h29. Conserto em duas partes: a sessão nunca dura mais que o link
 * (`minutosDaSessao`), e a LINHA passa a ser conferida também na emissão de credencial e na
 * confirmação, dentro da transação que já toma o `pg_advisory_xact_lock` por link
 * (`portal-credencial.service.ts`, `conferirLinkVivo`).
 *
 * §A.6, e é o veto V5: nem o link nem a sessão carregam CPF, nome ou data de nascimento; nenhum
 * evento da trilha leva o valor digitado; o CPF nunca é a chave do limitador, e sim o hash dele com
 * o `PORTAL_LOG_PEPPER` (segredo PRÓPRIO, decisão 10, jamais o `JWT_ACCESS_SECRET` como faz o VT).
 * O token não é persistido, não é logado e não volta em mensagem de erro: ele É a credencial.
 */

/** Decisão 5. */
const TENTATIVAS_LIMITE = 5;
const TENTATIVAS_JANELA_MS = 15 * 60_000;
const TENTATIVAS_BLOQUEIO_MS = 15 * 60_000;

/**
 * QUAL TETO MORDEU, e é vocabulário de TRILHA, não de resposta ao candidato.
 *
 * `CPF` é o balde GLOBAL por CPF, cuja chave qualquer um escolhe digitando no formulário: quem
 * aparece no evento costuma ser o ALVO, não o suspeito. `TOKEN_OU_LINK` são os baldes cuja chave o
 * atacante não consegue escolher (o hash do token inteiro e o `jti` assinado). São os dois únicos
 * estouros deste arquivo, e o tipo fechado é o que impede um terceiro nascer sem nome.
 */
type BaldeDoTeto = "CPF" | "TOKEN_OU_LINK";

/**
 * O BLOQUEIO PROGRESSIVO (a outra metade da decisão 5). O balde de 15 minutos passa sozinho, e quem
 * insiste simplesmente espera e recomeça. Contando os ESTOUROS num balde longo, o terceiro deles
 * SUSPENDE a linha do link, e a suspensão vale para qualquer CPF que tente por aquele link, que é o
 * que barra quem varre datas de nascimento trocando de CPF sem trocar de link.
 */
const ESTOUROS_ATE_SUSPENDER = 3;
const ESTOUROS_JANELA_MS = 24 * 60 * 60_000;
const SUSPENSAO_MS = 24 * 60 * 60_000;

/**
 * ══ O BALDE DA VÁLVULA DE RECUPERAÇÃO (achado S29) ═══════════════════════════════════════════
 *
 * UMA linha de trilha por LINK a cada hora. O pedido de socorro é um ato humano, e a segunda
 * vez que a mesma pessoa clica no mesmo botão não acrescenta informação nenhuma a quem vai ler o
 * log: o que o RH precisa é saber QUE aquele link pediu ajuda, não quantas vezes.
 *
 * A JANELA É LONGA DE PROPÓSITO, e mais longa que a dos outros baldes deste arquivo: aqueles
 * contam TENTATIVA (e precisam liberar o candidato legítimo depressa), este conta LINHA DE LOG (e
 * segurá-la por uma hora não tira nada de ninguém, porque a resposta ao candidato é a mesma
 * constante em todos os casos, gravando ou não).
 */
const RECUPERACAO_LINHAS_POR_JANELA = 1;
const RECUPERACAO_JANELA_MS = 60 * 60_000;

/**
 * A FORMA DO `jti`, que é o `id` de `portal_links` e portanto um UUID. Ver `jtiSemVerificar`: a
 * conferência existe porque o valor vem do payload de um token NÃO verificado e vai parar num
 * `where` sobre coluna `uuid`.
 */
const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mensagem única do teto. §A.11: sem travessão, e sem dizer quantas tentativas ainda faltavam. */
export const PORTAL_IDENTIFICACAO_BLOQUEADA =
  "Muitas tentativas. Aguarde alguns minutos e tente de novo, ou procure o RH.";

/** Resposta da válvula de recuperação. Ela não promete nada que o sistema não faça sozinho. */
export const PORTAL_RECUPERACAO_AVISO =
  "Recebemos o seu pedido. Procure o RH para conferir os seus dados e receber um link novo.";

/** Mensagem única de portal sem chave configurada. Nasce INERTE, no molde do webhook do Pandapé. */
const PORTAL_INDISPONIVEL = "Portal indisponível";

/**
 * O CORPO DO ERRO DA IDENTIFICAÇÃO, com CÓDIGO, e não só com frase.
 *
 * POR QUE O CÓDIGO EXISTE: a tela precisa DECIDIR para onde mandar o candidato, e as três falhas
 * levam a lugares diferentes. Link morto é terminal (só o RH resolve), não casou volta ao
 * formulário, bloqueado manda esperar. Sem código, a tela compara a FRASE, e frase é texto de
 * produto: muda uma vírgula e o fluxo quebra em silêncio.
 *
 * POR QUE A MENSAGEM VAI NO CORPO, e não só no `message` do erro HTTP: o cliente compartilhado do
 * frontend troca a mensagem de TODO 401 pela frase do operador ("sua sessão expirou, entre
 * novamente"), que fala de um login que o candidato não tem. Sem a frase no corpo, ele lê a frase
 * errada, medido pelo frontend contra o cliente real.
 *
 * O CÓDIGO NÃO REVELA NADA A MAIS QUE A FRASE JÁ REVELAVA, e esse é o cuidado que fecha os vetos V7
 * e F9: revogado, expirado e inexistente compartilham `LINK_MORTO`; CPF inexistente e data errada
 * compartilham `NAO_CASOU`. O recorte é exatamente o mesmo, e NÃO existe código por subcaso, nem
 * "só para depurar".
 *
 * O `message` VIAJA JUNTO, duplicado, e é de propósito: é ele que o Nest usa no log e é ele que
 * mantém os três desfechos de link morto indistinguíveis também para quem lê o erro pelo caminho
 * HTTP de sempre.
 */
function corpoDoErro(codigo: CodigoErroIdentificacao, mensagem: string): ErroDaIdentificacao & {
  message: string;
} {
  return { codigo, mensagem, message: mensagem };
}

@Injectable()
export class PortalIdentidadeService {
  private readonly log = new Logger(PortalIdentidadeService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
    private readonly trilha: PortalTrilhaService,
    @Inject(ThrottlerStorage) private readonly throttle: ThrottlerStorage,
  ) {}

  // ══ AS CHAVES ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Carrega uma chave privada Ed25519 de uma env em base64 (PEM PKCS8 numa linha só, o formato de
   * toda chave da casa).
   *
   * FAIL-CLOSED NO MOLDE DE `carregarChavePrivadaBilhete`: env ausente ou ILEGÍVEL devolve `null` e
   * NUNCA lança no boot. Um erro de formato numa variável de ambiente não pode derrubar o EA
   * inteiro; o que ele faz é a rota do portal responder 503 e nada mais.
   */
  private chavePrivada(nome: string): KeyObject | null {
    const b64 = (this.config.get<string>(nome) ?? "").trim();
    if (!b64) return null;
    try {
      const chave = createPrivateKey(Buffer.from(b64, "base64").toString("utf8"));
      // Chave que não seja Ed25519 é configuração errada, e configuração errada FECHA.
      return chave.asymmetricKeyType === "ed25519" ? chave : null;
    } catch {
      return null;
    }
  }

  /**
   * PAR PRÓPRIO DO LINK, separado do par da SESSÃO, e a separação é a razão de ser deste método.
   *
   * Com a MESMA chave assinando os dois bilhetes, o dia em que a checagem de `typ` cair numa
   * refatoração um link de 72 horas passa a valer como sessão de 72 horas e NADA falha. Com chaves
   * distintas, o mesmo descuido vira assinatura inválida, que é um erro barulhento.
   */
  private chaveDoLink(): KeyObject | null {
    return this.chavePrivada("PORTAL_LINK_PRIVATE_KEY");
  }

  /** O par que o `PortalSessaoGuard` já verifica com a `PORTAL_SESSION_PUBLIC_KEY`. */
  private chaveDaSessao(): KeyObject | null {
    return this.chavePrivada("PORTAL_SESSION_PRIVATE_KEY");
  }

  /**
   * O pepper da trilha, que é também o do limitador. SEGREDO PRÓPRIO (decisão 10), nunca o
   * `JWT_ACCESS_SECRET` que o VT reusa: o portal fica atrás de uma barreira exposta ao mundo, e
   * compartilhar segredo com a autenticação interna é um ovo a mais na mesma cesta.
   */
  private pepper(): string {
    return (this.config.get<string>("PORTAL_LOG_PEPPER") ?? "").trim();
  }

  // ══ EMITIR O LINK (rota do TIME) ════════════════════════════════════════════════════════════

  /**
   * Emite o link pessoal de 72 horas e REVOGA os anteriores da mesma admissão.
   *
   * A REVOGAÇÃO DOS ANTERIORES É O PONTO, e não a emissão: sem ela, o link de ontem que vazou no
   * grupo da família continua valendo, e o botão de revogar vira decoração. Ela acontece ANTES do
   * `insert`, na mesma transação, porque revogar depois apagaria o link recém criado ou dependeria
   * de um carimbo que o poupasse, que é uma condição a mais para estar errada.
   *
   * §A.6: devolve a URL UMA vez e não a persiste em claro em lugar nenhum. O token vai no FRAGMENTO
   * da URL (`#t=`), que o navegador NÃO manda ao servidor: assim ele não aparece no log de acesso
   * do proxy, nem no da barreira, nem no `Referer` de nenhuma página seguinte.
   */
  async emitirLink(admissaoId: string, autorId: string): Promise<LinkDoPortalGerado> {
    /*
     * ┌─ POR QUE ESTA PORTA CARIMBA `ENTREGA_A_MAO`, E NÃO `MANUAL` ───────────────────────────────┐
     * │ Este é o botão de "gerar link": ele devolve a URL UMA vez para o consultor entregar por    │
     * │ fora (WhatsApp, pessoalmente), e NÃO manda e-mail nenhum. `MANUAL` já quer dizer outra     │
     * │ coisa, "o RH enviou por e-mail pelo Gerenciador", e juntar as duas na mesma palavra        │
     * │ apagaria justamente a diferença que a coluna de origem existe para mostrar.                 │
     * │                                                                                            │
     * │ E O CARIMBO NÃO É `enviado_em`: nada foi enviado. A linha nasce com ORIGEM e sem carimbo   │
     * │ de envio, que é o retrato honesto de "o sistema gerou, alguém entregou". Escrever o        │
     * │ carimbo aqui também ligaria a janela de reenvio (`enviadoHaPouco`) para um e-mail que      │
     * │ ninguém mandou, bloqueando um envio legítimo logo em seguida.                               │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const saida = await this.emitirComTrava(admissaoId, autorId, false, "ENTREGA_A_MAO");
    if (!saida.emitido) {
      // INALCANÇÁVEL POR CONSTRUÇÃO: com `recusarSeJaAcessado` falso, a emissão nunca se abstém.
      // A guarda existe para que o dia em que alguém inverter o padrão do parâmetro vire uma falha
      // ruidosa, e não um `undefined` viajando dentro de uma URL entregue ao candidato.
      throw new ServiceUnavailableException(PORTAL_INDISPONIVEL);
    }
    return { link: saida.emitido.link, expiraEm: saida.emitido.expiraEm.toISOString() };
  }

  /**
   * A MESMA EMISSÃO, PARA QUEM VAI ENVIAR O LINK, e ela devolve o `jti` e pode SE ABSTER.
   *
   * ┌─ POR QUE O ENVIO NÃO PODE CHAMAR O `emitirLink` DE CIMA ────────────────────────────────────┐
   * │ Duas diferenças, e as duas são de segurança:                                                │
   * │                                                                                             │
   * │ 1. O `jti`. Quem envia precisa dele para CARIMBAR o envio na linha e para revogar o link     │
   * │    recém-emitido se o e-mail não sair. `LinkDoPortalGerado` devolve só a URL e o prazo, de   │
   * │    propósito (é o contrato que vai para a TELA, e o `jti` não tem por que ir para lá).       │
   * │                                                                                             │
   * │ 2. A ABSTENÇÃO (exigência S15 da auditoria). `emitirLink` REVOGA todos os links vivos da     │
   * │    admissão, sempre. Um envio automático disparado sobre uma admissão cujo candidato ESTÁ    │
   * │    enviando documento naquele instante mataria a sessão dele no meio do upload, sem aviso e  │
   * │    sem nada falhar. Com `recusarSeJaAcessado`, a emissão se abstém e devolve o link vivo que │
   * │    já existe, e quem chama reporta "esta pessoa já tem link e já entrou por ele".            │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A ABSTENÇÃO É DECIDIDA DENTRO DA TRAVA, e é isso que a torna correta: perguntar "já tem link
   * acessado?" fora da transação responderia sobre um instante anterior ao da escrita, e dois
   * cliques simultâneos passariam os dois pela pergunta antes de qualquer um deles inserir.
   */
  async emitirLinkParaEnvio(admissaoId: string, autorId: string): Promise<EmissaoParaEnvio> {
    /*
     * ORIGEM NULA NO NASCIMENTO, e é deliberado: por este caminho a origem só se sabe quando o
     * e-mail SAI, e quem a carimba é `marcarEnvioDoLink`, depois de o correio aceitar a mensagem.
     * Gravá-la aqui diria "enviado por e-mail" sobre um link que ainda pode nem ser entregue (e
     * que, nesse caso, é revogado pelo serviço de envio).
     */
    return this.emitirComTrava(admissaoId, autorId, true, null);
  }

  private async emitirComTrava(
    admissaoId: string,
    autorId: string,
    recusarSeJaAcessado: boolean,
    origemDoNascimento: OrigemDeEnvioDoLink | null,
  ): Promise<EmissaoParaEnvio> {
    const chave = this.chaveDoLink();
    if (!chave || !this.pepper()) {
      // Nasce INERTE: sem chave e sem pepper a rota se recusa a emitir, como o webhook do Pandapé
      // se recusa sem token (§A.5). Emitir link que ninguém consegue verificar é pior que não
      // emitir, porque o consultor o manda ao candidato e descobre na hora errada.
      this.log.warn("emissao de link do portal recusada: chave ou pepper ausentes");
      throw new ServiceUnavailableException(PORTAL_INDISPONIVEL);
    }

    const [admissao] = await this.db
      .select({ id: admissoes.id })
      .from(admissoes)
      .where(eq(admissoes.id, admissaoId))
      .limit(1);
    if (!admissao) throw new NotFoundException("Admissão não encontrada");

    const agora = new Date();
    const expiraEm = new Date(agora.getTime() + PORTAL_LINK_TTL_HORAS * 3_600_000);
    // O `jti` É O ID DA LINHA, sorteado aqui e gravado como chave primária. Deixar o banco sortear
    // obrigaria a assinar o bilhete depois do `insert`, e aí um erro na assinatura deixaria linha
    // viva sem token nenhum apontando para ela.
    const jti = randomUUID();

    const resultado = await this.db.transaction(async (tx) => {
      // A TRAVA, E ELA É A MESMA FAMÍLIA DA EMISSÃO DE CREDENCIAL (`portal-credencial.service.ts`):
      // `pg_advisory_xact_lock`, no SERVIDOR Postgres, então ela serializa duas INSTÂNCIAS do
      // backend e não só duas requisições do mesmo processo, e o Postgres a solta sozinho no commit
      // ou no rollback. A CHAVE É A ADMISSÃO, porque é por admissão que a revogação varre.
      //
      // O FURO QUE ISTO FECHA: dois cliques simultâneos em "gerar link" da MESMA admissão revogavam
      // o MESMO conjunto (nenhum dos dois enxergava a linha que o outro ainda não tinha inserido) e
      // inseriam duas linhas. A admissão terminava com DOIS links vivos, enquanto o consultor
      // acreditava que o novo tinha matado o anterior, que é exatamente a promessa da decisão 4.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${admissaoId}, 0))`);

      /*
       * A ABSTENÇÃO DA S15, E ELA MORA AQUI DENTRO, sob a MESMA trava que a revogação usa.
       *
       * O RECORTE É ESTREITO DE PROPÓSITO: só se abstém quando o link é VIVO (nada de revogado,
       * bloqueado, suspenso ou vencido) E JÁ FOI ABERTO (`primeiro_acesso_em`). Link vivo que
       * ninguém abriu NÃO impede a reemissão: reenviar para quem não recebeu é justamente o gesto
       * que a operação precisa, e ali não há sessão de upload a derrubar.
       *
       * `estadoDaLinha` é quem decide o que é vivo, e não uma segunda régua escrita aqui: as
       * colunas vêm de `COLUNAS_DO_LINK`, pelo motivo que aquele arquivo explica.
       */
      if (recusarSeJaAcessado) {
        const naoRevogados = await tx
          .select({
            ...COLUNAS_DO_LINK,
            id: portalLinks.id,
            enviadoEm: portalLinks.enviadoEm,
            // `criado_em` ENTROU AQUI COM A CORREÇÃO DO ACHADO 14, e é o que faz a janela cobrir
            // também o link entregue À MÃO (que nasce sem `enviado_em` de propósito). Ver o bloco
            // de `JANELA_DE_REENVIO_MS`, em `domain/portal-envio.ts`.
            criadoEm: portalLinks.criadoEm,
            primeiroAcessoEm: portalLinks.primeiroAcessoEm,
          })
          .from(portalLinks)
          .where(and(eq(portalLinks.admissaoId, admissaoId), isNull(portalLinks.revogadoEm)));

        const vivoEAcessado = naoRevogados.find(
          (linha) => linha.primeiroAcessoEm !== null && estadoDaLinha(linha, agora.getTime()).vivo,
        );
        if (vivoEAcessado) {
          return {
            emitido: null,
            jaAtivo: {
              jti: vivoEAcessado.id,
              expiraEm: vivoEAcessado.expiraEm,
              enviadoEm: vivoEAcessado.enviadoEm ?? null,
              motivo: "LINK_VIVO_EM_USO" as const,
            },
            revogados: [] as { id: string }[],
          };
        }

        /*
         * A JANELA CURTA (item b da S15), E ELA MORA AQUI DENTRO PELO MESMO MOTIVO DA DE CIMA.
         *
         * Decidida DENTRO da transação, sob a MESMA `pg_advisory_xact_lock` por admissão: fora
         * dela, a pergunta "já mandei agora há pouco?" responderia sobre um instante ANTERIOR à
         * escrita, e dois cliques simultâneos passariam os DOIS pela pergunta antes de qualquer um
         * deles carimbar. Era exatamente esse o furo que a trava fechou para a revogação, e a
         * decisão nova não podia nascer do lado de fora dela.
         *
         * O RECORTE: link VIVO (o estado sai de `estadoDaLinha`, nunca de uma régua nova), AINDA
         * NÃO ABERTO (o já aberto é o caso de cima, com frase própria) e ENTREGUE dentro de
         * `JANELA_DE_REENVIO_MS`. Fora disso, reemite: reenviar para quem não recebeu continua
         * sendo o gesto mais comum da operação, e a janela não pode custá-lo.
         *
         * "ENTREGUE", E NÃO "ENVIADO POR E-MAIL" (correção do achado 14). O critério era
         * `enviado_em`, carimbo que SÓ o caminho do e-mail escreve, e por isso gerar o link à mão
         * e clicar em "enviar por e-mail" segundos depois matava a URL que o consultor tinha
         * acabado de entregar, com os dois botões lado a lado na tela. `entregueHaPouco` olha o
         * instante da ENTREGA (`enviado_em` quando existe, `criado_em` quando não), que é o mesmo
         * para as duas portas. O PORQUÊ inteiro, com a segunda corrida que isto fecha, está em
         * `JANELA_DE_REENVIO_MS`.
         *
         * A JANELA CONTINUA VALENDO SÓ PARA QUEM PEDE (`recusarSeJaAcessado`), que é o ENVIO. O
         * "gerar link" passa direto e segue sendo a válvula de escape de quando algo trava.
         */
        const enviadoAgoraMesmo = naoRevogados.find(
          (linha) =>
            linha.primeiroAcessoEm === null &&
            estadoDaLinha(linha, agora.getTime()).vivo &&
            entregueHaPouco(linha, agora.getTime()),
        );
        if (enviadoAgoraMesmo) {
          return {
            emitido: null,
            jaAtivo: {
              jti: enviadoAgoraMesmo.id,
              expiraEm: enviadoAgoraMesmo.expiraEm,
              enviadoEm: enviadoAgoraMesmo.enviadoEm ?? null,
              motivo: "ENVIADO_HA_POUCO" as const,
            },
            revogados: [] as { id: string }[],
          };
        }
      }

      const mortos = await tx
        .update(portalLinks)
        .set({ revogadoEm: agora, revogadoPorId: autorId })
        .where(and(eq(portalLinks.admissaoId, admissaoId), isNull(portalLinks.revogadoEm)))
        .returning({ id: portalLinks.id });

      await tx.insert(portalLinks).values({
        id: jti,
        admissaoId,
        criadoPorId: autorId,
        expiraEm,
        // Ver a nota de `emitirLink`: `ENTREGA_A_MAO` pela porta do "gerar link", NULO pela porta
        // do envio (lá quem carimba é `marcarEnvioDoLink`, depois de a mensagem sair).
        envioOrigem: origemDoNascimento,
      });

      return { emitido: true as const, jaAtivo: null, revogados: mortos ?? [] };
    });

    if (!resultado.emitido) {
      // NADA FOI EMITIDO E NADA FOI REVOGADO, então NADA vai para a trilha: a abstenção é um
      // não-evento, e registrá-la encheria o log de "não fiz nada" a cada clique repetido.
      return { emitido: null, jaAtivo: resultado.jaAtivo };
    }

    const token = cunharLink(
      { admissaoId, jti, agoraMs: agora.getTime(), ttlHoras: PORTAL_LINK_TTL_HORAS },
      chave,
    );

    // Item L2. Código PRÓPRIO para a substituição: contar como revogação deliberada o que é rotina
    // de reenvio inflaria justamente o número que sinaliza incidente.
    for (const morto of resultado.revogados) {
      await this.trilha.registrar("PORTAL_LINK_REVOGADO", {
        jtiLink: morto.id,
        autorId,
        motivoCodigo: "SUBSTITUIDO",
      });
    }

    // Item L1. Vai o autor e o prazo; NUNCA o token, que é credencial.
    await this.trilha.registrar("PORTAL_LINK_EMITIDO", {
      jtiLink: jti,
      autorId,
      exp: Math.floor(expiraEm.getTime() / 1000),
    });

    return { emitido: { jti, link: this.urlDoLink(token), expiraEm }, jaAtivo: null };
  }

  /**
   * CARIMBA O ENVIO NA LINHA DO LINK (migration 0122) e registra a trilha.
   *
   * ┌─ POR QUE ELE MORA NESTE ARQUIVO, E NÃO NO SERVIÇO DE ENVIO ────────────────────────────────┐
   * │ `portal_links` tem UM ponto de escrita, e é este arquivo. A auditoria enumerou as sete      │
   * │ escritas que existiam justamente para poder afirmar que não há outra, e essa afirmação é o  │
   * │ que torna auditável a régua de "o que pode ser gravado sobre um link". Um `update` no       │
   * │ serviço de envio abriria a OITAVA porta, num arquivo que também sabe o e-mail do candidato, │
   * │ e a próxima pessoa a mexer lá teria um `update` em `portal_links` ao alcance da mão, a uma  │
   * │ linha de distância de gravar o destino junto (que é o veto S6).                             │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * §A.6: grava CARIMBO, CANAL, ORIGEM e AUTOR. Nenhum endereço, nenhuma URL, nenhum CPF. A trilha
   * leva ainda menos: `jti`, autor e origem, todos já permitidos pela allowlist fechada.
   *
   * SEM GUARDA DE IDEMPOTÊNCIA aqui, e é deliberado: o chamador só carimba DEPOIS de o correio
   * aceitar a mensagem, e cada envio aceito é um envio de verdade. Reescrever o carimbo é a
   * resposta certa para o reenvio, porque a pergunta que a coluna responde é "quando saiu o
   * ÚLTIMO", que é o que o consultor precisa saber antes de mandar de novo.
   */
  async marcarEnvioDoLink(
    jti: string,
    envio: { canal: string; origem: string; autorId: string; quando?: Date },
  ): Promise<void> {
    await this.db
      .update(portalLinks)
      .set({
        enviadoEm: envio.quando ?? new Date(),
        envioCanal: envio.canal,
        envioOrigem: envio.origem,
        enviadoPorId: envio.autorId,
      })
      .where(eq(portalLinks.id, jti));

    await this.trilha.registrar("PORTAL_LINK_ENVIADO", {
      jtiLink: jti,
      autorId: envio.autorId,
      origem: envio.origem,
    });
  }

  /**
   * MATA TODOS OS LINKS VIVOS DE UMA ADMISSÃO, com um motivo próprio.
   *
   * Existe para os dois desfechos que o envio criou e que não têm `jti` na mão de quem os provoca:
   * a REVERSÃO do "enviar para admissão" no funil de A&S (o consultor desfez, então o prontuário
   * não deve continuar aberto para coleta) e, no caminho de falha, a limpeza defensiva.
   *
   * O MOTIVO É PARÂMETRO E NÃO TEM PADRÃO, de propósito: quem revoga tem de dizer por quê, e a
   * Sala De Segurança conta revogação por código. Um padrão silencioso faria toda revogação nova
   * cair em `REVOGADO_MANUAL` e inflar justamente o número que sinaliza incidente.
   */
  async revogarLinksDaAdmissao(
    admissaoId: string,
    autorId: string,
    motivoCodigo: PortalMotivo,
  ): Promise<number> {
    const mortos = await this.db
      .update(portalLinks)
      .set({ revogadoEm: new Date(), revogadoPorId: autorId })
      .where(and(eq(portalLinks.admissaoId, admissaoId), isNull(portalLinks.revogadoEm)))
      .returning({ id: portalLinks.id });

    for (const morto of mortos ?? []) {
      await this.trilha.registrar("PORTAL_LINK_REVOGADO", { jtiLink: morto.id, autorId, motivoCodigo });
    }
    return mortos?.length ?? 0;
  }

  /**
   * Revogação manual (item L2, decisão 4). Idempotente: revogar o que já está revogado não move o
   * carimbo, então o rastro guardado é o da PRIMEIRA revogação e não o do último clique.
   */
  async revogarLink(
    jti: string,
    autorId: string,
    /*
     * O MOTIVO É PARÂMETRO, COM O PADRÃO ANTIGO, e o padrão é o que torna o acréscimo inócuo para
     * a rota que já existe: o botão "revogar" do Gerenciador continua gravando `REVOGADO_MANUAL`,
     * letra por letra como antes. Quem precisa de outro código é o ENVIO, que revoga o link
     * recém-emitido quando o e-mail não sai: contar isso como revogação deliberada inflaria
     * justamente o número que sinaliza incidente, que é a mesma razão pela qual `SUBSTITUIDO`
     * nasceu separado.
     */
    motivoCodigo: PortalMotivo = "REVOGADO_MANUAL",
  ): Promise<{ revogado: boolean }> {
    const revogados = await this.db
      .update(portalLinks)
      .set({ revogadoEm: new Date(), revogadoPorId: autorId })
      .where(and(eq(portalLinks.id, jti), isNull(portalLinks.revogadoEm)))
      .returning({ id: portalLinks.id });

    const revogado = (revogados?.length ?? 0) > 0;
    if (revogado) {
      await this.trilha.registrar("PORTAL_LINK_REVOGADO", { jtiLink: jti, autorId, motivoCodigo });
    }
    return { revogado };
  }

  /**
   * BLOQUEAR O LINK, À MÃO E DE FORMA REVERSÍVEL (pedido do diretor na 2a rodada do gerenciador).
   *
   * ┌─ POR QUE NÃO É UMA REVOGAÇÃO ───────────────────────────────────────────────────────────────┐
   * │ Revogar é TERMINAL, e desbloquear uma revogação obrigaria a EMITIR OUTRO LINK: a URL que o  │
   * │ candidato tem no WhatsApp mudaria, e é exatamente isso que o pedido existe para evitar. Aqui │
   * │ a porta fecha agora e reabre depois, com o mesmo link na mão da pessoa.                      │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O NOME É `bloquearLinkManualmente` E NÃO `bloquear` porque `bloquear` JÁ EXISTE neste arquivo,
   * e é outra coisa: a suspensão automática do bloqueio progressivo, que tem data de fim e passa
   * sozinha. Duas operações diferentes com o mesmo nome é o começo de alguém chamar a errada.
   *
   * IDEMPOTENTE, no molde de `revogarLink`: bloquear o que já está bloqueado não move o carimbo,
   * então o rastro guardado é o do PRIMEIRO bloqueio e não o do último clique de quem insistiu.
   *
   * ┌─ O LIMITE, DECLARADO: BLOQUEIO NÃO ALCANÇA CREDENCIAL JÁ EMITIDA ───────────────────────────┐
   * │ A credencial de upload é uma URL PRÉ-ASSINADA do armazenamento do Google, e o navegador do  │
   * │ candidato fala DIRETO com o balde: nenhum byte passa pelo EA. Bloquear o link NÃO impede um │
   * │ objeto já autorizado de aterrissar lá, e nada aqui pode impedir. O que o bloqueio impede é a │
   * │ CONFIRMAÇÃO (`portal-credencial.service.ts`), ou seja, o objeto não vira documento, não é    │
   * │ lido pela IA e não muda o prontuário; ele fica órfão no balde e cai na rede de proteção do   │
   * │ ciclo de vida. Quem precisa do corte imediato no armazenamento usa o expurgo, não o botão.   │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async bloquearLinkManualmente(jti: string, autorId: string): Promise<{ bloqueado: boolean }> {
    const bloqueados = await this.db
      .update(portalLinks)
      .set({ bloqueadoEm: new Date(), bloqueadoPorId: autorId })
      .where(and(eq(portalLinks.id, jti), isNull(portalLinks.bloqueadoEm)))
      .returning({ id: portalLinks.id });

    const bloqueado = (bloqueados?.length ?? 0) > 0;
    if (bloqueado) {
      await this.trilha.registrar("PORTAL_LINK_BLOQUEADO", {
        jtiLink: jti,
        autorId,
        motivoCodigo: "LINK_BLOQUEADO",
      });
    }
    return { bloqueado };
  }

  /**
   * DESBLOQUEAR, E ELE ZERA SÓ O BLOQUEIO.
   *
   * ┌─ NÃO TOCA `revogado_em` NEM `expira_em`, E ISSO É A REGRA, NÃO UM DETALHE ──────────────────┐
   * │ Um desbloqueio que limpasse a revogação RESSUSCITARIA um link que alguém matou de propósito │
   * │ (ou que morreu porque outro foi emitido no lugar dele), e um que mexesse no prazo daria vida │
   * │ nova a um link vencido. Nos dois casos o botão de "reabrir" viraria uma porta de fabricar    │
   * │ credencial, que é o oposto do que ele é. Link revogado continua REVOGADO depois de           │
   * │ desbloqueado; link vencido continua VENCIDO. Há teste para os dois.                          │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * IDEMPOTENTE pelo mesmo motivo do irmão acima: só registra quando de fato desfez alguma coisa.
   */
  async desbloquearLink(jti: string, autorId: string): Promise<{ desbloqueado: boolean }> {
    const abertos = await this.db
      .update(portalLinks)
      .set({ bloqueadoEm: null, bloqueadoPorId: null })
      .where(and(eq(portalLinks.id, jti), isNotNull(portalLinks.bloqueadoEm)))
      .returning({ id: portalLinks.id });

    const desbloqueado = (abertos?.length ?? 0) > 0;
    if (desbloqueado) {
      await this.trilha.registrar("PORTAL_LINK_DESBLOQUEADO", { jtiLink: jti, autorId });
    }
    return { desbloqueado };
  }

  /**
   * A URL que o consultor manda ao candidato.
   *
   * SEM `PORTAL_LINK_BASE_URL` A BASE SAI RELATIVA, e isso é deliberado: o endereço externo do
   * portal depende do vhost da barreira (pendência de infra, §A.17), e inventar um hostname aqui
   * produziria um link que parece bom e não abre. Relativo é visivelmente incompleto, que é o modo
   * de falha que alguém conserta no mesmo dia.
   */
  private urlDoLink(token: string): string {
    const base = (this.config.get<string>("PORTAL_LINK_BASE_URL") ?? "/portal").trim().replace(/\/+$/, "");
    // A LETRA VEM DO CONTRATO (`PORTAL_FRAGMENTO_LINK`), e não da mão de quem escreve os dois
    // lados. Com a letra escrita à mão aqui e lida à mão na tela, o backend montou `#t=` enquanto a
    // tela procurava `#l=`, e o link NUNCA abria: vocabulário compartilhado sem dono é o modo de
    // falha que só aparece com as duas pontas prontas.
    return `${base}#${PORTAL_FRAGMENTO_LINK}=${token}`;
  }

  // ══ IDENTIFICAR (rota do CANDIDATO) ═════════════════════════════════════════════════════════

  /**
   * Troca link + CPF + data de nascimento por uma sessão curta. É a ÚNICA porta por onde o CPF
   * entra no portal, e é por isso que o `candidato_hash` da trilha passa a existir a partir daqui.
   */
  async identificar(entrada: {
    linkToken: string;
    cpf: string;
    dataNascimento: string;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<SessaoDoCandidato> {
    const chaveLink = this.chaveDoLink();
    const chaveSessao = this.chaveDaSessao();
    if (!chaveLink || !chaveSessao || !this.pepper()) {
      throw new ServiceUnavailableException(PORTAL_INDISPONIVEL);
    }

    const agoraMs = Date.now();
    const ip = entrada.ip ?? undefined;
    const userAgent = entrada.userAgent ?? undefined;

    // ── (a) O BALDE DO TOKEN, ANTES DE QUALQUER OUTRA COISA ────────────────────────────────────
    //
    // A CHAVE É O HASH DO TOKEN INTEIRO, E NUNCA O `jti` DECLARADO. Antes de a assinatura fechar,
    // nada aqui sabe de quem é o link que o payload DIZ ser: o `jti` é campo escolhido por quem
    // chama, legível em base64 dentro de qualquer link encaminhado.
    //
    // ┌─ O ATAQUE QUE ISTO FECHA, e ele SOBREVIVEU à primeira correção (achado S37) ──────────────┐
    // │ A rodada anterior tirou a ESCRITA do valor declarado: `bloquear` passou a exigir           │
    // │ `bilhete.jti`, assinado. A DECISÃO continuou saindo do declarado, porque era ele que       │
    // │ escolhia o balde, e o estouro do balde é a única entrada da escalada. Medido com arnês     │
    // │ adversarial contra o serviço real: seis requisições de assinatura inválida carregando só   │
    // │ o `jti` da vítima não escrevem nada e estouram o balde DELA; a PRIMEIRA identificação da   │
    // │ vítima, com o token verdadeiro e o CPF certo, ouvia 429; na terceira insistência a         │
    // │ escalada gravava `suspenso_ate = +24h`, e o log atribuía o bloqueio à própria vítima. Era  │
    // │ pior que o defeito original, porque só doía quando ela aparecia.                           │
    // │                                                                                            │
    // │ A RÉGUA: lixo não verificado conta num balde que o atacante NÃO ESCOLHE, o do hash do      │
    // │ token. Encher o balde do token da vítima exige ter o token da vítima BYTE A BYTE, e quem   │
    // │ o tem já tem o link, que é exatamente o caso que a escalada POR LINK existe para punir.    │
    // └────────────────────────────────────────────────────────────────────────────────────────────┘
    //
    // TOKEN ILEGÍVEL CONTA IGUAL, e pela mesma chave: não existe atalho barato em que mandar lixo
    // saia de graça, e não há mais como escolher em qual balde cair. O `jti` declarado deixou de
    // escolher balde, então `jtiSemVerificar` não é chamado por este caminho.
    //
    // §A.6: a chave é o hash com o `PORTAL_LOG_PEPPER`, então o token, que é CREDENCIAL, não vira
    // chave do armazenamento do limitador.
    const estourouOBaldeDoToken = await this.estourou(
      `portal-ident:token:${this.hash(entrada.linkToken)}`,
      "portal-ident-token",
    );

    // ── (b) O BILHETE ───────────────────────────────────────────────────────────────────────────
    //
    // ELE É CONFERIDO MESMO COM O BALDE ESTOURADO, e essa é a inversão que o veto pede. A conta de
    // uma verificação Ed25519 não toca o banco e não tem estado; é o preço de só deixar decisão
    // durável nascer de valor assinado por nós.
    const bilhete = verificarLink(entrada.linkToken, this.publicaDoLink(chaveLink), agoraMs);
    if (!bilhete.ok) {
      // §A.6 e item L4: vai o CÓDIGO técnico da recusa, que não diz nada sobre a pessoa. O token
      // NÃO vai, e o `jti` declarado também não, porque num bilhete que não fecha assinatura ele é
      // um valor escolhido por quem tentou.
      //
      // O DESFECHO É O MESMO COM O BALDE ESTOURADO OU NÃO, de propósito: bilhete forjado sempre
      // ouve "link morto", nada é escalado e NADA é escrito. Não há oráculo novo, porque essa já é
      // a resposta que ele recebe desde a primeira tentativa.
      await this.trilha.registrar("PORTAL_LINK_RECUSADO", { ip, userAgent }, ip);
      throw new UnauthorizedException(corpoDoErro("LINK_MORTO", PORTAL_LINK_MORTO));
    }

    // ── (c) O BALDE POR LINK, E SÓ AGORA, COM O `jti` VERIFICADO ────────────────────────────────
    //
    // ESTE É O BALDE QUE DECIDE, e é por isso que ele só é TOCADO depois de a assinatura fechar:
    // é dele que sai a escalada que grava `suspenso_ate`. Só quem chegou aqui tem um bilhete
    // assinado por nós.
    //
    // ELE CONTA POR LINK, E ISSO NÃO FOI AFROUXADO: é o que barra quem varre datas de nascimento
    // trocando de CPF sem trocar de link (decisão 5). Quem tem o link de verdade continua batendo
    // no teto de 5 em 15 minutos e continua chegando na suspensão de 24 horas no terceiro estouro,
    // exatamente como antes. O que mudou é DE ONDE VEM A CHAVE antes da assinatura fechar.
    //
    // O ESTOURO DO BALDE DO TOKEN TAMBÉM DESEMBOCA AQUI, e isso não reabre o ataque: aquele balde
    // só se enche com o token byte a byte, então quem o estourou E traz um bilhete que fecha
    // assinatura é quem tem o token nas mãos, não quem leu um `jti` num link alheio.
    const estourouOBaldeDoLink = await this.estourou(
      `portal-ident:link:${bilhete.jti}`,
      "portal-ident-link",
    );
    if (estourouOBaldeDoLink || estourouOBaldeDoToken) {
      /*
       * ┌─ A ESCALADA NÃO ALCANÇA QUEM JÁ SABE A RESPOSTA (a terceira rodada da família S37) ──────┐
       * │ A rodada anterior fechou a escrita DIRETA pela porta do balde do CPF (`escalar: false`)  │
       * │ e deixou a INDIRETA, que é esta. A cadeia, medida com o armazém real do limitador: o     │
       * │ atacante enche o balde GLOBAL do CPF da vítima com o link PRÓPRIO dele; a vítima chega   │
       * │ com link, CPF e data CORRETOS e colhe 429 na primeira tentativa; ela insiste, porque a   │
       * │ credencial dela está certa; cada insistência enche o balde do TOKEN DELA; na sexta o     │
       * │ balde estoura, e a partir daí cada tentativa reentra na escalada até gravar              │
       * │ `suspenso_ate = +24h` na linha dela. Pior: `ESTOUROS_JANELA_MS` e `SUSPENSAO_MS` são os  │
       * │ dois 24 horas e a biblioteca PARA de decrementar enquanto o balde está bloqueado, então  │
       * │ `totalHits` trava acima do teto e todo estouro seguinte REGRAVA +24h. Trancamento        │
       * │ rolante permanente, ao custo de 6 requisições por janela de 15 minutos.                  │
       * │                                                                                           │
       * │ A RÉGUA: escalar é PUNIR QUEM ADIVINHA, e quem acerta CPF e data não está adivinhando.   │
       * │ O casamento passa a ser calculado ANTES de decidir a escalada, e a escalada é dispensada │
       * │ quando ele fecha. O brute-forcer continua escalando exatamente como antes, porque por    │
       * │ definição ele NÃO acerta: é a metade que não podia enfraquecer, e há teste para ela.     │
       * │                                                                                           │
       * │ ISTO NÃO ABRE ORÁCULO, e é a condição inegociável do conserto: os dois ramos devolvem o  │
       * │ MESMO 429, com o mesmo código e a mesma frase, e a diferença existe só dentro da trilha  │
       * │ (que já é privilegiada). O único preço é UMA consulta a mais na requisição JÁ ASSINADA e │
       * │ JÁ recusada pelo teto, que é o caminho raro.                                             │
       * │                                                                                           │
       * │ O BALDE DO TOKEN E A ESCALADA POR LINK NÃO MUDARAM DE DESENHO (correções aprovadas nas   │
       * │ rodadas anteriores): o que mudou é QUANDO a escalada é dispensada.                        │
       * └───────────────────────────────────────────────────────────────────────────────────────────┘
       */
      // A INVARIANTE DA ESCALADA MORA EM UM LUGAR SÓ (`escaladaDevida`), E ELA TEM DUAS METADES:
      // link VIVO **e** credencial ERRADA. Não existe `!credencialCorreta` solto aqui, e a ausência
      // dele é o conserto da QUARTA rodada: foi um `if` solto que deixou "link morto" satisfazer a
      // condição por acidente, e a escalada passou a se auto-renovar em cima da própria suspensão.
      await this.bloquear(
        bilhete.jti,
        agoraMs,
        { cpf: entrada.cpf, ip, userAgent },
        // `balde` diz QUAL teto mordeu, e é ele (não o `escalar`) que nomeia o motivo na trilha:
        // depois deste conserto, `escalar: false` também acontece com o balde do token/link, então
        // ele deixou de servir como discriminante.
        { escalar: await this.escaladaDevida(bilhete, agoraMs, entrada), balde: "TOKEN_OU_LINK" },
      );
    }

    // Item L3. Registrado aqui porque é neste ponto que se sabe que o link é NOSSO e está em pé.
    await this.trilha.registrar("PORTAL_LINK_ABERTO", { jtiLink: bilhete.jti, ip, userAgent }, ip);

    // ── (d) A LINHA, QUE É A AUTORIDADE DO PRAZO ────────────────────────────────────────────────
    const linha = await this.linhaDoLink(bilhete.jti);
    const estado = estadoDaLinha(linha, agoraMs);

    // A LINHA E O BILHETE PRECISAM FALAR DA MESMA ADMISSÃO.
    //
    // O `admissaoId` da linha já era projetado e jogado fora. Hoje a divergência não é explorável,
    // porque só nós assinamos bilhete, mas o casamento inteiro (`candidatoDaAdmissao`) é feito
    // contra `bilhete.admissaoId` enquanto o prazo é lido da LINHA: são dois vínculos que TÊM de
    // apontar para o mesmo lugar, e conferi-los custa uma comparação com o dado que já está na mão.
    // Divergiu, é link morto, sem subcaso e sem código próprio (`EXPIRADA`, o mesmo que a emissão
    // de credencial usa para todo link que não vale mais).
    const linhaDoMesmoDono = linha?.admissaoId === bilhete.admissaoId;
    const vivo = estado.vivo && linhaDoMesmoDono;

    /*
     * DIVERGIR DE DONO E NÃO EXISTIR SÃO ESTADOS DIFERENTES, E A TRILHA TEM DE DIZER QUAL FOI.
     *
     * `linhaDoMesmoDono` é FALSO também quando `linha` é `undefined`, e com isso o ramo escrito
     * para a linha que EXISTE e é de outro dono engolia junto a linha que NÃO EXISTE, forçando
     * `EXPIRADA`. Sobre o MESMO link, as outras três portas (`exigirVivo`, a emissão de credencial
     * e a confirmação) gravam o que `estadoDaLinha` nomeia para linha ausente, que é
     * `REVOGADO_MANUAL` ("uma linha que sumiu, não um forjado"). A Sala De Segurança lia a mesma
     * situação com dois nomes, conforme a porta.
     *
     * ISTO NÃO MUDA NADA DO QUE O CANDIDATO OUVE, e não pode mudar: a resposta é a mesma constante
     * nos cinco estados, e é essa indistinção que impede a trilha honesta de virar oráculo.
     */
    const divergiuDeDono = estado.existe && !linhaDoMesmoDono;

    // ── (e) O BALDE DO CPF, só agora, E ELE NÃO ALIMENTA A ESCALADA ────────────────────────────
    //
    // Ele NÃO é pulado quando o link está morto, e a ordem continua sendo esta: contar aqui protege
    // o CPF de quem tem um link vivo, que é o alvo real. Quem chega com link morto para na decisão
    // abaixo, sem saber nada sobre CPF nenhum.
    //
    // ┌─ O MESMO DANO DO S37, PELA PORTA DO CPF, E É POR ISSO QUE ELE NÃO ESCALA ─────────────────┐
    // │ O balde do CPF é escolhido por CAMPO DE FORMULÁRIO, e o gate `if (vivo)` exige UM link    │
    // │ vivo, não O link da vítima. Medido com o armazém real do limitador e duas admissões: um   │
    // │ atacante com link PRÓPRIO e legítimo (todo candidato da esteira tem um), sabendo SÓ o CPF │
    // │ da vítima, mandava 5 requisições; o link dele não era punido (o balde POR LINK ainda não  │
    // │ tinha estourado), e o balde do CPF dela ficava na borda. Aí ela chegava com o link dela,  │
    // │ o CPF certo e a data certa: 429 na primeira, e na TERCEIRA insistência `suspenso_ate =    │
    // │ +24h` gravado no link DELA, com o bloqueio atribuído ao nome dela na trilha. Repetível a  │
    // │ cada 15 minutos e, como a janela da escalada é de 24 horas, o trancamento virava          │
    // │ permanente. A correção anterior (o balde do token) subiu o preço de "zero links" para     │
    // │ "um link", e um link é o que todo candidato tem.                                          │
    // │                                                                                            │
    // │ A RÉGUA: o estouro do CPF RECUSA (429 de 15 minutos, que passa sozinho) e NÃO entra na    │
    // │ escalada. A escrita durável de 24 horas volta a nascer só dos baldes que o atacante não   │
    // │ escolhe, o do token e o do link assinado.                                                 │
    // │                                                                                            │
    // │ POR QUE NÃO ESTREITAR O BALDE PARA `(jti, cpf)`, que era a outra saída: os dois baldes    │
    // │ respondem a ataques DIFERENTES. O de LINK barra quem tem UM link e varre MUITOS CPFs; o   │
    // │ de CPF, global, barra quem tem MUITOS links e tenta UM CPF conhecido. Chaveado por        │
    // │ `(jti, cpf)` o segundo morre: cada link teria 5 tentativas frescas contra o mesmo CPF, e  │
    // │ quem tem N links ganharia 5N chutes na data de nascimento da mesma pessoa. Trocaria um    │
    // │ 429 incômodo por um buraco de verdade.                                                    │
    // │                                                                                            │
    // │ O RESIDUAL, DECLARADO E CORRIGIDO NA FRASE (ele era descrito menor do que é): o atacante  │
    // │ ainda consegue um 429 contra a vítima, e o estouro DESTE balde de fato não escreve nada   │
    // │ na linha dela. O que a frase antiga omitia é que o 429 faz a vítima INSISTIR, e a         │
    // │ insistência dela enchia o balde do TOKEN dela, que ESCALA: a escrita durável chegava pela │
    // │ porta indireta. Isso foi fechado no bloco (c), dispensando a escalada quando a credencial │
    // │ está correta. Hoje o residual é o que a frase sempre prometeu: um 429 que passa sozinho   │
    // │ em 15 minutos, sem escrita durável na linha de quem acerta os dados.                      │
    // │                                                                                            │
    // │ O QUE CONTINUA VERDADE E NÃO É COBERTO: o atacante mantém a vítima em 429 enquanto insiste │
    // │ (é o preço de um balde global por CPF), e o estouro DESTE balde vai para a trilha com     │
    // │ código PRÓPRIO (`BLOQUEADO_POR_CPF`).                                                      │
    // │                                                                                            │
    // │ E A PROMESSA DESSE CÓDIGO É ESTREITA, medida e declarada aqui para não ser lida maior do  │
    // │ que é: ele separa suspeito de alvo SÓ NO BALDE DO CPF. Um atacante que estoura o PRÓPRIO  │
    // │ balde de link digitando o CPF da vítima gera um evento pela outra porta, com              │
    // │ `motivoCodigo: "BLOQUEADO"` e o HASH DE CPF DA VÍTIMA junto. O evento é factualmente      │
    // │ verdadeiro (foi aquele CPF que veio no formulário) e o `jti` desambigua para quem consulta │
    // │ POR LINK, que é o link do atacante; mas quem consultar POR CANDIDATO vê a vítima como     │
    // │ bloqueada. Declarado, não corrigido: separar isso de verdade exige distinguir "o CPF      │
    // │ digitado" de "o dono do link" no evento, que é frente própria.                             │
    // └────────────────────────────────────────────────────────────────────────────────────────────┘
    let bloqueadoPorCpf = false;
    if (vivo) {
      bloqueadoPorCpf = await this.estourou(
        `portal-ident:cpf:${this.hash(so(entrada.cpf))}`,
        "portal-ident-cpf",
      );
      if (bloqueadoPorCpf) {
        // `escalar: false`, E É O CONSERTO DO S37 PELA PORTA DO CPF (ver o bloco logo acima).
        //
        // `balde: "CPF"` É A OUTRA METADE, e ela é de TRILHA, não de bloqueio: este estouro passa a
        // gravar `BLOQUEADO_POR_CPF`, e não o `BLOQUEADO` genérico. Ver o bloco do `bloquear`.
        await this.bloquear(
          bilhete.jti,
          agoraMs,
          { cpf: entrada.cpf, ip, userAgent },
          { escalar: false, balde: "CPF" },
        );
      }
    }

    // ── (f) O CASAMENTO, SEM RETORNO ANTECIPADO ─────────────────────────────────────────────────
    //
    // Os dois campos são comparados e o veredito é UM SÓ. Voltar cedo no CPF ("não existe, nem
    // preciso olhar a data") é diferença de tempo mensurável de fora, e é o oráculo voltando pela
    // porta do relógio, depois de ter sido fechado na porta da mensagem.
    //
    // O CASAMENTO É CONTRA A ADMISSÃO DO LINK, e não uma busca global por CPF como faz o VT. Sem
    // isso, qualquer link válido viraria porta de entrada para QUALQUER CPF da base: a pessoa
    // acerta o próprio CPF e a própria data e abre a trilha documental de um terceiro.
    //
    // A COMPARAÇÃO MORA EM `casamentoDaIdentificacao`, E É A MESMA QUE A ESCALADA CONSULTA. Duas
    // cópias da régua do casamento é o começo de a escalada perdoar um caso que o casamento recusa
    // (ou o contrário), e nenhum teste veria a divergência: as duas passariam, cada uma na sua.
    const pessoa = vivo ? await this.candidatoDaAdmissao(bilhete.admissaoId) : undefined;
    const casou = casamentoDaIdentificacao(pessoa, entrada);

    const decisao = decisaoDaIdentificacao({
      linkVivo: estado.existe && linhaDoMesmoDono,
      revogado: estado.revogado,
      expirado: estado.expirado,
      casou,
      bloqueado: bloqueadoPorCpf,
    });

    if (!decisao.ok) {
      if (decisao.motivoCodigo === "LINK_MORTO") {
        await this.trilha.registrar(
          "PORTAL_LINK_RECUSADO",
          {
            jtiLink: bilhete.jti,
            // `EXPIRADA` SÓ NA DIVERGÊNCIA DE DONO (a linha existe e é de outra admissão), que é o
            // único caso sem código próprio; linha ausente e os quatro estados de morte usam o
            // nome que o domínio já dá, igual às outras três portas.
            motivoCodigo: divergiuDeDono ? "EXPIRADA" : estado.motivoCodigo,
            ip,
            userAgent,
          },
          ip,
        );
        throw new UnauthorizedException(corpoDoErro("LINK_MORTO", PORTAL_LINK_MORTO));
      }
      // Item L6. O `motivoCodigo` é SEMPRE `NAO_CASOU`, e o `montarEventoPortal` o força por
      // construção mesmo que alguém aqui tente outra coisa. A data e o CPF não atravessam.
      await this.trilha.registrar(
        "PORTAL_IDENTIFICACAO_FALHA",
        { jtiLink: bilhete.jti, cpf: entrada.cpf, motivoCodigo: "NAO_CASOU", ip, userAgent },
        ip,
      );
      throw new UnauthorizedException(
        corpoDoErro("NAO_CASOU", PORTAL_IDENTIFICACAO_NAO_CASOU),
      );
    }

    // ── O CARIMBO DO ACESSO, E ELE NÃO É A TRILHA ───────────────────────────────────────────────
    //
    // Aqui, e só aqui: identificação BEM-SUCEDIDA, depois de o casamento fechar e antes de a sessão
    // nascer. Quem tentou e não casou NÃO acessou, e o painel não pode dizer que acessou.
    //
    // ┌─ POR QUE NÃO BASTAVA CONTAR `PORTAL_IDENTIFICACAO_OK` NA TRILHA ─────────────────────────┐
    // │ (a) `PortalTrilhaService.registrar` ENGOLE falha de gravação de propósito, então a trilha │
    // │     é declaradamente não confiável como CONTADOR;                                         │
    // │ (b) `portal_eventos` tem RETENÇÃO declarada (90 dias, 12 e 24 meses): o KPI encolheria    │
    // │     sozinho no dia em que a rotina de expurgo nascer;                                     │
    // │ (c) um falso "não acessou" faz o consultor REEMITIR o link, e `emitirLink` REVOGA todos os│
    // │     links vivos da admissão: a reemissão MATA a sessão de quem está enviando documento    │
    // │     naquele instante. Contador errado aqui vira dano na operação, não número torto.       │
    // └────────────────────────────────────────────────────────────────────────────────────────────┘
    //
    // FORA DO `try/catch`, de propósito e ao contrário dos `registrar` acima: este é o número que a
    // tela do RH usa para decidir reemitir link, e engolir a falha dele é justamente fabricar o
    // falso "não acessou" do item (c). Se o banco não aceita esta escrita, ele também não aceitaria
    // nada do que vem depois.
    await this.carimbarAcesso(bilhete.jti, new Date(agoraMs));

    // ── A SESSÃO ────────────────────────────────────────────────────────────────────────────────
    //
    // O PRAZO É O MENOR ENTRE 30 MINUTOS E O QUE RESTA DO LINK. Sessão que sobrevive ao link
    // vencido é o furo que a auditoria prévia achou antes de existir código.
    //
    // O `exp` DO LINK usado aqui é o da LINHA, não o do bilhete: é a linha que manda, e é ela que
    // alguém pode ter encurtado depois de o bilhete sair.
    const expDoLinkMs = estado.expiraEmMs ?? bilhete.expMs;
    const minutos = minutosDaSessao(agoraMs, expDoLinkMs, PORTAL_SESSAO_TTL_MINUTOS);
    const sessao = cunharSessao(
      { admissaoId: bilhete.admissaoId, jti: bilhete.jti, agoraMs, ttlMinutos: minutos },
      chaveSessao,
    );
    const expiraEm = new Date(agoraMs + minutos * 60_000);

    await this.trilha.registrar(
      "PORTAL_IDENTIFICACAO_OK",
      { jtiLink: bilhete.jti, cpf: entrada.cpf, ip, userAgent },
      ip,
    );
    await this.trilha.registrar(
      "PORTAL_SESSAO_EMITIDA",
      { jtiLink: bilhete.jti, cpf: entrada.cpf, exp: Math.floor(expiraEm.getTime() / 1000), ip, userAgent },
      ip,
    );

    // §A.6: sai o bilhete e o prazo. Não sai nome, não sai CPF e não sai id de admissão.
    return { sessao, expiraEm: expiraEm.toISOString() };
  }

  /**
   * A VÁLVULA DE RECUPERAÇÃO (a outra metade da decisão 5, item L18).
   *
   * SEM ELA O TETO VIRA UMA PORTA TRANCADA PARA SEMPRE: o candidato cuja data de nascimento está
   * errada NA NOSSA BASE nunca casa, gasta as cinco tentativas, é bloqueado, espera, gasta mais
   * cinco, e assim indefinidamente, sem nenhum caminho que não seja adivinhar a data que o RH
   * digitou errado. Aqui ele avisa, e a correção é humana.
   *
   * ELA NÃO PROMETE NADA QUE O SISTEMA FAÇA SOZINHO, e não abre exceção nenhuma: não emite link,
   * não destrava balde e não confirma que a admissão existe. Registra o pedido e manda procurar o
   * RH, que é a única coisa honesta a dizer.
   *
   * §A.6: não registra NADA do que ele digitou. O que entrou na tela de identificação (CPF errado,
   * data errada, nome no campo errado) é justamente o tipo de texto que traz dado pessoal de volta
   * para o log.
   *
   * ╔═ QUEM PODE ESCREVER NA TRILHA POR AQUI, E POR QUE A RÉGUA É ESTA (achado S29) ═════════════╗
   * ║ A rota é `@Public()`, sem sessão, e gravava UMA LINHA POR CHAMADA com um `jti` extraído do  ║
   * ║ payload SEM conferir assinatura (`jtiSemVerificar`). Ou seja: qualquer um enchia a trilha,  ║
   * ║ e ainda escolhia em nome de qual link. O balde global NÃO resolve, e o motivo está escrito  ║
   * ║ no `portal.controller.ts`: atrás da barreira todo mundo chega como `127.0.0.1`, então       ║
   * ║ limite por IP não separa ninguém.                                                            ║
   * ║                                                                                              ║
   * ║ A RÉGUA ADOTADA, em duas condições, nesta ordem:                                             ║
   * ║  1. GRAVA SÓ SE O `jti` FOR DE UMA LINHA QUE EXISTE em `portal_links`. A linha da trilha     ║
   * ║     existe para um HUMANO ir consertar a data de nascimento de ALGUÉM; `jti` que não casa    ║
   * ║     com linha nenhuma não identifica ninguém, não gera trabalho e é exatamente o que quem    ║
   * ║     quer poluir fabrica. Não gravá-lo não perde sinal, perde ruído.                          ║
   * ║  2. UMA LINHA POR LINK POR JANELA (`RECUPERACAO_JANELA_MS`). É o que fecha o caso restante:  ║
   * ║     quem tem em mãos um link REAL (o próprio candidato, ou quem recebeu o link vazado)       ║
   * ║     poderia repetir o pedido à vontade. A primeira é a que o RH precisa ver.                 ║
   * ║                                                                                              ║
   * ║ EXISTÊNCIA, E NÃO "LINK VIVO", e a diferença é o ponto: quem clica em "não consigo entrar"   ║
   * ║ costuma estar com o link VENCIDO, revogado, suspenso ou bloqueado. Exigir link vivo mataria  ║
   * ║ o registro justamente de quem mais precisa da válvula.                                       ║
   * ║                                                                                              ║
   * ║ A RESPOSTA NÃO MUDA EM NENHUM DOS CAMINHOS QUE CHEGAM AQUI, e isto é inegociável: a mesma    ║
   * ║ constante para token lixo, token sem `jti`, link inexistente, link real e balde estourado.  ║
   * ║ Nada de 429, nada de mensagem diferente. Responder diferente conforme o link EXISTIR         ║
   * ║ transformaria esta rota no ORÁCULO que ela foi desenhada para não ser, e por um caminho que  ║
   * ║ não precisa nem de CPF.                                                                      ║
   * ║                                                                                              ║
   * ║ COM UMA RESSALVA DE FRONTEIRA, e ela é do DTO, não daqui (achado S35): `linkToken` é         ║
   * ║ `@IsString()` sem `@IsOptional()` em `RecuperacaoNoPortalDto`, então corpo SEM o campo é     ║
   * ║ recusado pelo `ValidationPipe` com 400 e NUNCA entra neste método. A uniformidade vale do    ║
   * ║ `ValidationPipe` para dentro. Isso NÃO é oráculo sobre link nenhum (o 400 é o mesmo para     ║
   * ║ qualquer corpo malformado, e não distingue link existente de inexistente), e por isso o      ║
   * ║ comportamento fica como está; o que estava errado era esta caixa prometer o que a rota não   ║
   * ║ entrega. O parâmetro segue opcional na assinatura porque quem chama de dentro (teste,        ║
   * ║ chamador futuro) não passa pelo pipe.                                                        ║
   * ║                                                                                              ║
   * ║ O QUE ESTA ESCOLHA NÃO COBRE, dito aqui para ninguém ler proteção a mais do que existe:      ║
   * ║  - o VOLUME DE REQUISIÇÕES continua livre. Cada chamada ainda custa uma consulta por chave   ║
   * ║    primária. O que morreu foi a escrita na trilha, não o pedido; teto de requisição é da     ║
   * ║    barreira, que é quem enxerga o IP de verdade (mesmo veto V1 já anotado no controller).    ║
   * ║  - quem tiver N links REAIS em mãos escreve N linhas por janela, uma por link.               ║
   * ║  - o limitador é o `ThrottlerStorage` compartilhado: reiniciado ou zerado, a janela recomeça ║
   * ║    e uma linha a mais é gravada. A direção da falha é gravar, nunca recusar o candidato.     ║
   * ║  - some da trilha o registro de pedido com token inválido. Era sinal fraco por construção    ║
   * ║    (o `jti` era escolhido por quem chamava e o IP é sempre o da barreira) e é a própria      ║
   * ║    matéria-prima do enchimento.                                                              ║
   * ║  - ORÁCULO POR TEMPORIZAÇÃO (achado S34, residual ACEITO e declarado aqui para não ser lido  ║
   * ║    como coberto). A resposta é a mesma constante, mas o CAMINHO não é: sem `jti` retorna    ║
   * ║    na hora, com `jti` faz uma consulta por chave primária, e com linha existente toca ainda ║
   * ║    o limitador e, na primeira vez da janela, grava a trilha. Quem cronometrar o suficiente  ║
   * ║    distingue "este `jti` existe" de "não existe". Não foi fechado de propósito: nivelar o   ║
   * ║    tempo exigiria trabalho falso em todos os ramos (ou atraso fixo maior que o pior caso),  ║
   * ║    e o que se protege é a EXISTÊNCIA de um UUID v4 que quem pergunta já teria de adivinhar. ║
   * ║  - O BALDE DESTA VÁLVULA É ESCOLHIDO PELO `jti` NÃO VERIFICADO (a família do achado S37).   ║
   * ║    Quem conhece um `jti` real (link encaminhado, print) gasta a única linha por janela       ║
   * ║    daquele link. O EFEITO TEM DUAS METADES, e a segunda faltava aqui:                        ║
   * ║      (i) SILENCIA o pedido genuíno do candidato naquela hora, que não vira linha de trilha;  ║
   * ║     (ii) FABRICA um `PORTAL_RECUPERACAO_SOLICITADA` atribuído àquele link, ou seja um "este  ║
   * ║          candidato pediu ajuda" que ele NUNCA pediu, e que o RH vai ler como pedido dele.    ║
   * ║    Aqui isso NÃO foi consertado como na identificação, e a diferença é o EFEITO: lá o valor ║
   * ║    declarado decidia uma ESCRITA DURÁVEL contra a vítima (24 horas de link suspenso); aqui  ║
   * ║    a escrita é uma linha de log falsa mais uma verdadeira suprimida, e a janela seguinte    ║
   * ║    volta a aceitar o pedido real. Não há como fazer melhor sem assinatura, porque a rota    ║
   * ║    existe exatamente para quem não consegue passar pela identificação.                       ║
   * ╚══════════════════════════════════════════════════════════════════════════════════════════════╝
   */
  async recuperacao(entrada: { linkToken?: string | null; ip?: string | null }) {
    // O DESFECHO É UM SÓ, E ELE É CALCULADO ANTES DE QUALQUER DECISÃO: ver o bloco de cima. Fica
    // aqui, na primeira linha, para que nenhum caminho novo tenha por onde devolver outra coisa.
    const resposta = { mensagem: PORTAL_RECUPERACAO_AVISO };

    const jti = this.jtiSemVerificar(entrada.linkToken ?? "");
    // SEM `jti` NÃO HÁ O QUE REGISTRAR: "alguém pediu ajuda com um token que não é token" não
    // localiza candidato nenhum.
    if (!jti) return resposta;

    // (1) A LINHA TEM DE EXISTIR. Consulta por chave primária, projeção de UMA coluna: nada da
    // pessoa é lido, e o resultado NÃO atravessa para a resposta.
    if (!(await this.existeLinha(jti))) return resposta;

    // (2) UMA LINHA POR LINK POR JANELA. O balde só é tocado DEPOIS da conferência acima, e a
    // ordem é a defesa: fosse antes, a chave do balde seria escolhida por quem chama, e o
    // armazenamento do limitador viraria o novo lugar para despejar lixo.
    const balde = await this.throttle.increment(
      `portal-recup:link:${jti}`,
      RECUPERACAO_JANELA_MS,
      RECUPERACAO_LINHAS_POR_JANELA,
      RECUPERACAO_JANELA_MS,
      "portal-recuperacao",
    );
    if (balde?.isBlocked) return resposta;

    await this.trilha.registrar(
      "PORTAL_RECUPERACAO_SOLICITADA",
      { jtiLink: jti },
      entrada.ip ?? undefined,
    );
    // `mensagem`, e não `aviso`: é o nome que o contrato fixou, depois de o frontend ter chutado
    // um corpo diferente contra a mesma rota.
    return resposta;
  }

  // ══ AS PEÇAS ════════════════════════════════════════════════════════════════════════════════

  /** Só os dígitos. O candidato digita com ponto e traço, e a base guarda só número. */
  private hash(valor: string): string {
    // O PEPPER É O DO PORTAL (decisão 10). Sem ele a chave seria calculável por qualquer um que
    // soubesse o formato: um CPF tem 11 dígitos, e sem pepper a lista inteira se percorre em
    // segundos. `identificar` e `emitirLink` já recusam antes quando ele falta.
    return createHash("sha256").update(`${this.pepper()}:${valor}`).digest("hex").slice(0, 32);
  }

  /**
   * A chave PÚBLICA derivada da privada do link. Derivar em vez de ler uma segunda env é uma
   * variável a menos para configurar errado: uma pública que não seja o par da privada faria o
   * serviço recusar todo link que ele mesmo acabou de assinar.
   */
  private publicaDoLink(privada: KeyObject): KeyObject {
    // `createPublicKey` aceita uma KeyObject PRIVADA e devolve a pública correspondente.
    return createPublicKey(privada);
  }

  /**
   * Lê o `jti` do payload SEM conferir assinatura. HOJE ELE TEM UM ÚNICO LEITOR, a válvula de
   * recuperação, onde escolhe a linha que será procurada. Nada além disso pode depender deste
   * valor: ele é escolhido por quem chama.
   *
   * ┌─ ELE DEIXOU DE ESCOLHER BALDE NA IDENTIFICAÇÃO (achado S37) ───────────────────────────────┐
   * │ O balde pré-assinatura era `portal-ident:link:${jti declarado}`, e o estouro dele é a       │
   * │ única entrada da escalada que SUSPENDE a linha por 24 horas. Contar ali já era DECIDIR pelo │
   * │ valor declarado, mesmo com a escrita exigindo `bilhete.jti`: enchia-se o balde da vítima    │
   * │ com lixo, e ela colhia o 429 e, insistindo, a suspensão. Hoje aquele balde é o hash do      │
   * │ TOKEN, e o balde por link só é tocado com a assinatura fechada.                             │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ A FORMA É CONFERIDA, E ISSO NÃO É ZELO ───────────────────────────────────────────────────┐
   * │ O `jti` É o `id` de `portal_links`, que é coluna `uuid` (a igualdade é deliberada, ver o    │
   * │ comentário da tabela). Texto qualquer num `where id = $1` NÃO devolve zero linhas: derruba  │
   * │ a consulta no cast do Postgres, e numa rota PÚBLICA isso vira 500. Pior que o 500: a rota   │
   * │ da recuperação passaria a responder DIFERENTE conforme o que foi digitado, virando o        │
   * │ oráculo que ela existe para não ser. Mesma régua do `documentosValidos` das dicas.          │
   * │                                                                                             │
   * │ NA IDENTIFICAÇÃO A FORMA JÁ NÃO DECIDE NADA (o balde de lá é o hash do token), mas a        │
   * │ conferência continua valendo aqui, que é onde o valor vira `where id = $1` numa rota        │
   * │ PÚBLICA.                                                                                    │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  private jtiSemVerificar(token: string): string | null {
    const partes = token.split(".");
    if (partes.length !== 3) return null;
    try {
      const payload = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8")) as {
        jti?: unknown;
      };
      return typeof payload?.jti === "string" && FORMATO_UUID.test(payload.jti)
        ? payload.jti
        : null;
    } catch {
      return null;
    }
  }

  /**
   * Um toque no balde. Devolve se ele estourou, no molde de `VtService.limitarPorCpf`.
   *
   * ╔═ DUAS PROPRIEDADES DO LIMITADOR, REGISTRADAS E NÃO CONSERTADAS (decisão do diretor) ═══════╗
   * ║ Nenhuma das duas é desta mudança, e as duas valem para TODOS os baldes da casa, não só os  ║
   * ║ deste arquivo. Ficam escritas para quem medir o teto não concluir que ele é o que diz.     ║
   * ║                                                                                             ║
   * ║ 1. O ARMAZÉM É UM `Map` EM MEMÓRIA, POR PROCESSO (`ThrottlerStorageService`). Com N         ║
   * ║    instâncias do backend atrás do proxy, o teto EFETIVO é N vezes o declarado, porque cada  ║
   * ║    processo conta o seu próprio balde. Hoje o EA roda uma instância, então o número bate;   ║
   * ║    no dia em que escalar, o limite real muda sem nada falhar. Quem quiser o teto global     ║
   * ║    precisa de armazém compartilhado (Redis), que é decisão de arquitetura, não deste veto.  ║
   * ║                                                                                             ║
   * ║ 2. `resetBlockdRequest` DA BIBLIOTECA CHAMA `clearExpirationTimes(nome)`, que limpa os      ║
   * ║    temporizadores de decremento de TODAS as chaves daquele NOME de balde, e não só da chave ║
   * ║    que expirou. Na prática, os acertos de outras chaves do mesmo nome deixam de decair      ║
   * ║    dentro da janela. O nome de maior rotatividade aqui é o `portal-ident-token` (chave nova ║
   * ║    a cada token diferente), então é ele quem mais dispara o efeito. A DIREÇÃO DO ERRO É     ║
   * ║    SEMPRE PARA MAIS: sobra contagem, ou seja sobre-bloqueio, e nunca falta, então NUNCA     ║
   * ║    vira bypass. A CONCLUSÃO DE QUE ISSO É "SEGURO" NÃO SOBREVIVE, e a frase foi corrigida:  ║
   * ║    sobre-contagem no balde de MAIOR rotatividade ACELERA a chegada ao teto de quem usa o    ║
   * ║    portal de verdade, e todo estouro é candidato a virar escrita durável. Ela é menos ruim  ║
   * ║    que um bypass, não inofensiva. O que mantém o dano fora do usuário legítimo é o conserto ║
   * ║    do bloco (c) (a escalada não alcança quem acerta a credencial), não esta propriedade.    ║
   * ║    Fica registrada e não contornada porque contorná-la exigiria reimplementar o armazém.    ║
   * ╚═════════════════════════════════════════════════════════════════════════════════════════════╝
   */
  private async estourou(chave: string, nome: string): Promise<boolean> {
    const r = await this.throttle.increment(
      chave,
      TENTATIVAS_JANELA_MS,
      TENTATIVAS_LIMITE,
      TENTATIVAS_BLOQUEIO_MS,
      nome,
    );
    return r.isBlocked;
  }

  /**
   * O desfecho do teto: registra o bloqueio, escala para SUSPENSÃO no terceiro estouro e LANÇA.
   *
   * A ESCALADA É POR LINK, e não por CPF, porque é o link que o atacante tem em mãos: bloquear só o
   * CPF deixa quem varre datas trocando de CPF no mesmo link recomeçando para sempre.
   *
   * ┌─ E ELA SÓ ACONTECE QUANDO QUEM CHAMA PEDE (`escalar`) ─────────────────────────────────────┐
   * │ Recusar é uma coisa, ESCALAR é outra, e juntar as duas neste método foi o que deixou o     │
   * │ balde do CPF (chave escolhida por campo de formulário) gravar `suspenso_ate` no link de uma │
   * │ vítima que nunca errou nada. Hoje o balde do CPF recusa e para por aí; os do TOKEN e do    │
   * │ LINK escalam, porque só se enchem com valor que o atacante não escolhe, E SÓ CONTRA QUEM   │
   * │ ERRA a credencial (terceira rodada, ver o bloco (c) de `identificar`: quem acerta CPF e    │
   * │ data não está adivinhando, e escalar contra ele é punir a vítima do ataque).                │
   * │                                                                                             │
   * │ SEM ESCALAR, ESTE MÉTODO NÃO ESCREVE NADA NO BANCO: sobra a linha de trilha (que é verdade, │
   * │ a tentativa foi recusada mesmo) e o 429, que passa sozinho em 15 minutos.                   │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ E O `balde` DIZ QUAL TETO MORDEU, PORQUE A TRILHA PRECISA SEPARAR SUSPEITO DE ALVO ────────┐
   * │ Os dois estouros gravavam `BLOQUEADO`, e a Sala De Segurança lia com o MESMO nome duas     │
   * │ situações OPOSTAS: "o balde DELA estourou" (ela é a suspeita) e "o balde GLOBAL do CPF dela │
   * │ estourou porque um terceiro o encheu" (ela é o ALVO). No arnês do auditor foram 13 eventos │
   * │ desses, a maioria com o `jti` e o hash de CPF da VÍTIMA, e o ataque inteiro não acendia     │
   * │ nada: o único nome no log era o dela. É a cicatriz do S28, e o `domain/portal-identidade`  │
   * │ já a nomeia: trilha que descreve errado é pior que trilha ausente, porque é lida como       │
   * │ verdade. Com `BLOQUEADO_POR_CPF`, "muitos `jti` distintos bloqueados sobre o MESMO hash de │
   * │ CPF" vira consultável, que é o que torna o ataque DETECTÁVEL.                               │
   * │                                                                                             │
   * │ A SEPARAÇÃO É SÓ NO BALDE DO CPF, e a promessa acima não vale além disso: o estouro do     │
   * │ balde do LINK continua gravando `BLOQUEADO` com o hash do CPF que veio no formulário, que  │
   * │ pode ser o da vítima. O recorte exato está declarado no bloco (e) de `identificar`.        │
   * │                                                                                             │
   * │ O DISCRIMINANTE É O `balde`, E NÃO O `escalar`, e isto é consequência do conserto de cima: │
   * │ desde que a escalada passou a ser dispensada para credencial correta, `escalar: false`     │
   * │ acontece também no balde do token/link. Amarrar o nome do motivo ao `escalar` faria o      │
   * │ evento dizer "foi o CPF" justamente para a vítima que acertou tudo.                         │
   * │                                                                                             │
   * │ NADA DISSO CHEGA AO CANDIDATO: o corpo do erro continua sendo o MESMO `BLOQUEADO` com a     │
   * │ mesma frase nos dois ramos (`CodigoErroIdentificacao`, que a tela lê). O código novo é de  │
   * │ TRILHA, e trilha é superfície privilegiada.                                                 │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ O `jti` AQUI É SEMPRE VERIFICADO, E O TIPO É QUEM GARANTE (veto da auditoria de código) ───┐
   * │ Ele era `string | null`, e o valor que chegava do balde do link vinha do payload SEM         │
   * │ assinatura conferida. Como este método ESCREVE (`set suspenso_ate`), quem conhecesse um      │
   * │ `jti` derrubava o link de outra pessoa por 24 horas mandando lixo. Agora os dois chamadores  │
   * │ passam `bilhete.jti`, e a assinatura obrigatória do parâmetro é o que impede um terceiro     │
   * │ chamador futuro de voltar a entregar aqui um valor escolhido por quem tentou.                │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  private async bloquear(
    jti: string,
    agoraMs: number,
    contexto: { cpf?: string; ip?: string; userAgent?: string },
    /*
     * QUEM CHAMA DIZ SE ESCALA, E NÃO HÁ PADRÃO, pelo mesmo motivo de `motivoCodigo` em
     * `revogarLinksDaAdmissao`: um padrão silencioso faria o próximo balde nascer escalando, e é
     * exatamente disso que os dois achados desta família são feitos.
     */
    opcoes: { escalar: boolean; balde: BaldeDoTeto },
  ): Promise<never> {
    const escalada = opcoes.escalar
      ? await this.throttle.increment(
          `portal-ident:estouros:${jti}`,
          ESTOUROS_JANELA_MS,
          ESTOUROS_ATE_SUSPENDER,
          ESTOUROS_JANELA_MS,
          "portal-ident-estouros",
        )
      : null;
    if ((escalada?.totalHits ?? 0) >= ESTOUROS_ATE_SUSPENDER) {
      const ate = new Date(agoraMs + SUSPENSAO_MS);
      try {
        await this.db.update(portalLinks).set({ suspensoAte: ate }).where(eq(portalLinks.id, jti));
        // Item L8. Vai a data do fim da suspensão, que é número. Nenhum dado da pessoa.
        await this.trilha.registrar("PORTAL_LINK_SUSPENSO", {
          jtiLink: jti,
          motivoCodigo: "SUSPENSO",
          ate: ate.getTime(),
        });
      } catch (erro) {
        // A suspensão é uma trava A MAIS, não a principal: o bloqueio de 15 minutos já valeu. Se
        // ela falhar, o pedido continua recusado e o erro vira log, no padrão da INT-4 (§A.5).
        this.log.error("falha ao suspender o link do portal apos estouros repetidos", erro as Error);
      }
    }

    // Item L7. `janela` e `ate` são números; o CPF entra CRU aqui de propósito, porque a redução
    // por allowlist acontece num lugar só (`montarEventoPortal`), que o transforma em hash.
    await this.trilha.registrar(
      "PORTAL_IDENTIFICACAO_BLOQUEADA",
      {
        jtiLink: jti,
        cpf: contexto.cpf,
        // NOME PRÓPRIO PARA O BALDE QUE MORDEU (ver o bloco acima). O catálogo `PORTAL_MOTIVOS` é
        // lista FECHADA, e código fora dela vira `motivo_codigo` NULO em `montarEventoPortal`:
        // `BLOQUEADO_POR_CPF` foi acrescentado LÁ, junto do `BLOQUEADO`, e não aqui.
        motivoCodigo: opcoes.balde === "CPF" ? "BLOQUEADO_POR_CPF" : "BLOQUEADO",
        janela: TENTATIVAS_JANELA_MS,
        ate: agoraMs + TENTATIVAS_BLOQUEIO_MS,
        ip: contexto.ip,
        userAgent: contexto.userAgent,
      },
      contexto.ip,
    );
    throw new HttpException(
      corpoDoErro("BLOQUEADO", PORTAL_IDENTIFICACAO_BLOQUEADA),
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /**
   * A ESCALADA CABE CONTRA ESTA REQUISIÇÃO? É a ÚNICA pergunta que decide a escrita durável de 24
   * horas, e ela tem DUAS METADES, ditas aqui e em nenhum outro lugar:
   *
   *   **ESCALA SÓ QUANDO O LINK ESTÁ VIVO E A CREDENCIAL ESTÁ ERRADA.** As duas, sempre.
   *
   * ┌─ POR QUE AS DUAS, e por que a segunda sozinha é um defeito (a QUARTA rodada da família) ───┐
   * │ A pergunta anterior era "a credencial confere?", e ela respondia FALSO em dois casos que   │
   * │ não são a mesma coisa: "a credencial está errada" e "não dá para saber, o link está        │
   * │ morto". Como `estadoDaLinha` colapsa SUSPENSO e BLOQUEADO dentro de expirado, a PRÓPRIA    │
   * │ suspensão que a escalada acabava de escrever tornava o link não-vivo, e a tentativa        │
   * │ seguinte reentrava na escalada e REGRAVAVA `+24h`. Auto-renovação, medida: 24 tentativas   │
   * │ com credencial CORRETA contra linha suspensa davam 13 escritas novas; contra linha         │
   * │ BLOQUEADA À MÃO, 13 escritas e um `suspenso_ate` que NASCIA ali.                            │
   * │                                                                                             │
   * │ O DANO OPERACIONAL ERA NO BLOQUEIO MANUAL, e ele quebrava a invariante que o domínio       │
   * │ declara ("não tem data de fim, ao contrário da suspensão: ele acaba quando uma pessoa      │
   * │ decide", `estadoDaLinha`): o consultor clicava em DESBLOQUEAR e o link seguia morto, porque │
   * │ as tentativas do candidato tinham gravado uma suspensão por baixo. O bloqueio passava a    │
   * │ acabar quando o candidato desistia.                                                         │
   * │                                                                                             │
   * │ E ESCALAR LINK MORTO NÃO PROTEGE NADA: suspender o que já está suspenso é no-op de          │
   * │ segurança, e custa exatamente o dano acima. A proteção inteira mora no caso vivo.           │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * NENHUMA DAS DUAS RÉGUAS É REESCRITA AQUI. "Vivo e do mesmo dono" sai de `estadoDaLinha` (a
   * mesma das outras portas, e é ela que já contém suspenso, bloqueado, revogado e vencido);
   * o casamento sai de `casamentoDaIdentificacao`, a mesma função do bloco (f). Uma segunda cópia
   * de qualquer uma delas é o começo de a escalada perdoar o que o casamento recusa.
   *
   * A METADE QUE NÃO PODE ENFRAQUECER: quem varre datas de nascimento com o link VIVO continua
   * escalando até a suspensão, exatamente como antes. Há teste para as duas pontas.
   *
   * ┌─ RESIDUAL DECLARADO, e NÃO corrigido: um canal de TEMPO ───────────────────────────────────┐
   * │ Neste caminho (já recusado pelo teto), link VIVO custa duas consultas e link MORTO custa   │
   * │ uma, e isso distingue os dois estados enquanto a RESPOSTA permanece constante. Não é       │
   * │ corrigido de propósito: só alcança quem JÁ TEM o token do link, e essa pessoa descobre o   │
   * │ mesmo fato em 15 minutos pela própria recusa. Igualar o custo exigiria uma consulta inútil │
   * │ no caminho morto, que é preço permanente por um segredo de 15 minutos.                     │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * §A.6: nada do que ela lê atravessa para a resposta, para o log ou para a exceção. Booleano.
   */
  private async escaladaDevida(
    bilhete: { jti: string; admissaoId: string },
    agoraMs: number,
    entrada: { cpf: string; dataNascimento: string },
  ): Promise<boolean> {
    const linha = await this.linhaDoLink(bilhete.jti);
    // A PRIMEIRA METADE. Link morto (revogado, vencido, suspenso, bloqueado à mão ou de outro
    // dono) não escala, e o `return` é aqui em cima para que nenhuma condição abaixo possa voltar
    // a confundir "link morto" com "credencial errada".
    const linkVivo = estadoDaLinha(linha, agoraMs).vivo && linha?.admissaoId === bilhete.admissaoId;
    if (!linkVivo) return false;

    // A SEGUNDA METADE, e só agora: contra um link vivo, escalar é punir quem ADIVINHA.
    const credencialCorreta = casamentoDaIdentificacao(
      await this.candidatoDaAdmissao(bilhete.admissaoId),
      entrada,
    );
    return !credencialCorreta;
  }
  /**
   * O CARIMBO DE ACESSO NA LINHA DO LINK. Um `update` por identificação bem-sucedida.
   *
   * O PRIMEIRO ACESSO É IMUTÁVEL, e é o `coalesce` que garante isso no BANCO, não um `if` daqui:
   * duas abas identificando ao mesmo tempo não disputam o valor, e o "quando ele abriu a primeira
   * vez" não é reescrito pela décima entrada. O último acesso é reescrito sempre, que é a pergunta
   * oposta ("ele ainda está mexendo nisto?").
   *
   * O `jti` É O VERIFICADO (`bilhete.jti`), nunca o declarado: escrita durável decidida por campo
   * não assinado é o furo que a auditoria já fechou no `bloquear`, e ele não volta por aqui.
   *
   * §A.6: a linha não ganha nada da pessoa. Dois carimbos de tempo, e nada mais.
   */
  private async carimbarAcesso(jti: string, agora: Date) {
    await this.db
      .update(portalLinks)
      .set({
        // O `Date` VAI TIPADO, e isto foi MEDIDO e não suposto: dentro de um fragmento `sql` cru o
        // driver não tem a coluna para inferir o tipo do parâmetro, recebe o `Date` e estoura
        // (`byteLength ... Received an instance of Date`). O 500 derrubava a identificação INTEIRA,
        // com tudo verde no repositório, e só apareceu na prova visual contra a homologação.
        primeiroAcessoEm: sql`coalesce(${portalLinks.primeiroAcessoEm}, ${agora.toISOString()}::timestamptz)`,
        ultimoAcessoEm: agora,
      })
      .where(eq(portalLinks.id, jti));
  }

  /**
   * EXISTE LINHA COM ESTE `jti`? Só isso, e por isso a projeção é o `id` e nada mais.
   *
   * NÃO USA `linhaDoLink` DE PROPÓSITO, e não é economia de coluna: aquela projeta o estado
   * inteiro (`COLUNAS_DO_LINK`), e quem lê estado acaba decidindo por estado. Aqui a pergunta é
   * de EXISTÊNCIA, a resposta não atravessa para o candidato em caminho nenhum (a rota devolve a
   * mesma constante sempre), e uma projeção mínima deixa isso evidente para quem vier depois.
   */
  private async existeLinha(jti: string): Promise<boolean> {
    const [linha] = await this.db
      .select({ id: portalLinks.id })
      .from(portalLinks)
      .where(eq(portalLinks.id, jti))
      .limit(1);
    return linha !== undefined;
  }

  /** A linha do link, que é a autoridade do prazo. Uma consulta por `jti`, custo desprezível. */
  private async linhaDoLink(jti: string) {
    const [linha] = await this.db
      .select({
        id: portalLinks.id,
        admissaoId: portalLinks.admissaoId,
        // A PROJEÇÃO DO ESTADO VEM DE UM LUGAR SÓ (`COLUNAS_DO_LINK`): coluna esquecida aqui vira
        // "sem restrição" dentro de `estadoDaLinha`, e a porta fica aberta sem nada falhar.
        ...COLUNAS_DO_LINK,
      })
      .from(portalLinks)
      .where(eq(portalLinks.id, jti))
      .limit(1);
    return linha;
  }

  /**
   * O candidato DA ADMISSÃO DO LINK. Projeção mínima: CPF e data de nascimento, que são os dois
   * campos comparados, e nada mais. O nome não entra porque não é comparado e porque ele não tem
   * por que existir nesta camada.
   */
  private async candidatoDaAdmissao(admissaoId: string) {
    const [linha] = await this.db
      .select({ cpf: candidatos.cpf, dataNascimento: candidatos.dataNascimento })
      .from(admissoes)
      .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
      .where(eq(admissoes.id, admissaoId))
      .limit(1);
    return linha;
  }
}

/** Só os dígitos do CPF. O candidato digita com ponto e traço; a base guarda só número. */
function so(cpf: string): string {
  return (cpf ?? "").replace(/\D/g, "");
}

/**
 * O CASAMENTO, EM UM LUGAR SÓ. Dois leitores: o bloco (f) de `identificar`, que decide a sessão, e
 * `credencialConfere`, que decide se a escalada pune esta requisição.
 *
 * ELA É PURA E NÃO VOLTA A DIZER O QUE FALHOU: devolve um booleano, e nunca "o CPF existe mas a
 * data não bate". É o mesmo recorte do código `NAO_CASOU` (um só, sem subcaso), e é o que impede o
 * oráculo de voltar pela porta de um valor de retorno mais detalhado.
 *
 * OS DOIS CAMPOS SÃO SEMPRE COMPARADOS, sem retorno antecipado no CPF: diferença de tempo
 * mensurável de fora é o oráculo voltando pela porta do relógio.
 */
function casamentoDaIdentificacao(
  pessoa: { cpf?: string | null; dataNascimento?: string | null } | undefined,
  entrada: { cpf: string; dataNascimento: string },
): boolean {
  const casouCpf = pessoa?.cpf !== undefined && pessoa.cpf === so(entrada.cpf);
  const casouData =
    typeof pessoa?.dataNascimento === "string" &&
    pessoa.dataNascimento.length > 0 &&
    pessoa.dataNascimento === (entrada.dataNascimento ?? "").slice(0, 10);
  return casouCpf && casouData;
}
