import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import {
  BeneficioAlocadoDto,
  SEXO_VALORES,
  VagaFolhaInputDto,
  type SexoValor,
} from "./create-admissao.dto";
import { OBSERVACAO_LIBERACAO_MAX } from "./observacao-liberacao";
import { EpiInputDto, UniformeInputDto } from "./uniforme-epi.dto";
import { TipoContratoCanonicoDto } from "./tipo-contrato.decorator";

/**
 * Liberação Admissional (item 4): atribui cliente + cargo à pré-admissão E, opcionalmente, os demais
 * campos obrigatórios (régua unificada §A.19). A TRAVA de liberação continua sendo SÓ cliente+cargo:
 * todos os campos abaixo são opcionais e o que ficar vazio vira pendência na esteira (não bloqueia).
 *
 * REUSA os tipos do `create` (VagaFolhaInputDto, BeneficioAlocadoDto) — mesma régua de benefícios/
 * escala/valores, sem recriar. NÃO inclui `tempoContrato`: a régua unificada não o lista.
 */
export class LiberarAdmissaoDto {
  @IsString()
  @MinLength(1)
  codCliente!: string;

  @IsUUID()
  cargoId!: string;

  /** Trava de entrada (incidente de 06/08/2026): normaliza a grafia e recusa o que não existe. */
  @TipoContratoCanonicoDto()
  tipoContrato?: string;

  @IsOptional()
  @IsString()
  dataAdmissao?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => VagaFolhaInputDto)
  vagaFolha?: VagaFolhaInputDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BeneficioAlocadoDto)
  pacoteBeneficios?: BeneficioAlocadoDto[];

  /**
   * Observação LIVRE da liberação (Bloco 2). Opcional, não bloqueia e não vira pendência. Distinta
   * de `documentos_admissao.observacao` (motivo do veredito da auditoria) — ver o comentário da
   * coluna `admissoes.observacao_liberacao` no schema.
   */
  @IsOptional()
  @IsString()
  @MaxLength(OBSERVACAO_LIBERACAO_MAX, {
    message: `A observação da liberação tem no máximo ${OBSERVACAO_LIBERACAO_MAX} caracteres.`,
  })
  observacaoLiberacao?: string;

  /**
   * UNIFORME (OST Onda 3, item 1). OPCIONAL NO DTO, obrigatório na liberação INDIVIDUAL: quem cobra
   * a resposta é o serviço, não a validação de forma. Assim a mesma classe continua servindo a
   * qualquer chamador, e o lote (que reusa o miolo) segue liberando sem a resposta, deixando-a como
   * pendência individual na esteira, como faz com todos os outros campos em branco.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => UniformeInputDto)
  uniforme?: UniformeInputDto;

  /**
   * VÍNCULO escolhido (OST Onda 3, item 7, Bloco 5). Opcional no DTO porque só faz sentido para
   * cliente com dois ou mais contratos; quem cobra a escolha nesse caso é o serviço, que é quem sabe
   * quantos vínculos o cliente tem.
   */
  @IsOptional()
  @IsUUID()
  clienteVinculoId?: string;

  /** EPI (OST Onda 3, item 1). Opcional de ponta a ponta: não é pendência e não trava liberação. */
  @IsOptional()
  @ValidateNested()
  @Type(() => EpiInputDto)
  epi?: EpiInputDto;

  /**
   * SEXO DO CANDIDATO (OST do seletor de sexo). É o ÚNICO caminho de escrita depois da criação: até
   * aqui o campo só existia no wizard, e uma admissão que chegava do Pandapé com o sexo errado não
   * tinha onde ser corrigida. Foi o caso real que originou a OST: candidata gravada como MASCULINO,
   * Reservista virando obrigatório e o prontuário travado.
   *
   * O valor do Pandapé é PRÉ-PREENCHIMENTO, não trava (decisão do diretor): a tela manda o que o
   * consultor confirmou, e ele PODE corrigir. Opcional, então liberar sem informar continua valendo,
   * e sexo ausente segue não cobrando Reservista.
   */
  @IsOptional()
  @IsIn(SEXO_VALORES as unknown as string[], { message: "Selecione um sexo válido." })
  sexo?: SexoValor;
}
