import { describe, expect, it } from "vitest";
import { RetencaoCandidatosService } from "../candidatos/retencao-candidatos.service";
import { SITUACOES_VIVAS } from "../../domain/candidatura";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import {
  catalogoDeStatusFingido,
  linhasDeStatusFingidas,
} from "../vaga-status/vaga-status-catalogo.fake";
import { VagasService } from "./vagas.service";
import {
  CENARIO_ANTIGO,
  CENARIO_NOVO,
  CODIGO_ABERTURA,
  EVENTO_1,
  MASTER,
  VAGA,
  bancoDoReabrir,
  candidaturaDe,
  escritasEm,
  eventoDeCancelamento,
  portaDe,
  vivaDe,
  type BancoDoReabrir,
} from "./reabrir-vaga.tester-fake";

/**
 * ─ O RELÓGIO DO EXPURGO E A REABERTURA (§A.6, LGPD) ─────────────────────────────────────────────
 *
 * O REQUISITO DO DIRETOR, em uma linha: "o candidato reativado tem o prazo de expurgo PARADO".
 *
 * ┌─ POR QUE ESTE ARQUIVO MEDE CONTRA A RÉGUA DE VERDADE, e não contra uma cópia dela ──────────┐
 * │ A régua do expurgo é SQL, dentro de `retencao-candidatos.service.ts`, e é ela que decide se   │
 * │ uma pessoa é anonimizada. Um teste que REESCREVESSE a regra aqui ("basta ficar ATIVO") ficaria │
 * │ verde no dia em que a cláusula de lá mudasse, e a mudança de lá é exatamente a que ninguém    │
 * │ liga a esta frente. Então o arquivo LÊ a consulta real, afirma sobre ela, e só então confronta  │
 * │ com o que a reabertura grava. Duas metades que precisam CONCORDAR, e não uma cópia.            │
 * │                                                                                               │
 * │ A técnica de ler o SQL é a do `retencao-candidatos.spec.ts` (e a do                            │
 * │ `fopag-cliente-inativo.spec.ts` antes dele), inclusive o detalhe que já derrubou um teste ali: │
 * │ os COMENTÁRIOS falam as mesmas palavras que a regra, então só o SQL executável é lido.         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A CLÁUSULA, como ela está escrita hoje:
 *   `and (s.encerra = false or s.papel = 'ENTREGA' or v.encerrada_em is null)`
 * dentro de um `not exists` sobre candidatura em `SITUACOES_VIVAS`. Ou seja, a pessoa está protegida
 * quando tem candidatura VIVA em vaga NÃO ENCERRADA, e a reabertura entrega as DUAS metades: a
 * situação viva (restauração) e a vaga não encerrada (papel ABERTURA, `encerra = false`).
 */
function textoDaConsulta(q: unknown): string {
  const no = q as { queryChunks?: unknown[]; value?: unknown };
  if (Array.isArray(no?.queryChunks)) return no.queryChunks.map(textoDaConsulta).join("");
  if (Array.isArray(no?.value)) return no.value.join("");
  return no?.value !== undefined ? String(no.value) : "";
}
/** Só o SQL que o banco executa: linhas de comentário (--) fora, espaços colapsados. */
async function sqlDoExpurgo(): Promise<string> {
  const consultas: unknown[] = [];
  const db = {
    execute: (q: unknown) => {
      consultas.push(q);
      return Promise.resolve([]);
    },
  } as never;
  await new RetencaoCandidatosService(db).expurgar();
  expect(consultas).toHaveLength(1);
  return textoDaConsulta(consultas[0])
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join(" ")
    .replace(/\s+/g, " ");
}
const servico = (banco: BancoDoReabrir) =>
  portaDe(
    new VagasService(
      banco.db as never,
      catalogoDeEtapasFingido() as never,
      catalogoDeStatusFingido() as never,
    ),
  );
const comCancelamento = () =>
  bancoDoReabrir({ pessoas: CENARIO_NOVO(), eventos: [eventoDeCancelamento(EVENTO_1)] });
