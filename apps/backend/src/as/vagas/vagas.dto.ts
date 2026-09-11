import { Transform } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import {
  IDIOMA_NIVEIS,
  UFS,
  VAGA_ESCOLARIDADE,
  VAGA_ETAPAS_PS,
  VAGA_GENERO,
  VAGA_IDIOMAS,
  VAGA_MODELO_TRABALHO,
  VAGA_NATUREZA,
  VAGA_SAZONALIDADE,
  VAGA_TEMPO_CONTRATO,
  VAGA_TESTES,
  VAGA_TIPO_SUBSTITUICAO,
  VAGA_VINCULO,
  type IdiomaNivel,
  type VagaEscolaridade,
  type VagaGenero,
  type VagaModeloTrabalho,
  type VagaNatureza,
  type VagaSazonalidade,
  type VagaTipoSubstituicao,
  type VagaVinculo,
} from "@ea/shared-types";
import { normalizarSalarioParaDto } from "../../admissoes/dto/valor-monetario-br";

/**
 * UM IDIOMA EXIGIDO PELA VAGA, com o nível (Onda C).
 *
 * CLASSE, e não um par de campos soltos, porque é isso que o `ValidateNested` precisa para conferir
 * o nível de CADA item: uma lista de idiomas e outra de níveis passaria pela validação com tamanhos
 * diferentes, e a vaga acabaria exigindo um nível que ninguém escolheu, casado por posição.
 */
export class VagaIdiomaDto {
  /** Da lista FECHADA `VAGA_IDIOMAS`. "Outros" continua levando o texto para `idiomasOutros`. */
  @IsIn(VAGA_IDIOMAS as unknown as string[])
  idioma!: string;

  /**
   * O NÍVEL, da escala fechada, e ele é OBRIGATÓRIO: sem `@IsOptional()`, idioma escolhido sem nível
   * é recusado. É a regra inteira desta peça, e ela mora aqui, no lugar em que a ausência é medida.
   */
  @IsIn(IDIOMA_NIVEIS as unknown as string[])
  nivel!: IdiomaNivel;
}

/** Um benefício da vaga: o id do catálogo mais o valor, que nem todo benefício tem. */
export class VagaBeneficioDto {
  @IsUUID("4")
  beneficioId!: string;

  /**
   * Valor em pt-BR ("500,00"), normalizado para a forma canônica do `numeric`. Ausente e vazio são a
   * mesma coisa: benefício concedido sem valor a informar.
   */
  @IsOptional()
  @Transform(({ value }) => normalizarSalarioParaDto(value))
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: "Valor de benefício inválido. Informe um valor como 500 ou 500,00.",
  })
  valor?: string;
}

/**
 * DTO de criação da vaga (trilha de abertura, 5 passos).
 *
 * O QUE NÃO ESTÁ AQUI E É DE PROPÓSITO: `abertoPorId`, `consultorId` e `recruiterId`. Quem abriu é
 * carimbado a partir da sessão, e os dois lados da vaga saem do PAPEL DE A&S de quem abre mais a
 * contraparte escolhida (`contraparteId`). Aceitar os dois lados do corpo faria da trilha um campo
 * editável e a autoria deixaria de ser trilha.
 *
 * Os campos de FECHAMENTO também não estão aqui: são da ação Fechar Vaga, momento diferente.
 *
 * POR QUE OS OBRIGATÓRIOS SÃO `@IsOptional()` AQUI (OST de 25/08): o MESMO corpo serve para SALVAR
 * RASCUNHO e para PUBLICAR, e no rascunho nada é cobrado. Quem cobra é a régua única do domínio
 * (`vagaPendencias`, no shared-types), chamada no service SÓ quando o status pedido não é RASCUNHO.
 *
 * ISSO NÃO AFROUXA A PUBLICAÇÃO. O `@IsString`/`@IsUUID`/`@IsISO8601` continua conferindo o FORMATO
 * de tudo que vier preenchido, e a régua confere a PRESENÇA na hora de publicar, com a lista inteira
 * do que falta em vez de um erro por vez. O que saiu do DTO foi só a exigência de estar presente,
 * porque ela deixou de valer no momento em que o DTO chega.
 */
