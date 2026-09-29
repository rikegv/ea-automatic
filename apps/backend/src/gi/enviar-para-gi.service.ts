import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  executarGatilhoGi,
  montarFuncionarioSelecao,
  type FuncionarioSelecao,
} from "../domain/portal-dados-gi";
import { GiApiService } from "./gi-api.service";
import { GiDeParaService } from "./gi-depara.service";
import { GiLeitorService } from "./gi-leitor.service";

/** Código fechado do desfecho, para a tela/trilha. NUNCA carrega PII. */
export type GiEnvioMotivo =
  | "GI_NAO_CONFIGURADO"
  | "GI_AUTOMATICO_INERTE"
  | "GI_SEM_DADOS_PESSOA"
  | "GI_JA_ENVIADO"
  | "GI_MONTADO_NAO_DISPARADO"
  | "GI_ENVIADO"
  | "GI_FALHA_ENVIO";

export interface GiEnvioResultado {
  enviado: boolean;
  motivo: GiEnvioMotivo;
}

/**
 * PORTAL→GI, PEÇA 3: o ponto por onde o EA "manda a pessoa para a folha" (G.I), por `FuncionarioSelecao`
 * (pré-admissão), nunca em `Funcionario` (a folha oficial, fechada para a credencial).
 *
 * DOIS GATILHOS, UMA SÓ PORTA DE ENVIO REAL, e essa separação é o coração do "1 ENVIO SÓ":
 *
 *  - `enviar()`  ← o gatilho AUTOMÁTICO (fechamento da auditoria, `auditoria.service.ts`). NUNCA envia.
 *    É ESTRUTURALMENTE INCAPAZ de enviar: a ÚNICA coisa que ele toca no `GiApiService` é o getter
 *    read-only `configurado()` (compara comprimentos de string de config, sem rede). Não lê a pessoa,
 *    não monta payload e não chama `criarFuncionarioSelecao`. Só delega ao gatilho puro
 *    `executarGatilhoGi`, que é no-op. Assim, fechar auditoria em MASSA (uma leva de admissões)
 *    jamais dispara N criações no GI.
 *
 *  - `enviarManual()` ← o gatilho MANUAL (botão do time, `EnviarParaGiController`, MASTER/SUPER_ADMIN).
 *    É a ÚNICA porta que chega perto do envio real, e um-a-um por admissão. Mesmo ela é travada por
 *    `GI_DISPARO_ARMADO`, que nasce e permanece DESLIGADA nesta entrega: com a flag off, monta o
 *    payload e PARA (`GI_MONTADO_NAO_DISPARADO`), sem chamar `POST FuncionarioSelecao/Add`.
 *
 * IDEMPOTÊNCIA por admissão (leitor `jaEnviado`): rodar o manual duas vezes não cria dois registros.
 *
 * §A.6: o log NUNCA leva PII (nem o `admissaoId`). Credencial/URL/token do GI nunca são logados nem
 * persistidos, mesmo padrão de Pandapé/Clicksign.
 */
@Injectable()
export class EnviarParaGiService {
  private readonly log = new Logger("EnviarParaGiService");

  constructor(
    private readonly config: ConfigService,
    private readonly giApi: GiApiService,
    private readonly leitor: GiLeitorService,
    private readonly depara: GiDeParaService,
  ) {}

  /** O cliente do GI está configurado (URL + os 4 campos da credencial de 2 etapas)? */
  private configurado(): boolean {
    return this.giApi.configurado();
  }

  /** O disparo real está ARMADO? Só "true" arma. Nasce e permanece DESLIGADO nesta entrega. */
  private disparoArmado(): boolean {
    return (this.config.get<string>("GI_DISPARO_ARMADO") ?? "").trim().toLowerCase() === "true";
  }

