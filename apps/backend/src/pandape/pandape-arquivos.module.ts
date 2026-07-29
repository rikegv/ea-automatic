import { Module } from "@nestjs/common";
import { PandapeApiService } from "./pandape-api.service";
import { PandapeArquivosService } from "./pandape-arquivos.service";

/**
 * MÓDULO FOLHA da integração Pandapé: o cliente HTTP + a re-baixa de anexos por tipo. Não importa
 * ninguém, e é por isso que ele existe.
 *
 * A DIREÇÃO DAS DEPENDÊNCIAS é o ponto. `PandapeModule` importa `AuditoriaModule` (o pull do Pandapé
 * reusa a F2 incremental). Quando o ARQUIVAMENTO passou a precisar re-baixar do Pandapé, a auditoria
 * passou a precisar do lado de lá, e importar o `PandapeModule` inteiro fecharia o ciclo
 * Auditoria → Pandapé → Auditoria. Extraindo o pedaço sem dependência para cá, os dois lados
 * importam esta folha e o grafo continua acíclico, sem `forwardRef`.
 *
 * O `PandapeApiService` mora AQUI (e não mais no `PandapeModule`) de propósito: assim existe UMA
 * instância só, com UM cache de access_token. Duplicar o provider duplicaria a emissão de token e
 * dobraria o consumo da cota compartilhada (§A.5).
 */
@Module({
  providers: [PandapeApiService, PandapeArquivosService],
  exports: [PandapeApiService, PandapeArquivosService],
})
export class PandapeArquivosModule {}
