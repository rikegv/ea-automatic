import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { AuthUser } from "../auth/auth.types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { naoPausada } from "../db/admissao-filtros";
import {
  admissoes,
  assinanteEmpresa,
  candidatos,
  cargos,
  clientes,
  frentesAdmissao,
} from "../db/schema";
import {
  faseEnvelope,
  resolverAssinantes,
  type AssinanteEmpresa,
  type FaseEnvelope,
} from "../domain/assinante-empresa";
import { validarPdfKit } from "../domain/pdf-kit";
import { StagingService } from "../staging/staging.service";
import { ClicksignApiService } from "./clicksign-api.service";
import { ClicksignQueueService } from "./clicksign-queue.service";

/** Uma linha da tela de gerenciamento de assinatura. §A.6: sem CPF, sem URL da Clicksign. */
export interface LinhaAssinatura {
  admissaoId: string;
  candidato: string;
  /** `nome_operacao` do cliente; nulável no cadastro, então a tela trata o vazio. */
  cliente: string | null;
  cargo: string | null;
  tipoContrato: string | null;
  clicksignStatus: string;
  /** Só a existência do envelope; o id técnico não vai à tela (não acrescenta nada ao operador). */
  temEnvelope: boolean;
  /** ISO da ativação do envelope (base do prazo). null em quem nunca teve envelope. */
  enviadoEm: string | null;
  /** Link da PASTA do Drive com o contrato assinado (referência, nunca o binário — regra 7). */
  contratoAssinadoDriveUrl: string | null;
  origem: string;
  /** ISO de quando o kit foi anexado pelo Gerador de Kit (só na aba "Prontos para solicitar"). */
  kitAnexadoEm?: string | null;
  /** `null` = APTA a disparar. Preenchido = BLOQUEADA, com o motivo para a tela mostrar. */
  bloqueio?: string | null;
  /** Fase detectada, base do aviso de confirmação das ações destrutivas. */
  fase: FaseEnvelope;
  /** Há kit anexado para o olho abrir? Some quando o envelope é ASSINADO (vai para o prontuário). */
  temKit: boolean;
}

/** Status que representam trabalho EM ABERTO na assinatura (a aba principal da tela). */
const STATUS_ABERTOS = ["AGUARDANDO_ASSINATURA", "CANCELADO", "EXPIRADO"] as const;

/**
 * GERENCIAMENTO DE ASSINATURA (INT-4, menu "assinaturas"). Camada de LEITURA da tela + a ação de
 * CANCELAR. As outras duas ações da tela reusam caminhos que já existiam: "solicitar" chama o
 * `KitService.gerar` (que aplica o gate F12 e enfileira `criar-envelope`) e "reenviar por correção"
 * chama o `ClicksignSyncService.reenviarCorrecao` (com o aceite de dupla correção).
 *
 * §A.6: a tela mostra nome do candidato e cliente (dado de trabalho, igual à Esteira), NUNCA CPF,
 * NUNCA o id do envelope e NUNCA a URL do documento na Clicksign. A trilha das ações é logada com id
 * de usuário e de admissão, sem PII.
 */
