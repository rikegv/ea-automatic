import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/decorators";
import { HealthService, type HealthStatus } from "./health.service";

@Public()
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  check(): HealthStatus {
    return this.health.check();
  }
}
