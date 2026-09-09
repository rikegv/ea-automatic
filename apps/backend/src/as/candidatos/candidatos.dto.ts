import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import {
  AS_CANDIDATO_ORIGEM,
  AS_CONTATO_TIPO,
  AS_MAXIMO_POR_LOTE,
  CANDIDATURA_ETAPAS,
  UFS,
  type AsCandidatoOrigem,
  type AsContatoTipo,
  type CandidaturaEtapa,
} from "@ea/shared-types";
import {
  POSICAO_LADOS,
  SITUACOES_DE_SAIDA,
  type PosicaoLado,
  type SituacaoDeSaida,
} from "../../domain/candidatura";

/**
 * DTOs DA CENTRAL DE CANDIDATOS (A&S, onda 1).
 *
 * O QUE NÃO ESTÁ EM NENHUM CORPO AQUI, e é de propósito: `criadoPorId`, `alocadoPorId` e
 * `registradoPorId`. Autoria é TRILHA, carimbada a partir da sessão, e aceitá-la do corpo faria dela
 * um campo editável de formulário. Mesma disciplina do `CreateVagaDto`.
 *
 * §A.6: o CPF chega SEMPRE pelo CORPO, em POST, nunca por parâmetro de rota nem por query string.
 * URL vaza em log de proxy, em histórico de navegador e no cabeçalho referer, e nenhum dos três é
 * lugar de dado pessoal. É requisito, não preferência: por isso até a BUSCA é POST.
 */

/** Tira a máscara do CPF que a tela envia ("123.456.789-01") e deixa 11 dígitos. */
const soDigitos = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.replace(/\D/g, "") : value;

export class CriarCandidatoDto {
  /** O único obrigatório: sem nome não há pessoa a acompanhar. */
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  nome!: string;

  /**
   * CPF OPCIONAL, e essa é a decisão central da tabela. Candidato de seleção muitas vezes ainda não
   * deu o CPF, e exigi-lo produziria número inventado ou pessoa não cadastrada. Quando vem, o dígito
   * é conferido no service com o validador que já existe (`isValidCpf`), e o dedup é do banco
   * (unique parcial). §A.6: a mensagem de erro nunca repete o número recebido.
   */
  @IsOptional()
  @Transform(soDigitos)
  @IsString()
  @MaxLength(11)
  cpf?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefone?: string;

  @IsOptional()
  @IsISO8601()
  dataNascimento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cidade?: string;

  /** Lista fechada nas 27 unidades da federação, a mesma fonte que a vaga usa. */
  @IsOptional()
  @IsIn(UFS.map((u) => u.uf))
  uf?: string;

  @IsOptional()
  @IsIn(AS_CANDIDATO_ORIGEM as unknown as string[])
  origem?: AsCandidatoOrigem;

  /**
   * O id da pessoa no Pandapé, reservado para a onda 4. Aceito no corpo porque a carga da onda 4 vai
   * precisar dele, e a coluna já existe; NADA no sistema o preenche sozinho hoje.
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  idCandidatePandape?: string;
}

/** Edição da ficha. Mesmos campos da criação, todos opcionais: manda quem mexeu no que mexeu. */
export class EditarCandidatoDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @Transform(soDigitos)
  @IsString()
  @MaxLength(11)
  cpf?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefone?: string;

  @IsOptional()
  @IsISO8601()
  dataNascimento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cidade?: string;

  @IsOptional()
  @IsIn(UFS.map((u) => u.uf))
  uf?: string;

  @IsOptional()
  @IsIn(AS_CANDIDATO_ORIGEM as unknown as string[])
  origem?: AsCandidatoOrigem;
}

