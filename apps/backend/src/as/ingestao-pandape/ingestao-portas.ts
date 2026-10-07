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

/**
 * O QUE UMA ESCRITA DEVOLVE, e o `criada` é o que separa NASCER de ANDAR.
 *
 * ┌─ POR QUE `linhasAfetadas` NÃO RESPONDE ISSO ─────────────────────────────────────────────────┐
 * │ Ele vale 1 no insert E no update que mudou algo, que são coisas opostas para quem lê. O fato  │
 * │ "esta linha nasceu agora" só existe onde a escrita acontece, ou seja no repositório, e é por  │
 * │ isso que ele sobe declarado em vez de ser deduzido pelo chamador.                             │
 * │                                                                                              │
 * │ ELE NÃO TEM LEITOR DESDE 02/10/2026, e isso está escrito para ninguém tomar a ausência por    │
 * │ defeito: quem o lia era a ponte da varredura para a admissão, removida porque o gatilho que   │
 * │ envia para admissão é o da esteira, e não o das ATS. O campo ficou porque é a resposta honesta│
 * │ do repositório sobre a própria escrita, e porque há cobertura medindo-a; se ele continuar sem │
 * │ leitor, removê-lo é decisão do coordenador, não efeito colateral de outra frente.             │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export interface ResultadoDaEscrita {
  linhasAfetadas: number;
  id: string;
  /** A linha NASCEU nesta escrita? `undefined` vale como "não sei", e não como sim. */
  criada?: boolean;
  /**
   * QUANTAS DIVERGENCIAS esta escrita registrou em vez de sobrescrever (§A.6: contagem, nunca valor).
   *
   * A TRAVA DE PRECEDENCIA mora no adaptador porque é lá que os valores ATUAIS do EA são conhecidos
   * (o ciclo só tem o lado do ATS), então é ele quem abre a linha de revisão. O ciclo recebe o
   * NUMERO para somar no resumo, do mesmo jeito que já faz com `conflitosParaRevisao`: sem essa
   * contagem, a fila encheria sem nenhum log dizer que a volta encontrou discordância.
   */
  divergencias?: number;
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
  escrever(e: Escrita): Promise<ResultadoDaEscrita>;
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

/**
 * ─ A PORTA DA PROPOSTA DE CLIENTE DA VAGA (de/para da planilha viva do time, 01/10/2026) ───────
 *
 * ┌─ POR QUE ELA É UMA PORTA PRÓPRIA, E NÃO UM RETORNO DE `clientePorVaga` ──────────────────────┐
 * │ `clientePorVaga` devolve o CLIENTE, e o valor que ela devolvesse chegaria ao objeto `valores`  │
 * │ da escrita da vaga, que é a um caractere de distância de `cod_cliente`. A auditoria mediu esse │
 * │ fio: o ciclo CALCULAVA o cliente e o jogava fora, e quem "consertasse" o fio morto pelo        │
 * │ caminho natural faria 48 voltas por dia reescreverem o cliente que uma pessoa conferiu na      │
 * │ liberação, sem autor, sem data e sem trilha.                                                   │
 * │                                                                                               │
 * │ ESTA PORTA NÃO TEM COMO COMETER AQUELE ERRO, e isso é estrutural e não disciplinar: ela não    │
 * │ DEVOLVE cliente nenhum. Ela RESOLVE e GRAVA, em colunas próprias e inertes, e o que sobe para  │
 * │ o ciclo é CONTAGEM. Não existe valor de cliente atravessando o ciclo para ser posto no lugar   │
 * │ errado, e não existe caminho da planilha até `vagas.cod_cliente`.                              │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE ELA RECEBE O `resumo`, EM VEZ DE DEVOLVER UM DESFECHO PARA O CICLO SOMAR ───────────┐
 * │ Para a soma morar no MESMO arquivo que a §A.6 desta frente: quem conta é quem sabe o que NÃO    │
 * │ pode ser contado (nome de cliente é razão social, e razão social de MEI é nome de pessoa        │
 * │ natural). Um desfecho atravessando o ciclo seria o lugar natural para alguém pendurar "só o     │
 * │ primeiro exemplo, para facilitar", e o resumo do ciclo termina em log permanente.               │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OPCIONAL NO TIPO, como o `cicloDeVida`, e pela mesma razão: o contrato do
 * `tester` não a declara, e o ciclo tem de continuar assinável como
 * `(deps: DependenciasDaIngestao) => Promise<ResumoDoCiclo>`. AUSENTE NÃO PROPÕE NADA, que é a
 * direção certa: a vaga continua nascendo sem cliente e caindo na revisão, exatamente como hoje.
 */
