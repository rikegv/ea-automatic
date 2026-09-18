import type { LinhaDeParaEtapaExternaCrua } from "../../domain/as-etapa-externa";

/**
 * ─ AS PORTAS DA INGESTÃO DO PANDAPÉ POR VARREDURA ──────────────────────────────────────────────
 *
 * O CICLO NÃO CONHECE NestJS, NÃO CONHECE Drizzle E NÃO CONHECE `fetch`. Ele conhece estas quatro
 * portas, e é isso que permite auditá-lo inteiro sem Postgres e sem a API de terceiro: o contrato do
 * `tester` (`ingestao-varredura.tester-fake.ts`) implementa exatamente estas assinaturas com um mundo
 * falso que ANOTA toda requisição, toda escrita, todo job e toda linha de log.
 *
 * ┌─ POR QUE ESTE ARQUIVO DUPLICA AS INTERFACES DO `tester`, EM VEZ DE IMPORTÁ-LAS ──────────────┐
 * │ O arquivo do `tester` é de TESTE, e o sufixo `.tester-fake` é a trava de dono único (§A.39).  │
 * │ Código de produção que importasse dali passaria a depender de um arquivo que outro agente é   │
 * │ dono de reescrever, e levaria junto, para o bundle, as SENTINELAS e o mundo falso. A ligação  │
 * │ entre os dois lados é ESTRUTURAL (o TypeScript casa as formas), e é assim que ela deve ser:   │
 * │ se uma das duas mudar de forma, o contrato para de compilar no ponto em que ele é aplicado.   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhuma porta aqui devolve o item cru da API. A projeção por allowlist acontece antes, e em
 * dois lugares (no `PandapeApiService`, que é quem toca a rede, e de novo no ciclo, que é quem
 * escreve): o dado do art. 11 não tem caminho até o banco, o log ou a fila.
 */

/**
 * A PORTA HTTP RECEBE O VERBO, E ISSO É PROPOSITAL.
 *
 * Uma porta que só oferecesse `get()` tornaria "GET apenas" verdadeiro por tipagem, e o teste que
 * prova a regra mediria nada. A API do Pandapé tem `POST /v1/Match/UpdateFolder` e
 * `PATCH /v2/matches/{id}/update`, que MOVEM candidato no funil de um ATS de terceiro: o verbo tem
 * de ser POSSÍVEL de emitir para que a proibição dele seja medida. Em produção, o adaptador
 * (`ingestao-http.ts`) RECUSA qualquer verbo que não seja GET e qualquer caminho fora da allowlist.
 */
export interface PortaHttp {
  requisitar(metodo: string, caminho: string, params?: Record<string, unknown>): Promise<unknown>;
}

/**
 * UMA ESCRITA, DESCRITA E NÃO EXECUTADA.
 *
 * `comparaAntes` é o `where ... is distinct from` do plano (seção 8), e a AUSÊNCIA dele quer dizer
 * escrita INCONDICIONAL. A diferença é a trava do DIARIO inteira: sem a comparação, a reentrega que
 * não muda nada escreve assim mesmo, e uma volta a cada 30 minutos empurra o relógio do expurgo 48
 * vezes por dia, para sempre.
 */
export interface Escrita {
  tabela: string;
  acao: "insert" | "upsert" | "update" | "delete";
  valores: Record<string, unknown>;
  /** As colunas que identificam a linha no upsert. */
  chaveDeConflito?: string[];
  /** A linha alvo do update. */
  onde?: Record<string, unknown>;
  /** As colunas comparadas antes de escrever. Ausente = escrita incondicional. */
  comparaAntes?: string[];
  /** Upsert que não atualiza nada quando a linha já existe. */
  aoConflitoNadaFaz?: boolean;
}

export interface PortaBanco {
  identidadeExterna(fonte: string, identificador: string): Promise<{ candidatoId: string } | null>;
  candidatoPorCpf(cpf: string): Promise<{ id: string } | null>;
  /**
   * EXISTE PARA QUE A PROIBIÇÃO SEJA EXEQUÍVEL, E NÃO PARA SER CHAMADA.
   *
   * O ciclo NUNCA casa pessoa por nome, e o veto está no schema: nome é chave fraca, dois homônimos
   * viram uma pessoa só e a fusão não se desfaz. A porta existe porque uma proibição que não pode
   * ser cometida também não pode ser medida, e o mutante do contrato precisa dela para errar.
   */
  candidatoPorNome(nome: string): Promise<{ id: string } | null>;
  vagaPorIdPandape(idVacancy: number): Promise<{ id: string } | null>;
  /** Mesma razão da busca por nome: o `reference` REPETE (558 distintos em 587 vagas medidas). */
  vagaPorCodigo(codigo: string): Promise<{ id: string } | null>;
  deParaEtapa(chave: string): Promise<LinhaDeParaEtapaExternaCrua | null>;
  /** MEDIDO: não existe caminho de API para o cliente da vaga. Devolve null, e é o certo (§A.5). */
  clientePorVaga(idVacancy: number): Promise<string | null>;
  /** A marca de água da vaga: o maior `insertDate` já visto. Registro, NUNCA parada de leitura. */
  marcaDaVaga(idVacancy: number): Promise<string | null>;
  escrever(e: Escrita): Promise<{ linhasAfetadas: number; id: string }>;
}