describe("a reabertura PARA o prazo de quem volta, e a régua é a do expurgo de verdade", () => {
  it("a proteção do expurgo é 'viva E em vaga não encerrada', e a cláusula continua essa", async () => {
    const q = await sqlDoExpurgo();
    expect(q, "a proteção sai de um `not exists` sobre candidatura viva").toMatch(
      /not exists \(\s*select 1 from as_candidaturas k/,
    );
    expect(q, "o flag `encerra` do catálogo é o que diz 'a vaga acabou'").toContain(
      "s.encerra = false",
    );
    expect(q, "e a vaga sem carimbo de encerramento protege, fail-closed").toContain(
      "v.encerrada_em is null",
    );
  });
  it("as duas situações de volta são situações VIVAS, que é o que protege a pessoa", () => {
    /*
     * A ORIGEM GRAVADA SÓ PODE SER `ATIVO` OU `ALOCADO` (é o que o cancelamento forçado encerra,
     * `seguraOCancelamento`). Se alguma delas caísse fora de `SITUACOES_VIVAS`, a reabertura
     * devolveria a pessoa a um estado que o expurgo NÃO enxerga como processo vivo, e o prazo
     * continuaria correndo com ela de volta na seleção.
     */
    for (const situacao of ["ATIVO", "ALOCADO"] as const) {
      expect(SITUACOES_VIVAS as readonly string[], situacao).toContain(situacao);
    }
  });
  it("o destino da reabertura é um status que NÃO encerra, senão a outra metade falta", () => {
    const abertura = linhasDeStatusFingidas().find((l) => l.papel === "ABERTURA")!;
    expect(abertura.encerra, "vaga reaberta não pode continuar contando como encerrada").toBe(false);
  });
  it("depois de voltar, a pessoa tem candidatura VIVA em vaga NÃO encerrada, as duas metades", async () => {
    const banco = comCancelamento();
    await servico(banco).reabrir(VAGA, { candidaturaIds: ["cand-Ana"] }, MASTER);
    expect(vivaDe(banco, "Ana")?.situacao, "metade 1: situação viva").toBe("ATIVO");
    expect(banco.vaga.status, "metade 2a: status que não encerra").toBe(CODIGO_ABERTURA);
    expect(banco.vaga.encerradaEm, "metade 2b: sem carimbo de encerramento").toBeNull();
  });
  /**
   * AS DUAS METADES SAEM NA MESMA GRAVAÇÃO, e isto não é zelo de transação: limpar o `encerrada_em`
   * sem mover o status deixa uma vaga que o catálogo diz que ENCERRA e que não tem data de
   * encerramento. A cláusula é fail-closed (`v.encerrada_em is null` PROTEGE), então essa vaga
   * passaria a proteger PARA SEMPRE todo mundo vivo dentro dela, e o prazo de ninguém ali começaria
   * a correr. É o zumbi permanente que a onda anterior matou.
   */
  it("status e encerrada_em saem no MESMO update: não existe vaga meio reaberta", async () => {
    const banco = comCancelamento();
    await servico(banco).reabrir(VAGA, { candidaturaIds: ["cand-Ana"] }, MASTER);
    const naVaga = escritasEm(banco, "vagas");
    expect(naVaga).toHaveLength(1);
    expect(Object.keys(naVaga[0].valores)).toContain("status");
    expect(Object.keys(naVaga[0].valores)).toContain("encerradaEm");
    expect(naVaga[0].valores.encerradaEm).toBeNull();
  });
});
describe("quem NÃO foi selecionado não é apressado, e também não é prorrogado", () => {
  /**
   * A DIREÇÃO IMPORTA NAS DUAS PONTAS, e é fácil defender só uma.
   *
   * APRESSAR seria antecipar o expurgo de quem ficou. Não acontece, e a consulta prova: a data de
   * referência de uma candidatura DESCARTADA é `k.atualizado_em`, porque o `case when` que troca
   * pelo `v.encerrada_em` da vaga é restrito a `k.situacao in (VIVAS)`. Ou seja, LIMPAR o
   * `encerrada_em` da vaga não muda uma vírgula do relógio de quem está descartado.
   *
   * PRORROGAR é o risco de verdade, e é silencioso: qualquer escrita na linha dela, inclusive um
   * carimbo de cortesia, EMPURRA o `atualizado_em` para hoje e reinicia DOIS ANOS de retenção de
   * dado pessoal de alguém que ninguém trouxe de volta. Nada falha, ninguém percebe, e o dado fica.
   */
  it("o relógio de quem está DESCARTADO é o `atualizado_em` dele, e o da vaga não entra nele", async () => {
    const q = await sqlDoExpurgo();
    expect(q, "a data de referência base é o último movimento da candidatura").toContain(
      "max(greatest( k.atualizado_em,",
    );
    expect(
      q,
      "a troca pelo encerramento da vaga é restrita a quem está VIVO: o descartado não a alcança",
    ).toMatch(/case when k\.situacao in \(.*\) then v\.encerrada_em end/);
  });
  it("a reabertura não escreve uma única vez na linha de quem ficou", async () => {
    const banco = comCancelamento();
    const ficaram = ["cand-Eli", "cand-Caio", "cand-Dora"];
    // O RELÓGIO DE CADA UM É LIDO ANTES, e não comparado com uma constante: cada pessoa do cenário
    // saiu num dia diferente de propósito, e comparar todo mundo com a mesma data testaria o fixture.
    const antes = new Map(
      ficaram.map((id) => [id, Number(candidaturaDe(banco, id)?.atualizadoEm)]),
    );
    await servico(banco).reabrir(VAGA, { candidaturaIds: ["cand-Ana"] }, MASTER);
    const alcancados = escritasEm(banco, "as_candidaturas").flatMap((e) => e.alcancou);
    for (const id of ficaram) {
      expect(alcancados, `${id} foi alcançado por uma escrita`).not.toContain(id);
      expect(
        Number(candidaturaDe(banco, id)?.atualizadoEm),
        `${id} teve o relógio de retenção empurrado`,
      ).toBe(antes.get(id));
    }
  });
  it("nem quando ninguém é selecionado, que é o caminho onde o carimbo de cortesia nasce", async () => {
    for (const corpo of [{ candidaturaIds: [] }, {}]) {
      const banco = comCancelamento();
      await servico(banco).reabrir(VAGA, corpo, MASTER);
      expect(escritasEm(banco, "as_candidaturas"), JSON.stringify(corpo)).toEqual([]);
      expect(escritasEm(banco, "as_candidatura_etapas"), JSON.stringify(corpo)).toEqual([]);
    }
  });
  /**
   * O CASO MEDIDO NA HOMOLOGAÇÃO (M4 do mapa): `APROVADO` dentro de uma vaga CANCELADA. Ela é VIVA
   * numa vaga ENCERRADA, que era o buraco que a onda anterior fechou. A reabertura a protege DE
   * NOVO, automaticamente, sem escrever nada na linha dela: é a vaga que volta ao mundo dos vivos.
   */
  it("a APROVADA que ficou na vaga volta a ser protegida sem ninguém tocar na linha dela", async () => {
    const banco = comCancelamento();
    const antes = candidaturaDe(banco, "cand-Flavia")!.atualizadoEm;
    await servico(banco).reabrir(VAGA, { candidaturaIds: ["cand-Ana"] }, MASTER);
    const flavia = candidaturaDe(banco, "cand-Flavia")!;
    expect(flavia.situacao, "o fato não é reescrito: ela foi aprovada de verdade").toBe("APROVADO");
    expect(Number(flavia.atualizadoEm), "e a linha dela não é tocada").toBe(Number(antes));
    expect(SITUACOES_VIVAS as readonly string[]).toContain("APROVADO");
    expect(banco.vaga.encerradaEm, "a proteção vem da vaga, não de uma escrita nela").toBeNull();
  });
});
describe("§A.6: a reabertura não desfaz um expurgo já consumado", () => {
  /**
   * VAGA CANCELADA HÁ MAIS DE DOIS ANOS TEM GENTE QUE A RETENÇÃO JÁ ANONIMIZOU: nome trocado por
   * "Candidato Expurgado", CPF, e-mail, telefone e nascimento apagados. Devolvê-la a um processo
   * VIVO a protegeria DE NOVO pela cláusula do expurgo, isto é, o apagamento seria desfeito pela
   * porta dos fundos, e a linha voltaria a ser retida sem nunca mais vencer.
   *
   * A LINHA APARECE MARCADA E O SERVIDOR RECUSA. Aparecer é melhor do que sumir: sumir faria o
   * Master procurar para sempre alguém que ele lembra que estava ali. E a recusa é do SERVIDOR, não
   * da tela: a lista de ids vem do cliente.
   */
  it("a pessoa expurgada aparece MARCADA, e o servidor recusa restaurá-la", async () => {
    const banco = bancoDoReabrir({ pessoas: CENARIO_ANTIGO(), eventos: [] });
    const porta = servico(banco);
    const previa = await porta.previa(VAGA, MASTER);
    const fantasma = previa.candidaturas.find((c) => c.candidaturaId === "cand-Fantasma");
    expect(fantasma, "sumir da lista faz o Master procurar para sempre").toBeDefined();
    expect(fantasma?.anonimizado, "clicável sem aviso convida a redigitar os dados").toBe(true);
    await expect(
      porta.reabrir(VAGA, { candidaturaIds: ["cand-Fantasma"] }, MASTER),
    ).rejects.toThrow();
    expect(escritasEm(banco, "as_candidaturas"), "recusa que já escreveu não é recusa").toEqual([]);
  });
});
