import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsUUID } from "class-validator";

/**
 * Atribuição do CONSULTOR RESPONSÁVEL por frente (Onda 2). A ação é restrita ao Master pelo
 * `@Roles` do controller; estes DTOs só validam o formato.
 *
 * `consultorId` aceita `null` (desatribuir, limpa a coluna). Quando vem preenchido, precisa ser um
 * UUID de usuário. Nunca trafega nome/e-mail aqui: o seletor já carrega a lista pelo catálogo.
 */
export class AtribuirConsultorDto {
  @IsOptional()
  @IsUUID("4", { message: "Consultor inválido." })
  consultorId!: string | null;
}

/** Frentes que têm consultor responsável (as três abas de trabalho; integração/ifractal ficam fora). */
const FRENTES_CONSULTOR = ["auditoria", "exame", "cadastro"] as const;
type FrenteConsultor = (typeof FRENTES_CONSULTOR)[number];

/** Atribuição EM MASSA: o MESMO consultor para várias admissões, numa frente só. */
export class AtribuirConsultorLoteDto {
  @IsIn(FRENTES_CONSULTOR, { message: "Frente inválida (só auditoria, exame ou cadastro)." })
  frente!: FrenteConsultor;

  @IsArray()
  @ArrayMinSize(1, { message: "Selecione ao menos uma admissão." })
  // Teto defensivo, no mesmo molde do lote de agendamento: a fila é paginada e a seleção realista é
  // de dezenas. Um lote absurdo seria erro de uso, não caso legítimo.
  @ArrayMaxSize(500, { message: "Lote grande demais (máximo de 500 por vez)." })
  @IsUUID("4", { each: true, message: "Admissão inválida no lote." })
  admissaoIds!: string[];

  @IsOptional()
  @IsUUID("4", { message: "Consultor inválido." })
  consultorId!: string | null;
}