/**
 * A BUSCA, E POR QUE ELA É UM POST (§A.6, requisito e não preferência).
 *
 * O caminho óbvio seria `GET /as/candidatos?cpf=...`, e é justamente o que não se pode fazer: a
 * query string aparece no log de acesso de qualquer proxy no caminho, no histórico do navegador e no
 * cabeçalho `Referer` de toda navegação seguinte. CPF em nenhum dos três. Com o corpo, o dado viaja
 * dentro do POST e não sobra em lugar nenhum.
 *
 * NÃO EXISTE UMA LISTAGEM GET NESTE MÓDULO, e isso também é deliberado: com uma listagem GET no ar,
 * a primeira pessoa que precisasse filtrar por CPF acrescentaria `?cpf=` a ela sem pensar duas
 * vezes. Não havendo a porta, não há o atalho.
 */
export class BuscarCandidatosDto {
  /** Trecho do nome. Busca sem acento e sem caixa é resolvida no service. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nome?: string;

  /** CPF INTEIRO, no corpo. Busca exata: CPF pela metade não é critério, é vazamento parcial. */
  @IsOptional()
  @Transform(soDigitos)
  @IsString()
  @MaxLength(11)
  cpf?: string;

  @IsOptional()
  @IsIn(AS_CANDIDATO_ORIGEM as unknown as string[])
  origem?: AsCandidatoOrigem;

  /** Só quem está nesta vaga. */
  @IsOptional()
  @IsUUID()
  vagaId?: string;

  /**
   * SÓ QUEM NÃO ESTÁ EM VAGA NENHUMA, e é o filtro que abre a alocação SEM CPF (ajuste 2).
   *
   * O BECO SEM SAÍDA QUE ELE RESOLVE: quem foi cadastrado sem CPF não é achável pela busca por CPF,
   * e a alocação partia sempre do dedup por CPF. A pessoa existia na base e não entrava em vaga
   * nenhuma. Com este filtro a tela lista os candidatos disponíveis, o consultor escolhe um pelo
   * NOME e a alocação segue pelo `id`, que é a chave de verdade da tabela (o CPF nunca foi).
   *
   * "SEM CANDIDATURA" AQUI QUER DIZER ZERO CANDIDATURAS VIVAS OU BEM-SUCEDIDAS (nem `ATIVO`, nem
   * `APROVADO`, nem `ENVIADO_PARA_ADMISSAO`), que é EXATAMENTE a mesma régua do `candidaturasAtivas` que a lista
   * já devolve em cada linha. Reusar a mesma expressão é deliberado: com duas contas diferentes, o
   * filtro e a coluna acabariam discordando na mesma tela.
   *
   * QUEM FOI DESCARTADO OU DESISTIU CONTINUA APARECENDO, e isso é o comportamento desejado: processo
   * encerrado no passado não impede a pessoa de entrar numa vaga nova.
   *
   * `@Transform` porque o corpo pode chegar com `"true"` de um formulário; `@IsBoolean` sozinho
   * recusaria a string.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value === "true" : value))
  @IsBoolean()
  semCandidatura?: boolean;
}

/** Alocar a pessoa numa vaga: nasce em CAPTACAO e ATIVO, e ATIVO não consome posição. */
export class AlocarEmVagaDto {
  @IsUUID()
  vagaId!: string;