export class CreateVagaDto {
  // ── PASSO 1, a vaga ───────────────────────────────────────────────────────
  /** Código do PROCESSO SELETIVO, único no sistema. Normalizado (trim + caixa alta) no service. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  codigo?: string;

  @IsOptional()
  @IsUUID()
  cargoId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nomeDivulgacao?: string;

  /** NULÁVEL: vaga sem cliente vinculado é estado real e não trava nada. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  codCliente?: string;

  /**
   * O `IdVacancy` DA VAGA NO PANDAPÉ (ponte puxada da onda 4 da Central de Candidatos).
   *
   * SÓ GUARDA O CÓDIGO. Não existe varredura, não existe chamada de API, nada é buscado com ele:
   * quem digita é a trilha. Guardar agora é o que permite, no dia da ponte, casar a vaga do EA com a
   * do ATS sem ter de perguntar o número de novo.
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  idVacancyPandape?: string;

  // CENTRO DE CUSTO SAIU DA ABERTURA (item 4 da OST de 22/08). Não é campo omitido por engano: o
  // DTO deixa de aceitá-lo de propósito, então corpo antigo com `centroCusto` é rejeitado pelo
  // `forbidNonWhitelisted` em vez de gravar em silêncio um campo que a trilha não pergunta mais.

  @IsOptional()
  @IsIn(VAGA_NATUREZA as unknown as string[])
  natureza?: VagaNatureza;

  /**
   * O STATUS QUE A TRILHA PEDE, e ela só sabe pedir DOIS: o RASCUNHO e a ABERTURA.
   *
   * ┌─ O `@IsIn` SAIU DAQUI (onda B2), E A RÉGUA NÃO AFROUXOU: ELA MUDOU DE CAMADA ──────────────┐
   * │ Enquanto a lista era estática, o decorator podia recusar no corpo. Com o status virando     │
   * │ CATÁLOGO, um `@IsIn` sobre a lista de ontem recusaria o status que o diretor criou hoje, e o│
   * │ `class-validator` não faz consulta assíncrona bem. É o mesmo caminho que as etapas do funil │
   * │ percorreram, pela mesma razão.                                                              │
   * │                                                                                             │
   * │ QUEM RECUSA AGORA É `travaStatusDaTrilha`, no service, contra o flag `daTrilha` do catálogo,│
   * │ e ele SEMPRE foi a autoridade: a frase que dispensa o `@Roles` da rota de fechar é "a       │
   * │ autoridade é o service". `ENTREGUE`, `FECHADA` e `CANCELADA` continuam recusados, agora por │
   * │ não terem o flag, e o mesmo vale para qualquer status novo, que nasce com o flag FALSO.     │
   * │                                                                                             │
   * │ O QUE SE PERDEU: a recusa deixou de acontecer antes do handler. O que NÃO se perdeu: nenhum │
   * │ corpo consegue publicar vaga num estado terminal, que é o achado que a lista fechou em      │
   * │ 08/09, e há teste afirmando isso nas duas rotas da trilha.                                  │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsOptional()
  @IsIn(VAGA_SAZONALIDADE as unknown as string[])
  sazonalidade?: VagaSazonalidade;

  /**
   * A LINHA DE SERVIÇO (Onda C), pelo id do catálogo `as_linhas_servico`.
   *
   * `@IsOptional()` AQUI E OBRIGATÓRIA NA PUBLICAÇÃO, exatamente como `codigo`, `cargoId` e
   * `natureza`: o mesmo corpo serve para salvar rascunho e para publicar, e quem cobra a PRESENÇA é
   * a régua única (`pendenciasDaVaga`), chamada no service só quando o status pedido não é rascunho.
   *
   * SEM `@IsIn`, e isso não é afrouxamento: a lista virou CATÁLOGO do diretor, então um decorator
   * sobre a lista de ontem recusaria a linha que ele criou hoje. Quem confere se o id existe e está
   * ATIVO é `LinhasServicoService.exigirLinhaAtiva`, no service, contra o catálogo vivo. É o mesmo
   * caminho que o status da vaga e as etapas do funil já percorreram.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  linhaServicoId?: number;

  /**
   * OS DOIS CONTADORES DA VAGA (decisão do diretor, 25/08). OFICIAIS aceita a partir de 1, porque
   * vaga com zero contratação não é vaga; BANCO aceita ZERO, porque não reservar excedente é o
   * estado normal da maioria das vagas. É a mesma assimetria dos dois CHECK do banco de dados.
   *
   * O NOME ANTIGO `posicoes` DEIXA DE SER ACEITO de propósito: com `forbidNonWhitelisted`, um corpo
   * montado fora da tela com o campo velho é RECUSADO com mensagem, em vez de gravar em silêncio uma
   * vaga sem meta oficial nenhuma.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  posicoesOficiais?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  posicoesBanco?: number;

  // ── PASSO 2, quem pediu ───────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  @MaxLength(200)
  solicitanteNome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  solicitanteTelefone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  solicitanteEmail?: string;

  @IsOptional()
  @IsISO8601()
  dataSolicitacao?: string;

  @IsOptional()
  @IsISO8601()
  dataAlinhamento?: string;

  @IsOptional()
  @IsISO8601()
  dataAbertura?: string;

  /** Vale em QUALQUER natureza de vaga (correção de 21/08). Segue opcional. */
  @IsOptional()
  @IsISO8601()
  dataLimite?: string;

