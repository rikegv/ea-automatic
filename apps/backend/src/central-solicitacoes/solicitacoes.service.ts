import { extname } from "node:path";
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, asc, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import {
  SOLICITACAO_STATUS,
  SOLICITACAO_TIPO,
  type SolicitacaoAcaoGestao,
  type SolicitacaoDetalheApi,
  type SolicitacaoResumoApi,
  type SolicitacaoStatus,
  type SolicitacaoTipo,
} from "@ea/shared-types";
import type { AuthUser } from "../auth/auth.types";
import { AiClientService } from "../ai/ai-client.service";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { notificacoes, solicitacaoMensagens, solicitacoes, usuarios } from "../db/schema";
import { StagingService } from "../staging/staging.service";
import {
  diasParado,
  mensagemPadraoDaAcao,
  notificacaoDaAcao,
  resolverMenuDoCatalogo,
  statusDaAcao,
} from "./solicitacao-dominio";

/** Rota fixa do deep link das notificações desta frente. */
const ROTA_CENTRAL = "/central-solicitacoes";

/** mimetype do upload para extensão do arquivo final no Drive. */
export const EXT_POR_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/**
 * CENTRAL DE SOLICITAÇÕES (OST Central de Solicitações): o backend inteiro das solicitações.
 *
 * §A.6: a IMAGEM nunca entra no banco. Ela vai para a staging efêmera, é arquivada no Drive e só a
 * REFERÊNCIA (url da pasta + id do arquivo) é persistida. Sem pasta configurada, o arquivamento é
 * INERTE (placeholder), no molde das demais integrações, para a homologação funcionar sem Drive real.
 */
