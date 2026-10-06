import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  montarFuncionarioSelecao,
  origemAutorizadaParaGi,
  recusaDaContratacaoGi,
  type GiRecusaContratacao,
} from "../domain/portal-dados-gi";
import { admissaoEncerrada, admissaoOperavel } from "../domain/admissao";
import { GiApiService } from "./gi-api.service";
import { GiDeParaService } from "./gi-depara.service";
import { GiLeitorService } from "./gi-leitor.service";

/** Código fechado do desfecho, para a tela/trilha. NUNCA carrega PII. */
export type GiEnvioMotivo =
  | "GI_NAO_CONFIGURADO"
  /**
   * RECUSA DO GATILHO AUTOMÁTICO: a admissão não é OPERÁVEL por processo automático, pela régua única
   * `admissaoOperavel` (farol VIVO e não pausada). Substitui o antigo `GI_AUTOMATICO_INERTE`, que
   * existia porque o automático era um no-op estrutural: agora ele envia, então o que resta registrar
   * é POR QUE aquela admissão não vai.
   *
   * ⚠️ Não é redundância com o gate de transição: medido em 05/10/2026, há admissão com a régua
   * obrigatória COMPLETA, a frente AUDITORIA `concluida = false` e farol `DECLINOU` ou `RESCISAO`,
   * toda ela dentro das candidatas do runner em lote (`drive_pasta_url` nulo). Sem esta guarda, o
   * runner faria a transição acontecer e mandaria um declinado para a folha do fornecedor.
   */
  | "GI_ADMISSAO_NAO_OPERAVEL"
  /**
   * RECUSA DO GATILHO AUTOMÁTICO: a ORIGEM da admissão não está na allowlist
   * `ORIGENS_AUTORIZADAS_A_ENVIAR_AO_GI` (`domain/portal-dados-gi`), hoje só `MANUAL`.
   *
   * O CASO CONCRETO é a admissão nascida do webhook do Pandapé (`origem = "PANDAPE"`): ela **já é
   * enviada ao G.I por fora do EA** (§A.5, envio Pandapé para o G.I único e irreversível), então o
   * gatilho automático mandá-la de novo DUPLICARIA a pessoa na folha do fornecedor.
   *
   * ⚠️ É ALLOWLIST e não denylist: **origem futura nasce BLOQUEADA**. Ver o símbolo para o porquê.
   *
   * ⚠️ VALE SÓ PARA O AUTOMÁTICO. O botão manual não consulta esta régua: enviar um Pandapé a mão pode
   * ser legítimo, e essa é uma decisão do diretor que ele não tomou.
   */
  | "GI_ORIGEM_NAO_AUTORIZADA"
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
  /**
   * RECUSA DURA: o salário é válido e **ninguém declarou a UNIDADE** (por HORA ou MENSAL). O
   * `tipoSalario` do GI tem `default 'M'` (Mês), e medido na produção em 01/10/2026 há **7 admissões
   * VIVAS com `9,34` e `10,90`**, que são valores de HORA: sem a declaração, as 7 entram na folha como
   * salário MENSAL de R$ 9,34, em silêncio, passando por todas as outras guardas (§A.33).
   *
   * Regra permanente do diretor: **nenhum salário é gravado na folha sem auditoria do time.** Dedução
   * por faixa de valor está VETADA. Destrava-se declarando `dados_vaga_folha.salario_unidade` (0140),
   * que é o próprio ato de auditoria. §A.6: o motivo é código fechado e **não carrega o valor**.
   */
  | "GI_SALARIO_SEM_UNIDADE"
  /**
   * RECUSA DURA: a unidade FOI declarada e é **HORA**, e **falta a JORNADA** em horas que o GI exige junto.
   * Medido no contrato: ao lado de `salario`/`tipoSalario` existem `salarioHora`, `qtdeHorasMes` e
   * `qtdeHorasSem`, **todos com default `0`**, e o EA emite só os campos nomeados da allowlist. Então
   * `tipoSalario = 'H'` sem jornada gravaria um horista com ZERO horas por mês: deixaria de ser "9,34
   * mensal" para ser "9,34 por hora vezes 0 horas", que é outro valor errado, pela MESMA falha de default
   * `0` em campo de folha.
   *
   * ⚠️ **PENDÊNCIA PREENCHÍVEL, NÃO RECUSA PERPÉTUA, e foi isso que a 0140 mudou.** Antes dela o EA não
   * tinha jornada em lugar nenhum (`escala` é texto livre, `tempo_contrato` é vigência em dias), então o
   * horista auditado era recusado PARA SEMPRE, e **uma admissão que o time auditou e que o sistema recusa
   * para sempre é indistinguível de uma admissão quebrada**: ninguém sabe o que preencher. Agora existem
   * `dados_vaga_folha.jornada_horas_mes` e `jornada_horas_sem`, o motivo NOMEIA o que falta, e informar a
   * jornada destrava o envio. **AS DUAS são exigidas** (mensal sem semanal grava contradição no
   * fornecedor), e só para o `H`. §A.6: o motivo não carrega valor, nem salário nem horas.
   */
  | "GI_SALARIO_HORISTA_SEM_JORNADA"
  /**
   * RECUSA DURA: o **CLIENTE FINAL** não resolveu. ⚠️ Não é a empresa do Grupo Soulan
   * (`GI_SEM_EMPRESA_FILIAL`, que vem de `cliente_vinculos`): é o TOMADOR, o `codigoCliente` do GI, que
   * sai de `admissoes.cod_cliente` por de/para DIRETO (medido em 02/10/2026: `cod_cliente` é numérico em
   * 244 de 251 clientes, e **243 dos 244 casam** com um `codigoCliente` real do GI, 99%).
   *
   * Dois caminhos chegam aqui: admissão **sem cliente** (a pré-admissão do Pandapé nasce assim) e
   * `cod_cliente` **não numérico** (7 na base). Nos dois o campo é `int32` com **`default 0`** no
   * fornecedor, e `0` **não é "vazio": é referência a cliente INEXISTENTE**, a mesma família do registro
   * órfão já medido em empresa/filial. Destrava-se corrigindo o `cod_cliente` do cliente. §A.6: o motivo é
   * código fechado e não carrega valor.
   */
  | "GI_CLIENTE_NAO_RESOLVIDO"
  | "GI_ENVIADO"
  | "GI_FALHA_ENVIO";

