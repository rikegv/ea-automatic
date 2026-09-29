import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ThrottlerStorage } from "@nestjs/throttler";
import type { Request } from "express";
import {
  BALDES_RITMO_PORTAL,
  BALDES_RITMO_SESSAO,
  LIMITES_RITMO_PORTAL,
  LIMITES_RITMO_SESSAO,
  PORTAL_RITMO_CODIGO,
  origemDaRequisicao,
  proxiesEsperadosDaConfiguracao,
  saltosConfiaveisDaConfiguracao,
  type PerfilDeRitmo,
  type RegraDeRitmo,
} from "../domain/portal-ritmo";
import { ipHashDe, pepperDaTrilha } from "../domain/portal-evento";
// A FRASE É A MESMA DO TETO QUE JÁ EXISTE, importada e não recopiada: duas cópias do mesmo texto
// divergem no primeiro ajuste de produto, e aí o 429 do ritmo vira distinguível do 429 do teto.
import { PORTAL_IDENTIFICACAO_BLOQUEADA } from "./portal-identidade.service";
import { PortalRitmoContadores, type PortaDoRitmo } from "./portal-ritmo.contadores";
import { PortalTrilhaService } from "./portal-trilha.service";

/**
 * O LIMITE DE RITMO DAS ONZE ROTAS DO CANDIDATO (veto 2 do mapa de acesso público, e veto 5 da
 * auditoria do limitador).
 *
 * ╔═ AS ONZE, E POR QUE NENHUMA PODE FICAR DE FORA ════════════════════════════════════════════╗
 * ║ CINCO são ANÔNIMAS de nascença: `identificar`, `recuperacao`, `acesso-email/solicitar`,     ║
 * ║ `acesso-email/confirmar`, `acesso-email/identidade`.                                        ║
 * ║                                                                                             ║
 * ║ SEIS têm sessão: `credencial`, `confirmar`, `documentos`, `dados-gi`, `termo`, `vt-link`.   ║
 * ║ E ELAS SÃO ALCANÇÁVEIS SEM CREDENCIAL NENHUMA, que é o achado do veto 5: o `ThrottlerGuard` ║
 * ║ é o PRIMEIRO APP_GUARD, então ele CONTA ANTES de o `PortalSessaoGuard` recusar. Um laço      ║
 * ║ contra `POST portal/credencial` SEM token esgota o balde `default` e devolve 429 aos         ║
 * ║ consultores exatamente como pela porta anônima. "Tem guard de sessão" protege o DADO, e não  ║
 * ║ protege a COTA.                                                                             ║
 * ╚═════════════════════════════════════════════════════════════════════════════════════════════╝
 *
 * DOIS PERFIS, DOIS CONJUNTOS DE BALDE, e nenhuma porta gasta a cota da outra. O guard não sabe
 * qual dos dois está servindo: os números e os nomes chegam pela subclasse.
 *
 * O QUE ELE DELIBERADAMENTE NÃO FAZ: `trust proxy` no Express. Ligá-lo mudaria o `req.ip` de TODAS
 * as rotas do sistema de uma vez, alcançando produção validada inteira (§A.26/§A.27), e ainda daria
 * ao atacante tentativas ilimitadas no balde global (é só rotacionar o cabeçalho), que é o achado
 * já medido em `vt.service.ts`. O IP daqui é lido À MÃO, ancorado na topologia declarada, e só
 * decide DENTRO destes baldes.
 *
 * A ORDEM É IP PRIMEIRO, SUPERFÍCIE DEPOIS, e ela é a defesa: quem já estourou o próprio teto sai
 * pelo 429 SEM tocar o balde da superfície, então um único abusador não consegue empurrar a
 * superfície contra os outros candidatos.
 *
 * §A.6: o IP NUNCA vira chave em claro. A chave do balde é `ipHashDe` (o mesmo hash com sal mensal
 * da trilha), e o endereço em claro não entra em log nem em tabela por este caminho.
 */