  /** O id do match no Pandapé, reservado para a onda 4. Nada o preenche hoje. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  idMatchPandape?: string;

  /**
   * A CIÊNCIA DA REENTRADA: "sei que esta pessoa já esteve nesta vaga e terminou o processo".
   *
   * NASCE FALSO E TEM DE VIR NO CORPO. Quem já teve candidatura ENCERRADA naquela vaga é recusado na
   * PRIMEIRA tentativa, com a data e o motivo do processo anterior; a tela mostra o aviso, o
   * consultor confirma e a MESMA chamada volta com este flag em `true`. Sem ele, a recusa se repete.
   *
   * NÃO É "FORÇAR": ele não passa por cima de trava nenhuma. A vaga fechada continua fechada e a
   * candidatura VIVA continua barrada, com ou sem o flag. Este campo só responde a UMA pergunta, a da
   * reentrada, e é por isso que ele tem nome do que é e não um `force` genérico, que a primeira
   * pessoa apressada usaria para calar qualquer outra recusa.
   *
   * `@Transform` porque o corpo pode chegar com `"true"` de um formulário; `@IsBoolean` sozinho
   * recusaria a string.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value === "true" : value))
  @IsBoolean()
  cienteReentrada?: boolean;
}

/**
 * MOVER DE ETAPA. Só a etapa DE DESTINO: de onde a pessoa sai é o que está gravado, e aceitar a
 * origem do corpo deixaria a tela desatualizada mandar um avanço a partir de uma etapa que a pessoa
 * já não está mais.
 */
export class MoverEtapaDto {
  @IsIn(CANDIDATURA_ETAPAS as unknown as string[])
  etapa!: CandidaturaEtapa;
}

/**
 * REGISTRAR SAÍDA, de QUALQUER etapa. As três saídas entram por aqui, e `ENVIADO_PARA_ADMISSAO` passa pela
 * mesma trava de posição que a aprovação, porque ela também consome posição.
 */
export class RegistrarSaidaDto {
  /**
   * A LISTA VEM DO DOMÍNIO, e não é mais redigitada aqui (achado do tester, 08/09).
   *
   * ELA ESTAVA ESCRITA À MÃO, duas vezes: no `@IsIn` e na anotação do campo. `SITUACOES_DE_SAIDA`
   * existia em `domain/candidatura` e não era lida por NENHUMA linha de produção, só pelo teste: a
   * fonte estava morta e a cópia é que mandava. Derivar as duas da constante é o que impede as duas
   * de divergirem sem ninguém perceber.
   *
   * E A DERIVAÇÃO SOZINHA NÃO BASTAVA, por isso ela vem em par com a outra metade da correção: o
   * `registrarSaida` deixou de escolher o caminho comparando com o nome `"ENVIADO_PARA_ADMISSAO"` e
   * passou a perguntar à régua (`ocupaPosicao`). Sem isso, acrescentar `"ALOCADO"` a esta lista
   * mandaria a alocação para o `update` direto, sem trava de ocupação, e a vaga de 5 aceitaria 6.
   */
  @IsIn(SITUACOES_DE_SAIDA as unknown as string[])
  situacao!: SituacaoDeSaida;

  /**
   * POR QUE SAIU, E AGORA É OBRIGATÓRIO NOS TRÊS DESFECHOS (ajuste 7 do diretor).
   *
   * ANTES ERA OPCIONAL AQUI e exigido só na tela, e só para o descarte. Regra que vive apenas no
   * navegador não é regra: qualquer chamada direta à rota gravava desfecho sem motivo, e o histórico
   * do bug 1 nasceria com buracos justamente nos eventos que mais precisam de explicação. Exigir no
   * DTO é o que faz a régua valer para todo mundo que fala com a rota.
   *
   * `MinLength(2)` ESPELHA A TELA, que já desabilitava o botão do descarte com menos de dois
   * caracteres úteis. Um espaço em branco não é motivo, e aceitar "." só moveria o buraco.
   *
   * ┌─ E A RÉGUA PRECISOU MEDIR O TEXTO APARADO, senão a frase acima era só uma frase ───────────┐
   * │ O `@MinLength(2)` MEDIA A STRING CRUA (achado do tester, 09/09), então `"   "` passava com  │
   * │ três caracteres, o `registrarSaida` gravava `texto(dto.motivo)`, o helper aparava, e o      │
   * │ desfecho ia para o banco com `motivo_descarte` NULO. O buraco que este comentário diz       │
   * │ impedir estava aberto, e a única barreira real era o NAVEGADOR, que é exatamente o que a    │
   * │ obrigatoriedade no DTO existe para não depender.                                           │
   * │                                                                                            │
   * │ O `@Transform` RODA ANTES DA VALIDAÇÃO (é `plainToInstance` quem o executa), então quem     │
   * │ valida já vê o texto aparado, e quem GRAVA recebe o mesmo texto aparado do corpo. O         │
   * │ `texto()` do service continua onde está: ele defende a gravação, não a régua.               │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  motivo!: string;
}

/**
 * ─ FINALIZAR POSIÇÃO: a candidatura vira `ALOCADO` e a posição da vaga é ENTREGUE ──────────────
 *
 * CORPO PRÓPRIO, E ROTA PRÓPRIA, e não `registrarSaida` com `situacao: "ALOCADO"`, por duas razões
 * que não são de estilo:
 *   1. ALOCAR NÃO É SAIR. O candidato continua no funil, e é isso que o diretor pediu. `ALOCADO`
 *      está fora de `SITUACOES_DE_SAIDA` de propósito, e o `@IsIn` do `RegistrarSaidaDto` logo acima
 *      é a segunda trava: nem corpo montado fora da tela consegue entrar por lá.
 *   2. A SAÍDA EXIGE MOTIVO (`MinLength(2)`, ajuste 7 do diretor), e finalizar posição não tem
 *      justificativa a dar: entregar a posição é o desfecho BEM-SUCEDIDO do processo. Passar por lá
 *      obrigaria o consultor a escrever "alocado" toda vez, que é ruído e não trilha.
 */
export class FinalizarPosicaoDto {
  /**
   * DE QUAL LADO DA META a posição é preenchida. AUSENTE VALE `OFICIAL`, que é o caso comum e o que
   * toda candidatura de hoje já é.
   *
   * O BANCO É ESCOLHA DELIBERADA, nunca transbordo automático: é o consultor que diz "esta pessoa
   * fica na reserva desta vaga". Deduzir o lado por ordem de chegada apagaria a intenção no gesto
   * que a cria.
   */
  @IsOptional()
  @IsIn(POSICAO_LADOS as unknown as string[])
  lado?: PosicaoLado;

