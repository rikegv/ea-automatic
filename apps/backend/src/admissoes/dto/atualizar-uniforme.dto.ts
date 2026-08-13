import { Type } from "class-transformer";
import { IsDefined, ValidateNested } from "class-validator";
import { UniformeInputDto } from "./uniforme-epi.dto";

/**
 * EDIÇÃO DO UNIFORME depois da liberação (melhoria EAC, item 11b).
 *
 * REUSA o `UniformeInputDto` da liberação, e não uma cópia: os tamanhos são validados contra o mesmo
 * catálogo de `@ea/shared-types` que monta os seletores da tela, então valor fora da lista é chamada
 * forjada e cai no 400, aqui e lá, do mesmo jeito.
 *
 * O BLOCO É OBRIGATÓRIO, e vem inteiro: `possui` mais os tamanhos. O serviço normaliza com a mesma
 * função da liberação, então "não possui" limpa os tamanhos em vez de deixar sobra.
 */
export class AtualizarUniformeDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => UniformeInputDto)
  uniforme!: UniformeInputDto;
}