@Injectable()
export class SolicitacoesService {
  private readonly logger = new Logger("SolicitacoesService");
  private readonly driveParentId: string;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly ai: AiClientService,
    private readonly staging: StagingService,
    config: ConfigService,
  ) {
    this.driveParentId = (config.get<string>("SOLICITACOES_DRIVE_PARENT_ID") ?? "").trim();
  }

  // ── Rotas do usuário ─────────────────────────────────────────────────────

  /** Abre uma solicitação. Valida tipo/catálogo/descrição/imagem e arquiva o print no Drive. */
  async criar(
    dados: { tipo: SolicitacaoTipo; menuCodigo: string; submenu: string; descricao: string },
    file: Express.Multer.File | undefined,
    user: AuthUser,
  ): Promise<SolicitacaoDetalheApi> {
    const menu = resolverMenuDoCatalogo(dados.menuCodigo, dados.submenu);
    if (!menu) {
      throw new BadRequestException("Tela ou seção inválida para a solicitação.");
    }
    if (!file) {
      throw new BadRequestException("A imagem é obrigatória.");
    }

    const [criada] = await this.db
      .insert(solicitacoes)
      .values({
        tipo: dados.tipo,
        menuCodigo: dados.menuCodigo,
        menuRotulo: menu.rotulo,
        submenu: dados.submenu,
        descricao: dados.descricao,
        solicitanteId: user.id,
        status: "NOVO",
      })
      .returning({ id: solicitacoes.id });

    const { imagemDriveUrl, imagemDriveFileId } = await this.arquivarImagem(criada.id, file);
    await this.db
      .update(solicitacoes)
      .set({ imagemDriveUrl, imagemDriveFileId, atualizadoEm: new Date() })
      .where(eq(solicitacoes.id, criada.id));

    return this.detalhe(criada.id, user);
  }

  /** As solicitações abertas pelo próprio usuário, mais recentes primeiro. */
  async listarMinhas(user: AuthUser): Promise<SolicitacaoResumoApi[]> {
    const linhas = await this.selecionarResumo(eq(solicitacoes.solicitanteId, user.id));
    return linhas;
  }

  /** Detalhe de uma solicitação. Dono ou SUPER_ADMIN; senão 404 (não revela existência a terceiro). */
  async detalhe(id: string, user: AuthUser): Promise<SolicitacaoDetalheApi> {
    const linha = await this.carregarDetalhe(id);
    if (!linha) throw new NotFoundException("Solicitação não encontrada.");
    if (user.papel !== "SUPER_ADMIN" && linha.solicitanteId !== user.id) {
      throw new NotFoundException("Solicitação não encontrada.");
    }
    return linha.api;
  }

  /** Posta uma mensagem na thread. Dono ou SUPER_ADMIN; mensagem da gestão notifica o solicitante. */
  async postarMensagem(id: string, corpo: string, user: AuthUser): Promise<SolicitacaoDetalheApi> {
    const [alvo] = await this.db
      .select({ id: solicitacoes.id, solicitanteId: solicitacoes.solicitanteId })
      .from(solicitacoes)
      .where(eq(solicitacoes.id, id))
      .limit(1);
    if (!alvo) throw new NotFoundException("Solicitação não encontrada.");

    const ehDono = alvo.solicitanteId === user.id;
    const ehGestao = user.papel === "SUPER_ADMIN";
    if (!ehDono && !ehGestao) {
      throw new NotFoundException("Solicitação não encontrada.");
    }

    await this.db.transaction(async (tx) => {
      await tx
        .insert(solicitacaoMensagens)
        .values({ solicitacaoId: id, autorId: user.id, corpo });
      await tx
        .update(solicitacoes)
        .set({ atualizadoEm: new Date() })
        .where(eq(solicitacoes.id, id));
      // A gestão escrevendo PINGA o solicitante; o dono escrevendo não notifica a si mesmo.
      if (ehGestao && !ehDono) {
        await tx.insert(notificacoes).values({
          usuarioId: alvo.solicitanteId,
          titulo: "Nova Mensagem Da Gestão",
          corpo: "A gestão respondeu na sua solicitação.",
          rota: ROTA_CENTRAL,
          solicitacaoId: id,
        });
      }
    });

    return this.detalhe(id, user);
  }

  // ── Rotas da gestão (SUPER_ADMIN) ────────────────────────────────────────

  /** Lista para a gestão, com filtros multiselect (§A.28) e busca por nome/tela/descrição. */
  async listarGestao(filtros: {
    tipos?: string[];
    status?: string[];
    busca?: string;
  }): Promise<SolicitacaoResumoApi[]> {
    const condicoes: SQL[] = [];
    // Intersecta com o vocabulário conhecido antes do IN: um valor fora do enum, vindo de query
    // malformada, viraria "invalid input value for enum" no Postgres (500) em vez de "nada casa".
    const tipos = filtros.tipos?.filter((t): t is SolicitacaoTipo =>
      (SOLICITACAO_TIPO as readonly string[]).includes(t),
    );
    const status = filtros.status?.filter((s): s is SolicitacaoStatus =>
      (SOLICITACAO_STATUS as readonly string[]).includes(s),
    );
    if (tipos?.length) {
      condicoes.push(inArray(solicitacoes.tipo, tipos));
    }
    if (status?.length) {
      condicoes.push(inArray(solicitacoes.status, status));
    }
    const busca = filtros.busca?.trim();
    if (busca) {
      const alvo = `%${busca}%`;
      const ou = or(
        ilike(usuarios.nome, alvo),
        ilike(solicitacoes.menuRotulo, alvo),
        ilike(solicitacoes.descricao, alvo),
      );
      if (ou) condicoes.push(ou);
    }
    const where = condicoes.length ? and(...condicoes) : undefined;
    return this.selecionarResumo(where);
  }

  /** Detalhe para a gestão (sem checagem de dono: SUPER_ADMIN vê todas). */
  async detalheGestao(id: string): Promise<SolicitacaoDetalheApi> {
    const linha = await this.carregarDetalhe(id);
    if (!linha) throw new NotFoundException("Solicitação não encontrada.");
    return linha.api;
  }

  /**
   * Aplica uma ação da gestão: muda o status, registra a mensagem na thread e notifica o solicitante,
   * tudo numa transação. ENVIAR_DUVIDA exige o corpo (a pergunta); as demais aceitam nota opcional.
   */
  async aplicarAcao(
    id: string,
    acao: SolicitacaoAcaoGestao,
    corpo: string | undefined,
    user: AuthUser,
  ): Promise<SolicitacaoDetalheApi> {
    const corpoLimpo = corpo?.trim() || undefined;
    if (acao === "ENVIAR_DUVIDA" && !corpoLimpo) {
      throw new BadRequestException("A dúvida precisa de um texto.");
    }

    const [alvo] = await this.db
      .select({
        id: solicitacoes.id,
        solicitanteId: solicitacoes.solicitanteId,
        menuRotulo: solicitacoes.menuRotulo,
      })
      .from(solicitacoes)
      .where(eq(solicitacoes.id, id))
      .limit(1);
    if (!alvo) throw new NotFoundException("Solicitação não encontrada.");

    const novoStatus = statusDaAcao(acao);
    const mensagem = corpoLimpo ?? mensagemPadraoDaAcao(acao);
    const notif = notificacaoDaAcao(acao, corpoLimpo, alvo.menuRotulo);

    await this.db.transaction(async (tx) => {
      await tx
        .update(solicitacoes)
        .set({ status: novoStatus, atualizadoEm: new Date() })
        .where(eq(solicitacoes.id, id));
      await tx
        .insert(solicitacaoMensagens)
        .values({ solicitacaoId: id, autorId: user.id, corpo: mensagem });
      await tx.insert(notificacoes).values({
        usuarioId: alvo.solicitanteId,
        titulo: notif.titulo,
        corpo: notif.corpo,
        rota: ROTA_CENTRAL,
        solicitacaoId: id,
      });
    });

    return this.detalheGestao(id);
  }

  // ── Internos ─────────────────────────────────────────────────────────────

  /** Monta os resumos (com nome do solicitante e diasParado) para um predicado qualquer. */
  private async selecionarResumo(where: SQL | undefined): Promise<SolicitacaoResumoApi[]> {
    const linhas = await this.db
      .select({
        id: solicitacoes.id,
        tipo: solicitacoes.tipo,
        menuCodigo: solicitacoes.menuCodigo,
        menuRotulo: solicitacoes.menuRotulo,
        submenu: solicitacoes.submenu,
        status: solicitacoes.status,
        descricao: solicitacoes.descricao,
        solicitanteNome: usuarios.nome,
        criadoEm: solicitacoes.criadoEm,
        atualizadoEm: solicitacoes.atualizadoEm,
      })
      .from(solicitacoes)
      .innerJoin(usuarios, eq(usuarios.id, solicitacoes.solicitanteId))
      .where(where)
      .orderBy(desc(solicitacoes.criadoEm));

    return linhas.map((l) => this.paraResumo(l));
  }

  private paraResumo(l: {
    id: string;
    tipo: SolicitacaoTipo;
    menuCodigo: string;
    menuRotulo: string;
    submenu: string;
    status: SolicitacaoStatus;
    descricao: string;
    solicitanteNome: string;
    criadoEm: Date;
    atualizadoEm: Date;
  }): SolicitacaoResumoApi {
    return {
      id: l.id,
      tipo: l.tipo,
      menuCodigo: l.menuCodigo,
      menuRotulo: l.menuRotulo,
      submenu: l.submenu,
      status: l.status,
      descricao: l.descricao,
      solicitanteNome: l.solicitanteNome,
      criadoEm: l.criadoEm.toISOString(),
      atualizadoEm: l.atualizadoEm.toISOString(),
      diasParado: diasParado(l.status, l.criadoEm),
    };
  }

  /** Carrega uma solicitação com a thread, pronta como detalhe, mais o dono para a checagem de acesso. */
  private async carregarDetalhe(
    id: string,
  ): Promise<{ solicitanteId: string; api: SolicitacaoDetalheApi } | null> {
    const [cab] = await this.db
      .select({
        id: solicitacoes.id,
        tipo: solicitacoes.tipo,
        menuCodigo: solicitacoes.menuCodigo,
        menuRotulo: solicitacoes.menuRotulo,
        submenu: solicitacoes.submenu,
        status: solicitacoes.status,
        descricao: solicitacoes.descricao,
        imagemDriveUrl: solicitacoes.imagemDriveUrl,
        imagemDriveFileId: solicitacoes.imagemDriveFileId,
        solicitanteId: solicitacoes.solicitanteId,
        solicitanteNome: usuarios.nome,
        criadoEm: solicitacoes.criadoEm,
        atualizadoEm: solicitacoes.atualizadoEm,
      })
      .from(solicitacoes)
      .innerJoin(usuarios, eq(usuarios.id, solicitacoes.solicitanteId))
      .where(eq(solicitacoes.id, id))
      .limit(1);
    if (!cab) return null;

    const msgs = await this.db
      .select({
        id: solicitacaoMensagens.id,
        corpo: solicitacaoMensagens.corpo,
        autorNome: usuarios.nome,
        autorPapel: usuarios.papel,
        criadoEm: solicitacaoMensagens.criadoEm,
      })
      .from(solicitacaoMensagens)
      .innerJoin(usuarios, eq(usuarios.id, solicitacaoMensagens.autorId))
      .where(eq(solicitacaoMensagens.solicitacaoId, id))
      .orderBy(asc(solicitacaoMensagens.criadoEm));

    const resumo = this.paraResumo(cab);
    const api: SolicitacaoDetalheApi = {
      ...resumo,
      descricao: cab.descricao,
      // Link direto para o PRINT quando temos o id do arquivo no Drive (abre a imagem, não a
      // pasta com os prints de todas as solicitações). Sem id (MOCK/sem pasta), cai na url gravada.
      imagemUrl: cab.imagemDriveFileId
        ? `https://drive.google.com/file/d/${cab.imagemDriveFileId}/view`
        : cab.imagemDriveUrl,
      mensagens: msgs.map((m) => ({
        id: m.id,
        corpo: m.corpo,
        autorNome: m.autorNome,
        autorEhGestao: m.autorPapel === "SUPER_ADMIN",
        criadoEm: m.criadoEm.toISOString(),
      })),
    };
    return { solicitanteId: cab.solicitanteId, api };
  }

  /**
   * Arquiva o print no Drive e devolve a referência. Sem pasta configurada, NÃO chama o ai-service:
   * grava um placeholder e a solicitação segue utilizável (molde das integrações inertes). Com pasta,
   * a imagem passa pela staging efêmera, sobe ao Drive e a staging é limpa (§A.6, nada de binário no
   * banco). Falha no arquivamento vira placeholder e log sem PII: a solicitação não se perde por isso.
   */
  private async arquivarImagem(
    solicitacaoId: string,
    file: Express.Multer.File,
  ): Promise<{ imagemDriveUrl: string | null; imagemDriveFileId: string | null }> {
    if (!this.driveParentId) {
      return {
        imagemDriveUrl: `https://drive.google.com/drive/folders/MOCK-solicitacoes`,
        imagemDriveFileId: null,
      };
    }

    // `Object.hasOwn`, nunca indexar direto: `EXT_POR_MIME["toString"]` devolveria uma função, não
    // undefined, e o `??` não cairia no fallback. Defesa em profundidade com o fileFilter do controller.
    const ext = Object.hasOwn(EXT_POR_MIME, file.mimetype)
      ? EXT_POR_MIME[file.mimetype]
      : extname(file.originalname) || "";
    let stagingPath: string | null = null;
    try {
      stagingPath = await this.staging.salvar(solicitacaoId, "print", file);
      const resultado = await this.ai.arquivarDrive({
        parentFolderId: this.driveParentId,
        pastaNome: "Central de Solicitações",
        // A subpasta é um valor fixo do contrato do Drive (ASO/ADMISSAO/BENEFICIOS/
        // DOCUMENTOS_PESSOAIS); o print entra em DOCUMENTOS_PESSOAIS por ser o destino genérico.
        arquivos: [{ stagingPath, nomeFinal: `${solicitacaoId}${ext}`, subpasta: "DOCUMENTOS_PESSOAIS" }],
      });
      return {
        imagemDriveUrl: resultado.pastaUrl,
        imagemDriveFileId: resultado.arquivosIds?.[0] ?? null,
      };
    } catch (err) {
      // §A.6: nunca logar o buffer, o nome do arquivo nem o conteúdo. Só o id da solicitação e o erro.
      this.logger.error(
        `Falha ao arquivar o print da solicitação ${solicitacaoId}: ${(err as Error).name}`,
      );
      return {
        imagemDriveUrl: `https://drive.google.com/drive/folders/MOCK-solicitacoes`,
        imagemDriveFileId: null,
      };
    } finally {
      if (stagingPath) {
        await this.staging.removerArquivo(stagingPath).catch(() => undefined);
      }
    }
  }
}