export interface PortaPropostaDeClienteDaVaga {
  /**
   * Resolve as DUAS chaves no de/para e grava a proposta na vaga. NUNCA devolve o cliente, e nunca
   * lança: dado de planilha não derruba a ingestão da vaga (bloqueio 5 da auditoria).
   */
  resolverERegistrar(
    vagaId: string,
    chaves: { idVacancy: number; reference: string | null },
    resumo: ResumoDoCiclo,
  ): Promise<void>;
}

/**
 * ─ O GATE DE ENTRADA PELA PLANILHA VIVA DO TIME (F2, 06/10/2026) ───────────────────────────────
 *
 * ┌─ ELE GATEIA SÓ A ESCRITA, E JAMAIS O CONJUNTO ATS-ATIVO (trava do `seguranca`, §A.6) ───────┐
 * │ A varredura só ESPELHA/CRIA (e varre as páginas de) uma vaga que a planilha "Geral 2026"     │
 * │ marque como ABERTO ou ENTREGUE. Mas o conjunto `ativos[]` que alimenta `encerrarAusentes`    │
 * │ continua sendo o ATS-ativo COMPLETO: o encerramento deriva de AUSÊNCIA REAL no ATS, NUNCA de │
 * │ "não estar na planilha". Confundir os dois acenderia o relógio de expurgo de dezenas de      │
 * │ milhares de candidaturas por base ilícita. Por isso o gate mora AQUI, no caminho da escrita, │
 * │ e não toca o laço de descoberta das ativas.                                                  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ OPCIONAL NO TIPO, E AUSENTE NÃO GATEIA NADA ────────────────────────────────────────────────┐
 * │ Como `cicloDeVida` e `propostaDeClienteDaVaga`, o contrato do `tester` não a declara, e o     │
 * │ ciclo tem de continuar assinável sem ela. Em produção ela só é injetada quando a planilha     │
 * │ está CONFIGURADA (`AS_PLANILHA_VIVA_FILE_ID`): sem planilha, não há espelho a ler, e gatear   │
 * │ por um espelho vazio barraria TODA vaga. Ausente, tudo entra, exatamente como hoje.           │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ELA LÊ O ESPELHO (`as_depara_cliente_vaga.status_planilha`, frescor ~1h), não o Drive ao vivo:
 * decisão do diretor. §A.6: devolve só um booleano; nenhum dado da planilha atravessa esta porta.
 */