@Injectable()
export class ClicksignGestaoService {
  private readonly logger = new Logger("ClicksignGestaoService");

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly api: ClicksignApiService,
    private readonly staging: StagingService,
    private readonly fila: ClicksignQueueService,
  ) {}

  /**
   * Lista as admissões de UMA aba:
   *  - `abertos`: têm envelope em estado que ainda pede trabalho (aguardando, cancelado, expirado);
   *  - `assinados`: contrato fechado e arquivado no Drive (histórico consultável);
   *  - `aptos`: SEM envelope e com o gate F12 fechado (as 3 frentes concluídas), ou seja, prontas
   *    para o consultor solicitar a assinatura. É esta aba que dá destino à ação "solicitar".
   *
   * Admissão PAUSADA fica fora de `aptos` (não se dispara envelope de admissão pausada, mesma regra
   * do `criarEnvelope`), mas permanece em `abertos`: o envelope dela existe e continua sendo assunto.
   */
  async listar(aba: "abertos" | "assinados" | "aptos"): Promise<{ itens: LinhaAssinatura[] }> {
    if (aba === "aptos") return { itens: await this.listarAptos() };

    const status =
      aba === "assinados" ? (["ASSINADO"] as const) : STATUS_ABERTOS;

    const rows = await this.db
      .select({
        admissaoId: admissoes.id,
        candidato: candidatos.nome,
        cliente: clientes.nomeOperacao,
        cargo: cargos.nome,
        tipoContrato: admissoes.tipoContrato,
        clicksignStatus: admissoes.clicksignStatus,
        clicksignEnvelopeId: admissoes.clicksignEnvelopeId,
        enviadoEm: admissoes.clicksignEnviadoEm,
        contratoAssinadoDriveUrl: admissoes.contratoAssinadoDriveUrl,
        origem: admissoes.origem,
        kitPath: admissoes.kitAssinaturaPath,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(admissoes.candidatoCpf, candidatos.cpf))
      .innerJoin(clientes, eq(admissoes.codCliente, clientes.codCliente))
      .leftJoin(cargos, eq(admissoes.cargoId, cargos.id))
      .where(
        and(
          inArray(admissoes.clicksignStatus, [...status]),
          // A carga histórica (§A.16 regra 1) marcou 1.486 admissões como ASSINADO sem nunca passar
          // pela Clicksign. Exigir o envelope tira esse artefato da tela: aqui só entra assinatura de
          // verdade, senão a aba "assinados" viraria a lista de admissões concluídas.
          isNotNull(admissoes.clicksignEnvelopeId),
        ),
      )
      .orderBy(desc(admissoes.atualizadoEm))
      .limit(500);

    return { itens: rows.map((r) => this.paraLinha(r)) };
  }

  /**
   * Admissões na FILA DE DISPARO: as que foram enviadas pelo botão "Enviar para assinatura" do
   * Gerador de Kit, ou seja, que têm KIT ANEXADO (`kit_assinatura_path`).
   *
   * MUDANÇA DE RÉGUA (fluxo aprovado pelo diretor): antes a fila listava qualquer admissão com as 3
   * frentes concluídas, e por isso aparecia gente SEM KIT nenhum, que o consultor não tinha como
   * disparar. Concluir frente não é mais suficiente: entra quem tem kit pronto e anexado.
   *
   * BLOQUEIO em vez de sumiço: a linha entra na fila mesmo impedida, com o motivo visível, e a tela
   * não deixa selecionar. Some da fila é pior que aparecer bloqueada, porque o consultor fica sem
   * saber por que o candidato não chega.
   */
  private async listarAptos(): Promise<LinhaAssinatura[]> {
    const concluidas = this.db
      .select({
        admissaoId: frentesAdmissao.admissaoId,
        qtd: sql<number>`count(*) filter (where ${frentesAdmissao.concluida})`.as("qtd"),
      })
      .from(frentesAdmissao)
      .groupBy(frentesAdmissao.admissaoId)
      .as("fr");

    const rows = await this.db
      .select({
        admissaoId: admissoes.id,
        candidato: candidatos.nome,
        cliente: clientes.nomeOperacao,
        cargo: cargos.nome,
        tipoContrato: admissoes.tipoContrato,
        clicksignStatus: admissoes.clicksignStatus,
        clicksignEnvelopeId: admissoes.clicksignEnvelopeId,
        enviadoEm: admissoes.clicksignEnviadoEm,
        contratoAssinadoDriveUrl: admissoes.contratoAssinadoDriveUrl,
        origem: admissoes.origem,
        codCliente: admissoes.codCliente,
        candidatoEmail: candidatos.email,
        kitPath: admissoes.kitAssinaturaPath,
        kitEm: admissoes.kitAssinaturaEm,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(admissoes.candidatoCpf, candidatos.cpf))
      .innerJoin(clientes, eq(admissoes.codCliente, clientes.codCliente))
      .leftJoin(cargos, eq(admissoes.cargoId, cargos.id))
      .innerJoin(concluidas, eq(concluidas.admissaoId, admissoes.id))
      .where(
        and(
          eq(admissoes.clicksignStatus, "SEM_ENVELOPE"),
          naoPausada(),
          // O QUE PÕE NA FILA: kit anexado pelo Gerador de Kit. Sem isto não há o que disparar.
          isNotNull(admissoes.kitAssinaturaPath),
          // As 3 frentes concluídas seguem exigidas (gate F12), agora como defesa e não como régua
          // de entrada: quem tem kit anexado já passou pelo gate no envio.
          sql`${concluidas.qtd} >= 3`,
        ),
      )
      .orderBy(desc(admissoes.kitAssinaturaEm))
      .limit(500);

    // Os assinantes da empresa são carregados UMA vez e a precedência é aplicada em memória por
    // linha: sem representante resolvido o envelope não nasceria, então isso é bloqueio, não surpresa
    // no disparo.
    const assinantes = await this.db
      .select({
        codCliente: assinanteEmpresa.codCliente,
        nome: assinanteEmpresa.nome,
        email: assinanteEmpresa.email,
        cpf: assinanteEmpresa.cpf,
        ordem: assinanteEmpresa.ordem,
        ativo: assinanteEmpresa.ativo,
      })
      .from(assinanteEmpresa);

    return rows.map((r) => ({
      ...this.paraLinha(r),
      kitAnexadoEm: r.kitEm ? new Date(r.kitEm).toISOString() : null,
      bloqueio: this.motivoBloqueio(r, assinantes),
    }));
  }

  /**
   * Por que esta admissão NÃO pode ser disparada agora. `null` = apta.
   *
   * Os três motivos são os que fariam o `criarEnvelope` desistir silenciosamente lá no worker. Trazer
   * a checagem para a fila é o que transforma "o candidato sumiu" em "o candidato está aqui, e falta
   * isto".
   */
  private motivoBloqueio(
    r: { candidatoEmail: string | null; kitPath: string | null; codCliente: string | null },
    assinantes: AssinanteEmpresa[],
  ): string | null {
    if (!r.candidatoEmail?.trim()) {
      return "Candidato sem e-mail. A assinatura é autenticada por e-mail, então não há como enviar.";
    }
    if (!r.kitPath || !this.staging.dentroDaRaiz(r.kitPath) || !existsSync(r.kitPath)) {
      return "Kit expirado da área temporária (48h). Gere e envie o kit de novo pelo Gerador de Kit.";
    }
    if (resolverAssinantes(assinantes, r.codCliente).length === 0) {
      return "Sem representante da empresa cadastrado. Cadastre em Administração, Assinante da empresa.";
    }
    return null;
  }

  /** Monta a linha da tela a partir do row do banco (esconde o id do envelope, §A.6). */
  private paraLinha(r: {
    admissaoId: string;
    candidato: string;
    cliente: string | null;
    cargo: string | null;
    tipoContrato: string | null;
    clicksignStatus: string;
    clicksignEnvelopeId: string | null;
    enviadoEm: Date | null;
    contratoAssinadoDriveUrl: string | null;
    origem: string;
    kitPath?: string | null;
  }): LinhaAssinatura {
    const temKit = Boolean(r.kitPath);
    return {
      fase: faseEnvelope(r.clicksignStatus, temKit),
      temKit,
      admissaoId: r.admissaoId,
      candidato: r.candidato,
      cliente: r.cliente,
      cargo: r.cargo,
      tipoContrato: r.tipoContrato,
      clicksignStatus: r.clicksignStatus,
      temEnvelope: Boolean(r.clicksignEnvelopeId),
      enviadoEm: r.enviadoEm ? new Date(r.enviadoEm).toISOString() : null,
      contratoAssinadoDriveUrl: r.contratoAssinadoDriveUrl,
      origem: r.origem,
    };
  }

  /**
   * DISPARO EM LOTE (ação humana do consultor). Para cada admissão selecionada, revalida o bloqueio e
   * enfileira o `criar-envelope` com o KIT JÁ ANEXADO. É aqui que o envelope nasce de verdade e o
   * e-mail sai; nada antes disso manda e-mail.
   *
   * PARCIALIDADE, no padrão da liberação em massa: um item que falha NÃO derruba os outros. Cada
   * admissão volta com `ok` e, quando recusada, o motivo por candidato.
   *
   * A revalidação do bloqueio acontece aqui de novo, e não só na listagem, porque entre carregar a
   * tela e clicar podem ter passado horas: o kit pode ter expirado no TTL, o e-mail pode ter sido
   * apagado. Confiar na tela seria confiar num retrato velho.
   */
  async dispararLote(
    admissaoIds: string[],
    user: AuthUser,
  ): Promise<{ total: number; disparados: number; itens: Array<{ admissaoId: string; candidato: string; ok: boolean; motivo?: string }> }> {
    const ids = [...new Set((admissaoIds ?? []).map((i) => (i ?? "").trim()).filter(Boolean))];
    if (ids.length === 0) throw new BadRequestException("Selecione ao menos uma admissão.");

    this.logger.log(
      `[ASSINATURA][trilha] acao=disparar-lote total=${ids.length} por=${user.id} (${user.papel})`,
    );

    // Uma leitura só da fila; o mapa evita N consultas e garante que a régua do disparo é EXATAMENTE
    // a mesma que a tela mostrou (mesma função de bloqueio).
    const fila = await this.listarAptos();
    const porId = new Map(fila.map((l) => [l.admissaoId, l]));

    const itens: Array<{ admissaoId: string; candidato: string; ok: boolean; motivo?: string }> = [];
    for (const id of ids) {
      const linha = porId.get(id);
      if (!linha) {
        itens.push({
          admissaoId: id,
          candidato: "não informado",
          ok: false,
          motivo: "Saiu da fila de disparo (kit removido, envelope já criado ou admissão pausada).",
        });
        continue;
      }
      if (linha.bloqueio) {
        itens.push({ admissaoId: id, candidato: linha.candidato, ok: false, motivo: linha.bloqueio });
        continue;
      }
      const [adm] = await this.db
        .select({ kitPath: admissoes.kitAssinaturaPath })
        .from(admissoes)
        .where(eq(admissoes.id, id));
      if (!adm?.kitPath) {
        itens.push({
          admissaoId: id,
          candidato: linha.candidato,
          ok: false,
          motivo: "Kit não está mais anexado. Envie de novo pelo Gerador de Kit.",
        });
        continue;
      }

      // O PDF ABRE? A Clicksign aceita arquivo quebrado sem reclamar (o stub de 45 bytes do teste de
      // 28/07 virou envelope), e quem descobre é o signatário, que em produção é o candidato real.
      // Validar AQUI, no caminho síncrono, é o que devolve o motivo na tela em vez de deixar o job
      // falhar em silêncio depois.
      const veredito = await this.validarKitNoDisco(adm.kitPath);
      if (!veredito.ok) {
        this.logger.warn(
          `[ASSINATURA] disparo recusado por PDF inválido (admissão ${id}, ${veredito.bytes} bytes).`,
        );
        itens.push({
          admissaoId: id,
          candidato: linha.candidato,
          ok: false,
          motivo: veredito.motivo,
        });
        continue;
      }

      try {
        // O retorno importa: fila fora do ar (ou recusa) não pode virar "ok" na tela.
        const enfileirou = await this.fila.enfileirarCriarEnvelope(id, adm.kitPath);
        itens.push(
          enfileirou
            ? { admissaoId: id, candidato: linha.candidato, ok: true }
            : {
                admissaoId: id,
                candidato: linha.candidato,
                ok: false,
                motivo: "A fila de disparo não aceitou o pedido. Tente de novo em instantes.",
              },
        );
      } catch (err) {
        itens.push({
          admissaoId: id,
          candidato: linha.candidato,
          ok: false,
          motivo: err instanceof Error ? err.message : "Falha ao enfileirar o disparo.",
        });
      }
    }

    const disparados = itens.filter((i) => i.ok).length;
    this.logger.log(`[ASSINATURA] lote concluído: ${disparados}/${ids.length} enfileirados.`);
    return { total: ids.length, disparados, itens };
  }

  /**
   * CANCELA o documento nas DUAS frentes: EA e Clicksign.
   *
   * VALE INCLUSIVE PARA ENVELOPE JÁ ASSINADO (regra do diretor). O motivo é operacional, não técnico:
   * quando um contrato assinado precisa ser desfeito, o funcionário tem de ser NOTIFICADO, e é o
   * cancelamento na Clicksign que dispara esse aviso.
   *
   * HONESTIDADE SOBRE O PROVEDOR (§A.5): nesta conta, envelope em `running` não tem cancelamento
   * programático e `closed` menos ainda; o `cancelarEnvelope` tenta o PATCH canônico e segue
   * BEST-EFFORT. O estado AUTORITATIVO é o do EA. Ou seja: o EA sempre cancela; a Clicksign cancela
   * se a conta permitir. O retorno diz o que aconteceu de cada lado, para ninguém supor notificação
   * que não saiu.
   */
  async cancelar(
    admissaoId: string,
    user: AuthUser,
  ): Promise<{ ok: true; status: string; fase: FaseEnvelope; clicksign: "cancelado" | "best-effort" | "sem-envelope" }> {
    const alvo = await this.carregarParaAcao(admissaoId);

    this.logger.log(
      `[ASSINATURA][trilha] acao=cancelar fase=${alvo.fase} admissao=${admissaoId} por=${user.id} (${user.papel})`,
    );

    let clicksign: "cancelado" | "best-effort" | "sem-envelope" = "sem-envelope";
    if (alvo.clicksignEnvelopeId) {
      // O provedor pode aceitar a chamada e NÃO cancelar (§A.5); o boolean diz o que houve de fato,
      // e é isso que a tela informa ao consultor sobre a notificação do funcionário.
      clicksign = (await this.api.cancelarEnvelope(alvo.clicksignEnvelopeId))
        ? "cancelado"
        : "best-effort";
    }

    await this.db
      .update(admissoes)
      .set({ clicksignStatus: "CANCELADO", atualizadoEm: new Date() })
      .where(eq(admissoes.id, admissaoId));

    return { ok: true, status: "CANCELADO", fase: alvo.fase, clicksign };
  }

  /**
   * TROCAR O KIT: cancela o que existe (nas duas frentes, pela mesma regra do `cancelar`) e DESANEXA
   * o kit atual, devolvendo a admissão ao estado de quem ainda não tem kit.
   *
   * O kit novo NÃO é escolhido aqui: ele vem do Gerador de Kit, onde já foi gerado, pelo botão
   * "Enviar para assinatura". Foi a leitura que fecha com o fluxo aprovado ("o kit novo vem do
   * Gerenciador de Kit, precisa estar gerado lá") e evita inventar um seletor de kit nesta tela, que
   * não conhece os jobs do motor de extração (efêmeros, vivem no ai-service).
   *
   * Em `NAO_ENVIADO` não há envelope, então só o desanexo acontece: ninguém é notificado.
   */
  async trocarKit(
    admissaoId: string,
    user: AuthUser,
  ): Promise<{ ok: true; fase: FaseEnvelope; clicksign: "cancelado" | "best-effort" | "sem-envelope" }> {
    const alvo = await this.carregarParaAcao(admissaoId);

    this.logger.log(
      `[ASSINATURA][trilha] acao=trocar-kit fase=${alvo.fase} admissao=${admissaoId} por=${user.id} (${user.papel})`,
    );

    let clicksign: "cancelado" | "best-effort" | "sem-envelope" = "sem-envelope";
    if (alvo.clicksignEnvelopeId) {
      // O provedor pode aceitar a chamada e NÃO cancelar (§A.5); o boolean diz o que houve de fato,
      // e é isso que a tela informa ao consultor sobre a notificação do funcionário.
      clicksign = (await this.api.cancelarEnvelope(alvo.clicksignEnvelopeId))
        ? "cancelado"
        : "best-effort";
    }

    // Volta a SEM_ENVELOPE quando não chegou a existir envelope (o kit era só um anexo na fila);
    // com envelope, o registro fica CANCELADO, que é o histórico correto do que foi desfeito.
    await this.db
      .update(admissoes)
      .set({
        clicksignStatus: alvo.clicksignEnvelopeId ? "CANCELADO" : "SEM_ENVELOPE",
        kitAssinaturaPath: null,
        kitAssinaturaEm: null,
        atualizadoEm: new Date(),
      })
      .where(eq(admissoes.id, admissaoId));

    if (alvo.kitPath) await this.staging.removerArquivo(alvo.kitPath).catch(() => undefined);

    return { ok: true, fase: alvo.fase, clicksign };
  }

  /**
   * DISPARO INDIVIDUAL: o mesmo caminho do lote, com um item só. Reusa `dispararLote` de propósito,
   * para as duas portas terem EXATAMENTE a mesma régua de bloqueio; duplicar a lógica aqui seria
   * criar duas verdades sobre quem pode ser disparado.
   */
  async dispararUm(admissaoId: string, user: AuthUser) {
    const r = await this.dispararLote([admissaoId], user);
    const item = r.itens[0];
    if (!item?.ok) {
      throw new ConflictException(item?.motivo ?? "Não foi possível disparar esta assinatura.");
    }
    return { ok: true as const, candidato: item.candidato };
  }

  /**
   * Lê o kit da staging e valida a ESTRUTURA do PDF (`domain/pdf-kit`). Guarda o path traversal com o
   * mesmo predicado do resto do módulo.
   *
   * Arquivo sumido devolve motivo próprio em vez de estourar: entre a tela carregar e o clique, o
   * TTL de 2 horas da staging pode ter expurgado o kit, e isso é caso de refazer, não de erro 500.
   * §A.6: só o tamanho vai ao log, nunca o conteúdo.
   */
  private async validarKitNoDisco(
    kitPath: string,
  ): Promise<{ ok: boolean; motivo: string; bytes: number }> {
    if (!this.staging.dentroDaRaiz(kitPath) || !existsSync(kitPath)) {
      return {
        ok: false,
        bytes: 0,
        motivo: "O arquivo do kit não está mais na staging. Gere e envie o kit de novo.",
      };
    }
    try {
      const r = validarPdfKit(await readFile(kitPath));
      return { ok: r.ok, bytes: r.bytes, motivo: r.motivo ?? "" };
    } catch {
      return {
        ok: false,
        bytes: 0,
        motivo: "Não foi possível ler o arquivo do kit. Gere e envie o kit de novo.",
      };
    }
  }

  /** Caminho do kit anexado, para o olho da tela. `null` quando não há (ou já foi ao prontuário). */
  async caminhoDoKit(admissaoId: string): Promise<{ caminho: string; candidato: string } | null> {
    const [row] = await this.db
      .select({ kitPath: admissoes.kitAssinaturaPath, candidato: candidatos.nome })
      .from(admissoes)
      .innerJoin(candidatos, eq(admissoes.candidatoCpf, candidatos.cpf))
      .where(eq(admissoes.id, admissaoId));
    if (!row?.kitPath) return null;
    if (!this.staging.dentroDaRaiz(row.kitPath) || !existsSync(row.kitPath)) return null;
    return { caminho: row.kitPath, candidato: row.candidato };
  }

  /** Carrega o alvo de uma ação destrutiva já com a fase detectada. */
  private async carregarParaAcao(admissaoId: string) {
    const [adm] = await this.db
      .select({
        clicksignEnvelopeId: admissoes.clicksignEnvelopeId,
        clicksignStatus: admissoes.clicksignStatus,
        kitPath: admissoes.kitAssinaturaPath,
      })
      .from(admissoes)
      .where(eq(admissoes.id, admissaoId));
    if (!adm) throw new NotFoundException("Admissão não encontrada");
    const fase = faseEnvelope(adm.clicksignStatus, Boolean(adm.kitPath));
    if (fase === "ENCERRADO" && !adm.clicksignEnvelopeId && !adm.kitPath) {
      throw new NotFoundException("Não há envelope nem kit anexado nesta admissão.");
    }
    return { ...adm, fase };
  }
}
