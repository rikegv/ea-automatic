/**
 * ─ A LEITURA DA POPULAÇÃO DA HOMOLOGAÇÃO (a casca da asserção de arranque do lote) ──────────────
 *
 * A REGRA mora em `apps/frontend/src/ajuda/lote.ts`, onde existe runner de teste e onde o `tester`
 * já a travou em 10 casos, com as linhas INJETADAS. Aqui fica apenas o que a regra não pode ter:
 * acesso ao banco.
 *
 * ┌─ POR QUE A REGRA NÃO CONSULTA O BANCO, E É ISSO QUE A TORNA CONFIÁVEL ────────────────────────┐
 * │ Um teste que consultasse a homologação de verdade ficaria VERDE POR SORTE: verde hoje porque a  │
 * │ base está anonimizada, e mudo no dia do re-clone, que é justamente o dia em que ele tinha de     │
 * │ gritar. A regra é medida contra linhas injetadas; a leitura real é esta casca, e ela é burra de   │
 * │ propósito: devolve o que está lá.                                                              │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * DUAS TRAVAS DE ENDEREÇO CONTINUAM AQUI, e as duas provam POUCO, o que é exatamente o motivo de a
 * asserção de população existir: o database tem de se chamar `ea_automatic_homolog` e a URL tem de
 * ser a da 3120. Depois de um re-clone, as duas continuam verdadeiras com a base cheia de gente.
 *
 * O NOME E O E-MAIL LIDOS FICAM EM MEMÓRIA E NÃO SAEM DAQUI: eles alimentam a conferência e a
 * allowlist, e nunca a mensagem de erro nem o log (§A.6).
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import type {
  ColunaDePessoa,
  LinhaPessoa,
  TabelaDePessoas,
} from "../../../apps/frontend/src/ajuda/lote";
import { FalhaDeMotor } from "./ambiente";

/** O `.env` da homologação vive fora deste repositório, no worktree da 3120. */
const ENV_HOMOLOG = "/home/henrique/apps/ea-homolog/apps/backend/.env";
const DATABASE_DE_HOMOLOGACAO = "ea_automatic_homolog";
const POSTGRES_ESM =
  "/home/henrique/apps/ea-automatic/apps/backend/node_modules/postgres/src/index.js";

/**
 * ─ TRÊS TABELAS DE GENTE, E `comerciais` É A TERCEIRA (achado do `seguranca`, 28/09/2026) ────────
 *
 * `as_comerciais.rotulo` é NOME DE PESSOA por natureza (é o comercial responsável), e o menu
 * `clientes` da conta de captura entrega aquela lista. Ela entra aqui, e não no
 * `CONSULTA_DE_VOCABULARIO`: vocabulário DISPENSA, esta tabela PROÍBE. Medido: 3 linhas com forma de
 * nome, nenhuma em `usuarios`, portanto nenhuma protegida por nada além do léxico.
 *
 * `rotulo as nome` porque a régua da tabela é a de `usuarios`: a linha de pessoa que o gate PROCURA.
 * Sem CPF e sem e-mail, que aquela tabela não tem.
 */
const CONSULTAS: Record<TabelaDePessoas, string> = {
  candidatos: `select nome, cpf, email from candidatos`,
  usuarios: `select nome, null as cpf, email from usuarios`,
  comerciais: `select rotulo as nome, null as cpf, null as email from as_comerciais`,
};

/**
 * ─ AS **COLUNAS** DE PESSOA, UMA CONSULTA POR FONTE (segundo veto do `seguranca`, 28/09/2026) ────
 *
 * A REGRA mora em `lote.ts` (que tem runner de teste); aqui só a leitura. Cada consulta devolve a MESMA
 * forma de linha (`nome`, `cpf`, `email`), porque a régua que as audita é a mesma das tabelas: o gate
 * que audita as telas.
 *
 * `distinct` e `where ... is not null` em tudo: o que interessa é o CONJUNTO de valores distintos, e
 * linha nula é coluna em branco, que é normal e não prova nada (a régua em `lote.ts` a ignora).
 *
 * §A.6: nada lido aqui sai desta casca. O que é impresso é CONTAGEM.
 */
