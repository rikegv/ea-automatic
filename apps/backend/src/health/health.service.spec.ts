import { describe, expect, it } from "vitest";
import { HealthService } from "./health.service";

describe("HealthService", () => {
  it("reporta o serviço saudável", () => {
    const result = new HealthService().check();
    expect(result).toEqual({ status: "ok", service: "ea-backend", audience: "PUBLIC" });
  });
});