  @IsOptional()
  @IsISO8601()
  envioShortlist?: string;

  // ── PASSO 3, contratação ──────────────────────────────────────────────────
  /**
   * A CONTRAPARTE: o usuário do lado OPOSTO ao de quem abre. Qual lado é esse, quem decide é o papel
   * de A&S da sessão, no service. A tela manda um id só, e não escolhe o lado.
   */
  @IsOptional()
  @IsUUID()
  contraparteId?: string;

  @IsOptional()
  @IsIn(VAGA_VINCULO as unknown as string[])
  vinculo?: VagaVinculo;

  @IsOptional()
  @IsIn(VAGA_TEMPO_CONTRATO as unknown as string[])
  tempoContrato?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;

  @IsOptional()
  @IsString()
  justificativaMotivo?: string;

  @IsOptional()
  @IsIn(VAGA_TIPO_SUBSTITUICAO as unknown as string[])
  tipoSubstituicao?: VagaTipoSubstituicao;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  substituidoNome?: string;

  /**
   * CPF DE QUEM SERÁ SUBSTITUÍDO. Chega com máscara da tela ("123.456.789-01") e é normalizado aqui
   * para 11 dígitos; quem validou que o dígito fecha é o service, com `isValidCpf`, para o erro sair
   * como frase em português e não como violação de constraint.
   *
   * PERSISTE, por decisão do diretor (22/08): exigência legal do cadastro do ADM. §A.6 no resto.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.replace(/\D/g, "") : value))
  @IsString()
  @MaxLength(11)
  substituidoCpf?: string;

  // ── PASSO 4, condições e benefícios ───────────────────────────────────────
  @IsOptional()
  @Transform(({ value }) => normalizarSalarioParaDto(value))
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message:
      "Salário de abertura inválido. Informe um valor como 2500 ou 2.500,00 (ponto separa o milhar, vírgula os centavos).",
  })
  salarioAbertura?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VagaBeneficioDto)
  beneficios?: VagaBeneficioDto[];

  @IsOptional()
  @IsString()
  localTrabalho?: string;

  /**
   * A CIDADE DA VAGA (Onda C), pelo CÓDIGO DO IBGE, de 7 dígitos.
   *
   * ELA SUBSTITUI A LISTA VELHA DE REGIÃO como campo digitado. A UF deixa de ser escolhida à parte e
   * passa a ser DERIVADA da cidade, no service: uma fonte só, e nenhuma chance de a vaga ficar com
   * cidade de um estado e UF de outro. Os três campos antigos (`regiaoEstado`, `regioes`,
   * `regioesOutras`) continuam ACEITOS logo abaixo, e o porquê está escrito lá.
   *
   * SEM `@IsIn` (são 5.571 municípios) e sem `@Min(1000000)`: quem confere é `CidadesService`,
   * contra a base carregada do IBGE, e código que não existe lá é recusado com a frase certa.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  cidadeId?: number;

  /**
   * A UF ESCOLHIDA (item 7). Lista fechada nas 27 unidades da federação.
   *
   * ┌─ POR QUE ELA CONTINUA SENDO ACEITA DEPOIS DA CIDADE (Onda C) ─────────────────────────────┐
   * │ O precedente do `centroCusto` (campo que SAIU do DTO para ser recusado pelo                │
   * │ `forbidNonWhitelisted`) NÃO se aplica aqui, e a diferença importa: aquele campo saiu da     │
   * │ trilha inteiro, e este tem TRÊS vagas em produção com região gravada e uma tela que pode    │
   * │ continuar oferecendo a região como informação complementar. Removê-lo do DTO transformaria  │
   * │ um corpo antigo em 400 no meio de uma abertura de vaga.                                     │
   * │                                                                                             │
   * │ O QUE MUDOU É O DONO DO DADO, não a aceitação: com `cidadeId` presente, a UF gravada é a da │
   * │ CIDADE, e o que vier aqui é ignorado. A régua das regiões (`regiaoPertenceAUf`) continua    │
   * │ valendo, agora contra a UF derivada, então região de outro estado segue recusada.           │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  @IsOptional()
  @IsIn(UFS.map((u) => u.uf))
  regiaoEstado?: string;

  /**
   * AS REGIÕES MARCADAS. Aqui o DTO garante só a FORMA (array de texto sem repetição); QUAL região
   * é válida depende da UF, e essa é a régua de `regiaoPertenceAUf`, aplicada no service. Um
   * `@IsIn` com a união dos 27 estados aceitaria região do Ceará numa vaga de São Paulo.
   */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  regioes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  regioesOutras?: string;

