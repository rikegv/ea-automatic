import { IsUUID } from "class-validator";

/** Campo de texto do multipart da auditoria (o arquivo vem por FileInterceptor). */
export class AuditarDocumentoDto {
  @IsUUID()
  tipoDocumentoId!: string;
}
