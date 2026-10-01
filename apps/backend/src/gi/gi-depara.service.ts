import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { DeParaGi } from "../domain/portal-dados-gi";

/**
 * O DE/PARA de código do GI (Portal→GI, peça 3): traduz o que o EA guarda como TEXTO (nome da cidade
 * + UF) no CÓDIGO que o `FuncionarioSelecao` espera (`codigoCidadeResid`).
 *
 * PRINCÍPIO: NUNCA SE INVENTA CÓDIGO (§A.9 / instrução da peça 3). A fonte da verdade é o catálogo do
 * próprio GI (municípios), materializado OFFLINE pela grade GET-only e carregado aqui como um mapa via
 * env (`GI_DEPARA_CIDADES`, JSON). Quando não há correspondência, o resolver devolve `null` e o campo
 * de código fica VAZIO no payload, jamais um palpite. VAZIO é o default: sem o env, todo código é nulo
 * (fail-closed).
 *
 * O DE/PARA DE BANCO SAIU (decisão do diretor, 01/10/2026), junto com `codigoBcoFolha`/`codigoBcoPagar`:
 * aqueles campos referenciam a CONTA PAGADORA DA EMPRESA (`TB_Banco`, que tem agência, conta, cheque e
 * saldo), quem cadastra é o time de folha, e o EA não deve mandar. O `341` que o EA mandava era o código
 * FEBRABAN (`TB_Banco.numeroBanco`), e o campo espera a chave interna `TB_Banco.codigoBanco`, que para o
 * mesmo FEBRABAN tem 40 valores possíveis (um por empresa/finalidade). Com os campos fora do envio, o
 * mapa `GI_DEPARA_BANCOS` ficou sem consumidor e foi removido, inclusive do `.env.example`.
 *
 * §A.6: o mapa é de CÓDIGO PÚBLICO de catálogo (cidade), não PII. Nada aqui é logado com valor.
 */

type MapaCidades = Record<string, string>; // chave normalizada "UF|CIDADE" -> código GI

@Injectable()
export class GiDeParaService implements DeParaGi {
  private readonly logger = new Logger("GiDeParaService");
  private readonly cidades: MapaCidades;

  constructor(config: ConfigService) {
    this.cidades = normalizarMapaCidades(
      lerJson(config.get<string>("GI_DEPARA_CIDADES"), "GI_DEPARA_CIDADES", this.logger),
    );
  }

  /** Código GI da cidade por (nome, UF). Sem correspondência: null (não se inventa). */
  codigoCidade(nome: string | null | undefined, uf: string | null | undefined): string | null {
    const chave = chaveCidade(nome, uf);
    if (!chave) return null;
    return this.cidades[chave] ?? null;
  }
}

/** Remove acentos, colapsa espaço e sobe para maiúsculas: casa "São Paulo" com "SAO PAULO". */
function normalizarTexto(v: string | null | undefined): string {
  if (typeof v !== "string") return "";
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function chaveCidade(nome: string | null | undefined, uf: string | null | undefined): string {
  const n = normalizarTexto(nome);
  const u = normalizarTexto(uf);
  if (!n || !u) return "";
  return `${u}|${n}`;
}

function lerJson(bruto: string | undefined, rotulo: string, log: Logger): Record<string, unknown> {
  const t = (bruto ?? "").trim();
  if (!t) return {};
  try {
    const obj = JSON.parse(t) as unknown;
    if (obj && typeof obj === "object" && !Array.isArray(obj)) return obj as Record<string, unknown>;
    log.warn(`${rotulo} não é um objeto JSON: de/para ignorado`);
    return {};
  } catch {
    // NUNCA logar o conteúdo (pode ter sido colado errado). Só o rótulo da env.
    log.warn(`${rotulo} não é JSON válido: de/para ignorado`);
    return {};
  }
}

/** Normaliza as chaves do mapa de cidades ("UF|CIDADE") para casar independente de acento/caixa. */
function normalizarMapaCidades(cru: Record<string, unknown>): MapaCidades {
  const out: MapaCidades = {};
  for (const [k, v] of Object.entries(cru)) {
    const codigo = valorCodigo(v);
    if (!codigo) continue;
    const partes = k.split("|");
    if (partes.length !== 2) continue;
    const chave = chaveCidade(partes[1], partes[0]);
    if (chave) out[chave] = codigo;
  }
  return out;
}

function valorCodigo(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}
