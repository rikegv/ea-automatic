import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { clienteVinculos, drivePastaPai } from "../db/schema";
import { fopagTemPastaPai as fopagFallback, resolvePastaPaiId as resolveFallback } from "./drive-routing";

/**
 * Resolução da PASTA-PAI do Drive por TABELA (INT-2), tirando o roteamento do `.env`. Precedência:
 *  1. a tabela `drive_pasta_pai` (fonte da verdade, administrável pela tela);
 *  2. o fallback em código (`drive-routing`), rede de segurança durante a transição.
 * NÃO lê mais o `.env`. A normalização do tipo de contrato é a MESMA do `drive-routing` (acento e
 * caixa insensíveis), para a chave da tabela casar com a do fallback. `null` = sem mapeamento, o
 * chamador NÃO arquiva (mantém a staging viva até o TTL, §A.6).
 *
 * §A.6: `folder_id` é identificador do Drive (não é PII nem segredo); nada de CPF/URL do Pandapé.
 */

/** Remove acento e caixa: "Temporário" -> "temporario". Igual ao `drive-routing`. */
function norm(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Extrai o id de uma pasta do Drive a partir de uma URL `.../folders/<id>` ou de um id cru. */
export function extrairFolderId(urlOuId: string | null | undefined): string | null {
  const bruto = (urlOuId ?? "").trim();
  if (!bruto) return null;
  const porUrl = bruto.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (porUrl) return porUrl[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(bruto)) return bruto;
  return null;
}

export type EscopoPastaPai = "CONTRATO" | "FOPAG";

export interface UpsertPastaPaiInput {
  escopo: EscopoPastaPai;
  chave: string;
  folderId: string;
  rotulo: string;
}

@Injectable()
export class DrivePastaPaiService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** A chave gravada na tabela: tipo normalizado quando CONTRATO, cod_cliente (trim) quando FOPAG. */
  private chaveNormalizada(escopo: EscopoPastaPai, chave: string): string {
    return escopo === "CONTRATO" ? norm(chave) : (chave ?? "").trim();
  }

  /** Lê da tabela um folder_id ATIVO para o par (escopo + chave). `null` quando não há. */
  private async buscarNaTabela(escopo: EscopoPastaPai, chave: string): Promise<string | null> {
    const [row] = await this.db
      .select({ folderId: drivePastaPai.folderId })
      .from(drivePastaPai)
      .where(
        and(
          eq(drivePastaPai.escopo, escopo),
          eq(drivePastaPai.chave, this.chaveNormalizada(escopo, chave)),
          eq(drivePastaPai.ativo, true),
        ),
      )
      .limit(1);
    return row?.folderId ?? null;
  }

  /**
   * Resolve o id da pasta-pai por contrato/cliente. Tabela primeiro; se não achar, cai no fallback em
   * código. NÃO lê o `.env` (passa `{}` para o fallback puro, anulando qualquer leitura de env).
   */
  async resolver(
    tipoContrato: string | null | undefined,
    codCliente: string | null | undefined,
  ): Promise<string | null> {
    const t = norm(tipoContrato ?? "");
    if (!t) return null;
    if (t === "fopag") {
      const cod = (codCliente ?? "").trim();
      // 1) Cadastro POR CLIENTE vence sempre (decisão do diretor): é a exceção explícita, e existe
      // caso real que depende dela (o RAFFOUL 25, empresa 44, gravado na pasta do grupo RAFUL).
      const daTabela = await this.buscarNaTabela("FOPAG", cod);
      if (daTabela) return daTabela;
      // 2) EMPRESA DO VÍNCULO. É a correção de raiz do retrabalho: a pasta do Fopag no Drive é
      // organizada por EMPRESA do grupo, não por cliente, e o sistema perguntava por cliente. Cada
      // cliente novo da mesma empresa obrigava a recadastrar a MESMA pasta, e foi assim que os
      // cadastros por cliente nasceram, todos apontando para a pasta da empresa correspondente.
      const empresa = await this.empresaDoFopag(cod);
      if (empresa) {
        const porEmpresa = await this.buscarNaTabela("FOPAG", empresa);
        if (porEmpresa) return porEmpresa;
        // O mapa em código também é chaveado por empresa (16, 19, 27, ...), então vale tentar.
        const doFallback = resolveFallback(tipoContrato, empresa, {});
        if (doFallback) return doFallback;
      }
    } else {
      const daTabela = await this.buscarNaTabela("CONTRATO", t);
      if (daTabela) return daTabela;
    }
    // Rede de segurança: o mapa em código, SEM env (transição sem perder nenhum mapeamento).
    return resolveFallback(tipoContrato, codCliente, {});
  }

  /**
   * Um cod_cliente do contrato Fopag TEM pasta-pai mapeada? (tabela OU fallback em código). Usado
   * pela tela de diagnóstico (Bloco 2) para achar cliente Fopag novo sem pasta.
   */
  async fopagTemPastaPai(codCliente: string): Promise<boolean> {
    const daTabela = await this.buscarNaTabela("FOPAG", codCliente);
    if (daTabela) return true;
    if (fopagFallback(codCliente, {})) return true;
    // MESMA régua do `resolver`: se a EMPRESA do vínculo tem pasta, o cliente TEM pasta, e o sinal
    // do diagnóstico não pode cobrar cadastro que já existe. Sem isto, a tela seguiria pedindo
    // mapeamento por cliente, que é exatamente o retrabalho que esta correção elimina.
    const empresa = await this.empresaDoFopag(codCliente);
    if (!empresa) return false;
    if (await this.buscarNaTabela("FOPAG", empresa)) return true;
    return fopagFallback(empresa, {});
  }

  /**
   * Código da EMPRESA do grupo no vínculo Fopag ATIVO do cliente. `null` quando o cliente não tem
   * vínculo Fopag cadastrado (aí não há por onde herdar e o mapeamento é mesmo necessário).
   *
   * Um cliente tem no máximo um vínculo por tipo de serviço (unique `uq_cliente_vinculo_tipo`), então
   * não existe ambiguidade a resolver aqui.
   */
  private async empresaDoFopag(codCliente: string): Promise<string | null> {
    const cod = (codCliente ?? "").trim();
    if (!cod) return null;
    const [row] = await this.db
      .select({ empresa: clienteVinculos.empresaCodigo })
      .from(clienteVinculos)
      .where(
        and(
          eq(clienteVinculos.codCliente, cod),
          eq(clienteVinculos.tipoServico, "FOPAG"),
          eq(clienteVinculos.ativo, true),
        ),
      )
      .limit(1);
    const empresa = (row?.empresa ?? "").trim();
    return empresa || null;
  }

  /** Lista todas as pastas-pai cadastradas (tela admin). Sem PII (§A.6). */
  async listar() {
    return this.db
      .select({
        id: drivePastaPai.id,
        escopo: drivePastaPai.escopo,
        chave: drivePastaPai.chave,
        rotulo: drivePastaPai.rotulo,
        folderId: drivePastaPai.folderId,
        ativo: drivePastaPai.ativo,
      })
      .from(drivePastaPai)
      .orderBy(asc(drivePastaPai.escopo), asc(drivePastaPai.chave));
  }

  /**
   * Cria ou atualiza a pasta-pai do par (escopo + chave). Idempotente: o unique converge por
   * `onConflictDoUpdate`, então re-salvar o mesmo par só atualiza folder_id/rotulo/reativa.
   */
  async upsert(input: UpsertPastaPaiInput) {
    const chave = this.chaveNormalizada(input.escopo, input.chave);
    const [row] = await this.db
      .insert(drivePastaPai)
      .values({
        escopo: input.escopo,
        chave,
        folderId: input.folderId.trim(),
        rotulo: input.rotulo.trim(),
        ativo: true,
      })
      .onConflictDoUpdate({
        target: [drivePastaPai.escopo, drivePastaPai.chave],
        set: {
          folderId: input.folderId.trim(),
          rotulo: input.rotulo.trim(),
          ativo: true,
          atualizadoEm: new Date(),
        },
      })
      .returning({
        id: drivePastaPai.id,
        escopo: drivePastaPai.escopo,
        chave: drivePastaPai.chave,
        rotulo: drivePastaPai.rotulo,
        folderId: drivePastaPai.folderId,
        ativo: drivePastaPai.ativo,
      });
    return row;
  }

  /** Remove a pasta-pai (exclusão física: é só roteamento, o histórico do Drive não depende dela). */
  async remover(id: string): Promise<{ ok: boolean }> {
    await this.db.delete(drivePastaPai).where(eq(drivePastaPai.id, id));
    return { ok: true };
  }
}
