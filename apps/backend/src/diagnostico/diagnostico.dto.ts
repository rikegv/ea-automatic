import { IsBoolean, IsIn, IsNotEmpty, IsString, IsUUID } from "class-validator";
import { FILAS, type NomeFila } from "./filas.service";

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

/**
 * LIGAR A ADMISSÃO A UMA PASTA QUE JÁ EXISTE NO DRIVE (OST da duplicação, item 5).
 *
 * Existe para o diretor resolver sozinho o caso em que a pasta está lá, com os documentos, e o link
 * não ficou gravado porque o arquivamento caiu no meio (foi o que aconteceu com o João: pasta com 5
 * documentos, upload interrompido por timeout, URL nunca gravada, admissão presa no card "Régua
 * Fechada Sem Pasta"). Aceita a URL da pasta ou o id cru.
 */
export class AcaoLigarPastaDto {
  @IsUUID()
  admissaoId!: string;

  @IsString()
  @IsNotEmpty({ message: "Informe o link ou o id da pasta do Drive." })
  pasta!: string;
}

/**
 * ZERAR a pendência de arquivamento de UMA admissão (decisão do diretor).
 *
 * Existe para o diretor fechar sozinho o sinal quando ele mesmo constatou que o caso está resolvido,
 * sem acionar a fábrica. Não mexe em documento, nem em pasta, nem em veredito: apaga só o MOTIVO
 * gravado na admissão, e a baixa fica registrada com autor e data.
 */
export class AcaoZerarPendenciaDto {
  @IsUUID()
  admissaoId!: string;
}

/**
 * ZERAR o sinal de PASTA DUPLICADA de UMA admissão (decisão do diretor).
 *
 * Existe porque o diretor decidiu conviver com as pastas extras por enquanto: ele NÃO vai apagá-las
 * agora e assume a remoção manual daqui pra frente, mas não quer o aviso aceso no meio tempo. Só
 * baixa o SINAL: nada é apagado, movido ou renomeado no Drive (§A.6), a pasta continua exatamente
 * onde está. Os ids baixados ficam guardados para o aviso não voltar sozinho no próximo
 * rearquivamento; duplicata NOVA acende normalmente.
 */
export class AcaoZerarDuplicataDto {
  @IsUUID()
  admissaoId!: string;
}

/** Bloco 5: liga/desliga o scheduler de re-consulta (sem deploy). */
export class SchedulerToggleDto {
  @IsBoolean()
  ligado!: boolean;
}

/**
 * AÇÃO SOBRE UM JOB FALHADO (onda 1 do diagnóstico detalhado). A fila vem no corpo porque o mesmo
 * `jobId` pode existir em filas diferentes: sem ela, limpar o job certo seria sorte.
 */
export class AcaoJobDto {
  @IsIn(FILAS as unknown as string[], { message: "Fila desconhecida." })
  fila!: NomeFila;

  @IsString()
  @IsNotEmpty({ message: "Informe o job." })
  jobId!: string;
}

/** "Testar agora" de UMA dependência: re-checa pelo caminho real, ignorando o cache de 5 minutos. */
export class TestarDependenciaDto {
  @IsIn(["Banco de dados", "Fila (BullMQ)", "Vertex AI (auditoria)", "Google Drive", "Pandapé (API)"], {
    message: "Dependência desconhecida.",
  })
  nome!: string;
}
