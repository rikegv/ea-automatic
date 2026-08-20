import { ArrayNotEmpty, ArrayUnique, IsArray, IsIn } from "class-validator";
import { AREA, type Area } from "@ea/shared-types";

const AREAS = AREA as unknown as string[];

/**
 * Áreas a gravar num menu.
 *
 * `ArrayNotEmpty` na FORMA, e o serviço recusa de novo na REGRA. A dupla checagem é deliberada: a
 * validação de formato protege a rota, e a do serviço protege qualquer outro caminho que venha a
 * chamar `definir` (script, carga, uma tela futura). Menu sem área é uma tela que ninguém alcança.
 */
export class DefinirAreasDoMenuDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(AREAS, { each: true })
  areas!: Area[];
}

/**
 * Marcação HIPOTÉTICA, para a prévia do impacto.
 *
 * Aceita lista VAZIA de propósito, ao contrário do salvamento: a tela desmarca a última caixa e o
 * diretor precisa ver o estrago que aquilo causaria ANTES de a recusa aparecer. Simular o proibido é
 * justamente como se explica por que ele é proibido.
 */
export class ImpactoAreasDoMenuDto {
  @IsArray()
  @ArrayUnique()
  @IsIn(AREAS, { each: true })
  areas!: Area[];
}
