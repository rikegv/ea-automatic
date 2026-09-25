/**
 * PORTAL→GI: A ALLOWLIST FECHADA DO QUE O CANDIDATO PODE GRAVAR EM `admissao_dados_gi`.
 *
 * POR QUE ESTE MÓDULO EXISTE, E POR QUE É ALLOWLIST E NÃO BLOCKLIST: a rota de gravação recebe um
 * mapa `campo -> valor` vindo do navegador do candidato. Só as chaves listadas aqui viram coluna; o
 * resto é DESCARTADO em silêncio, no mesmo espírito do `CAMPOS_POR_TIPO` do `ai-service` e da
 * allowlist da trilha (`domain/portal-evento.ts`). Um campo novo que o cliente invente não atravessa
 * sem que ninguém precise se lembrar de proibi-lo, e o candidato NUNCA escreve em `candidatos`
 * (nome, cpf, nascimento, sexo, banco), em farol nem em qualquer coluna que não seja dado dele para
 * o GI.
 *
 * As CHAVES são as mesmas que a IA usa ao extrair (`ai-service/app/portal_extracao.py`), para que o
 * que a tela recebe como sugestão e o que ela devolve como confirmação falem o mesmo vocabulário. O
 * VALOR gravado é sempre o que o candidato CONFIRMOU, nunca a sugestão crua da IA (veto V12): a
 * gravação só acontece por esta rota, disparada pelo candidato.
 *
 * §A.6: este módulo é função pura, sem logger. Nenhum VALOR é lido para decidir nada além de
 * validar formato de data; nada daqui é impresso.
 */

/** O tipo do campo decide só a validação de formato na gravação, nunca a regra de negócio. */
type TipoCampoGi = "texto" | "data" | "uf";

interface CampoGiDef {
  /** Nome da COLUNA (propriedade JS de `admissaoDadosGi`) onde o valor é gravado. */
  coluna: string;
  /** Rótulo legível, para o rastro do aceite (§A.6: rótulo, nunca valor). */
  rotulo: string;
  tipo: TipoCampoGi;
}

/**
 * O CATÁLOGO. Chave = campo do vocabulário da extração; valor = coluna + rótulo + tipo.
 *
 * Cobre os campos do GI que o EA não tem (grupos 1, 2, 3 e 5 de `GI-DADOS`). `raca`,
 * `grauInstrucao`, `nacionalidade` e `naturalidade` não saem de documento comum: o candidato os
 * digita/seleciona, e por isso entram aqui como texto normal.
 */
