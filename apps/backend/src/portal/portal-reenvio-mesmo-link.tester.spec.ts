import { describe, expect, it } from "vitest";
import { PortalEnvioService } from "./portal-envio.service";
import {
  ADMISSAO_SINTETICA,
  AUTOR_SINTETICO,
  JTI_SINTETICO,
  bancoDoEnvio,
  correioFake,
  filaFake,
  identidadeFake,
  instanciarPorTipos,
  trilhaFake,
} from "./portal-envio.tester-fake";

/**
 * ─ O REENVIO DO MESMO LINK, E O DESFECHO DA FALHA (OST frente-reenvio-email-mesmo-link) ─────────
 *
 * ┌─ O REQUISITO, E O PERIGO QUE ELE CARREGA ────────────────────────────────────────────────────┐
 * │ Reenviar por e-mail passou a DEVOLVER o mesmo link vivo (`emitido.reutilizado = true`) em vez │
 * │ de reemitir. O serviço de envio, na FALHA do correio, revogava o link "recém-nascido e órfão" │
 * │ com `ENVIO_FALHOU`. Esse raciocínio só vale para o link que NASCEU naquele clique. Para um    │
 * │ link REUTILIZADO (o candidato pode estar usando ele AGORA), revogar na falha de REENVIO        │
 * │ encerraria o acesso vigente, que é exatamente o que o diretor pediu para NÃO acontecer.        │
 * │                                                                                               │
 * │ A guarda mora no serviço de envio e lê `emitido.reutilizado`. Este arquivo a prova pelos dois │
 * │ lados: reutilizado NÃO revoga na falha; recém-nascido CONTINUA revogando (anti-regressão).    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nada aqui tem nome, e-mail, CPF ou URL. Só identificador técnico.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const config = () =>
  ({
    get: () => undefined,
    getOrThrow: (chave: string) => chave,
  }) as never;

function montarEnvio(opcoes: {
  reutilizado: boolean;
  correio: { configurado?: boolean; falhaAoEnviar?: boolean; lancaAoEnviar?: boolean };
}) {
  const banco = bancoDoEnvio({ pessoa: { admissaoId: ADMISSAO_SINTETICA } });
  const identidade = identidadeFake({ reutilizadoNoEnvio: opcoes.reutilizado });
  const correio = correioFake(opcoes.correio);
  const trilha = trilhaFake();
  const fila = filaFake();
  const servico = instanciarPorTipos(
    PortalEnvioService as any,
    {
      Database: banco.db,
      PortalIdentidadeService: identidade.fake,
      PortalEmissorService: identidade.fake,
      PortalCorreioService: correio.fake,
      PortalTrilhaService: trilha.fake,
      ConfigService: config(),
    },
    { arquivo: ["portal", "portal-envio.service.ts"], classe: "PortalEnvioService" },
  ) as any;
  return { servico, identidade, correio, fila };
}

const enviar = (m: ReturnType<typeof montarEnvio>) =>
  m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "MANUAL");

describe("reenvio do MESMO link: a falha de envio NÃO revoga o link reutilizado", () => {
  it("link REUTILIZADO + correio devolve falso: recusa FALHA_NO_ENVIO e NÃO revoga", async () => {
    const m = montarEnvio({ reutilizado: true, correio: { configurado: true, falhaAoEnviar: true } });
    const r = await enviar(m);
    expect(r.enviado).toBe(false);
    expect(r.motivo).toBe("FALHA_NO_ENVIO");
    expect(
      m.identidade.revogados,
      "o acesso vigente do candidato foi encerrado por uma falha de reenvio",
    ).toEqual([]);
  });

  it("link REUTILIZADO + correio LANÇA exceção: também NÃO revoga", async () => {
    const m = montarEnvio({ reutilizado: true, correio: { configurado: true, lancaAoEnviar: true } });
    const r = await enviar(m);
    expect(r.enviado).toBe(false);
    expect(r.motivo).toBe("FALHA_NO_ENVIO");
    expect(m.identidade.revogados).toEqual([]);
  });

  /**
   * ANTI-REGRESSÃO: o link que NASCEU neste clique (reutilizado falso) continua sendo revogado na
   * falha, com código próprio. Sem isso, "não revogar o reutilizado" viraria "nunca revogar", e um
   * link recém-emitido e nunca entregue ficaria vivo e órfão por 72 horas.
   */
  it("link RECÉM-NASCIDO + correio falha: revoga com ENVIO_FALHOU (comportamento preservado)", async () => {
    const m = montarEnvio({ reutilizado: false, correio: { configurado: true, falhaAoEnviar: true } });
    const r = await enviar(m);
    expect(r.enviado).toBe(false);
    expect(r.motivo).toBe("FALHA_NO_ENVIO");
    expect(m.identidade.revogados).toHaveLength(1);
    expect(m.identidade.revogados[0]).toMatchObject({ jti: JTI_SINTETICO, motivo: "ENVIO_FALHOU" });
  });

  it("link REUTILIZADO + correio OK: envia e carimba o envio no MESMO jti", async () => {
    const m = montarEnvio({ reutilizado: true, correio: { configurado: true } });
    const r = await enviar(m);
    expect(r.enviado).toBe(true);
    expect(r.motivo).toBeNull();
    expect(m.correio.enviados.length).toBe(1);
    // O carimbo do envio recai sobre o MESMO link reutilizado, sem revogar nada.
    expect(m.identidade.carimbos.map((c) => c.jti)).toEqual([JTI_SINTETICO]);
    expect(m.identidade.revogados).toEqual([]);
  });
});