export interface GiEnvioResultado {
  enviado: boolean;
  motivo: GiEnvioMotivo;
}

/**
 * O CONTEXTO do gatilho AUTOMÁTICO, fornecido por quem fechou a auditoria. São os dois campos que a
 * régua `admissaoOperavel` consome, mais o autor do ato.
 *
 * ⚠️ Os dois são OPCIONAIS no tipo e isso NÃO afrouxa nada: `admissaoOperavel(undefined, undefined)` é
 * `false`, então chamador que esquecer de preencher NÃO envia. Fail-closed por construção, no mesmo
 * padrão da lista vazia de pares empresa/filial.
 */
export interface ContextoEnvioAutomaticoGi {
  /** `admissoes.farol_global` CORRENTE (já reavaliado pela conclusão da frente). */
  farolGlobal?: string | null;
  /** `admissoes.pausada_em`. Preenchido = admissão pausada = não envia. */
  pausadaEm?: Date | string | null;
  /** O autor do pós-veredito que fechou a frente (trilha do GI, quando a tela da peça 3 existir). */
  autorId: string;
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
  GI_SALARIO_SEM_UNIDADE:
    "GI: unidade do salario nao declarada pelo time (hora ou mensal): envio RECUSADO.",
  // A FRASE DIZ O QUE FALTA, nao so que recusou: e a diferenca entre pendencia preenchivel e admissao
  // que parece quebrada. §A.6: nenhum valor, nem o salario nem as horas.
  GI_SALARIO_HORISTA_SEM_JORNADA:
    "GI: salario declarado por HORA e a jornada em horas nao esta informada (mensal e semanal, dados_vaga_folha.jornada_horas_mes/sem): envio RECUSADO, preencha a jornada.",
  // A FRASE DIZ **CLIENTE FINAL** com todas as letras, porque "cliente" sozinho e lido como empresa do
  // grupo e manda o time conferir `cliente_vinculos`, que e a outra recusa. §A.6: nenhum valor, nenhum
  // nome de cliente, nenhum id de admissao.
  GI_CLIENTE_NAO_RESOLVIDO:
    "GI: o CLIENTE FINAL (tomador) nao resolveu a partir de admissoes.cod_cliente (ausente ou nao numerico): envio RECUSADO, nunca se envia 0.",
};

