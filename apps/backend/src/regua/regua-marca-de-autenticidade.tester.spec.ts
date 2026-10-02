import { describe, expect, it, vi } from "vitest";
import { ReguaCompletudeService } from "./regua-completude.service";

/**
 * TESTER INDEPENDENTE (§A.38/§A.40 regra 2). COMPLEMENTO de
 * `domain/regua-autenticidade-nao-fecha.tester.spec.ts`, que eu NAO reescrevi.
 *
 * O QUE O TESTE QUE JA EXISTE PROVA, e eu confirmei rodando (2 casos, VERDES): sobre `regua.ts`
 * puro, um obrigatorio em `AGUARDANDO_AUDITORIA` nao conta como entregue, entao a regua nao fecha.
 * Isso cobre o caminho ESPERADO do suspeito, porque `decidirDestino` manda o suspeito para
 * `AGUARDANDO_AUDITORIA`.
 *
 * O FURO QUE ELE NAO COBRE, e que e o requisito dito ao pe da letra: o requisito fala da MARCA
 * (`conferir_autenticidade`), e a regua nao conhece marca nenhuma, so ESTADO. Medido:
 *  - `domain/regua.ts:17-21` (`DocReguaEstado`) tem `nome`, `exigencia` e `estado`. Nada de marca.
 *  - `regua/regua-completude.service.ts:69-76` (`docsRegua`) projeta `estado` e nao projeta
 *    `conferirAutenticidade`. O mesmo vale para as outras quatro consultas em lote do arquivo
 *    (`:138`, `:194`, `:272`, `:328`).
 * Logo um documento `ENTREGUE` COM a marca `true` fecha a regua, porque ninguem olha a marca.
 *
 * ╔═ ISSO E ALCANCAVEL, NAO E HIPOTESE DE LABORATORIO ════════════════════════════════════════════╗
 * ║ A sequencia tem tres passos, todos de codigo que existe:                                      ║
 * ║  1. a IA suspeita: `decidirDestino("VALIDADO", true)` grava AGUARDANDO_AUDITORIA + marca true; ║
 * ║  2. alguem reauditi o mesmo documento e a IA volta LIMPA (`autenticidadeSuspeita: false`):     ║
 * ║     `auditoria.service.ts:432-442` grava `estado: ENTREGUE` e NAO toca a marca, porque "a      ║
 * ║     automacao so SOBE a marca, nunca a limpa" (§A.38). Isso esta PROVADO, e de proposito, pelo ║
 * ║     caso 5b de `reauditoria/autenticidade-limpeza-da-marca.tester.spec.ts`;                    ║
 * ║  3. o documento fica ENTREGUE com a marca true. A regua fecha, a frente AUDITORIA auto-conclui ║
 * ║     (§A.3 regra 2 complemento), o gate do Cadastro abre e o Drive arquiva, com a suspeita de   ║
 * ║     autenticidade AINDA EM PE e nenhum humano tendo olhado.                                   ║
 * ║                                                                                               ║
 * ║ A regra "a automacao nunca limpa a marca" e justamente o que torna o estado possivel: ela      ║
 * ║ garante que a marca sobrevive, e o estado passa por cima dela porque sao duas colunas          ║
 * ║ independentes e so uma e lida.                                                                ║
 * ╚═══════════════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ╔═ DUAS SAIDAS POSSIVEIS, E O COORDENADOR NAO ESCOLHEU NENHUMA: E DECISAO DO DIRETOR ══════════╗
 * ║ (a) A REGUA PASSA A LER A MARCA. Toca `regua-completude.service.ts`, que e codigo VALIDADO e    ║
 * ║     consumido por varias telas (Esteira, Gerenciador, KPIs de pendencia, barra de progresso,    ║
 * ║     gatilho NC-1 e o disparo do arquivamento no Drive). Cai inteiro na §A.26: alcance em codigo ║
 * ║     aprovado, logo pergunta antes.                                                            ║
 * ║ (b) A AUTOMACAO LIMPA A MARCA quando o veredito volta limpo. CONTRADIZ a regra deliberada da    ║
 * ║     §A.38 de que SO O HUMANO limpa, que esta provada de proposito pelo caso 5b de               ║
 * ║     `reauditoria/autenticidade-limpeza-da-marca.tester.spec.ts`. Trocar isso e trocar a         ║
 * ║     precedencia humana sobre a IA, que nao e detalhe de implementacao.                         ║
 * ║                                                                                               ║
 * ║ AS DUAS MEXEM EM REGRA JA DECIDIDA, entao nenhuma e escolha da fabrica. Os dois testes do GAP   ║
 * ║ ficam `skip`, com o titulo dizendo o que FALTA, e viram verdes no dia em que o diretor decidir. ║
 * ║ OS DOIS CONTROLES CONTINUAM RODANDO: e eles que provam que o fake funciona e que o `skip` nao   ║
 * ║ esta escondendo um teste quebrado.                                                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════════════════════════╝
 *
 * §A.6: fixture sem dado pessoal. Codigos e nomes de tipo de documento, e um sexo, so.
 */

const CARGO = "cargo-1";
const CLIENTE = "C-10";
const ADM = "adm-1";

