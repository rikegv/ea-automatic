import { describe, expect, it } from "vitest";
import { ConfigService } from "@nestjs/config";
import { EnviarParaGiService } from "./enviar-para-gi.service";

function comEnv(env: Record<string, string>): EnviarParaGiService {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new EnviarParaGiService(config);
}

/**
 * O GATILHO DA PEÇA 3 NASCE INERTE (fail-closed). Sem GI configurado, o envio é no-op e nunca lança:
 * a auditoria e o botão do time chamam este serviço sem risco de quebrar por causa de uma integração
 * que ainda não existe.
 */
describe("EnviarParaGiService: inerte até a peça 3", () => {
  it("sem GI configurado, é no-op e devolve GI_NAO_CONFIGURADO", async () => {
    const svc = comEnv({});
    const r = await svc.enviar("00000000-0000-0000-0000-000000000000");
    expect(r).toEqual({ enviado: false, motivo: "GI_NAO_CONFIGURADO" });
  });

  it("com URL mas sem segredo, ainda nasce fechado", async () => {
    const svc = comEnv({ GI_API_URL: "https://gi.example.com" });
    const r = await svc.enviar("00000000-0000-0000-0000-000000000000");
    expect(r.enviado).toBe(false);
    expect(r.motivo).toBe("GI_NAO_CONFIGURADO");
  });

  it("mesmo configurado, o cliente da peça 3 ainda não existe: no-op, sem lançar", async () => {
    const svc = comEnv({ GI_API_URL: "https://gi.example.com", GI_API_TOKEN: "segredo" });
    const r = await svc.enviar("00000000-0000-0000-0000-000000000000");
    expect(r.enviado).toBe(false);
    expect(r.motivo).toBe("GI_CLIENTE_PECA_3_PENDENTE");
  });
});
