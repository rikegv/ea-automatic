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
 * ═══ OS PARES (EMPRESA, FILIAL) DO GI, segundo mapa, mesmo molde e mesmo princípio (01/10/2026) ═══
 *
 * `codigoEmpresa` e `codigoFilial` são os dois únicos campos `int16` OBRIGATÓRIOS e SEM default do envio,
 * e o EA os resolve por `cliente_vinculos`. **Validar os dois campos em separado NÃO BASTA:**
 * `empresa 1 / filial 37` é numericamente válido nos dois e **não existe no fornecedor**, e o registro
 * nasceria apontando para um estabelecimento que não há.
 *
 * MEDIDO contra a lista autoritativa do GI (`Empresa/GetAll`, **127 pares**), comparada com os 244
 * vínculos do EA: **243 dos 244 casam EXATAMENTE, zero divergências.** O único fora é um vínculo com
 * empresa `99` e filial NULA, que é recusa legítima. E **filial `0` é LEGÍTIMA**, existe para todas as 47
 * empresas; dois vínculos do EA a usam (`43/0` e `44/0`) e casam com pares reais.
 *
 * FAIL-CLOSED, e sem exceção: **sem a lista configurada, NENHUM par é conhecido e todo envio é
 * RECUSADO.** Nunca se envia par não verificado. A lista é materializada OFFLINE da medição e carregada
 * por env, igual ao mapa de cidades: ela não é buscada em tempo de execução.
 *
 * §A.6: os dois mapas são de CÓDIGO PÚBLICO de catálogo (cidade, empresa, filial), não PII. Nada aqui é
 * logado com valor.
 */

type MapaCidades = Record<string, string>; // chave normalizada "UF|CIDADE" -> código GI
/** Pares conhecidos, na forma "empresa|filial" (ex.: "1|0", "1|4"). */
type ParesEmpresaFilial = ReadonlySet<string>;

@Injectable()
export class GiDeParaService implements DeParaGi {
  private readonly logger = new Logger("GiDeParaService");
  private readonly cidades: MapaCidades;
  private readonly pares: ParesEmpresaFilial;

  constructor(config: ConfigService) {
    this.cidades = normalizarMapaCidades(
      lerJson(config.get<string>("GI_DEPARA_CIDADES"), "GI_DEPARA_CIDADES", this.logger),
    );
    this.pares = normalizarPares(
      lerJsonLargo(
        config.get<string>("GI_PARES_EMPRESA_FILIAL"),
        "GI_PARES_EMPRESA_FILIAL",
        this.logger,
      ),
    );
  }

  /** Código GI da cidade por (nome, UF). Sem correspondência: null (não se inventa). */
  codigoCidade(nome: string | null | undefined, uf: string | null | undefined): string | null {
    const chave = chaveCidade(nome, uf);
    if (!chave) return null;
    return this.cidades[chave] ?? null;
  }

  /**
   * O par (empresa, filial) existe na lista autoritativa do GI? **Fail-closed: sem lista, sempre
   * `false`**, e o envio é recusado com `GI_PAR_EMPRESA_FILIAL_DESCONHECIDO`.
   *
   * ⚠️ Filial `0` é um par LEGÍTIMO (`"1|0"`), não ausência. Ver o cabeçalho deste arquivo.
   */
  parEmpresaFilialConhecido(empresa: number, filial: number): boolean {
    if (!Number.isInteger(empresa) || !Number.isInteger(filial)) return false;
    return this.pares.has(`${empresa}|${filial}`);
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

/**
 * Lê um JSON que pode ser OBJETO **ou** ARRAY (o `lerJson` acima só aceita objeto, porque o mapa de
 * cidades é sempre objeto). Os pares aparecem naturalmente nas duas formas em quem edita um `.env`.
 */
function lerJsonLargo(bruto: string | undefined, rotulo: string, log: Logger): unknown {
  const t = (bruto ?? "").trim();
  if (!t) return null;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    // NUNCA logar o conteúdo. Só o rótulo da env.
    log.warn(`${rotulo} não é JSON válido: lista de pares ignorada (envio recusado)`);
    return null;
  }
}

/**
 * Normaliza a lista de pares. TRÊS formas aceitas, todas equivalentes:
 *   - `["1|0", "1|4", "2|0"]`      (lista de "empresa|filial", o mesmo espírito da chave composta
 *                                   do mapa de cidades);
 *   - `[[1, 0], [1, 4]]`           (lista de duplas);
 *   - `{"1": [0, 4], "2": [0]}`    (filiais agrupadas por empresa, que é como a medição sai).
 *
 * Par malformado é DESCARTADO em silêncio de dado (sem logar valor): a consequência é recusa de envio,
 * que é o desfecho seguro, e nunca um par inventado.
 */
function normalizarPares(cru: unknown): ParesEmpresaFilial {
  const out = new Set<string>();
  const add = (e: unknown, f: unknown) => {
    const empresa = inteiroPar(e);
    const filial = inteiroPar(f);
    // Empresa 0 não existe no GI; filial 0 existe e é legítima.
    if (empresa == null || filial == null || empresa < 1 || filial < 0) return;
    out.add(`${empresa}|${filial}`);
  };

  if (Array.isArray(cru)) {
    for (const item of cru) {
      if (typeof item === "string") {
        const partes = item.split("|");
        if (partes.length === 2) add(partes[0], partes[1]);
      } else if (Array.isArray(item) && item.length === 2) {
        add(item[0], item[1]);
      }
    }
    return out;
  }

  if (cru && typeof cru === "object") {
    for (const [empresa, filiais] of Object.entries(cru as Record<string, unknown>)) {
      const lista = Array.isArray(filiais) ? filiais : [filiais];
      for (const f of lista) add(empresa, f);
    }
  }
  return out;
}

/** Inteiro não negativo que cabe em `int16`, sem zero à esquerda. Fora disso: null (descarta o par). */
function inteiroPar(v: unknown): number | null {
  const t = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  if (!/^(?:0|[1-9]\d*)$/.test(t)) return null;
  const n = Number.parseInt(t, 10);
  return n <= 32767 ? n : null;
}

function valorCodigo(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}