  /**
   * ESCALA: o nome vindo do catálogo `escalas_catalogo` OU o texto de "Outra escala". Texto livre de
   * propósito (item 5): o catálogo está sujo e a limpeza dele é frente futura do diretor, então uma
   * validação contra a lista barraria a escala nova que ainda não foi cadastrada.
   */
  @IsOptional()
  @IsString()
  horarioEscala?: string;

  @IsOptional()
  @IsIn(VAGA_MODELO_TRABALHO as unknown as string[])
  modeloTrabalho?: VagaModeloTrabalho;

  /** Lista fechada (item 6), com "Outro" abrindo texto. O texto do escape cabe nos mesmos 200. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  detalheHibrido?: string;

  @IsOptional()
  @IsBoolean()
  confidencial?: boolean;

  @IsOptional()
  @IsBoolean()
  divulgarEmpresa?: boolean;

  // ── PASSO 5, requisitos ───────────────────────────────────────────────────
  @IsOptional()
  @IsIn(VAGA_ESCOLARIDADE as unknown as string[])
  escolaridade?: VagaEscolaridade;

  /**
   * FAIXA ETÁRIA: uma opção da lista OU o que a pessoa escreveu em "Outra". Uma coluna só, e não
   * uma para a opção e outra para o escape: a vaga responde UMA faixa, e ao reabrir a tela sabe de
   * onde o texto veio comparando com a lista (`separarOpcaoEscape`, no shared-types).
   */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  faixaEtaria?: string;

  @IsOptional()
  @IsIn(VAGA_GENERO as unknown as string[])
  genero?: VagaGenero;

