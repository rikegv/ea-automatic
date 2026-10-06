import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";
import { Public } from "../auth/decorators";
import {
  ConfirmarCodigoDto,
  IdentidadeDoAcessoDto,
  SolicitarCodigoDto,
} from "./portal-acesso-email.dto";
import { PortalAcessoEmailService } from "./portal-acesso-email.service";
import { PortalRitmoGuard } from "./portal-ritmo.guard";

/**
 * A PORTA DE E-MAIL DO CANDIDATO. Três rotas, e NENHUMA delas entrega sessão.
 *
 * Contrato NORMATIVO: `docs/CONTRATO-PORTAL-ACESSO-EMAIL.md` (v2), seções 1 e 6.
 *
 * ┌─ POR QUE NÃO HÁ `PortalSessaoGuard` AQUI, e a ausência não é um esquecimento ────────────────┐
 * │ As outras rotas do candidato são `@Public()` MAIS o guard de sessão: o `@Public()` tira o      │
 * │ `JwtAuthGuard` global do caminho, e quem autoriza é o guard. Estas três são ANTERIORES a        │
 * │ qualquer sessão: elas existem justamente para quem NÃO consegue entrar, e exigir o bilhete de   │
 * │ sessão aqui seria pedir a credencial que o fluxo existe para obter. É a mesma dupla de          │
 * │ `POST portal/identificar` e `POST portal/recuperacao`, que também são `@Public()` sem guard.    │
 * │                                                                                             │
 * │ A PROTEÇÃO REAL, então, é OUTRA, e está no serviço: a resposta única de `solicitar`             │
 * │ (anti-enumeração), o código de 6 dígitos com HMAC e teto de 5 tentativas que DESTROI o código,  │
 * │ os baldes de 3 por hora e 10 por dia, o bilhete opaco de uso único, a trava de divergência e o  │
 * │ fail-closed de 503 sem pepper e sem correio. Nenhuma delas concede acesso a documento nenhum:   │
 * │ o desfecho de sucesso é um E-MAIL com o link, e o link ainda pede CPF e nascimento.             │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ELAS PRECISAM ENTRAR NA ALLOWLIST DA BARREIRA, por CAMINHO e nunca por prefixo (item F7 do
 * documento de regras, e a mesma nota das outras controllers do candidato). O prefixo `portal/`
 * também abriga `portal/links/*`, que é do TIME: allowlist por prefixo exporia aquela ao mundo.
 *
 * AS TRÊS ESTÃO SOB O `PortalRitmoGuard`, com `@SkipThrottle()`: elas saem do balde global (que
 * conta por `req.ip`, e no Portal todo mundo chega como o mesmo endereço) e passam a contar num
 * balde PRÓPRIO, por IP quando há IP confiável e por superfície sempre. `acesso-email/solicitar` é
 * a rota mais atraente de todas para automatizar, e era por ela que o laço consumia a cota dos
 * consultores. O limite que DECIDE continua sendo o POR E-MAIL, do serviço; o guard é freio de
 * VOLUME, e não substitui nenhum dos baldes de lá.
 *
 * §A.6: nenhuma destas rotas loga corpo, e nenhuma devolve dado da pessoa. `confirmar` devolve o
 * bilhete e o prazo, e nada mais (proibição O10: sem nome, nem mascarado).
 */
@Controller("portal")
export class PortalAcessoEmailController {
  constructor(private readonly acesso: PortalAcessoEmailService) {}

  /**
   * PASSO 1. Resposta ÚNICA, byte a byte, exista ou não o e-mail: é o anti-enumeração, e ele é
   * calculado na primeira linha do serviço para que nenhum caminho novo tenha outra coisa a devolver.
   */
  @Post("acesso-email/solicitar")
  @Public()
  @SkipThrottle()
  @UseGuards(PortalRitmoGuard)
  solicitar(@Req() req: Request, @Body() dto: SolicitarCodigoDto) {
    return this.acesso.solicitar({
      email: dto.email,
      ip: this.ipDaBarreira(req),
      userAgent: req.headers["user-agent"] ?? null,
    });
  }

  /** PASSO 2. Devolve o bilhete de identificação e NADA da pessoa. Não é sessão do Portal. */
  @Post("acesso-email/confirmar")
  @Public()
  @SkipThrottle()
  @UseGuards(PortalRitmoGuard)
  confirmar(@Req() req: Request, @Body() dto: ConfirmarCodigoDto) {
    return this.acesso.confirmar({
      email: dto.email,
      codigo: dto.codigo,
      ip: this.ipDaBarreira(req),
      userAgent: req.headers["user-agent"] ?? null,
    });
  }

  /**
   * PASSO 3. Grava `cpf` e `data_nascimento` na ficha do funil e, havendo admissão viva pelo VÍNCULO,
   * pede o ENVIO do link pelo caminho que já existe. Não devolve sessão em nenhum desfecho.
   */
  @Post("acesso-email/identidade")
  @Public()
  @SkipThrottle()
  @UseGuards(PortalRitmoGuard)
  identidade(@Req() req: Request, @Body() dto: IdentidadeDoAcessoDto) {
    return this.acesso.identidade({
      bilhete: dto.bilhete,
      cpf: dto.cpf,
      dataNascimento: dto.dataNascimento,
      ip: this.ipDaBarreira(req),
      userAgent: req.headers["user-agent"] ?? null,
    });
  }

  /**
   * IP do candidato, e ele só existe se a BARREIRA o escrever (item F1). Cópia deliberada do
   * `PortalController`: sem `trust proxy` o socket é sempre `127.0.0.1` e o `x-forwarded-for` que
   * chega é o que o CLIENTE mandar, forjado intacto.
   *
   * POR ISSO ELE NÃO DECIDE NADA, NUNCA: não limita, não bloqueia e não autoriza. Os baldes desta
   * porta são chaveados pelo HASH DO E-MAIL, e não por este valor. Ele só alimenta a trilha, e mesmo
   * ali entra hasheado com sal mensal, com o endereço completo indo para a tabela restrita.
   */
  private ipDaBarreira(req: Request): string | null {
    const cabecalho = req.headers["x-forwarded-for"];
    const bruto = (Array.isArray(cabecalho) ? cabecalho[0] : cabecalho)?.split(",")[0]?.trim();
    if (!bruto) return null;
    return bruto.replace(/^::ffff:/, "").slice(0, 45);
  }
}
