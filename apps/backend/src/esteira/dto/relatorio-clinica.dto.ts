import { ArrayNotEmpty, IsArray, IsString } from "class-validator";

/**
 * Relatório da clínica (Esteira/Exame): lote de admissões cujo candidato irá ao exame/ASO. O
 * relatório é um insumo operacional para a clínica identificar quem é o candidato e qual o
 * empregador/CNPJ que responde pelo exame — SÓ status/identificação, nunca documento (§A.6).
 */
export class RelatorioClinicaDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  admissaoIds!: string[];
}