abstract class PortalRitmoBase implements CanActivate {
  protected abstract readonly porta: PortaDoRitmo;
  protected abstract readonly limites: PerfilDeRitmo;
  protected abstract readonly baldes: typeof BALDES_RITMO_PORTAL | typeof BALDES_RITMO_SESSAO;

  constructor(
    @Inject(ThrottlerStorage) private readonly throttle: ThrottlerStorage,
    private readonly config: ConfigService,
    private readonly trilha: PortalTrilhaService,
    private readonly contadores: PortalRitmoContadores,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<Request>();
    const segredoRecebido = req.headers["x-portal-borda"];
    const origem = origemDaRequisicao(req.headers["x-forwarded-for"], {
      saltos: saltosConfiaveisDaConfiguracao(
        this.config.get<string>("PORTAL_RITMO_SALTOS_CONFIAVEIS"),
      ),
      proxiesEsperados: proxiesEsperadosDaConfiguracao(
        this.config.get<string>("PORTAL_RITMO_PROXY_ESPERADO"),
      ),
      segredoEsperado: this.config.get<string>("PORTAL_RITMO_BORDA_SEGREDO") ?? null,
      segredoRecebido: Array.isArray(segredoRecebido) ? segredoRecebido[0] : segredoRecebido,
    });
    // VETO 2: o desfecho da derivação SEMPRE é contado, inclusive o desfecho vazio. É o que impede
    // que "configurei e não funciona" fique indistinguível de "configurei e funciona".
    this.contadores.registrarOrigem(origem.motivo);

    if (origem.ip) {
      const chave = ipHashDe(origem.ip, pepperDaTrilha());
      if (
        await this.estourou(
          `${this.baldes.RAJADA}:${chave}`,
          this.limites.IP_RAJADA_JANELA_MS,
          this.limites.IP_RAJADA_LIMITE,
          this.baldes.RAJADA,
        )
      ) {
        await this.recusar("RITMO_IP", this.limites.IP_RAJADA_JANELA_MS, origem.ip);
      }
      if (
        await this.estourou(
          `${this.baldes.SUSTENTADO}:${chave}`,
          this.limites.IP_JANELA_MS,
          this.limites.IP_LIMITE,
          this.baldes.SUSTENTADO,
        )
      ) {
        await this.recusar("RITMO_IP", this.limites.IP_JANELA_MS, origem.ip);
      }
    }

    if (
      await this.estourou(
        this.baldes.SUPERFICIE,
        this.limites.SUPERFICIE_JANELA_MS,
        this.limites.SUPERFICIE_LIMITE,
        this.baldes.SUPERFICIE,
      )
    ) {
      await this.recusar("RITMO_SUPERFICIE", this.limites.SUPERFICIE_JANELA_MS, null);
    }

    return true;
  }

  /**
   * Um toque no balde, no molde do `estourou` de `PortalIdentidadeService`: mesmo
   * `ThrottlerStorage` injetado, NOMES próprios, e a duração do bloqueio igual à da janela (o teto
   * passa sozinho, sem nada durável escrito).
   *
   * VALE AQUI A MESMA RESSALVA JÁ REGISTRADA LÁ, e ela não é desta frente: o armazém é um `Map` em
   * memória POR PROCESSO. Com uma instância do backend, que é o caso hoje, o número bate; com N
   * instâncias o teto efetivo vira N vezes o declarado. E o REINÍCIO ZERA os baldes: quem foi
   * barrado volta a ter janela cheia. É aceitável porque nenhum dos limites deste arquivo é a
   * defesa durável do Portal (os que gravam, o teto por link e por CPF da identificação e o teto
   * por e-mail da porta de e-mail, vivem no banco e atravessam reinício); este é o freio de
   * VOLUME, e reinício é evento raro, manual e nosso, não algo que o atacante provoque.
   */
  private async estourou(
    chave: string,
    janelaMs: number,
    limite: number,
    nome: string,
  ): Promise<boolean> {
    const r = await this.throttle.increment(chave, janelaMs, limite, janelaMs, nome);
    return r.isBlocked;
  }