const CONSULTAS_DE_COLUNA: Record<string, string> = {
  // PII REAL DE TERCEIRO: o gestor do cliente. 413 de 414 valores byte-idênticos à produção, 94 com
  // e-mail corporativo. Entra na asserção E na denylist (ver `lote.ts`).
  "dados_vaga_folha.gestor_bp": `select distinct gestor_bp as nome, null as cpf, null as email
     from dados_vaga_folha where gestor_bp is not null and btrim(gestor_bp) <> ''`,
  // "Substituição" costuma vir com o NOME da pessoa substituída depois (§A.3 regra 10).
  "dados_vaga_folha.motivo": `select distinct motivo as nome, null as cpf, null as email
     from dados_vaga_folha where motivo is not null and btrim(motivo) <> ''`,
  // O CPF do substituído tem TTL de 48h (§A.3 regra 10), e enquanto ele existe é PII em tela.
  "dados_vaga_folha.substituido": `select distinct substituido_nome as nome, substituido_cpf as cpf,
     null as email from dados_vaga_folha
     where substituido_nome is not null or substituido_cpf is not null`,
  "sala_espera": `select distinct nome, cpf, email from sala_espera`,
  "as_candidatos": `select distinct nome, cpf, email from as_candidatos`,
  "assinante_empresa": `select distinct nome, null as cpf, email from assinante_empresa`,
  // VAZIAS HOJE, e a asserção é escrita agora de propósito: é o momento mais barato, passa hoje e
  // começa a proteger no dia em que o fluxo encher.
  "admissao_dados_gi.filiacao": `select distinct filiacao_nome_mae as nome, null as cpf, null as email
       from admissao_dados_gi where filiacao_nome_mae is not null
     union select distinct filiacao_nome_pai, null, null
       from admissao_dados_gi where filiacao_nome_pai is not null`,
  "vagas.solicitante": `select distinct solicitante_nome as nome, null as cpf,
     solicitante_email as email from vagas
     where solicitante_nome is not null or solicitante_email is not null`,
};

/**
 * ─ OS VOCABULÁRIOS DO SISTEMA QUE **NÃO SÃO PESSOA**, LIDOS DO BANCO ───────────────────────────
 *
 * ┌─ POR QUE ISTO É CONSULTA E NÃO LISTA ────────────────────────────────────────────────────────┐
 * │ O léxico de nome reprovou três telas por "BC CAMPINAS PARQUE D PEDRO SHOPPING" (uma LOJA),     │
 * │ "Ferraz de Vasconcelos" e "São Paulo" (CIDADES). Escrever essas três exceções à mão consertaria │
 * │ hoje e voltaria a falhar na próxima cidade cadastrada, com a fábrica achando que o gate         │
 * │ regrediu. A fonte é a TABELA, exatamente como a denylist: catálogo novo entra sozinho.         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A LISTA É FECHADA E NOMINAL, PAR (TABELA, COLUNA), E ISSO É EXIGÊNCIA DO `seguranca` ───────┐
 * │ Nada de varredura genérica por "tabelas de catálogo". A varredura genérica pega `as_comerciais` │
 * │ sozinha, e ali **100% dos valores são nome de pessoa por natureza** (é o comercial responsável).│
 * │ O detalhe que torna o erro provável: hoje aquela tabela está VAZIA em produção, então quem medir│
 * │ conclui "inofensivo", inclui, e o furo abre sozinho no dia em que a operação cadastrar a equipe.│
 * │ Cada par abaixo foi conferido valor a valor por ele: NENHUM tem forma de nome de pessoa.        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE FICOU DE FORA, e o motivo, porque a tentação é somar tudo:
 *   . `as_comerciais.rotulo`: PROIBIDO, ver o bloco acima.
 *   . `tarifas_transporte.cidade`: é catálogo EDITÁVEL, e a conta de captura tem o menu `tarifas`.
 *     Dispensá-lo deixaria a identidade que captura editar um vocabulário em que o gate confia. As
 *     cidades daquela tela são cobertas por `as_cidades.nome`, que a API só expõe em leitura (a
 *     escrita é a carga do IBGE), e é por isso que ela é aceitável e esta não. *(Decisão do
 *     coordenador sobre o achado do `seguranca`: o menu FICA, a tabela não é dispensada.)*
 *   . `clinicas_catalogo.endereco`: só `nome` entra. Endereço é dado de local com forma livre.
 *   . `candidatos` e `usuarios`: são as duas tabelas de PESSOA.
 *
 * INATIVO TAMBÉM ENTRA (não há filtro por `ativo`): o catálogo inativo continua desenhado na tela
 * sempre que o filtro está em "todos", que é justamente o estado do artigo de catálogo.
 */
