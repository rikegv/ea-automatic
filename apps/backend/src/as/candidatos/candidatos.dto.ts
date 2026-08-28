import { Transform } from "class-transformer";
import {
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
  CANDIDATURA_ETAPAS,
  UFS,
  type AsCandidatoOrigem,
  type AsContatoTipo,
  type CandidaturaEtapa,
} from "@ea/shared-types";

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
   * `APROVADO`, nem `CONTRATADO`), que é EXATAMENTE a mesma régua do `candidaturasAtivas` que a lista
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
 * REGISTRAR SAÍDA, de QUALQUER etapa. As três saídas entram por aqui, e `CONTRATADO` passa pela
 * mesma trava de posição que a aprovação, porque ela também consome posição.
 */
export class RegistrarSaidaDto {
  @IsIn(["DESCARTADO", "DESISTIU", "CONTRATADO"])
  situacao!: "DESCARTADO" | "DESISTIU" | "CONTRATADO";

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
   */
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  motivo!: string;
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