  /**
   * OS IDIOMAS EXIGIDOS, cada um COM O SEU NÍVEL (Onda C). Lista FECHADA de idiomas, nível da escala
   * fechada, seleção múltipla. O que não estiver nas duas listas é rejeitado, não gravado.
   *
   * ┌─ ELE É CAMPO NOVO, e a coluna também: `idiomas` (a velha, `text[]`) FICA CONGELADA ────────┐
   * │ Converter a coluna no lugar quebraria a tela no intervalo entre a migration e o deploy, e  │
   * │ obrigaria a INVENTAR um nível para as vagas que já pedem idioma. Então a coluna nova nasce  │
   * │ ao lado, e o campo do corpo acompanha o nome dela.                                          │
   * │                                                                                             │
   * │ UM CORPO ANTIGO (`idiomas: ["Inglês"]`) É RECUSADO com mensagem, e isso é deliberado: nível │
   * │ é OBRIGATÓRIO por idioma escolhido, e idioma sem nível é a caixa de texto de volta com      │
   * │ outro nome. Recusar alto é melhor do que gravar uma exigência pela metade.                  │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * `@ValidateNested` + `@Type` NÃO SÃO DECORAÇÃO: sem eles o `class-validator` não desce ao objeto,
   * e a coluna, que é `jsonb` e não tem esquema, aceitaria JSON arbitrário de qualquer autenticado.
   *
   * `ArrayUnique` COM SELETOR DE IDIOMA: o par é único pelo IDIOMA, não pelo objeto inteiro. Sem o
   * seletor, "Inglês básico" e "Inglês avançado" passariam juntos na mesma vaga, que é uma exigência
   * que não quer dizer nada.
   */
  @IsOptional()
  @IsArray()
  @ArrayUnique((i: VagaIdiomaDto) => i?.idioma)
  @ValidateNested({ each: true })
  @Type(() => VagaIdiomaDto)
  idiomasExigidos?: VagaIdiomaDto[];

  /**
   * O MESMO CAMPO PELO NOME ANTIGO, aceito DURANTE A TRANSIÇÃO e com a MESMA validação.
   *
   * POR QUE O APELIDO EXISTE: a tela está sendo reescrita em paralelo a este backend, e o nome do
   * campo é a única coisa que os dois lados podem escolher diferente sem nada avisar. Com o apelido,
   * qualquer um dos dois nomes chega ao MESMO lugar; sem ele, a discordância vira 400 no meio de uma
   * abertura de vaga, e o motivo aparece como "property idiomas should not exist".
   *
   * NÃO É UM SEGUNDO DADO, e por isso não existe risco de as duas listas divergirem: os dois campos
   * gravam a MESMA coluna, e quando os dois vêm, `idiomasExigidos` (o nome da coluna) é quem vale.
   * O `idiomas` do BANCO continua intocado por qualquer um dos dois.
   */
  @IsOptional()
  @IsArray()
  @ArrayUnique((i: VagaIdiomaDto) => i?.idioma)
  @ValidateNested({ each: true })
  @Type(() => VagaIdiomaDto)
  idiomas?: VagaIdiomaDto[];

  @IsOptional()
  @IsString()
  @MaxLength(160)
  idiomasOutros?: string;

  /** SEGUE TEXTO ABERTO, por decisão do diretor. Não virou lista e não deve virar sem pedido. */
  @IsOptional()
  @IsString()
  cursosConhecimentos?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(VAGA_TESTES as unknown as string[], { each: true })
  testes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(160)
  testesOutro?: string;

  @IsOptional()
  @IsString()
  experiencia?: string;

  @IsOptional()
  @IsString()
  atribuicoes?: string;

  @IsOptional()
  @IsString()
  perfilComportamental?: string;

  @IsOptional()
  @IsString()
  ambiente?: string;