  /**
   * A CIÊNCIA DO AVISO DE BANCO: "sei que ainda há posição OFICIAL aberta e mesmo assim quero alocar
   * no banco".
   *
   * NASCE FALSO E TEM DE VIR NO CORPO, exatamente como o `cienteReentrada` do `AlocarEmVagaDto`, e a
   * mecânica é a mesma: a primeira chamada é recusada com um 409 que diz QUANTAS posições oficiais
   * continuam abertas, a tela mostra a pergunta, o consultor confirma e a MESMA chamada volta com o
   * flag em `true`.
   *
   * AVISA, NÃO BLOQUEIA (decisão do diretor): quem decide é o consultor, com o número na frente.
   *
   * NÃO É "FORÇAR", e o nome diz de que ele é ciente por isso: ele não passa por cima de trava
   * nenhuma. O teto do lado escolhido continua valendo, com ou sem o flag, e um `force` genérico
   * seria usado pela primeira pessoa apressada para calar qualquer outra recusa.
   *
   * `@Transform` porque o corpo pode chegar com `"true"` de um formulário; `@IsBoolean` sozinho
   * recusaria a string.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value === "true" : value))
  @IsBoolean()
  cienteBancoComOficiaisAbertas?: boolean;
}

/**
 * TROCAR A VAGA DA CANDIDATURA (item 5 do diretor). Corrige a alocação errada MANTENDO a linha e a
 * etapa, e é operação de MASTER e SUPER_ADMIN (o `@Roles` na rota é a autoridade).
 */
export class TrocarVagaDto {
  /** A vaga de DESTINO. As travas do destino são conferidas no service, com a linha dela travada. */
  @IsUUID()
  vagaId!: string;

  /**
   * POR QUE A VAGA ESTAVA ERRADA. OPCIONAL de propósito, e a diferença para o desfecho é real: o
   * desfecho encerra o processo de alguém e precisa de justificativa (ajuste 7), a troca conserta um
   * erro de digitação e exigir texto para isso só faria o Master escrever "correção" toda vez, que é
   * ruído e não trilha. Quando ele escreve, o texto entra no rastro e vale.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}

/** REGISTRAR CONTATO no histórico da candidatura (nunca no da pessoa: ver a tabela). */
export class RegistrarContatoDto {
  @IsIn(AS_CONTATO_TIPO as unknown as string[])
  tipo!: AsContatoTipo;

  /**
   * O que aconteceu, em texto livre. §A.6: é resumo do PROCESSO ("não atendeu, retornar amanhã"),
   * não ficha da pessoa. Nada aqui deve receber identificador direto.
   */
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  resumo!: string;

