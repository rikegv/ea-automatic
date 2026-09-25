import { describe, expect, it } from "vitest";
import { dadosVagaFolha, vagas } from "../db/schema";
import { corpoDoMetodo, fonteOuNulo } from "../portal/portal-envio.tester-fake";

/**
 * ─ PONTE A&S -> ADM, RISCO 5: OS DOIS REGIMES DO CPF DO SUBSTITUÍDO (`tester` §A.38/§A.40) ───────
 *
 * O REQUISITO: a pré-admissão criada pela ponte, ao gravar `dados_vaga_folha.substituido_cpf`,
 * grava TAMBÉM `substituicaoExpurgarEm` (TTL 48h, o padrão do `create`), e NÃO estende TTL nem
 * apaga `vagas.substituido_cpf` (retenção legal, SEM TTL). São dois regimes de LGPD diferentes
 * (§A.6 / regra 10): o da ADMISSÃO expira em 48h após a assinatura; o da VAGA é retenção mínima
 * legal e não tem relógio.
 *
 * Este arquivo TRAVA os dois pré-requisitos estruturais e o "padrão do create" que a ponte copia.
 * O comportamento da ponte (escrever o TTL ao carregar o substituído do funil) fica em `.todo`,
 * porque o método de criação a partir do funil é de outra frente.
 */

describe("ponte A&S -> ADM (risco 5): dois regimes de LGPD para o CPF do substituído", () => {
  it("dados_vaga_folha (ADMISSÃO) carrega o CPF do substituído E o relógio de expurgo", () => {
    // O par CPF + `substituicaoExpurgarEm` é o regime COM TTL: o job de expurgo nula o CPF ao vencer.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((dadosVagaFolha as any).substituidoCpf).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((dadosVagaFolha as any).substituicaoExpurgarEm).toBeTruthy();
  });

  it("vagas guarda o CPF do substituído SEM relógio: retenção legal, não TTL", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((vagas as any).substituidoCpf).toBeTruthy();
    // A AUSÊNCIA da coluna de expurgo é a regra: um relógio aqui apagaria um dado de retenção legal.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((vagas as any).substituicaoExpurgarEm).toBeUndefined();
  });

  it("o `create` é o PADRÃO que a ponte copia: grava o expurgo em ~48h quando é substituição", () => {
    const fonte = fonteOuNulo("admissoes", "admissoes.service.ts");
    expect(fonte).not.toBeNull();
    const corpo = corpoDoMetodo(fonte as string, "create");
    expect(corpo).not.toBeNull();
    // A janela de 48h em milissegundos, escrita no `create`. É o "padrão de create" que o requisito
    // manda a ponte reusar; se ele mudar aqui, a ponte e este teste têm de reconvergir juntos.
    expect(corpo as string).toMatch(/substituicaoExpurgarEm/);
    expect(corpo as string).toMatch(/48\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  });

  /**
   * COMPORTAMENTO DA PONTE (a fazer / de outra frente): a pré-admissão criada a partir do funil,
   * ao carregar o substituído, grava `substituicaoExpurgarEm = ~agora + 48h` junto do
   * `substituido_cpf` em `dados_vaga_folha`, e NÃO toca `vagas.substituido_cpf` nem cria relógio
   * de expurgo para a vaga. Provar isto pede o método de criação da ponte (ainda inexistente).
   */
  it.todo("a pré-admissão da ponte grava substituido_cpf COM substituicaoExpurgarEm de 48h");
  it.todo("a ponte NÃO estende TTL nem apaga vagas.substituido_cpf (regime de retenção legal)");
});