  /**
   * O 429, e ele é CONSTANTE. Mesmo código, mesma frase e mesmo corpo para as duas regras, para os
   * dois perfis e para as onze rotas: nada aqui pode dizer qual balde mordeu, nem que o CPF existe,
   * nem que o e-mail existe (vetos V7 e F9). A resposta de quem estourou é indistinguível da de
   * qualquer outro, E TAMBÉM da do teto por CPF e por link que já existia: é o MESMO corpo.
   */
  private async recusar(regra: RegraDeRitmo, janelaMs: number, ip: string | null): Promise<never> {
    this.contadores.registrarRecusa(this.porta, regra);
    await this.registrarEstouro(regra, janelaMs, ip);
    throw new HttpException(
      {
        codigo: PORTAL_RITMO_CODIGO,
        mensagem: PORTAL_IDENTIFICACAO_BLOQUEADA,
        message: PORTAL_IDENTIFICACAO_BLOQUEADA,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /**
   * A TRILHA DO ESTOURO, ESTRANGULADA NO PRÓPRIO LIMITADOR (evento L17, `PORTAL_LIMITE_ATINGIDO`).
   *
   * Uma linha por regra por minuto, no máximo, e o estrangulamento é a razão de o registro poder
   * existir: sem ele, cada requisição barrada custaria um insert, e um laço encheria a trilha às
   * centenas de milhares por dia, apagando o sinal que ela existe para dar. O preço (não distinguir
   * um abusador de quarenta legítimos barrados) é pago pelo CONTADOR agregado, que é de graça.
   *
   * §A.6: vai o HASH do IP (sal mensal, derivado dentro do `PortalTrilhaService`), a regra e a
   * janela. NÃO vai o endereço em claro (nenhum `ipCompleto` é passado, então nada é escrito em
   * `portal_eventos_ip`). Falhar ao registrar NUNCA muda o desfecho: o 429 já foi decidido.
   */
  private async registrarEstouro(
    regra: RegraDeRitmo,
    janelaMs: number,
    ip: string | null,
  ): Promise<void> {
    try {
      if (!this.trilha.configurada()) return;
      const estrangulado = await this.estourou(
        `${this.baldes.TRILHA}:${regra}`,
        this.limites.TRILHA_JANELA_MS,
        this.limites.TRILHA_LIMITE,
        this.baldes.TRILHA,
      );
      if (estrangulado) return;
      await this.trilha.registrar("PORTAL_LIMITE_ATINGIDO", {
        resultado: "RECUSADO",
        motivoCodigo: "RITMO",
        regra,
        janela: Math.round(janelaMs / 1000),
        ...(ip ? { ip } : {}),
      });
    } catch {
      // A recusa não depende do log. Ver `PortalTrilhaService.registrar`: a mesma assimetria.
    }
  }
}

/** As CINCO rotas anônimas: `identificar`, `recuperacao` e as três de `acesso-email`. */
@Injectable()
export class PortalRitmoGuard extends PortalRitmoBase {
  protected readonly porta = "ANONIMA" as const;
  protected readonly limites = LIMITES_RITMO_PORTAL;
  protected readonly baldes = BALDES_RITMO_PORTAL;
}

/**
 * As SEIS rotas com sessão. Elas exigem o bilhete para FAZER qualquer coisa, e não exigem nada para
 * CONSUMIR COTA: é por isso que elas precisam do limitador tanto quanto as anônimas (veto 5).
 */
@Injectable()
export class PortalRitmoSessaoGuard extends PortalRitmoBase {
  protected readonly porta = "SESSAO" as const;
  protected readonly limites = LIMITES_RITMO_SESSAO;
  protected readonly baldes = BALDES_RITMO_SESSAO;
}