  /**
   * QUANDO ACONTECEU, que é diferente de quando foi digitado. Ligação de ontem registrada hoje é o
   * caso normal; ausente, vale agora.
   */
  @IsOptional()
  @IsISO8601()
  ocorridoEm?: string;
}

/**
 * ─ OS CORPOS DAS AÇÕES EM MASSA (grupo 1 da A&S) ───────────────────────────────────────────────
 *
 * ┌─ POR QUE A RÉGUA MORA AQUI, E NÃO NA TELA ─────────────────────────────────────────────────┐
 * │ REGRA QUE VIVE APENAS NO NAVEGADOR NÃO É REGRA, e este módulo já pagou por isso uma vez: o  │
 * │ motivo do desvínculo era exigido só na tela, e qualquer chamada direta à rota gravava        │
 * │ desfecho sem motivo (ajuste 7 do diretor). EM MASSA o mesmo buraco é multiplicado pelo       │
 * │ tamanho da seleção, de uma vez só, então a exigência desce para o corpo.                     │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O TETO É BARREIRA, NÃO REGRA DE NEGÓCIO: seleção com milhares de ids é erro de tela, não intenção.
 * O número vem de `AS_MAXIMO_POR_LOTE`, a MESMA fonte do Alto Volume, e não é redigitado aqui: o teto
 * do corpo e o teto do vocabulário divergiriam em silêncio na primeira vez que um dos dois mudasse.
 *
 * NÃO EXISTE CORPO QUE ACEITE `alocadoPorId` NEM AUTORIA: quem fez sai da sessão, como em todo o
 * resto do módulo. Em massa isso importa mais, não menos: uma trilha de trinta linhas assinada por
 * um campo de formulário não é trilha.
 */

/** O teto e a forma da lista, iguais nos quatro corpos: uma régua só, aplicada quatro vezes. */
const LISTA_EM_MASSA = [
  IsArray(),
  ArrayMinSize(1, { message: "Selecione pelo menos uma linha." }),
  ArrayMaxSize(AS_MAXIMO_POR_LOTE, {
    message: `Selecione no máximo ${AS_MAXIMO_POR_LOTE} linhas por vez.`,
  }),
  IsUUID(undefined, { each: true }),
] as const;

/** Aplica a régua da lista sem repetir os quatro decoradores em cada corpo. */
const ListaEmMassa = (): PropertyDecorator => (alvo, chave) => {
  for (const decorar of LISTA_EM_MASSA) decorar(alvo, chave);
};

/**
 * ADICIONAR CANDIDATOS À VAGA EM MASSA. É a `alocar`, N vezes, e NÃO consome posição: quem entra no
 * funil nasce `ATIVO`, e `ATIVO` não ocupa nada. Uma vaga de 10 recebe 40 currículos, que é o normal.
 *
 * A VAGA VEM DA ROTA, e não do corpo: o lote é sempre de UMA vaga, e aceitar a vaga por linha
 * permitiria uma seleção que espalha gente por vagas diferentes sem ninguém perceber.
 */
export class AdicionarEmLoteDto {
  /** Os CANDIDATOS (a pessoa), e não candidaturas: aqui a candidatura ainda não existe. */
  @ListaEmMassa()
  candidatoIds!: string[];

  /**
   * A CIÊNCIA DA REENTRADA, uma para a seleção inteira, como a tela a coleta. O REGISTRO, porém, é
   * POR LINHA: cada reentrada grava o seu próprio aceite, preso à sua candidatura (§A.3 regra 8), e
   * quem entra na vaga pela primeira vez não recebe carimbo nenhum.
   *
   * `@Transform` porque o corpo pode chegar com `"true"` de um formulário.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value === "true" : value))
  @IsBoolean()
  cienteReentrada?: boolean;
}

/**
 * FINALIZAR POSIÇÃO EM MASSA: N posições da vaga são ENTREGUES, uma transação por linha.
 *
 * VERBO SEPARADO DO DE ADICIONAR (decisão do diretor): trazer para o funil e entregar a posição são
 * dois gestos com consequências diferentes, e o segundo é o que consome a meta da vaga.
 */
export class FinalizarPosicaoEmLoteDto {
  @ListaEmMassa()
  candidaturaIds!: string[];

