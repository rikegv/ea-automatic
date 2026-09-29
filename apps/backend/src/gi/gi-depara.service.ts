import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { DeParaGi } from "../domain/portal-dados-gi";

/**
 * O DE/PARA de código do GI (Portal→GI, peça 3): traduz o que o EA guarda como TEXTO (nome da cidade
 * + UF, nome do banco) no CÓDIGO que o `FuncionarioSelecao` espera (`codigoCidadeResid`,
 * `codigoBcoFolha`/`codigoBcoPagar`).
 *
 * PRINCÍPIO: NUNCA SE INVENTA CÓDIGO (§A.9 / instrução da peça 3). A fonte da verdade são os catálogos
 * do próprio GI (`Banco`, 163 registros; municípios), materializados OFFLINE pela grade GET-only e
 * carregados aqui como um mapa via env (`GI_DEPARA_BANCOS`, `GI_DEPARA_CIDADES`, JSON). Quando não há
 * correspondência, o resolver devolve `null` e o campo de código fica VAZIO no payload, jamais um
 * palpite. VAZIO é o default: sem os env, todo código é nulo (fail-closed).
 *
 * §A.6: o mapa é de CÓDIGO PÚBLICO de catálogo (banco/cidade), não PII. Nada aqui é logado com valor.
 */

type MapaCidades = Record<string, string>; // chave normalizada "UF|CIDADE" -> código GI
type MapaBancos = Record<string, string>; // chave normalizada "NOME BANCO" -> código GI

@Injectable()
export class GiDeParaService implements DeParaGi {
  private readonly logger = new Logger("GiDeParaService");
  private readonly cidades: MapaCidades;
  private readonly bancos: MapaBancos;

  constructor(config: ConfigService) {
    this.cidades = normalizarMapaCidades(
      lerJson(config.get<string>("GI_DEPARA_CIDADES"), "GI_DEPARA_CIDADES", this.logger),
    );
    this.bancos = normalizarMapaBancos(
      lerJson(config.get<string>("GI_DEPARA_BANCOS"), "GI_DEPARA_BANCOS", this.logger),
    );
  }

  /** Código GI da cidade por (nome, UF). Sem correspondência: null (não se inventa). */
  codigoCidade(nome: string | null | undefined, uf: string | null | undefined): string | null {
    const chave = chaveCidade(nome, uf);
    if (!chave) return null;
    return this.cidades[chave] ?? null;
  }

  /** Código GI do banco pelo nome (texto livre do candidato). Sem correspondência: null. */
  codigoBanco(nome: string | null | undefined): string | null {
    const chave = normalizarTexto(nome);
    if (!chave) return null;
    return this.bancos[chave] ?? null;
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

/** Normaliza as chaves do mapa de bancos (nome do banco) para casar independente de acento/caixa. */
function normalizarMapaBancos(cru: Record<string, unknown>): MapaBancos {
  const out: MapaBancos = {};
  for (const [k, v] of Object.entries(cru)) {
    const codigo = valorCodigo(v);
    const chave = normalizarTexto(k);
    if (codigo && chave) out[chave] = codigo;
  }
  return out;
}

function valorCodigo(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}
