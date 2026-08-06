import { applyDecorators } from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsIn, IsOptional } from "class-validator";
import { normalizarTipoContrato, TIPOS_CANONICOS } from "../../domain/tipo-contrato";

/**
 * TRAVA DE ENTRADA DO TIPO DE CONTRATO (incidente de 06/08/2026).
 *
 * O campo era `@IsString()` puro, texto livre, e foi por aí que "TERC." entrou e travou o
 * arquivamento do contrato assinado da Thaís: o mapa de pasta-pai do Drive é chaveado pela grafia
 * canônica, então a abreviação não resolvia e o envelope ficava preso em AGUARDANDO_ASSINATURA sem
 * erro nenhum na tela. Texto livre num campo que outra parte do sistema usa como CHAVE não é
 * flexibilidade, é falha silenciosa esperando a hora.
 *
 * NORMALIZA ANTES DE VALIDAR, e essa ordem é o ponto. O `@Transform` converte a grafia conhecida
 * ("TEMP.", "temporario", "TEMPORÁRIO") para a canônica, e só então o `@IsIn` decide. Assim:
 *  - fluxo legítimo que manda abreviação continua passando, agora gravando a grafia certa;
 *  - grafia desconhecida é RECUSADA com a lista do que vale, em vez de virar a 14ª grafia da base;
 *  - vazio e ausente seguem válidos, porque o tipo é pendência da régua (§A.19), não trava.
 *
 * Vale para todo DTO que grava o campo: criação, edição, liberação individual e liberação em lote.
 */
export function TipoContratoCanonicoDto(): PropertyDecorator {
  return applyDecorators(
    IsOptional(),
    // `?? value` de propósito: grafia irreconhecível SEGUE para o @IsIn e vira erro legível, em vez
    // de sumir como `null` e passar pelo @IsOptional como se nada tivesse sido enviado.
    Transform(({ value }) => normalizarTipoContrato(value) ?? value),
    IsIn(TIPOS_CANONICOS as unknown as string[], {
      message: `Tipo de contrato inválido. Use um destes: ${TIPOS_CANONICOS.join(", ")}.`,
    }),
  );
}