const CONSULTA_DE_VOCABULARIO = `
  select nome as valor from as_cidades
  union select razao_social from clientes
  union select nome_operacao from clientes
  union select nome from cliente_lojas
  union select nome from cargos
  union select rotulo from as_segmentos
  union select nome from clinicas_catalogo
  union select nome from projetos_alto_volume
  union select nome from grupos_cliente
  union select nome from entidades_soulan
  union select nome from escalas_catalogo
`;

type Consulta = {
  unsafe(sql: string): Promise<Array<Record<string, unknown>>>;
  end(): Promise<void>;
};

export function urlDaHomologacao(): string {
  let bruto: string;
  try {
    bruto = fs.readFileSync(ENV_HOMOLOG, "utf8");
  } catch {
    throw new FalhaDeMotor(
      `Não foi possível ler ${ENV_HOMOLOG} para alcançar a base de homologação. Sem a conferência ` +
        `de população, o lote não começa (achado 4 do \`seguranca\`).`,
    );
  }
  const linha = bruto.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  const url = linha?.slice(linha.indexOf("=") + 1).trim();
  if (!url) throw new FalhaDeMotor(`${ENV_HOMOLOG} não tem DATABASE_URL.`);
  const nome = new URL(url).pathname.replace("/", "");
  if (nome !== DATABASE_DE_HOMOLOGACAO) {
    throw new FalhaDeMotor(
      `DATABASE RECUSADO: "${nome}". O motor só lê a base de homologação ` +
        `("${DATABASE_DE_HOMOLOGACAO}"). A produção nunca é fonte de print (§A.6, §A.32).`,
    );
  }
  return url;
}

export type LeitorDaBase = {
  amostrarPessoas: (tabela: TabelaDePessoas) => Promise<LinhaPessoa[]>;
  /** Uma COLUNA de pessoa (ver `ColunaDePessoa` em `lote.ts`). Quem decide é a regra, não esta casca. */
  amostrarColunaDePessoa: (fonte: ColunaDePessoa) => Promise<LinhaPessoa[]>;
  /** Os valores CRUS dos catálogos. Quem os transforma em dispensa é `montarVocabularioDoSistema`. */
  amostrarVocabulario: () => Promise<string[]>;
  fechar: () => Promise<void>;
};

export async function abrirLeitorDaBase(): Promise<LeitorDaBase> {
  const url = urlDaHomologacao();
  const modulo = (await import(pathToFileURL(POSTGRES_ESM).href)) as {
    default: (u: string, o?: unknown) => Consulta;
  };
  const sql = modulo.default(url, { max: 1, idle_timeout: 5 });
  return {
    amostrarPessoas: async (tabela) => {
      const linhas = await sql.unsafe(CONSULTAS[tabela]);
      return linhas.map((l) => ({
        nome: l.nome == null ? undefined : String(l.nome),
        cpf: l.cpf == null ? undefined : String(l.cpf),
        email: l.email == null ? undefined : String(l.email),
      }));
    },
    amostrarColunaDePessoa: async (fonte) => {
      const consulta = CONSULTAS_DE_COLUNA[fonte];
      if (!consulta) {
        // FONTE DECLARADA E SEM CONSULTA seria a asserção nova nascendo INERTE, em silêncio, que é o
        // modo de falha desta frente inteira. Falha dura, com o nome da fonte.
        throw new FalhaDeMotor(
          `COLUNA DE PESSOA SEM CONSULTA: "${fonte}". A fonte está declarada em \`lote.ts\` e não tem ` +
            `leitura aqui, então a asserção dela nunca rodaria e o gate teria proteção IMAGINÁRIA.`,
        );
      }
      const linhas = await sql.unsafe(consulta);
      return linhas.map((l) => ({
        nome: l.nome == null ? undefined : String(l.nome),
        cpf: l.cpf == null ? undefined : String(l.cpf),
        email: l.email == null ? undefined : String(l.email),
      }));
    },
    amostrarVocabulario: async () => {
      const linhas = await sql.unsafe(CONSULTA_DE_VOCABULARIO);
      return linhas.map((l) => (l.valor == null ? "" : String(l.valor))).filter(Boolean);
    },
    fechar: async () => {
      await sql.end().catch(() => undefined);
    },
  };
}