  /**
   * A VAGA DA SELEÇÃO, opcional e CONFERIDA QUANDO VEM (decisão do diretor).
   *
   * ELA NÃO É DE ONDE A VAGA SAI: a vaga de cada linha sai da PRÓPRIA candidatura, e é ela que a
   * trava usa. Este campo é a afirmação da tela sobre o que ela pensa estar fazendo, e serve a duas
   * coisas: recusar o LOTE INTEIRO quando a vaga não recebe mais candidato (um problema só, da vaga,
   * que não deve virar trinta falhas idênticas no relatório) e recusar a LINHA cuja candidatura não
   * pertence àquela vaga, que é uma seleção misturada e não uma intenção.
   *
   * OPCIONAL, e não obrigatório, porque a vaga da linha continua sendo a fonte autoritativa: sem o
   * campo, cada linha é decidida sob a trava da vaga dela, exatamente como na ação individual.
   */
  @IsOptional()
  @IsUUID()
  vagaId?: string;

  /**
   * DE QUAL LADO DA META as posições saem. AUSENTE VALE `OFICIAL`, como na ação individual.
   *
   * UM LADO PARA A SELEÇÃO INTEIRA: o teto de cada lado continua sendo medido POR LINHA, dentro da
   * transação, então um lote mandado para a reserva para de entregar quando a reserva enche, e as
   * demais linhas voltam em `falhas` com a frase do teto daquele lado.
   */
  @IsOptional()
  @IsIn(POSICAO_LADOS as unknown as string[])
  lado?: PosicaoLado;

  /**
   * A CIÊNCIA DO AVISO DE BANCO. A tela coleta UMA confirmação; o REGISTRO é N, um por linha, com o
   * número de oficiais abertas lido DENTRO da transação daquela linha, porque esse número muda a
   * cada posição entregue. O gatilho do registro continua sendo a guarda ter DISPARADO, nunca o
   * flag do corpo ter vindo.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value === "true" : value))
  @IsBoolean()
  cienteBancoComOficiaisAbertas?: boolean;
}

/**
 * DESVINCULAR EM MASSA (e ENVIAR PARA ADMISSÃO em massa, que é a terceira saída).
 *
 * O MOTIVO É OBRIGATÓRIO NOS TRÊS DESFECHOS, com a MESMA régua do individual: aparado ANTES de
 * validado, senão `"   "` passa pelo `@MinLength` cru, o service apara na gravação e o motivo chega
 * NULO ao banco. Em massa, isso seriam trinta desfechos sem explicação de uma vez só.
 */
export class RegistrarSaidaEmLoteDto {
  @ListaEmMassa()
  candidaturaIds!: string[];

  /**
   * A LISTA VEM DO DOMÍNIO, como no corpo individual. `ALOCADO` está FORA dela de propósito: alocar
   * não é sair, consome posição e tem rota própria, com a trava que este caminho não roda.
   */
  @IsIn(SITUACOES_DE_SAIDA as unknown as string[])
  situacao!: SituacaoDeSaida;

  /** UM motivo para a seleção inteira, gravado em cada linha: é o desfecho comum que a originou. */
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  motivo!: string;
}

/**
 * MOVER NO FUNIL EM MASSA. É a `moverEtapa`, N vezes, e SÓ ela: trocar de vaga é operação de MASTER,
 * com rota própria e `@Roles`, e entrar aqui abriria um caminho de COMUM para uma ação que não é dele.
 */
export class MoverEtapaEmLoteDto {
  @ListaEmMassa()
  candidaturaIds!: string[];

  /** Só a etapa de DESTINO: de onde cada pessoa sai é o que está gravado nela. */
  @IsIn(CANDIDATURA_ETAPAS as unknown as string[])
  etapa!: CandidaturaEtapa;
}