  /** Lista FECHADA, seleção múltipla (item 6). A ordem que chega é a ordem em que fica gravada. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(VAGA_ETAPAS_PS as unknown as string[], { each: true })
  etapasPs?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(160)
  etapasPsOutra?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}

/**
 * DTO DA EDIÇÃO DOS DOIS CONTADORES (decisão do diretor, 25/08: "continuam editáveis depois").
 *
 * CORPO PRÓPRIO, MINÚSCULO, E NÃO O `CreateVagaDto`: a vaga publicada NÃO volta para a trilha de
 * abertura (decisão anterior, preservada), então reaproveitar o corpo da trilha aqui abriria a vaga
 * inteira para edição livre de tabela, que é outra decisão e ninguém pediu (§A.14/§A.26). Este corpo
 * escreve DUAS colunas e mais nenhuma.
 *
 * OS DOIS SÃO OBRIGATÓRIOS porque a edição é do PAR: mandar só um deles deixaria a tela decidir em
 * silêncio se o outro foi zerado ou preservado, e é exatamente esse tipo de silêncio que faz o
 * contador mentir depois.
 */
export class EditarPosicoesVagaDto {
  @IsInt()
  @Min(1)
  posicoesOficiais!: number;

  @IsInt()
  @Min(0)
  posicoesBanco!: number;
}

/**
 * DTO do FECHAMENTO (frente 4). Momento diferente da abertura, então DTO diferente: aqui não se
 * edita nada da vaga, só se registra como ela terminou.
 */
export class FecharVagaDto {
  @IsISO8601()
  dataFechamento!: string;

  /**
   * ─ OS DOIS CONTADORES DIGITADOS: AINDA ACEITOS, JÁ IGNORADOS ─────────────────────────────────
   *
   * QUEM CONTA AGORA É A CONTAGEM DE CANDIDATURAS, e não mais o formulário: o fechamento grava
   * `ocupacao.finalizadasOficial` e `ocupacao.finalizadasBanco`, derivadas de quem foi de fato
   * alocado. O que vier nestes dois campos NÃO é lido para decidir nada e NÃO é gravado, e há teste
   * afirmando exatamente isso (`vagas.fechamento-derivado.spec.ts`).
   *
   * POR QUE ELES CONTINUAM AQUI, e isto é uma janela e não um desenho: o `ValidationPipe` global
   * roda com `forbidNonWhitelisted`, então tirá-los AGORA faria a tela de hoje, que ainda os manda,
   * receber 400 no botão Fechar. Eles saem daqui na etapa do FRONTEND, no gesto em que a tela para
   * de mandá-los, e não antes. Campo aceito e ignorado é dívida: por isso ele nasce com data para
   * sair e com teste que prova que ele não escreve nada.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  vagasFechadas?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  vagasFechadasBanco?: number;

  /**
   * FECHAR MESMO COM POSIÇÃO OFICIAL EM ABERTO (a trava 6).
   *
   * SÓ MASTER E SUPER_ADMIN PASSAM, e QUEM CONFERE É O SERVICE, nunca um `@Roles` na rota: todo
   * consultor precisa poder fechar a vaga COMPLETA, e o decorador barraria o fechamento normal do
   * COMUM, que é regressão silenciosa. É o mesmo desenho da liberação de Apto sem ASO na Esteira.
   *
   * O forçado GRAVA TRILHA (quem, quando, quantas faltavam), e a trilha é o preço da exceção.
   */
  @IsOptional()
  @IsBoolean()
  forcar?: boolean;

  @IsOptional()
  @Transform(({ value }) => normalizarSalarioParaDto(value))
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message:
      "Salário de fechamento inválido. Informe um valor como 2500 ou 2.500,00 (ponto separa o milhar, vírgula os centavos).",
  })
  salarioFechamento?: string;

  @IsOptional()
  @IsISO8601()
  dataPrevistaInicio?: string;

  /**
   * A segunda opção do fechamento: "finalizar o processo seletivo e enviar para admissão". Hoje ela
   * REGISTRA A INTENÇÃO e nada mais. A ponte com a esteira é frente separada (última etapa do
   * planejamento), e por isso o campo existe agora: no dia da ponte, saber quais vagas pediram
   * passagem já estará gravado.
   */
  @IsOptional()
  @IsBoolean()
  enviarParaAdmissao?: boolean;
}