  /**
   * GATILHO AUTOMÁTICO (auditoria). SEMPRE no-op: nunca envia, nunca monta payload, nunca toca o
   * cliente do GI. Preserva o rastro pelo gatilho puro `executarGatilhoGi` (fail-closed, sem PII).
   *
   * A porta `enviarAoGi` aqui é um stub deliberado: mesmo que o GI esteja configurado, o automático
   * não pode virar disparo em massa. O envio real vive SÓ no `enviarManual`.
   */
  async enviar(_admissaoId: string): Promise<GiEnvioResultado> {
    const configurado = this.configurado();
    await executarGatilhoGi(
      {
        enviarAoGi: async (_payload: FuncionarioSelecao) => ({}),
        log: (mensagem: string) => this.log.log(mensagem),
      },
      { giConfigurado: configurado, pessoa: {} },
    );
    return {
      enviado: false,
      motivo: configurado ? "GI_AUTOMATICO_INERTE" : "GI_NAO_CONFIGURADO",
    };
  }

  /**
   * GATILHO MANUAL (botão do time). A ÚNICA porta que envia de verdade, um-a-um, e ainda assim atrás
   * de `GI_DISPARO_ARMADO`. O `autorId` é o usuário que clicou (para a trilha do GI, quando a tela da
   * peça 3 existir); hoje não é logado (§A.6).
   *
   * Fluxo, na ordem que garante fail-closed e idempotência:
   *   1. não configurado  → não toca a rede, não lê pessoa. `GI_NAO_CONFIGURADO`.
   *   2. já enviado        → idempotência: não recria. `GI_JA_ENVIADO`.
   *   3. sem dados de pessoa → fail-closed: não envia vazio. `GI_SEM_DADOS_PESSOA`.
   *   4. monta o payload só-de-pessoa (com de/para de cidade/banco).
   *   5. disparo DESARMADO → PARA aqui. `GI_MONTADO_NAO_DISPARADO` (estado desta entrega).
   *   6. disparo ARMADO    → cria no GI e carimba a idempotência. `GI_ENVIADO` / `GI_FALHA_ENVIO`.
   */
  async enviarManual(admissaoId: string, _autorId: string): Promise<GiEnvioResultado> {
    if (!this.configurado()) {
      this.log.log("GI nao configurado: gatilho manual inerte.");
      return { enviado: false, motivo: "GI_NAO_CONFIGURADO" };
    }

    if (await this.leitor.jaEnviado(admissaoId)) {
      this.log.log("GI: admissao ja enviada, idempotencia (no-op).");
      return { enviado: false, motivo: "GI_JA_ENVIADO" };
    }

    const pessoa = await this.leitor.lerPessoa(admissaoId);
    if (!pessoa || (!pessoa.cpf && !pessoa.nome)) {
      this.log.warn("GI: sem dados de pessoa para a admissao (nao envia).");
      return { enviado: false, motivo: "GI_SEM_DADOS_PESSOA" };
    }

    // Monta o payload SÓ-de-pessoa (allowlist) com o de/para de cidade/banco. O objeto é PII e não
    // é logado nem retornado; morre no escopo deste método.
    const payload = montarFuncionarioSelecao(pessoa, this.depara);

    if (!this.disparoArmado()) {
      // ESTADO DESTA ENTREGA: monta e para. NENHUM POST FuncionarioSelecao/Add é feito.
      this.log.log("GI: payload montado, disparo DESARMADO (GI_DISPARO_ARMADO off): nao disparado.");
      return { enviado: false, motivo: "GI_MONTADO_NAO_DISPARADO" };
    }

    // ── DAQUI PARA BAIXO só roda com GI_DISPARO_ARMADO=true (não nesta entrega). ──
    const r = await this.giApi.criarFuncionarioSelecao(payload);
    if (!r.ok) {
      this.log.error("GI: falha ao criar FuncionarioSelecao (ver status no log do cliente).");
      return { enviado: false, motivo: "GI_FALHA_ENVIO" };
    }
    await this.leitor.marcarEnviado(admissaoId, r.funcionarioSelecaoId);
    this.log.log("GI: FuncionarioSelecao criado e idempotencia carimbada.");
    return { enviado: true, motivo: "GI_ENVIADO" };
  }
}
