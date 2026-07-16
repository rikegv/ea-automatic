import { IsNotEmpty, IsUUID } from "class-validator";

/**
 * Declínio da admissão INTEIRA acionável de qualquer frente (OST ajustes, item 3). O motivo é
 * OBRIGATÓRIO: o usuário escolhe do catálogo motivos_declinio e confirma. Grava no MESMO
 * `admissoes.motivo_declinio_id` que o modal do olho/lápis usa (sem segundo campo).
 */
export class DeclinarDto {
  @IsNotEmpty({ message: "Escolha o motivo do declínio." })
  @IsUUID(undefined, { message: "Motivo de declínio inválido. Selecione um motivo da lista." })
  motivoDeclinioId!: string;
}