/** Uma linha da regua, como `docsRegua` a le do banco. */
interface LinhaDaRegua {
  codigo: string;
  nome: string;
  exigencia: "OBRIGATORIO" | "NAO_OBRIGATORIO" | "FACULTATIVO";
  estado: string | null;
  tipoDocumentoId: string;
  clienteVinculoId: string | null;
  /** A coluna que a consulta de hoje NAO projeta. O fake a oferece de propósito. */
  conferirAutenticidade: boolean;
}

function montar(linhas: LinhaDaRegua[]) {
  /** As chaves que a consulta da regua pediu (a prova estrutural do canario 2). */
  const projecoes: string[][] = [];

  const select = vi.fn((proj: Record<string, unknown>) => {
    const chaves = Object.keys(proj ?? {});
    // A segunda consulta de `docsRegua` busca o sexo do candidato (para o Reservista).
    if (chaves.includes("sexo")) {
      const b = {
        from: () => b,
        innerJoin: () => b,
        where: () => b,
        limit: () => Promise.resolve([{ sexo: "MASCULINO" }]),
      };
      return b;
    }
    projecoes.push(chaves);
    const b = {
      from: () => b,
      innerJoin: () => b,
      leftJoin: () => b,
      where: () =>
        // Entrega SO as colunas pedidas, como o Postgres faria: se a consulta nao projetar a marca,
        // ela nao chega, e o calculo nao tem como considerar o que nao pediu.
        Promise.resolve(
          linhas.map((l) => {
            const linha: Record<string, unknown> = {};
            for (const c of chaves) linha[c] = (l as unknown as Record<string, unknown>)[c];
            return linha;
          }),
        ),
    };
    return b;
  });

  const svc = new ReguaCompletudeService({ select } as never);
  return { svc, projecoes };
}

const obrigatorio = (
  n: number,
  estado: string | null,
  conferirAutenticidade = false,
): LinhaDaRegua => ({
  codigo: `DOC${n}`,
  nome: `Documento ${n}`,
  exigencia: "OBRIGATORIO",
  estado,
  tipoDocumentoId: `tipo-${n}`,
  clienteVinculoId: null,
  conferirAutenticidade,
});

// ── CONTROLE: a regua funciona como se espera quando a marca nao esta em jogo ─────────────────

describe("controle: a consulta da regua e o calculo concordam no caso simples", () => {
  it("todos os obrigatorios ENTREGUE sem marca: a regua FECHA", async () => {
    const { svc } = montar([obrigatorio(1, "ENTREGUE"), obrigatorio(2, "ENTREGUE")]);
    const p = await svc.progresso(ADM, CLIENTE, CARGO);
    expect(p.completa).toBe(true);
    expect(p.obrigatoriosEntregues).toBe(2);
  });

  it("o suspeito que ficou em AGUARDANDO_AUDITORIA NAO fecha a regua (o caminho esperado)", async () => {
    const { svc } = montar([
      obrigatorio(1, "ENTREGUE"),
      obrigatorio(2, "AGUARDANDO_AUDITORIA", true),
    ]);
    const p = await svc.progresso(ADM, CLIENTE, CARGO);
    expect(p.completa).toBe(false);
    expect(p.faltantes).toContain("Documento 2");
  });
});

// ── O GAP, EM DUAS PROVAS INDEPENDENTES ──────────────────────────────────────────────────────

describe("GAP: documento ENTREGUE com conferir_autenticidade=true NAO deve fechar a regua", () => {
  it.skip("FALTA DECISAO DO DIRETOR (a regua le ESTADO e nunca a MARCA): a regua nao pode ficar completa com a marca em pe", async () => {
    const { svc } = montar([
      obrigatorio(1, "ENTREGUE"),
      // A combinacao alcancavel: a IA marcou na primeira passada, a reauditoria promoveu a ENTREGUE
      // e nao limpou a marca (comportamento PROVADO e deliberado, §A.38).
      obrigatorio(2, "ENTREGUE", true),
    ]);

    const p = await svc.progresso(ADM, CLIENTE, CARGO);

    // O QUE ACONTECE HOJE: a regua FECHA com a suspeita em pe, a frente AUDITORIA auto-conclui
    // (§A.3 regra 2 complemento), o gate do Cadastro abre e o Drive arquiva, sem humano nenhum ter
    // olhado o documento que a IA desconfiou. A asserticao abaixo e o comportamento DESEJADO.
    expect(p.completa).toBe(false);
    expect(p.faltantes).toContain("Documento 2");
  });

  it.skip("FALTA DECISAO DO DIRETOR (saida (a)): a consulta da regua tem de PROJETAR conferir_autenticidade", async () => {
    const { svc, projecoes } = montar([obrigatorio(1, "ENTREGUE", true)]);
    await svc.progresso(ADM, CLIENTE, CARGO);

    // Sem a coluna na projecao nao existe conserto possivel no calculo: o dado nunca chega. Este
    // canario e o mais barato de manter e o que falha primeiro se alguem "consertar" so o puro.
    expect(projecoes.length).toBeGreaterThan(0);
    const projetaMarca = projecoes.some((chaves) =>
      chaves.some((c) => /conferir.?autenticidade/i.test(c)),
    );
    expect(projetaMarca).toBe(true);
  });
});
