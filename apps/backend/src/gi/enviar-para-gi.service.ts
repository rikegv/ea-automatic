import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  executarGatilhoGi,
  montarFuncionarioSelecao,
  recusaDaContratacaoGi,
  type FuncionarioSelecao,
  type GiRecusaContratacao,
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
  /**
   * RECUSA DURA: o vínculo do cliente não RESOLVEU `codigoEmpresa` e `codigoFilial`, que no GI são `int16`
   * obrigatórios sem default. Nada é enviado: a omissão faria o fornecedor gravar `0`, calado, e o
   * registro órfão que isso cria já foi medido na produção dele. Destrava-se cadastrando
   * `cliente_vinculos` (empresa + filial) do tipo de contrato da admissão.
   *
   * ⚠️ A régua é a PRESENÇA da resolução, não o valor: **filial `0` resolvida é LEGÍTIMA e passa** (existe
   * para todas as 47 empresas do GI). Empresa `0` recusa, porque empresa 0 não existe lá.
   */
  | "GI_SEM_EMPRESA_FILIAL"
  /**
   * RECUSA DURA: empresa e filial resolveram, mas o PAR não está na lista autoritativa do GI
   * (`GI_PARES_EMPRESA_FILIAL`, materializada de `Empresa/GetAll`, 127 pares). `1/37` é válido campo a
   * campo e inexistente no fornecedor. **Sem a lista configurada, nenhum par é conhecido e tudo recusa.**
   */
  | "GI_PAR_EMPRESA_FILIAL_DESCONHECIDO"
  /**
   * RECUSA DURA: salário ausente, ZERO ou NEGATIVO. O campo tem `default 0` no GI, e salário zero em
   * folha é salário ERRADO, não campo vazio. §A.6: o motivo é código fechado e **não carrega o valor**.
   */
  | "GI_SALARIO_INVALIDO"
  | "GI_ENVIADO"
  | "GI_FALHA_ENVIO";

export interface GiEnvioResultado {
  enviado: boolean;
  motivo: GiEnvioMotivo;
}

/**
 * A frase de log de cada recusa de contratação. §A.6: são RÓTULOS FIXOS. Nenhuma delas interpola valor,
 * e em especial nenhuma menciona o salário, porque salário em log é remuneração em log.
 */
const MOTIVO_RECUSA_CONTRATACAO: Record<GiRecusaContratacao, string> = {
  GI_SEM_EMPRESA_FILIAL:
    "GI: empresa/filial do vinculo do cliente nao resolvidas (cliente_vinculos): envio RECUSADO.",
  GI_PAR_EMPRESA_FILIAL_DESCONHECIDO:
    "GI: o par empresa/filial nao consta da lista autoritativa do GI (GI_PARES_EMPRESA_FILIAL): envio RECUSADO.",
  GI_SALARIO_INVALIDO: "GI: salario ausente ou fora de faixa para a folha: envio RECUSADO.",
};

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
   *   4. monta o payload: pessoa (allowlist 1) + contratação (allowlist 2), com o de/para de cidade.
   *   5. disparo DESARMADO → PARA aqui. `GI_MONTADO_NAO_DISPARADO` (estado desta entrega).
   *   6. contratação incompleta → RECUSA sem tocar a rede: `GI_SEM_EMPRESA_FILIAL`,
   *      `GI_PAR_EMPRESA_FILIAL_DESCONHECIDO` ou `GI_SALARIO_INVALIDO`.
   *   7. disparo ARMADO    → cria no GI e carimba a idempotência. `GI_ENVIADO` / `GI_FALHA_ENVIO`.
   *
   * POR QUE AS GUARDAS DA CONTRATAÇÃO VÊM NO PASSO 6, e não antes do 5: a trava `GI_DISPARO_ARMADO` é a
   * garantia mais forte da frente, e o desfecho dela não muda por causa de dado faltando. As guardas
   * ficam ENCOSTADAS no `POST`, que é onde o dano aconteceria e onde elas não podem ser contornadas.
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

    // Os SEIS campos de contratação (salário, data de admissão, vínculo, prazo, empresa+filial), por
    // porta própria e recorte explícito de colunas. Ausentes, saem nulos e as guardas do passo 6 recusam.
    const contratacao = await this.leitor.lerContratacao(admissaoId);

    // Monta o payload das DUAS allowlists FECHADAS (pessoa + os seis campos nomeados) com o de/para de
    // cidade. O objeto carrega PII E SALÁRIO: não é logado, não é retornado, morre no escopo do método.
    const payload = montarFuncionarioSelecao(pessoa, this.depara, contratacao ?? undefined);

    if (!this.disparoArmado()) {
      // ESTADO DESTA ENTREGA: monta e para. NENHUM POST FuncionarioSelecao/Add é feito.
      this.log.log("GI: payload montado, disparo DESARMADO (GI_DISPARO_ARMADO off): nao disparado.");
      return { enviado: false, motivo: "GI_MONTADO_NAO_DISPARADO" };
    }

    // ── DAQUI PARA BAIXO só roda com GI_DISPARO_ARMADO=true (não nesta entrega). ──

    // AS GUARDAS DURAS, encostadas no POST. Empresa e filial são `int16` obrigatórios sem default: a
    // omissão faz o fornecedor gravar `0` e criar registro órfão, calado. A validação do PAR entra junto,
    // porque campo a campo não pega `1/37` (válido nos dois campos, inexistente no GI). E salário
    // zero/negativo é salário ERRADO indo para a folha, não campo vazio.
    // §A.6: o log diz o MOTIVO e nada mais. Nenhum valor, nenhum id de pessoa, nenhuma remuneração.
    // O predicado do PAR tem TIPO PROPRIO (`ParEmpresaFilialConhecido`) e e injetado AQUI, no servico que
    // o usa, nao em `DeParaGi` (que e o contrato do MONTADOR, e o montador nao valida par). Chamada
    // DIRETA, sem `?.`: o metodo e obrigatorio em quem o provê, e o fail-closed vem da LISTA vazia
    // (nenhum par conhecido = recusa), nunca de o metodo poder faltar, que faria a guarda ser opcional.
    const recusa = recusaDaContratacaoGi(
      payload,
      (empresa, filial) => this.depara.parEmpresaFilialConhecido(empresa, filial),
    );
    if (recusa) {
      this.log.warn(MOTIVO_RECUSA_CONTRATACAO[recusa]);
      return { enviado: false, motivo: recusa };
    }

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
