import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { admissoes, candidatos, frentesAdmissao, kitTipo } from "../db/schema";
import { AiClientService } from "../ai/ai-client.service";
import { kitLiberado } from "../domain/frentes";
import { ClicksignQueueService } from "../clicksign/clicksign-queue.service";
import { StagingService } from "../staging/staging.service";

/** Entrada do mapa de download (token → kit). Em memória: kit é efêmero (TTL 1h no purge). */
interface KitDownload {
  caminho: string;
  nomeArquivo: string;
}

/** Item do histórico de kits gerados (em memória — sem CPF, §A.6). */
interface KitHistorico {
  token: string;
  admissaoId: string;
  candidatoNome: string;
  nomeArquivo: string;
  criadoEm: string;
}

/** Limite do histórico em memória (últimos N kits da sessão). */
const HISTORICO_MAX = 50;

/**
 * Gerador de kit (F9, Fase 4 — recorte do diretor: SEM gate F12 e SEM Clicksign nesta OST). Salva
 * o PDF-mãe na staging, pede ao ai-service o desmembramento por candidato e expõe o kit por um
 * token de download de uso imediato. O binário nunca entra no banco; o token→caminho vive só em
 * memória (sem tabela de metadados — §A.6) e o arquivo é expurgado por TTL (1h). O histórico
 * (metadados, sem CPF) é mantido só em memória — some no restart, junto com os kits expurgados.
 */
