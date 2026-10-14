import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { portalCredenciais } from "../db/schema";
import { PortalArmazenamentoService } from "./portal-armazenamento.service";
import { PortalArquivadorService } from "./portal-arquivador.service";

/**
 * VISUALIZAÇÃO do documento do Portal na tela de Auditoria (acréscimo à frente Prontuário Drive).
 *
 * O time precisa ABRIR e VER o documento que o candidato anexou pelo Portal, como fazia com o
 * Pandapé. Mas o documento do Portal vive só no balde de entrada (GCS) e nunca passa pela staging
 * que a Auditoria serve. Exibir exige ler o balde, e ler o balde de forma segura é EXATAMENTE a
 * conta cega do Desenho 1 (`ea-portal-arquivador`): a mesma que copia bytes para o prontuário lê
 * aqui para exibir, sem interpretar. NÃO há acesso novo nem paralelo ao balde (VS3 intacto): este
 * serviço só delega ao cliente do arquivador.
 *
 * NASCE INERTE: `disponivel()` só diz sim quando o cliente do arquivador está configurado E o balde
 * nomeado, o que depende do binding do diretor. Sem binding, a Auditoria segue mostrando o mesmo
 * "indisponível" de sempre (nada muda em produção). UM binding destrava prontuário E visualização.
 *
 * §A.6: o nome do objeto (opaco, sem PII) nunca é logado; o binário transita em memória.
 */

export interface DocumentoDoPortal {
  /** Nome OPACO do objeto no balde (sem PII). Não sai deste módulo nem vai ao log. */
  objeto: string;
  /** Tipo do conteúdo corrigido na credencial (autoridade do mime para o navegador). */
  mime: string;
  tamanhoBytes: number;
}

@Injectable()
export class PortalDocumentoVisualizacaoService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly arquivador: PortalArquivadorService,
    private readonly armazenamento: PortalArmazenamentoService,
  ) {}

  /** A visualização pela conta cega está LIGADA? (binding do diretor presente.) Inerte se não. */
  disponivel(): boolean {
    return this.arquivador.configurado() && this.armazenamento.nomeDoBucket().length > 0;
  }

  /**
   * Os objetos CONFIRMADOS e não reprovados daquele documento (admissão + tipo), em ordem
   * DETERMINÍSTICA (chegada, depois objeto). O índice nesta lista é o mesmo que `baixar` resolve, por
   * isso a ordem é fixa: a tela pede o arquivo N, e N tem de ser sempre o mesmo objeto.
   */
  async listar(admissaoId: string, tipoDocumentoId: string): Promise<DocumentoDoPortal[]> {
    if (!this.disponivel()) return [];
    const linhas = await this.db
      .select({
        objeto: portalCredenciais.objeto,
        mime: portalCredenciais.contentType,
        tamanhoBytes: portalCredenciais.bytesConfirmados,
      })
      .from(portalCredenciais)
      .where(
        and(
          eq(portalCredenciais.admissaoId, admissaoId),
          eq(portalCredenciais.tipoDocumentoId, tipoDocumentoId),
          isNotNull(portalCredenciais.confirmadoEm),
          isNull(portalCredenciais.reprovadoEm),
        ),
      )
      .orderBy(asc(portalCredenciais.confirmadoEm), asc(portalCredenciais.objeto));
    return linhas.map((l) => ({
      objeto: l.objeto,
      mime: l.mime,
      tamanhoBytes: l.tamanhoBytes ?? 0,
    }));
  }

  /** Baixa os bytes de UM objeto pela conta cega (o backend serve inline). */
  async baixar(objeto: string): Promise<{ bytes: Buffer; contentType: string }> {
    return this.arquivador.baixarDocumento({ bucket: this.armazenamento.nomeDoBucket(), objeto });
  }
}
