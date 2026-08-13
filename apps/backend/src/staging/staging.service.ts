import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/** Um arquivo na staging de uma admissão: caminho absoluto + código do tipo (lido do nome). */
export interface ArquivoStaging {
  caminho: string;
  codigoTipo: string;
}

/**
 * Staging efêmera dos binários (§A.6 / F2). O arquivo vive APENAS no disco temporário (volume
 * descartável), NUNCA no banco. Layout:
 *   {STAGING_DIR}/{admissaoId}/{codigoTipo}__{uuid}.{ext}   — documentos auditados
 *   {STAGING_DIR}/_kits/{uuid}.pdf                          — kits gerados (TTL 1h)
 * O purge (StagingPurgeService) usa o mtime como relógio — não há metadados de arquivo no DB.
 */
@Injectable()
export class StagingService {
  private readonly baseDir: string;
  static readonly KITS_DIR = "_kits";

  constructor(config: ConfigService) {
    this.baseDir = config.get<string>("STAGING_DIR") ?? "/tmp/ea-staging";
  }

  /** Diretório-raiz da staging (consumido pelo purge). */
  raiz(): string {
    return this.baseDir;
  }

  /** Diretório da admissão. */
  caminho(admissaoId: string): string {
    return join(this.baseDir, this.sanitizar(admissaoId));
  }

  /** Diretório dos kits gerados. */
  kitsDir(): string {
    return join(this.baseDir, StagingService.KITS_DIR);
  }

  /**
   * Grava o buffer do multipart em disco e devolve o caminho. O buffer é referenciado só aqui e
   * descartado pelo GC ao fim do handler (nunca persistido em banco — §A.6).
   *
   * MESMO CONTEÚDO NÃO VIRA ARQUIVO NOVO (correção do bug de 13/08/2026). Antes de gravar, o
   * conteúdo é comparado com o que já existe na pasta da admissão para AQUELE tipo: batendo, devolve
   * o caminho do arquivo que já está lá.
   *
   * O DEFEITO QUE ISTO TRAVA: a marca que evita rebaixar do Pandapé só era gravada quando a
   * auditoria da I.A concluía. Enquanto ela não fechava, o ciclo de 12 minutos rebaixava os mesmos
   * bytes e caía aqui, que gravava um arquivo novo a cada volta. Uma candidata que enviou 4 páginas
   * de CTPS terminou com 104 arquivos, 26 cópias de cada, e 241 MB de staging. Com esta comparação,
   * a mesma falha de auditoria repetida 26 vezes deixa 4 arquivos.
   *
   * COMPARA O CONTEÚDO, e não o nome nem o tamanho: nome tem UUID (sempre diferente) e tamanho igual
   * não é conteúdo igual. O custo é ler os arquivos daquele tipo, que são poucos (um documento tem
   * frente, verso e algumas páginas), e só acontece na gravação.
   */
  async salvar(
    admissaoId: string,
    codigoTipo: string,
    // Aceita qualquer fonte com buffer + nome (Multer.File é estruturalmente compatível). Permite o
    // pull de docs do Pandapé (Fase 5 / INT-1) reusar a staging sem depender de multipart.
    file: { buffer: Buffer; originalname: string },
  ): Promise<string> {
    const dir = this.caminho(admissaoId);
    await mkdir(dir, { recursive: true });

    const jaExiste = await this.mesmoConteudo(admissaoId, codigoTipo, file.buffer);
    if (jaExiste) return jaExiste;

    const ext = extname(file.originalname) || "";
    const nome = `${this.sanitizar(codigoTipo)}__${randomUUID()}${ext}`;
    const caminho = join(dir, nome);
    await writeFile(caminho, file.buffer);
    return caminho;
  }

  /**
   * O caminho de um arquivo do MESMO tipo com o MESMO conteúdo, se já houver um na staging desta
   * admissão. `null` quando é conteúdo inédito.
   *
   * Arquivo ilegível (apagado pelo purge no meio da conferência) é ignorado em vez de derrubar a
   * gravação: a coleta não pode falhar por causa de um vizinho que sumiu.
   */
  private async mesmoConteudo(
    admissaoId: string,
    codigoTipo: string,
    buffer: Buffer,
  ): Promise<string | null> {
    const alvo = this.sanitizar(codigoTipo);
    const hashNovo = createHash("sha256").update(buffer).digest("hex");
    for (const a of await this.listar(admissaoId)) {
      if (a.codigoTipo !== alvo) continue;
      try {
        const atual = await readFile(a.caminho);
        if (createHash("sha256").update(atual).digest("hex") === hashNovo) return a.caminho;
      } catch {
        continue;
      }
    }
    return null;
  }

  /** Grava um PDF-mãe de kit na pasta de kits e devolve o caminho. */
  async salvarKit(file: Express.Multer.File): Promise<string> {
    const dir = this.kitsDir();
    await mkdir(dir, { recursive: true });
    const ext = extname(file.originalname) || ".pdf";
    const caminho = join(dir, `${randomUUID()}${ext}`);
    await writeFile(caminho, file.buffer);
    return caminho;
  }

  /** Lista os arquivos da staging de uma admissão com o código do tipo recuperado do nome. */
  async listar(admissaoId: string): Promise<ArquivoStaging[]> {
    const dir = this.caminho(admissaoId);
    let nomes: string[];
    try {
      nomes = await readdir(dir);
    } catch {
      return [];
    }
    return nomes.map((nome) => ({
      caminho: join(dir, nome),
      codigoTipo: nome.split("__")[0] ?? "",
    }));
  }

  /** Remove o diretório inteiro da admissão (expurgo no fechamento da régua — §A.6). */
  async removerAdmissao(admissaoId: string): Promise<void> {
    await rm(this.caminho(admissaoId), { recursive: true, force: true });
  }

  /** Remove UM arquivo da staging (ex.: ASO já arquivado no Drive — evita duplicar no fechamento).
   * Só age dentro da raiz da staging (guarda contra path traversal — §A.6). */
  async removerArquivo(caminho: string): Promise<void> {
    if (!this.dentroDaRaiz(caminho)) return;
    await rm(caminho, { force: true });
  }

  /** Garante que um caminho está sob a raiz da staging (guarda contra path traversal). */
  dentroDaRaiz(caminho: string): boolean {
    const base = resolve(this.baseDir);
    const alvo = resolve(caminho);
    return alvo === base || alvo.startsWith(base + "/");
  }

  /** Remove caracteres perigosos de path de um segmento (admissaoId/codigoTipo). */
  private sanitizar(s: string): string {
    return (s ?? "").replace(/[^a-zA-Z0-9_-]/g, "_");
  }
}