@Injectable()
export class KitService {
  private readonly downloads = new Map<string, KitDownload>();
  private readonly historico: KitHistorico[] = [];

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly staging: StagingService,
    private readonly ai: AiClientService,
    private readonly clicksignQueue: ClicksignQueueService,
  ) {}

  /**
   * Motor de extração (OST etapa 3): recebe os N PDFs da folha + o kit selecionado, os coloca na
   * staging efêmera (§A.6) e INICIA o job no ai-service (fila com espaçamento + retry/backoff no
   * 429). Devolve o id do job + total de lotes; a tela acompanha por polling (`statusMotor`). Passa
   * o NOME do arquivo enviado para o ai-service rotular a origem, sem nunca expor o caminho interno.
   * Só admin (guard no controller). Nada de PII em log.
   */
  async processarMotor(kitTipoId: string, files: Express.Multer.File[] | undefined) {
    const id = kitTipoId?.trim();
    if (!id) throw new BadRequestException("Selecione um kit antes de processar.");
    const kit = await this.db.query.kitTipo.findFirst({ where: eq(kitTipo.id, id) });
    if (!kit) throw new NotFoundException("Kit não encontrado.");
    const arquivos = files ?? [];
    if (arquivos.length === 0) throw new BadRequestException("Envie ao menos um PDF.");
    for (const f of arquivos) {
      const ehPdf =
        f.mimetype === "application/pdf" || (f.originalname ?? "").toLowerCase().endsWith(".pdf");
      if (!ehPdf) throw new BadRequestException("Apenas arquivos PDF são aceitos.");
    }

    // Coloca cada PDF na staging efêmera; o ai-service lê pelo caminho e apaga ao fim (§A.6).
    const documentos: { stagingPath: string; arquivo: string }[] = [];
    for (const f of arquivos) {
      const stagingPath = await this.staging.salvarKit(f);
      documentos.push({ stagingPath, arquivo: f.originalname });
    }

    const { jobId, totalLotes } = await this.ai.extrairKit({ kitTipoId: id, documentos });
    return { jobId, totalLotes, kit: { id: kit.id, nome: kit.nome } };
  }

  /** Progresso do job de extração (polling da tela). Repassa o estado do ai-service. */
  statusMotor(jobId: string) {
    return this.ai.extrairKitStatus(jobId);
  }

  /**
   * Etapa 4 (download): PDF consolidado de um funcionário do job. O ai-service concatena as páginas
   * originais na ordem do kit (com aviso se incompleto) e devolve o binário; aqui só repassamos.
   */
  downloadFuncionario(jobId: string, indice: number) {
    if (!Number.isInteger(indice) || indice < 0) {
      throw new BadRequestException("Índice de funcionário inválido.");
    }
    return this.ai.baixarKitFuncionario(jobId, indice);
  }

  /** Etapa 4 (download): ZIP com um PDF por funcionário do job. */
  downloadZip(jobId: string) {
    return this.ai.baixarKitZip(jobId);
  }

  /**
   * Reimporta PDFs para UM funcionário do resultado: coloca os novos PDFs na staging efêmera e pede
   * ao ai-service para classificar (mesmo fluxo título+nome) e ANEXAR os documentos que faltavam ao
   * funcionário. Devolve o resultado atualizado. Só admin (guard no controller). Nada de PII em log.
   */
  async reimportarFuncionario(
    jobId: string,
    indice: number,
    files: Express.Multer.File[] | undefined,
  ) {
    if (!Number.isInteger(indice) || indice < 0) {
      throw new BadRequestException("Índice de funcionário inválido.");
    }
    const arquivos = files ?? [];
    if (arquivos.length === 0) throw new BadRequestException("Envie ao menos um PDF.");
    for (const f of arquivos) {
      const ehPdf =
        f.mimetype === "application/pdf" || (f.originalname ?? "").toLowerCase().endsWith(".pdf");
      if (!ehPdf) throw new BadRequestException("Apenas arquivos PDF são aceitos.");
    }
    const documentos: { stagingPath: string; arquivo: string }[] = [];
    for (const f of arquivos) {
      const stagingPath = await this.staging.salvarKit(f);
      documentos.push({ stagingPath, arquivo: f.originalname });
    }
    return this.ai.reimportarKit(jobId, indice, documentos);
  }

  /**
   * Gera o kit a partir do PDF-mãe e devolve um token de download. GATE F9 (§A.4 / INT-4): o kit só
   * nasce após as TRÊS frentes concluídas (`kitLiberado`); sem isso, 409. Quando liberado, após
   * materializar o kit na staging, enfileira `criar-envelope` na Clicksign (não bloqueia o response
   * do download — o envelope sobe no worker, fila + backoff §A.5).
   */
  async gerar(admissaoId: string, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException("Arquivo do kit obrigatório (campo 'file')");

    const [adm] = await this.db
      .select({ id: admissoes.id, nomeCandidato: candidatos.nome })
      .from(admissoes)
      .innerJoin(candidatos, eq(admissoes.candidatoCpf, candidatos.cpf))
      .where(eq(admissoes.id, admissaoId));
    if (!adm) throw new NotFoundException("Admissão não encontrada");

    // Gate F9: as 3 frentes (AUDITORIA + EXAME + CADASTRO_CONTRATO) precisam estar concluídas.
    const frentes = await this.db
      .select({ tipo: frentesAdmissao.tipo, concluida: frentesAdmissao.concluida })
      .from(frentesAdmissao)
      .where(eq(frentesAdmissao.admissaoId, admissaoId));
    if (!kitLiberado(frentes)) {
      throw new ConflictException(
        "O kit exige as 3 frentes concluídas (Auditoria, Exame e Cadastro/Contrato).",
      );
    }

    // PDF-mãe na staging (buffer descartado após gravar).
    const stagingPath = await this.staging.salvarKit(file);

    const { stagingPathKit } = await this.ai.gerarKit({
      stagingPath,
      nomeCandidato: adm.nomeCandidato,
    });

    // Guarda contra path traversal: o kit gerado tem de viver sob a raiz da staging.
    if (!this.staging.dentroDaRaiz(stagingPathKit)) {
      throw new NotFoundException("Kit gerado fora da staging");
    }

    // Dispara a assinatura (INT-4) sem bloquear o download: enfileira a criação do envelope.
    await this.clicksignQueue.enfileirarCriarEnvelope(admissaoId, stagingPathKit);

    const token = randomUUID();
    const nomeArquivo = `kit_${this.sanitizar(adm.nomeCandidato)}.pdf`;
    this.downloads.set(token, { caminho: stagingPathKit, nomeArquivo });

    // Histórico (em memória): mais recente primeiro, limitado a HISTORICO_MAX.
    this.historico.unshift({
      token,
      admissaoId,
      candidatoNome: adm.nomeCandidato,
      nomeArquivo,
      criadoEm: new Date().toISOString(),
    });
    if (this.historico.length > HISTORICO_MAX) this.historico.length = HISTORICO_MAX;

    return { downloadToken: token, nomeArquivo };
  }

  /** Resolve um token de download para o caminho do kit (404 se desconhecido/expirado). */
  resolverDownload(token: string): KitDownload {
    const d = this.downloads.get(token);
    if (!d) throw new NotFoundException("Kit não encontrado ou expirado");
    return d;
  }

  /**
   * Histórico de kits gerados (F9 — UX da tela do Gerador). `disponivel` indica se o arquivo ainda
   * existe (não foi expurgado pelo TTL de 1h) — quando false, só restam os metadados. Sem CPF (§A.6).
   */
  listarHistorico() {
    return this.historico.map((h) => {
      const d = this.downloads.get(h.token);
      return {
        token: h.token,
        admissaoId: h.admissaoId,
        candidatoNome: h.candidatoNome,
        nomeArquivo: h.nomeArquivo,
        criadoEm: h.criadoEm,
        disponivel: Boolean(d) && existsSync(d!.caminho),
      };
    });
  }

  private sanitizar(s: string): string {
    const limpo = (s ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80);
    return limpo || "candidato";
  }
}