export interface PortaFiltroDaPlanilhaDaVaga {
  /** A vaga (por idVacancy, com a `reference` como segunda chave) entra pela régua da planilha? */
  vagaEntra(idVacancy: number, reference: string | null): Promise<boolean>;
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
  /**
   * O SAL DA MARCA DE PASTA, injetado pela BORDA, do mesmo jeito que a `dataDeCorte`.
   *
   * ┌─ POR QUE ELE VEM DAQUI, E NÃO DE UM `process.env` DENTRO DO DOMÍNIO ────────────────────────┐
   * │ `marcaDeChaveExterna` (`domain/as-etapa-externa.ts`) é DOMÍNIO PURO: sem consulta, sem       │
   * │ injeção, sem Nest. Ler o ambiente lá dentro faria o teste puro depender do runner e tiraria  │
   * │ da função o determinismo por argumento, que é o que a torna auditável. Quem lê a variável é  │
   * │ o serviço Nest (`ingestao-varredura.service.ts`).                                            │
   * │                                                                                              │
   * │ FIXO POR INSTALAÇÃO, JAMAIS POR PROCESSO OU POR PASSADA: um sal sorteado no boot faria as    │
   * │ mesmas 15 pastas aparecerem como 15 novidades depois de todo deploy, e quem opera aprenderia │
   * │ a ignorar o aviso. A estabilidade entre passadas é o que responde "são sempre as mesmas?".   │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * OPCIONAL NO TIPO, EXIGIDO NA PARTIDA: o ciclo RECUSA a varredura quando ele falta
   * (`salDaVarredura`), antes da primeira página. Ausente nunca vira "segue sem marca" (perda
   * silenciosa de 35% da entrada) nem "segue sem sal" (volta ao digesto confirmável).
   *
   * §A.6: o VALOR nunca vai a log, a erro, a resposta de rota ou a commit. O sistema pode dizer QUE
   * ele está configurado, nunca QUAL é.
   */
  salDaMarca?: string;
}

/**
 * O NOME DA VARIÁVEL DE AMBIENTE DO SAL, nomeado UMA vez, para a recusa poder dizer o que falta.
 *
 * ELE É O NOME, NUNCA O VALOR: é a única coisa sobre o sal que pode aparecer em log.
 */
export const VARIAVEL_DO_SAL_DA_MARCA = "AS_MARCA_SAL";

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
  /**
   * O DE/PARA DE CLIENTE DA PLANILHA DO TIME. Em produção é sempre injetada; ausente, nada é
   * proposto e a vaga segue nascendo sem cliente, como nasce hoje. Ela NÃO devolve cliente nenhum.
   */
  propostaDeClienteDaVaga?: PortaPropostaDeClienteDaVaga;
  /**
   * O GATE DE ENTRADA PELA PLANILHA (F2). Injetada só quando a planilha está configurada; ausente,
   * nada é gateado e toda vaga ATS-ativa entra, como hoje. NUNCA encolhe `ativos[]` (trava do
   * `seguranca`): gateia o que é ESPELHADO/CRIADO, nunca o que é encerrado por ausência no ATS.
   */
  filtroDaPlanilha?: PortaFiltroDaPlanilhaDaVaga;
}

export interface ResumoDoCiclo {
  vagasVarridas: number;
  paginasLidas: number;
  pessoasCriadas: number;
  candidaturasCriadas: number;
  /**
   * As MARCAS (`marcaDeChaveExterna`) das pastas sem de/para, uma por pasta distinta. Registro para
   * o de/para ser configurado, NUNCA escrita automática.
   *
   * A CHAVE CRUA NÃO ENTRA AQUI, e isso é o achado R1 do `seguranca`: nome de pasta é texto livre
   * do ATS, esta lista termina em log permanente, e o log está fora do alcance do `aplicarRetencao`.
   * O nome legível se lê na FONTE; daqui sai quantas são e se são sempre as mesmas.
   */
  etapasNaoMapeadas: string[];
  /** Quantos casos foram para revisão humana em vez de o ciclo escolher sozinho. */
  conflitosParaRevisao: number;
  /**
   * Quantas DIVERGENCIAS de precedência foram registradas nesta passada (OST de 30/09/2026).
   *
   * ELA NAO E ERRO, E A TRAVA FUNCIONANDO. Cada unidade aqui é um campo que o ATS queria sobrescrever
   * e NAO sobrescreveu, porque havia trabalho humano no caminho. Sem este número, a trava seria
   * invisível: o log diria "0 candidatura criada" e ninguém saberia que a volta encontrou 40
   * discordâncias. §A.6: contagem, nunca o valor divergente.
   */
  divergencias: number;

