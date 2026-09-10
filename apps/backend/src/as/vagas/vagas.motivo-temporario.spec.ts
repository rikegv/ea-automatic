import { describe, expect, it } from "vitest";
import type { Database } from "../../db/client";
import { VagasService } from "./vagas.service";
import type { CreateVagaDto } from "./vagas.dto";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";

/**
 * MOTIVO / JUSTIFICATIVA / SUBSTITUIÇÃO SÓ NO VÍNCULO TEMPORÁRIO (item 1, decisão do diretor 07/09).
 *
 * A TELA JÁ ESCONDE OS CAMPOS, e isto testa a OUTRA METADE, que é a que ninguém vê: o que o serviço
 * efetivamente GRAVA. Sem ela, quem preenchesse o motivo e depois trocasse o vínculo para Efetivo
 * deixaria um motivo órfão no banco, invisível na trilha e presente na linha; e, no caso do CPF do
 * substituído, deixaria DADO PESSOAL guardado sem necessidade (§A.6).
 *
 * `camposDaTrilha` é o mapeamento PURO do corpo para as colunas: não toca no banco, e é por isso que
 * ele é testável assim, sem stub de Drizzle. O `db` nulo prova o ponto: nada aqui o usa.
 */
const service = new VagasService(null as unknown as Database, catalogoDeEtapasFingido() as never);

function campos(dto: Partial<CreateVagaDto>) {
  return (
    service as unknown as {
      camposDaTrilha: (d: CreateVagaDto, s: string) => Record<string, unknown>;
    }
  ).camposDaTrilha({ status: "RASCUNHO", ...dto } as CreateVagaDto, "RASCUNHO");
}

/** O corpo que a tela do temporário manda, com tudo preenchido, inclusive o CPF. */
const CORPO_CHEIO = {
  motivo: "Substituição",
  justificativaMotivo: "cobrir férias",
  tipoSubstituicao: "FERIAS" as const,
  substituidoNome: "Fulano de Tal",
  substituidoCpf: "39053344705",
  tempoContrato: "90",
};

describe("motivo de contratação só no vínculo temporário", () => {
  it("TEMPORÁRIO grava os cinco campos, como sempre gravou", () => {
    const c = campos({ vinculo: "TEMPORARIO", ...CORPO_CHEIO });
    expect(c.motivo).toBe("Substituição");
    expect(c.justificativaMotivo).toBe("cobrir férias");
    expect(c.tipoSubstituicao).toBe("FERIAS");
    expect(c.substituidoNome).toBe("Fulano de Tal");
    expect(c.substituidoCpf).toBe("39053344705");
  });

  it("EFETIVO não grava NENHUM deles, mesmo com o corpo cheio", () => {
    const c = campos({ vinculo: "EFETIVO", ...CORPO_CHEIO });
    expect(c.motivo).toBeNull();
    expect(c.justificativaMotivo).toBeNull();
    expect(c.tipoSubstituicao).toBeNull();
    expect(c.substituidoNome).toBeNull();
    expect(c.substituidoCpf).toBeNull();
  });

  /**
   * O CORPO CHEIO NÃO É HIPÓTESE: é exatamente o que a tela manda quando alguém preenche tudo como
   * Temporário e depois volta o vínculo para Efetivo. O estado do formulário não se limpa sozinho, e
   * é o servidor que tem de recusar a gravação.
   */
  it("§A.6: o CPF do substituído NÃO fica guardado fora do temporário", () => {
    for (const v of ["EFETIVO", "PJ", "TERCEIRIZADO", "ESTAGIO", "INTERNO", "FOPAG", "JOVEM_APRENDIZ"]) {
      expect(campos({ vinculo: v as never, ...CORPO_CHEIO }).substituidoCpf).toBeNull();
    }
  });

  it("vaga sem vínculo escolhido (rascunho) também não grava nada disso", () => {
    expect(campos({ ...CORPO_CHEIO }).motivo).toBeNull();
    expect(campos({ ...CORPO_CHEIO }).substituidoCpf).toBeNull();
  });

  /**
   * A GUARDA CONTRA O ERRO QUE ESTE AJUSTE PODIA TER CAUSADO: o tempo de contrato tem régua PRÓPRIA
   * (três vínculos) e NÃO podia sumir junto. Estágio prova a separação: tem prazo, não tem motivo.
   */
  it("o TEMPO DE CONTRATO não foi arrastado junto: estágio mantém o prazo e perde o motivo", () => {
    const c = campos({ vinculo: "ESTAGIO", ...CORPO_CHEIO });
    expect(c.tempoContrato).toBe("90");
    expect(c.motivo).toBeNull();
  });

  it("temporário mantém prazo E motivo, que é o único vínculo com os dois", () => {
    const c = campos({ vinculo: "TEMPORARIO", ...CORPO_CHEIO });
    expect(c.tempoContrato).toBe("90");
    expect(c.motivo).toBe("Substituição");
  });

  it("efetivo não tem prazo nem motivo", () => {
    const c = campos({ vinculo: "EFETIVO", ...CORPO_CHEIO });
    expect(c.tempoContrato).toBeNull();
    expect(c.motivo).toBeNull();
  });
});
