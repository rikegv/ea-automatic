import { IsBoolean, IsUUID } from "class-validator";

/** Ações do Bloco 5, sempre POR ALVO (uma admissão). */
export class AcaoReauditarDto {
  @IsUUID()
  admissaoId!: string;

  @IsUUID()
  tipoDocumentoId!: string;
}

export class AcaoRearquivarDto {
  @IsUUID()
  admissaoId!: string;
}

export class AcaoRepullDto {
  @IsUUID()
  admissaoId!: string;
}

/** Bloco 5: liga/desliga o scheduler de re-consulta (sem deploy). */
export class SchedulerToggleDto {
  @IsBoolean()
  ligado!: boolean;
}