/**
 * PORTAL→GI, PEÇA 3: o ponto por onde o EA "manda a pessoa para a folha" (G.I), por `FuncionarioSelecao`
 * (pré-admissão), nunca em `Funcionario` (a folha oficial, fechada para a credencial).
 *
 * DOIS GATILHOS, UMA SÓ PORTA DE ENVIO REAL, e essa separação é o coração do "1 ENVIO SÓ":
 *
 *  - `enviar()` ← o gatilho AUTOMÁTICO (fechamento da auditoria, `auditoria.service.ts`). É o caminho
 *    PRINCIPAL por decisão do diretor (05/10/2026): a auditoria fecha, a pessoa vai para a folha, sem
 *    ninguém clicar. ⚠️ Ele NÃO é uma porta mais frouxa: delega ao MESMO `enviarComGuardas` do manual,
 *    então passa por `jaEnviado`, pela trava `GI_DISPARO_ARMADO` e pelas SEIS recusas de contratação,
 *    na mesma ordem. O que ele TEM a mais são duas condições de entrada que o manual não tem:
 *      (1) a TRANSIÇÃO da frente (quem decide é `auditoria.service`, pelo `rowCount` do UPDATE
 *          condicional: régua completa é ESTADO, e estado re-disparado mandaria a mesma pessoa de novo
 *          a cada passagem dos oito chamadores do pós-veredito, inclusive o runner em lote);
 *      (2) a TRAVA DE ORIGEM (`ORIGENS_AUTORIZADAS_A_ENVIAR_AO_GI`, hoje só `MANUAL`): a admissão do
 *          webhook do Pandapé NÃO vai pelo automático, porque o Pandapé já a envia ao G.I por fora do
 *          EA e mandá-la de novo duplicaria a pessoa na folha. É ALLOWLIST, então origem nova nasce
 *          bloqueada. ⚠️ Esta é a única guarda EXCLUSIVA do automático: ela NÃO vale no manual.
 *
 *  - `enviarManual()` ← o gatilho MANUAL (botão do time, `EnviarParaGiController`, MASTER/SUPER_ADMIN).
 *    Continua existindo como ALTERNATIVA, um-a-um por admissão, e sem o gate de transição (é um ato
 *    humano deliberado, não um evento do fluxo). Travado por `GI_DISPARO_ARMADO` como sempre.
 *
 * O ENCERRAMENTO PASSOU A VALER PARA OS DOIS em 06/10/2026, por decisão do diretor, em DUAS palavras:
 * declinado e rescindido NÃO saem por caminho nenhum, nem por MASTER/SUPER_ADMIN. A guarda é
 * `admissaoEncerrada` (`domain/admissao`) e mora dentro de `enviarComGuardas`, com o estado LIDO pelo
 * próprio serviço (`leitor.lerEstado`) em vez de vindo do chamador: guarda que depende de quem chama é
 * guarda que o próximo chamador contorna sem querer.
 *
 * ⚠️ ELA NÃO É `admissaoOperavel`, E A CONFUSÃO ENTRE AS DUAS CUSTARIA 2.002 ADMISSÕES: `ADMISSAO_CONCLUIDA`
 * não é farol VIVO, e é precisamente quem TEM de estar na folha. O automático continua checando
 * `admissaoOperavel` (farol vivo e não pausada), então ele é MAIS restrito que o manual, de propósito.
 *
 * A TRAVA `GI_DISPARO_ARMADO` é a chave dos DOIS gatilhos: com a flag off, os dois montam o payload e
 * PARAM (`GI_MONTADO_NAO_DISPARADO`), sem chamar `POST FuncionarioSelecao/Add`.
 *
 * `criarFuncionarioSelecao` É ALCANÇÁVEL POR UM PONTO SÓ (`enviarComGuardas`), e isso é desenho: duas
 * cadeias de guarda divergem no primeiro ajuste, e a que divergir para o lado permissivo é a que manda
 * gente errada para a folha.
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
   * `apiSincAdmissaoDigital` do payload: para QUAL lado o G.I sincroniza a pré-admissão recebida.
   *
   * O EA ENTREGA O MECANISMO, NÃO O VALOR: a decisão mora em `GI_API_SINC_ADMISSAO_DIGITAL` e o
   * **default é `false`**, que é o default do fornecedor. Só a string "true" liga; qualquer outra coisa
   * (vazia, ausente, "1", "sim") deixa como está. Mesma régua de leitura do `GI_DISPARO_ARMADO`: uma
   * forma só de ligar, para não existir meio-ligado.
   *
   * POR QUE A DECISÃO É DE `.env` E NÃO DE CÓDIGO: medido na produção do fornecedor em 05/10/2026, com
   * `false` a pré-admissão SOME em menos de 10 minutos e com `true` PERMANECE. Os dois lados têm custo
   * (com `false` a auditoria que fecha fora do horário faz o time PERDER a admissão; com `true` o dado
   * fica no fornecedor sem relógio ao nosso alcance), então quem decide é o diretor, e reverter é uma
   * linha de ambiente, não um commit.
   */
  private apiSincAdmissaoDigital(): boolean {
    return (
      (this.config.get<string>("GI_API_SINC_ADMISSAO_DIGITAL") ?? "").trim().toLowerCase() === "true"
    );
  }

  /**
   * GATILHO AUTOMÁTICO (fechamento da auditoria). ENVIA de verdade, pela MESMA cadeia do manual.
   *
   * QUEM DECIDE A TRANSIÇÃO NÃO É ESTE MÉTODO, e isso é deliberado: a pergunta "a frente fechou NESTA
   * chamada?" só tem resposta atômica dentro da transação que fecha a frente, então ela mora no
   * `auditoria.service` (UPDATE condicional, `rowCount === 1`), e este método só é chamado quando a
   * resposta foi sim. Duplicar a pergunta aqui seria uma segunda régua, com uma segunda resposta.
   *
   * O QUE ESTE MÉTODO DECIDE SOZINHO É A ORIGEM: só admissão de origem AUTORIZADA
   * (`ORIGENS_AUTORIZADAS_A_ENVIAR_AO_GI`, hoje só `MANUAL`) vai pelo automático. A do webhook do
   * Pandapé não vai, porque já é enviada ao G.I por fora do EA.
   *
   * A OPERABILIDADE (`admissaoOperavel`, `domain/admissao`: farol VIVO derivado de `FAROIS_VIVOS`, então
   * DECLINOU, RESCISAO, ADMISSAO_CONCLUIDA e os faróis de liberação ficam de fora por construção, E
   * admissão não PAUSADA) continua sendo régua SÓ DO AUTOMÁTICO, e continua vindo do CONTEXTO: é o
   * chamador que tem a admissão carregada, e a ausência do dado RECUSA. Ela não foi levada para a cadeia
   * única de propósito: lá ela barraria `ADMISSAO_CONCLUIDA`, que o botão do time precisa enviar.
   *
   * ⚠️ A CADEIA ÚNICA TEM A SUA PRÓPRIA GUARDA DE ESTADO, mais frouxa e AUTORITATIVA: `admissaoEncerrada`
   * sobre o farol LIDO DO BANCO. Então o automático passa por DUAS perguntas de farol, e isso não é
   * duplicação de régua: são réguas diferentes (operável x encerrada), a de cima é curto-circuito que
   * recusa sem tocar o banco, e a de baixo é a palavra final sobre o que está gravado.
   *
   * ⚠️ A PAUSA ENTRA AQUI E NÃO NA AUDITORIA: auditar admissão pausada CONTINUA permitido (decisão do
   * diretor, o trabalho interno de análise não para), mas MANDAR PARA A FOLHA do fornecedor uma
   * admissão pausada seria errado. São perguntas diferentes, e esta é a de enviar.
   *
   * O CONTEXTO VEM DO CHAMADOR porque é ele que tem a admissão carregada, e a ausência do dado RECUSA
   * (fail-closed): contexto vazio não é operável, logo não envia.
   *
   * NUNCA LANÇA. Falha de envio, de rede ou de qualquer guarda vira ERRO no log e desfecho fechado: a
   * auditoria do candidato não pode quebrar porque o GI caiu (§A.6: o log não leva PII nem salário).
   */
  async enviar(
    admissaoId: string,
    contexto: ContextoEnvioAutomaticoGi,
  ): Promise<GiEnvioResultado> {
    // CONFIGURADO PRIMEIRO, ANTES DE QUALQUER LEITURA (06/10/2026). Sem credencial o envio nao tem
    // como acontecer, entao ler o estado no banco e trabalho jogado fora. E tem um efeito pior que
    // desperdicio: a leitura mora dentro do `try`, logo qualquer falha nela cai no `catch` e devolve
    // `GI_FALHA_ENVIO`, que diz "tentei e falhou" sobre um GI que nunca foi configurado. O desfecho
    // e o unico sinal que sobra depois (o log nao leva PII), entao impreciso aqui e log que mente.
    if (!this.configurado()) {
      this.log.log("GI nao configurado: gatilho automatico inerte.");
      return { enviado: false, motivo: "GI_NAO_CONFIGURADO" };
    }

    if (!admissaoOperavel(contexto.farolGlobal, contexto.pausadaEm)) {
      this.log.log(
        "GI: admissao nao operavel por processo automatico (farol nao vivo ou pausada): nao enviada.",
      );
      return { enviado: false, motivo: "GI_ADMISSAO_NAO_OPERAVEL" };
    }

    try {
      // ── A TRAVA DE ORIGEM, e ela é EXCLUSIVA do gatilho automático ──────────────────────────────
      // A admissão nascida do webhook do Pandapé JÁ é enviada ao G.I por fora do EA (§A.5): o
      // automático mandá-la de novo duplicaria a pessoa na folha. A régua é ALLOWLIST
      // (`ORIGENS_AUTORIZADAS_A_ENVIAR_AO_GI`, hoje só `MANUAL`), então origem futura nasce BLOQUEADA
      // e entrar na lista é ato deliberado. Nunca `!== "PANDAPE"`: denylist autoriza por omissão o
      // próximo valor do enum, e o Digai é uma segunda ATS com ingestão já construída.
      //
      // FAIL-CLOSED: admissão não encontrada devolve estado nulo, e estado nulo não está autorizado.
      //
      // ⚠️ A trava NÃO entra em `enviarComGuardas` de propósito: lá passa também o botão manual, e
      // enviar um Pandapé a mão pode ser legítimo. Essa é decisão do diretor, que ele não tomou.
      const estado = await this.leitor.lerEstado(admissaoId);
      if (!origemAutorizadaParaGi(estado?.origem)) {
        this.log.log(
          "GI: origem da admissao fora da allowlist de envio automatico: nao enviada pelo gatilho automatico.",
        );
        return { enviado: false, motivo: "GI_ORIGEM_NAO_AUTORIZADA" };
      }

      return await this.enviarComGuardas(admissaoId, contexto.autorId);
    } catch {
      // §A.6: nem a mensagem do erro sobe, porque mensagem de erro de cliente HTTP carrega corpo, e o
      // corpo deste cliente carrega a pessoa e o salario. O detalhe tecnico fica no log do GiApiService.
      this.log.error("GI: falha inesperada no envio automatico (auditoria segue normalmente).");
      return { enviado: false, motivo: "GI_FALHA_ENVIO" };
    }
  }

  /**
   * GATILHO MANUAL (botão do time), a ALTERNATIVA ao automático. Um-a-um, atrás de
   * `GI_DISPARO_ARMADO`. O `autorId` é o usuário que clicou (para a trilha do GI, quando a tela da
   * peça 3 existir); hoje não é logado (§A.6).
   *
   * ⚠️ ELE DEIXOU DE SER PORTA LIVRE QUANTO AO FAROL. Desde 06/10/2026 a cadeia única recusa admissão
   * ENCERRADA (`DECLINOU`/`RESCISAO`, por `admissaoEncerrada`) com `GI_ADMISSAO_NAO_OPERAVEL`, e a saída
   * é mudar o farol antes. Decisão do diretor, em duas palavras: declinado e rescindido.
   *
   * ⚠️ O QUE ELE CONTINUA PODENDO, e é deliberado: enviar admissão `ADMISSAO_CONCLUIDA` (que é quem mais
   * precisa estar na folha) e admissão PAUSADA. Se a pausa e a conclusão devem ou não barrar o botão
   * manual é pergunta aberta ao diretor; enquanto ele não decidir, vale a régua literal dele.
   *
   * ⚠️ O QUE ELE CONTINUA NÃO TENDO é a trava de ORIGEM: enviar a mão uma admissão vinda do Pandapé
   * pode ser legítimo, e autorizar ou proibir isso é decisão do diretor, que ele não tomou.
   */
  async enviarManual(admissaoId: string, autorId: string): Promise<GiEnvioResultado> {
    return this.enviarComGuardas(admissaoId, autorId);
  }

  /**
   * A CADEIA ÚNICA DE GUARDAS, e o único ponto do sistema que chega a `criarFuncionarioSelecao`.
   *
   * Fluxo, na ordem que garante fail-closed e idempotência:
   *   1. não configurado  → não toca a rede, não lê pessoa. `GI_NAO_CONFIGURADO`.
   *   2. já enviado        → idempotência: não recria. `GI_JA_ENVIADO`.
   *   2b. ENCERRADA         → farol `DECLINOU` ou `RESCISAO` (ou a linha da admissão não existe):
   *       `GI_ADMISSAO_NAO_OPERAVEL`. Vale para os DOIS gatilhos, inclusive o botão de MASTER.
   *       ⚠️ É `admissaoEncerrada`, não `admissaoOperavel`: `ADMISSAO_CONCLUIDA` PASSA aqui.
   *   3. sem dados de pessoa → fail-closed: não envia vazio. `GI_SEM_DADOS_PESSOA`.
   *   4. monta o payload: pessoa (allowlist 1) + contratação (allowlist 2), com o de/para de cidade.
   *   5. disparo DESARMADO → PARA aqui. `GI_MONTADO_NAO_DISPARADO` (a flag é a chave, e ela decide).
   *   6. contratação incompleta → RECUSA sem tocar a rede: `GI_SEM_EMPRESA_FILIAL`,
   *      `GI_PAR_EMPRESA_FILIAL_DESCONHECIDO`, `GI_SALARIO_INVALIDO`, `GI_SALARIO_SEM_UNIDADE` ou
   *      `GI_SALARIO_HORISTA_SEM_JORNADA`.
   *   7. disparo ARMADO    → cria no GI e carimba a idempotência. `GI_ENVIADO` / `GI_FALHA_ENVIO`.
   *
   * POR QUE AS GUARDAS DA CONTRATAÇÃO VÊM NO PASSO 6, e não antes do 5: a trava `GI_DISPARO_ARMADO` é a
   * garantia mais forte da frente, e o desfecho dela não muda por causa de dado faltando. As guardas
   * ficam ENCOSTADAS no `POST`, que é onde o dano aconteceria e onde elas não podem ser contornadas.
   */
  private async enviarComGuardas(
    admissaoId: string,
    _autorId: string,
  ): Promise<GiEnvioResultado> {
    if (!this.configurado()) {
      // A frase deixou de dizer "manual": a cadeia passou a ser a dos DOIS gatilhos.
      this.log.log("GI nao configurado: envio inerte (nenhum dos dois gatilhos toca a rede).");
      return { enviado: false, motivo: "GI_NAO_CONFIGURADO" };
    }

    if (await this.leitor.jaEnviado(admissaoId)) {
      this.log.log("GI: admissao ja enviada, idempotencia (no-op).");
      return { enviado: false, motivo: "GI_JA_ENVIADO" };
    }

    // ── O ENCERRAMENTO, NA CADEIA ÚNICA: declinado e rescindido NÃO saem por caminho NENHUM ───────
    // Decisão do diretor (06/10/2026), DUAS palavras: declinado e rescindido. Nem pelo automático, nem
    // pelo botão do time, nem por MASTER/SUPER_ADMIN. Antes a única guarda de farol morava no
    // `enviar()`, e `enviarManual` chegava aqui SEM nenhuma: o `seguranca` levantou o furo e esta é a
    // guarda que o fecha, no ponto por onde os DOIS gatilhos passam, para nenhum caminho futuro
    // contorná-la por simplesmente não passar contexto.
    //
    // ⚠️ A RÉGUA AQUI É `admissaoEncerrada`, **NUNCA `admissaoOperavel`**, e a diferença é de 2.002
    // admissões: `admissaoOperavel` exige farol VIVO, então barraria `ADMISSAO_CONCLUIDA` (1.550
    // `MANUAL` + 452 `PANDAPE` medidas em 06/10/2026), que é exatamente quem TEM de estar na folha. O
    // farol é flag manual e pegajosa, então bastaria marcá-la antes do envio para a admissão ficar
    // barrada para sempre. O gatilho automático SEGUE com `admissaoOperavel` (ver `enviar`), e com isso
    // ele fica mais restrito que o manual, de propósito.
    //
    // ESTA LEITURA É A AUTORITATIVA das duas travas de estado (encerramento aqui, origem no `enviar`).
    // O cheque de farol/pausa que vive no `enviar()` é só CURTO-CIRCUITO barato, que recusa o automático
    // sem tocar o banco; a palavra final sobre o que está no banco é desta linha.
    //
    // FAIL-CLOSED NA AUSÊNCIA DA LINHA, e isso é pergunta SEPARADA do encerramento: a coluna é
    // `NOT NULL`, então linha ausente não é dado faltando, é admissão que não existe (ou `select` que
    // esqueceu a coluna). Nesse caso não se envia.
    //
    // §A.6 + legibilidade: a frase diz a SAÍDA OPERACIONAL ("mude o farol antes"), porque sem isso a
    // recusa chega ao time como "o botão não funciona". Nenhum id, nenhum nome, nenhum valor.
    const estado = await this.leitor.lerEstado(admissaoId);
    if (!estado) {
      this.log.warn("GI: estado da admissao nao encontrado para o envio (nao envia).");
      return { enviado: false, motivo: "GI_ADMISSAO_NAO_OPERAVEL" };
    }
    // ⚠️ FAROL AUSENTE RECUSA, e esta linha e a correcao de uma ASSIMETRIA que o `tester` achou
    // (06/10/2026): `admissaoEncerrada(undefined)` devolve `false`, logo um `select` que esquecesse a
    // coluna `farol_global` passaria a ENVIAR, enquanto a trava de ORIGEM, no mesmo arquivo, falha
    // FECHADA no mesmo caso. Duas travas de estado no mesmo caminho com fail-closed OPOSTO e como a
    // proxima refatoracao abre um furo sem ninguem perceber. A coluna e `NOT NULL`, entao vazio aqui
    // nao e dado faltando: e projecao errada, e projecao errada nao manda ninguem para a folha.
    if (!estado.farolGlobal) {
      this.log.warn("GI: farol da admissao ausente na leitura do envio (nao envia).");
      return { enviado: false, motivo: "GI_ADMISSAO_NAO_OPERAVEL" };
    }
    if (admissaoEncerrada(estado.farolGlobal)) {
      this.log.log(
        "GI: admissao ENCERRADA (declinada ou rescindida): envio RECUSADO, mude o farol antes.",
      );
      return { enviado: false, motivo: "GI_ADMISSAO_NAO_OPERAVEL" };
    }

    const pessoa = await this.leitor.lerPessoa(admissaoId);
    if (!pessoa || (!pessoa.cpf && !pessoa.nome)) {
      this.log.warn("GI: sem dados de pessoa para a admissao (nao envia).");
      return { enviado: false, motivo: "GI_SEM_DADOS_PESSOA" };
    }

    // Os NOVE campos de contratação (salário, unidade, jornada mensal e semanal, data de admissão,
    // vínculo, prazo, empresa+filial), por porta própria e recorte explícito de colunas. Ausentes, saem
    // nulos e as guardas do passo 6 recusam.
    const contratacao = await this.leitor.lerContratacao(admissaoId);

    // Monta o payload das DUAS allowlists FECHADAS (pessoa + os nove campos nomeados) com o de/para de
    // cidade. O objeto carrega PII E SALÁRIO: não é logado, não é retornado, morre no escopo do método.
    // A OPÇÃO DE SINCRONISMO entra PELO MONTADOR, dentro da allowlist fechada, nunca injetada depois
    // dela: campo enfiado no payload por fora não passa pelas redes de runtime daquela fronteira. O
    // valor é de ambiente (`GI_API_SINC_ADMISSAO_DIGITAL`), com default `false`, o do fornecedor.
    const payload = montarFuncionarioSelecao(pessoa, this.depara, contratacao ?? undefined, {
      apiSincAdmissaoDigital: this.apiSincAdmissaoDigital(),
    });

    if (!this.disparoArmado()) {
      // FLAG DESLIGADA: monta e para. NENHUM POST FuncionarioSelecao/Add é feito.
      this.log.log("GI: payload montado, disparo DESARMADO (GI_DISPARO_ARMADO off): nao disparado.");
      return { enviado: false, motivo: "GI_MONTADO_NAO_DISPARADO" };
    }

    // ── DAQUI PARA BAIXO só roda com GI_DISPARO_ARMADO=true (não nesta entrega). ──

    // AS GUARDAS DURAS, encostadas no POST. Empresa e filial são `int16` obrigatórios sem default: a
    // omissão faz o fornecedor gravar `0` e criar registro órfão, calado. A validação do PAR entra junto,
    // porque campo a campo não pega `1/37` (válido nos dois campos, inexistente no GI). E salário
    // zero/negativo é salário ERRADO indo para a folha, não campo vazio.
    // E A UNIDADE DO SALÁRIO ENTRA AQUI PELO MESMO MOTIVO: o `tipoSalario` do GI tem `default 'M'`, então
    // salário de HORA enviado sem declaração vira salário MENSAL na folha sem nada falhar. Não se deduz
    // pela faixa do valor (vetado) e não se cai no default: recusa, e o time declara (0140). E declarar
    // HORA recusa ENQUANTO a jornada não estiver informada: o `H` exige `qtdeHorasMes` e `qtdeHorasSem`
    // (default `0` nos dois), que desde a 0140 o EA tem colunas para guardar. É pendência preenchível, e
    // o motivo nomeia a jornada em vez de só recusar.
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