/**
 * ─ DTO DO CANCELAMENTO DA VAGA (onda B1) ────────────────────────────────────────────────────────
 *
 * CORPO PRÓPRIO, e não o do fechamento, porque a pergunta é outra: fechar registra o que a vaga
 * ENTREGOU (salário de fechamento, data prevista de início, envio para a admissão); cancelar
 * registra POR QUE o processo não vai mais acontecer. Reaproveitar o `FecharVagaDto` traria quatro
 * campos que o cancelamento não tem o que fazer com eles, e o `ValidationPipe` global roda com
 * `forbidNonWhitelisted`: campo aceito e ignorado é dívida.
 *
 * ┌─ O QUE NÃO ESTÁ AQUI, E É DE PROPÓSITO: QUEM CANCELOU E QUANDO ────────────────────────────┐
 * │ `cancelada_por_id` vem da SESSÃO e `cancelada_em` é o `now()` do SERVIDOR. Autoria e carimbo │
 * │ são TRILHA, não campo de formulário: aceitá-los no corpo deixaria qualquer chamada direta à  │
 * │ rota assinar o cancelamento em nome de outra pessoa, ou datá-lo no mês passado, e é          │
 * │ exatamente esta trilha que compensa as travas que o cancelamento pula em relação ao fechar.  │
 * │                                                                                             │
 * │ `dataCancelamento` É OUTRA COISA, e por isso ela ESTÁ no corpo: é a data do FATO comercial   │
 * │ (quando o cliente cancelou a vaga), que pode ser anterior ao clique, e é ela que vai para    │
 * │ `data_fechamento`. Sem ela, o contador de dias em aberto ficaria em branco para sempre.      │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export class CancelarVagaDto {
  /**
   * POR QUE A VAGA FOI CANCELADA, do catálogo (`motivos_cancelamento_vaga`).
   *
   * VIAJA COMO NOME, e não como id, porque é o NOME que fica gravado na vaga, do mesmo jeito que a
   * vaga já faz com o motivo de contratação. Quem confere que este nome EXISTE e está ATIVO é o
   * service, contra o catálogo: sem essa conferência, o campo seria texto livre com aparência de
   * catálogo, e a auditoria leria depois qualquer coisa que alguém tivesse digitado.
   *
   * ┌─ O `@Transform` DE APARA VEM ANTES DO `@MinLength`, e a ordem é a régua ──────────────────┐
   * │ O `@MinLength` mede a string CRUA, então `"   "` passa com três caracteres, o service      │
   * │ apara na gravação e a vaga vai para o banco com motivo VAZIO. O defeito já foi pago em     │
   * │ 09/09, na saída da candidatura (achado do tester): a única barreira real era o NAVEGADOR,  │
   * │ que é exatamente o que a obrigatoriedade no DTO existe para não depender. O `@Transform`   │
   * │ roda ANTES da validação (é `plainToInstance` quem o executa), então quem valida já vê o    │
   * │ texto aparado, e quem grava recebe o mesmo texto aparado do corpo.                          │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  motivo!: string;

  /** O detalhe livre, quando o motivo do catálogo não conta a história inteira. Opcional. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  observacao?: string;

  /**
   * A DATA DO FATO, que vira `data_fechamento`. Obrigatória, e a razão é medida: a leitura do
   * contador de dias devolve nulo para vaga encerrada SEM data de fechamento, e a célula escreve
   * "não informado" para sempre. Toda vaga cancelada ficaria com o contador em branco.
   */
  @IsISO8601()
  dataCancelamento!: string;

  /**
   * CANCELAR MESMO COM CANDIDATO EM PROCESSO DENTRO.
   *
   * SÓ MASTER E SUPER_ADMIN PASSAM, e QUEM CONFERE É O SERVICE, nunca um `@Roles` na rota: todo
   * consultor precisa poder cancelar a vaga SEM ninguém segurando, e o decorador barraria o
   * cancelamento normal do COMUM, que é regressão silenciosa. É o mesmo desenho do `forcar` do
   * fechamento, logo acima.
   *
   * O QUE ELE CUSTA, ALÉM DA TRILHA: as candidaturas que seguravam são ENCERRADAS na mesma
   * transação. Deixá-las vivas numa vaga cancelada prenderia o dado pessoal do candidato para
   * sempre (§A.6), porque o prazo de retenção só começa a correr quando nada vivo sobra.
   */
  @IsOptional()
  @IsBoolean()
  forcar?: boolean;
}