export const CAMPOS_GI: Readonly<Record<string, CampoGiDef>> = {
  // Grupo 1 / filiação
  nacionalidade: { coluna: "nacionalidade", rotulo: "Nacionalidade", tipo: "texto" },
  naturalidade: { coluna: "naturalidade", rotulo: "Naturalidade", tipo: "texto" },
  nomeMae: { coluna: "filiacaoNomeMae", rotulo: "Nome da mãe", tipo: "texto" },
  nomePai: { coluna: "filiacaoNomePai", rotulo: "Nome do pai", tipo: "texto" },
  // Grupo 2
  estadoCivil: { coluna: "estadoCivil", rotulo: "Estado civil", tipo: "texto" },
  raca: { coluna: "raca", rotulo: "Raça/cor", tipo: "texto" },
  grauInstrucao: { coluna: "grauInstrucao", rotulo: "Grau de instrução", tipo: "texto" },
  // Grupo 3 (RG)
  rgNumero: { coluna: "rgNumero", rotulo: "Número do RG", tipo: "texto" },
  rgOrgaoEmissor: { coluna: "rgOrgaoEmissor", rotulo: "Órgão emissor do RG", tipo: "texto" },
  rgUf: { coluna: "rgUf", rotulo: "UF do RG", tipo: "uf" },
  rgDataEmissao: { coluna: "rgDataEmissao", rotulo: "Data de emissão do RG", tipo: "data" },
  // Grupo 3 (CTPS)
  ctpsNumero: { coluna: "ctpsNumero", rotulo: "Número da CTPS", tipo: "texto" },
  ctpsSerie: { coluna: "ctpsSerie", rotulo: "Série da CTPS", tipo: "texto" },
  ctpsUf: { coluna: "ctpsUf", rotulo: "UF da CTPS", tipo: "uf" },
  ctpsData: { coluna: "ctpsData", rotulo: "Data de expedição da CTPS", tipo: "data" },
  // Grupo 3 (PIS)
  pis: { coluna: "pis", rotulo: "PIS/PASEP", tipo: "texto" },
  // Grupo 3 (título de eleitor)
  tituloNumero: { coluna: "tituloNumero", rotulo: "Número do título", tipo: "texto" },
  tituloZona: { coluna: "tituloZona", rotulo: "Zona do título", tipo: "texto" },
  tituloSecao: { coluna: "tituloSecao", rotulo: "Seção do título", tipo: "texto" },
  // Grupo 3 (reservista)
  reservistaNumero: { coluna: "reservistaNumero", rotulo: "Número do reservista", tipo: "texto" },
  reservistaCategoria: {
    coluna: "reservistaCategoria",
    rotulo: "Categoria do reservista",
    tipo: "texto",
  },
  // Grupo 3 (CNH) — a extração devolve `cnhPrimeiraHabilitacao` (emissão) e `cnhValidade` (vencimento)
  cnhRegistro: { coluna: "cnhNumero", rotulo: "Número da CNH", tipo: "texto" },
  cnhPrimeiraHabilitacao: {
    coluna: "cnhDataEmissao",
    rotulo: "Data de emissão da CNH",
    tipo: "data",
  },
  cnhValidade: { coluna: "cnhDataValidade", rotulo: "Validade da CNH", tipo: "data" },
  // Grupo 5 (endereço) — chaves iguais às do COMPROVANTE_RESIDENCIA na extração
  cep: { coluna: "endCep", rotulo: "CEP", tipo: "texto" },
  logradouro: { coluna: "endLogradouro", rotulo: "Logradouro", tipo: "texto" },
  numeroEndereco: { coluna: "endNumero", rotulo: "Número", tipo: "texto" },
  complemento: { coluna: "endComplemento", rotulo: "Complemento", tipo: "texto" },
  bairro: { coluna: "endBairro", rotulo: "Bairro", tipo: "texto" },
  cidade: { coluna: "endCidade", rotulo: "Cidade", tipo: "texto" },
  uf: { coluna: "endUf", rotulo: "UF", tipo: "uf" },
};

/** Teto de tamanho por valor: não é limite de formulário, é trava contra texto vazando pelo campo. */
const TAMANHO_MAX_VALOR = 200;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

export interface DadosGiFiltrados {
  /** As colunas a gravar (nome JS da coluna -> valor confirmado). Só o que passou pela allowlist. */
  update: Record<string, string>;
  /** Os RÓTULOS dos campos que o candidato confirmou, para o rastro do aceite (§A.6). */
  rotulos: string[];
}

/**
 * Filtra o mapa cru do candidato para o que pode ser gravado, e devolve os rótulos confirmados.
 *
 * REGRAS, e cada uma é uma trava:
 *  - chave fora da allowlist: DESCARTADA (não vira coluna, não vira rótulo);
 *  - valor não-string ou vazio (após `trim`): DESCARTADO (nada a gravar);
 *  - valor maior que o teto: DESCARTADO (não é dado de documento, é texto vazando);
 *  - `tipo === "data"` com formato diferente de AAAA-MM-DD: DESCARTADO (não persiste data quebrada);
 *  - `tipo === "uf"`: reduzido a 2 letras maiúsculas; vazio depois disso é descartado.
 *
 * §A.6: nada aqui é logado, e a função nunca levanta com o valor dentro.
 */
export function filtrarCamposGi(cru: Record<string, unknown>): DadosGiFiltrados {
  const update: Record<string, string> = {};
  const rotulos: string[] = [];
  for (const [campo, def] of Object.entries(CAMPOS_GI)) {
    const bruto = cru[campo];
    if (typeof bruto !== "string") continue;
    let valor = bruto.trim();
    if (!valor || valor.length > TAMANHO_MAX_VALOR) continue;
    if (def.tipo === "data" && !RE_DATA.test(valor)) continue;
    if (def.tipo === "uf") {
      valor = valor.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
      if (valor.length !== 2) continue;
    }
    update[def.coluna] = valor;
    rotulos.push(def.rotulo);
  }
  return { update, rotulos };
}
