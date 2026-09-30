import { Module } from "@nestjs/common";
import { AuditoriaModule } from "../auditoria/auditoria.module";
import { ClicksignModule } from "../clicksign/clicksign.module";
import { ClicksignQueueModule } from "../clicksign/clicksign-queue.module";
import { EsteiraModule } from "../esteira/esteira.module";
import { PandapeEntradaModule } from "../pandape/pandape-entrada.module";
import { PandapeModule } from "../pandape/pandape.module";
import { PandapeQueueModule } from "../pandape/pandape-queue.module";
import { ReauditoriaModule } from "../reauditoria/reauditoria.module";
import { VtColetaModule } from "../vt-coleta/vt-coleta.module";
import { VtColetaQueueModule } from "../vt-coleta/vt-coleta-queue.module";
import { DiagnosticoController } from "./diagnostico.controller";
import { DiagnosticoService } from "./diagnostico.service";
import { FilasDiagnosticoService } from "./filas.service";
import { NomesFalhadosService } from "./nomes-falhados.service";
import { ReconciliacaoDriveSchedulerService } from "./reconciliacao-drive-scheduler.service";
import { ReconciliacaoDriveService } from "./reconciliacao-drive.service";

/**
 * Tela de diagnóstico (OST). Importa os módulos cujos serviços a tela reusa: Auditoria (pós-veredito
 * de arquivamento e AiClientService global), Pandapé (API + fila) e Reauditoria (reauditar por alvo).
 * AiClientService vem do AiModule global. O ClicksignModule entra pelo scheduler da assinatura
 * (estado + liga/desliga + rodar-agora), no mesmo papel do VtColetaModule.
 */
@Module({
  imports: [
    AuditoriaModule,
    ClicksignModule,
    // As TRÊS filas: o card do Diagnóstico via só a do Pandapé e ficava verde com job falhado
    // nas outras duas (bug corrigido em 06/08/2026).
    ClicksignQueueModule,
    // Traz o ExameSchedulerService (verificador de status do Exame), mesmo papel do VtColetaModule.
    EsteiraModule,
    PandapeModule,
    // O CACHE DE NOMES EM MEMÓRIA, que a busca por nome do drawer da fila lê e preenche. Entra pelo
    // módulo FOLHA (`PandapeEntradaModule`) e não pelo `PandapeModule`, que não o re-exporta: o cache
    // precisa ser a MESMA instância que o worker preenche, senão o nome resolvido pelo sync não
    // aparece aqui e cada abertura do modal pagaria cota do Pandapé de novo.
    PandapeEntradaModule,
    PandapeQueueModule,
    ReauditoriaModule,
    VtColetaModule,
    VtColetaQueueModule,
  ],
  controllers: [DiagnosticoController],
  providers: [
    DiagnosticoService,
    ReconciliacaoDriveService,
    // Faz a reconciliação rodar sozinha, em vez de depender de alguém abrir esta tela.
    ReconciliacaoDriveSchedulerService,
    FilasDiagnosticoService,
    NomesFalhadosService,
  ],
})
export class DiagnosticoModule {}
