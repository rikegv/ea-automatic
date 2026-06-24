import { Injectable } from "@nestjs/common";
import type { Papel } from "@ea/shared-types";

export interface HealthStatus {
  status: "ok";
  service: "ea-backend";
  /** Papel mínimo exigido para a rota (Fase 0: liberado para todos). */
  audience: Papel | "PUBLIC";
}

@Injectable()
export class HealthService {
  check(): HealthStatus {
    return { status: "ok", service: "ea-backend", audience: "PUBLIC" };
  }
}