  /**
   * ─ OS CINCO CONTADORES DA PROPOSTA DE CLIENTE (de/para da planilha, 01/10/2026) ──────────────
   *
   * ELES NÃO SÃO ERRO, SÃO A FRENTE FUNCIONANDO, e sem eles ela seria invisível: o log diria "470
   * vagas varridas" e ninguém saberia se a planilha resolveu 312 ou zero, nem distinguiria "a
   * planilha não cobre estas vagas" de "a leitura parou de casar". É o molde do `etapasNaoMapeadas`
   * e do `divergencias`, que já existem no resumo por essa mesma razão.
   *
   * ┌─ SÃO CONTAGENS, E É SÓ ISSO QUE PODEM SER (§A.6) ──────────────────────────────────────────┐
   * │ Nenhum deles carrega o código da planilha nem o nome do cliente. O nome é RAZÃO SOCIAL vinda │
   * │ de célula de texto livre, e razão social de MEI É nome de pessoa natural; o resumo do ciclo   │
   * │ termina em log permanente, que está fora do alcance do `aplicarRetencao`. Precisando de       │
   * │ identificador, o caminho é a marca com sal que já existe (`marcaDeChaveExterna`), nunca o cru.│
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * OPCIONAIS NO TIPO porque o resumo é construído em `ingestao-ciclo.ts` (`novoResumo`) e pelo
   * mundo falso do `tester`, e `undefined` aqui tem UM significado só: "esta volta não resolveu
   * proposta nenhuma", que é o estado de qualquer passada sem a porta injetada. Quem soma usa
   * `?? 0`, e quem lê não distingue zero de ausência porque não há nada a distinguir.
   *
   * ┌─ AS TRÊS CLASSES QUE **NÃO** ESTÃO AQUI, E A AUSÊNCIA É DELIBERADA ────────────────────────┐
   * │ Malformado, família interna `SL...` e célula vazia são recusas da PLANILHA, e a planilha é    │
   * │ lida na SINCRONIZAÇÃO do catálogo, não na volta da varredura (a volta consulta a tabela de    │
   * │ de/para, que só guarda chave já validada). Contá-las aqui criaria três contadores            │
   * │ permanentemente em ZERO, que é o "contador que ninguém lê" com outro nome. Elas são contadas  │
   * │ onde acontecem: no resumo da sincronização (`as/depara-cliente`), que a rota devolve e loga.  │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  propostasDeClienteComCodigo?: number;
  /** Tem NOME e não tem código: 154 das 470 (59 dos 95 nomes não existem no catálogo da Admissão). */
  propostasDeClienteSoNome?: number;
  /** A planilha não tem esta vaga: 158 das 470. Insumo para o TIME, não defeito de código. */
  propostasDeClienteSemLinhaNaPlanilha?: number;
  /** O código confirmado não existe (mais) no catálogo do EA. Degrada para só nome, nunca derruba. */
  codigosDeClienteForaDoCatalogo?: number;
  /**
   * As duas chaves casaram com clientes DIFERENTES. Vale o `idVacancy`, e a discordância é CONTADA.
   *
   * Hoje é ZERO (263 de 263 medidas), e o zero é FOTOGRAFIA de uma planilha que o time edita durante
   * o dia, não invariante: apareceu uma linha nova entre a cópia da manhã e a leitura da tarde.
   */
  chavesDaPlanilhaDiscordantes?: number;
  /**
   * Quantas vagas ATS-ativas NÃO entraram nesta volta porque a planilha não as tem como ABERTO nem
   * ENTREGUE (F2). §A.6: número, nunca id de vaga. Elas CONTINUAM em `ativos[]`: o gate barra a
   * escrita, jamais o encerramento por ausência real no ATS. `undefined` = esta volta não gateou
   * (planilha não configurada), que é o estado de quem roda sem o espelho.
   */
  vagasForaDaPlanilha?: number;
  erros: number;
}