export interface PortaFila {
  enfileirar(fila: string, payload: unknown): Promise<void>;
}

export interface PortaLog {
  info(texto: string, dados?: unknown): void;
  erro(texto: string, dados?: unknown): void;
}

/**
 * O CICLO DE VIDA DA VAGA ESPELHADA, e ele é a correção do achado 8 do `seguranca`.
 *
 * ┌─ POR QUE ELE É UMA PORTA SEPARADA E OPCIONAL ────────────────────────────────────────────────┐
 * │ Encerrar a vaga que SAIU da lista de ativas é uma pergunta sobre o que está no BANCO e não    │
 * │ veio na resposta da API, então ela não cabe em nenhuma das portas de leitura de item. Ela é    │
 * │ UMA instrução SQL (o conjunto inteiro de uma vez, com o relógio do SERVIDOR), e não uma        │
 * │ escrita linha a linha: fatiá-la em N `update` deixaria a janela em que metade das vagas está   │
 * │ encerrada e a outra metade não.                                                                │
 * │                                                                                                │
 * │ OPCIONAL PORQUE O CONTRATO DO `tester` NÃO A DECLARA, e o ciclo tem de continuar assinável     │
 * │ como `(deps: DependenciasDaIngestao) => Promise<ResumoDoCiclo>`. Em produção ela é SEMPRE      │
 * │ injetada, e há teste próprio provando o encerramento e a reabertura.                           │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export interface PortaCicloDeVidaDaVaga {
  /**
   * As vagas espelhadas que NÃO estão mais na lista de ativas do Pandapé vão para o status de papel
   * FECHAMENTO, com `encerrada_em` carimbado pelo relógio do SERVIDOR. Devolve quantas encerrou.
   */
  encerrarAusentes(idsAtivos: number[]): Promise<number>;
}

export interface DependenciasDaIngestao {
  http: PortaHttp;
  banco: PortaBanco;
  fila: PortaFila;
  log: PortaLog;
  agora(): Date;
  /**
   * O MARCO INICIAL, e é ele que separa "só os novos" das 137.654 inscrições do passivo.
   *
   * DATA FIXA DE CONFIGURAÇÃO, nunca `agora() menos alguma coisa`: da segunda forma, duas vagas
   * varridas com dez minutos de diferença teriam cortes diferentes, e religar a varredura mudaria o
   * que entra sem ninguém decidir isso.
   */
  dataDeCorte: Date;
}

/** As dependências COMPLETAS de produção: as do contrato mais o ciclo de vida da vaga. */
export interface DependenciasDaVarredura extends DependenciasDaIngestao {
  cicloDeVida?: PortaCicloDeVidaDaVaga;
  /**
   * A ETAPA EM QUE UMA CANDIDATURA NOVA NASCE quando o de/para resolve só o DESFECHO.
   *
   * Duas linhas semeadas mapeiam `situacao` sem `etapa_codigo` (`Descartados` e `RETORNO NEGATIVO`),
   * e `as_candidaturas.etapa` é NOT NULL: a linha nova precisa nascer em algum caneco. Quem responde
   * é o catálogo (`as_etapas_funil`, a linha marcada `inicial`), e por isso a resposta é uma porta e
   * não um literal. A candidatura que JÁ EXISTE não é movida: sem etapa no de/para, a coluna não é
   * escrita, e a pessoa fica onde estava.
   */
  etapaInicial?: () => Promise<string>;
}

export interface ResumoDoCiclo {
  vagasVarridas: number;
  paginasLidas: number;
  pessoasCriadas: number;
  candidaturasCriadas: number;
  /** As chaves normalizadas sem de/para. Registro para o diretor mapear, NUNCA escrita automática. */
  etapasNaoMapeadas: string[];
  /** Quantos casos foram para revisão humana em vez de o ciclo escolher sozinho. */
  conflitosParaRevisao: number;
  erros: number;
}