/**
 * ─ MOVER O STATUS DA VAGA À MÃO (onda B2) ──────────────────────────────────────────────────────
 *
 * SEM `@IsIn`, PELA MESMA RAZÃO DO `status` DA TRILHA: a lista de destinos é o CATÁLOGO, e ele muda
 * quando o diretor quiser. Quem confere é o service, contra `podeSerDestinoManual` (ativo, movível e
 * que não encerra) e contra `podeSairManualmente` na origem, sob a linha da vaga travada.
 *
 * NÃO EXISTE CAMPO DE ORIGEM, e a ausência é a regra: a origem é lida do banco, sob o
 * `SELECT ... FOR UPDATE`, e nunca do corpo. Aceitá-la do corpo seria decidir sobre o estado que a
 * tela viu, que é justamente a fotografia velha que o lock existe para descartar.
 */
export class MoverStatusVagaDto {
  /** O CÓDIGO do status de destino. O catálogo e a FK é que o governam. */
  @IsString()
  @MaxLength(40)
  status!: string;

  /** Por que a vaga foi movida. Opcional, e vai inteiro para a trilha. §A.6: sem dado de candidato. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  observacao?: string;
}

/**
 * ─ DTO DA REABERTURA DA VAGA CANCELADA (onda B3) ───────────────────────────────────────────────
 *
 * CORPO PRÓPRIO, MINÚSCULO, e o que NÃO está nele é a maior parte da régua:
 *
 * ┌─ NÃO EXISTE CAMPO DE STATUS DE DESTINO, E A AUSÊNCIA É A TRAVA ────────────────────────────┐
 * │ O destino é SEMPRE `codigoDoPapel("ABERTURA")`, resolvido no servidor contra o catálogo.    │
 * │ Aceitá-lo do corpo transformaria esta rota na porta SEM RÉGUA para qualquer status, os que  │
 * │ encerram inclusive: quem quisesse marcar uma vaga como ENTREGUE sem entregar nada passaria  │
 * │ por aqui, pulando as travas de candidato tratado e de posição preenchida que o `fechar` tem.│
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ NÃO EXISTE CAMPO DE PAPEL NEM DE AUTOR ───────────────────────────────────────────────────┐
 * │ Quem reabriu vem da SESSÃO, e o papel é reconferido no service a partir dela. Um `papel` no │
 * │ corpo promoveria o consultor a Master com uma linha de JSON, e a trilha passaria a ser      │
 * │ assinada por quem o remetente escolhesse.                                                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `candidaturaIds` É OPCIONAL PORQUE REABRIR SEM TRAZER NINGUÉM É LEGÍTIMO: a vaga volta a receber
 * gente nova e ninguém é ressuscitado. Ausente e lista vazia são a MESMA coisa, e nesse caminho
 * NENHUMA candidatura é tocada, nem com um carimbo de cortesia (§A.6: para quem está descartado, o
 * `atualizado_em` É o relógio do expurgo, e mexer nele empurra dois anos de retenção em silêncio).
 */
export class ReabrirVagaDto {
  /**
   * QUEM O MASTER ESCOLHEU TRAZER DE VOLTA, um a um. `@ArrayUnique` porque o mesmo id duas vezes é
   * erro de tela, não intenção, e o segundo passaria por uma candidatura já restaurada.
   *
   * A LISTA NÃO É A AUTORIDADE: o service confere, dentro da transação e sob a linha da vaga
   * travada, que cada id pertence ao conjunto daquele cancelamento. Id de fora é RECUSADO, nunca
   * ignorado em silêncio.
   */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  candidaturaIds?: string[];

  /** Por que a vaga voltou. Opcional, e vai inteiro para a trilha. §A.6: sem dado de candidato. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  observacao?: string;
}
