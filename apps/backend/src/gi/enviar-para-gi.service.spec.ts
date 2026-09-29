import { describe, expect, it, vi } from "vitest";
import { ConfigService } from "@nestjs/config";
import { EnviarParaGiService } from "./enviar-para-gi.service";
import type { GiApiService, GiCriacaoResultado } from "./gi-api.service";
import type { GiLeitorService } from "./gi-leitor.service";
import type { GiDeParaService } from "./gi-depara.service";
import { DE_PARA_GI_VAZIO, type PessoaParaGi } from "../domain/portal-dados-gi";

/**
 * PORTAL→GI, PEÇA 3: a garantia do "1 ENVIO SÓ" e o fail-closed do disparo.
 *
 * O ponto central provado aqui: o gatilho AUTOMÁTICO (`enviar`) é ESTRUTURALMENTE incapaz de criar no
 * GI (nunca chama `criarFuncionarioSelecao`), e o MANUAL (`enviarManual`) só cria com
 * `GI_DISPARO_ARMADO=true`. §A.6: nenhum valor de pessoa aparece nos motivos (códigos fechados).
 */

const CPF_SINTETICO = "39053344705";
const PESSOA: PessoaParaGi = { nome: "Fulano De Tal", cpf: CPF_SINTETICO };

function fakes(over: {
  configurado?: boolean;
  jaEnviado?: boolean;
  pessoa?: PessoaParaGi | null;
  criar?: GiCriacaoResultado;
} = {}) {
  const criar = vi.fn(
    async (): Promise<GiCriacaoResultado> =>
      over.criar ?? { ok: true, funcionarioSelecaoId: "GI-123" },
  );
  const marcarEnviado = vi.fn(async () => {});
  const giApi = {
    configurado: () => over.configurado ?? true,
    criarFuncionarioSelecao: criar,
  } as unknown as GiApiService;
  const leitor = {
    jaEnviado: vi.fn(async () => over.jaEnviado ?? false),
    lerPessoa: vi.fn(async () => (over.pessoa === undefined ? PESSOA : over.pessoa)),
    marcarEnviado,
  } as unknown as GiLeitorService;
  const depara = DE_PARA_GI_VAZIO as unknown as GiDeParaService;
  return { criar, marcarEnviado, giApi, leitor, depara };
}

function build(env: Record<string, string>, f: ReturnType<typeof fakes>): EnviarParaGiService {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new EnviarParaGiService(config, f.giApi, f.leitor, f.depara);
}

describe("EnviarParaGiService: gatilho AUTOMATICO (auditoria) NUNCA envia", () => {
  it("sem GI configurado: GI_NAO_CONFIGURADO", async () => {
    const f = fakes({ configurado: false });
    const svc = build({}, f);
    const r = await svc.enviar("00000000-0000-0000-0000-000000000000");
    expect(r).toEqual({ enviado: false, motivo: "GI_NAO_CONFIGURADO" });
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("mesmo GI configurado E disparo armado, o automatico e inerte e NUNCA cria", async () => {
    const f = fakes({ configurado: true });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviar("00000000-0000-0000-0000-000000000000");
    expect(r).toEqual({ enviado: false, motivo: "GI_AUTOMATICO_INERTE" });
    expect(f.criar).not.toHaveBeenCalled();
  });
});

describe("EnviarParaGiService: gatilho MANUAL, fail-closed e idempotencia", () => {
  it("nao configurado: nao le pessoa, nao cria", async () => {
    const f = fakes({ configurado: false });
    const svc = build({}, f);
    const r = await svc.enviarManual("00000000-0000-0000-0000-000000000000", "autor-1");
    expect(r.motivo).toBe("GI_NAO_CONFIGURADO");
    expect(f.leitor.lerPessoa).not.toHaveBeenCalled();
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("ja enviado: idempotencia, nao recria", async () => {
    const f = fakes({ configurado: true, jaEnviado: true });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviarManual("00000000-0000-0000-0000-000000000000", "autor-1");
    expect(r.motivo).toBe("GI_JA_ENVIADO");
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("sem dados de pessoa: nao envia vazio", async () => {
    const f = fakes({ configurado: true, pessoa: null });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviarManual("00000000-0000-0000-0000-000000000000", "autor-1");
    expect(r.motivo).toBe("GI_SEM_DADOS_PESSOA");
    expect(f.criar).not.toHaveBeenCalled();
  });
});

describe("EnviarParaGiService: a TRAVA do disparo (GI_DISPARO_ARMADO)", () => {
  it("DESARMADO (default): monta o payload e PARA, sem criar no GI", async () => {
    const f = fakes({ configurado: true });
    const svc = build({}, f); // sem GI_DISPARO_ARMADO
    const r = await svc.enviarManual("00000000-0000-0000-0000-000000000000", "autor-1");
    expect(r).toEqual({ enviado: false, motivo: "GI_MONTADO_NAO_DISPARADO" });
    expect(f.leitor.lerPessoa).toHaveBeenCalled(); // montou
    expect(f.criar).not.toHaveBeenCalled(); // mas NAO disparou
    expect(f.marcarEnviado).not.toHaveBeenCalled();
  });

  it("valor diferente de 'true' tambem NAO arma", async () => {
    const f = fakes({ configurado: true });
    const svc = build({ GI_DISPARO_ARMADO: "1" }, f);
    const r = await svc.enviarManual("00000000-0000-0000-0000-000000000000", "autor-1");
    expect(r.motivo).toBe("GI_MONTADO_NAO_DISPARADO");
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("ARMADO: cria UMA vez e carimba a idempotencia", async () => {
    const f = fakes({ configurado: true });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviarManual("00000000-0000-0000-0000-000000000000", "autor-1");
    expect(r).toEqual({ enviado: true, motivo: "GI_ENVIADO" });
    expect(f.criar).toHaveBeenCalledTimes(1);
    expect(f.marcarEnviado).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000000",
      "GI-123",
    );
  });

  it("ARMADO mas a criacao falha: GI_FALHA_ENVIO, nao carimba", async () => {
    const f = fakes({ configurado: true, criar: { ok: false, motivo: "HTTP", status: 500 } });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviarManual("00000000-0000-0000-0000-000000000000", "autor-1");
    expect(r.motivo).toBe("GI_FALHA_ENVIO");
    expect(f.marcarEnviado).not.toHaveBeenCalled();
  });
});
