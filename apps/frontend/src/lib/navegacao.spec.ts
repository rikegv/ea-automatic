import { describe, it, expect } from "vitest";
import { ADMINISTRACAO, gruposDeNavegacao, OPERACAO, SELECAO } from "./navegacao";
import { CARDS } from "@/app/(app)/admin/page";

/**
 * A régua da navegação, afirmada sem montar componente (mesmo padrão do `LogoSou.spec`).
 *
 * O QUE ESTES TESTES PROTEGEM: a promessa de que a TELA INICIAL e a BARRA LATERAL mostram o mesmo
 * conjunto de destinos. Elas leem a mesma lista, e é justamente por isso que a regressão perigosa
 * aqui não é visual: é alguém voltar a filtrar por outra régua e as duas telas se separarem de novo.
 */

/** `temMenu` de mentira: só os códigos passados existem para a pessoa. */
const com = (...codigos: string[]) => (c: string) => codigos.includes(c);

describe("gruposDeNavegacao", () => {
  it("só entrega o que a pessoa tem liberado", () => {
    const grupos = gruposDeNavegacao(com("esteira", "gerenciador"), false);
    expect(grupos.map((g) => g.titulo)).toEqual(["Operação"]);
    expect(grupos[0].itens.map((i) => i.label)).toEqual([
      "Esteira Admissional",
      "Gerenciador",
    ]);
  });

  it("consultor de A&S vê o grupo de seleção e NÃO o de operação", () => {
    const grupos = gruposDeNavegacao(com("as-vagas", "as-candidatos"), false);
    expect(grupos.map((g) => g.titulo)).toEqual(["Atração e Seleção"]);
    expect(grupos[0].itens.map((i) => i.href)).toEqual(["/as/vagas", "/as/candidatos"]);
  });

  it("sem menu nenhum não inventa grupo, nem cabeçalho órfão", () => {
    expect(gruposDeNavegacao(() => false, false)).toEqual([]);
  });

  it("o grupo de Administração aparece por isAdmin, sem depender de temMenu", () => {
    const grupos = gruposDeNavegacao(() => false, true);
    expect(grupos.map((g) => g.titulo)).toEqual(["Administração"]);
    expect(grupos[0].itens[0].href).toBe("/admin");
  });

  it("um menu que abre a camada /admin também traz o grupo de Administração", () => {
    const grupos = gruposDeNavegacao(com("regua"), false);
    expect(grupos.map((g) => g.titulo)).toEqual(["Administração"]);
  });

  /*
   * ─ ETAPAS DO FUNIL: DENTRO DO HUB, E NÃO SOLTO NA BARRA ────────────────────────────────────────
   *
   * A CASA MUDOU DUAS VEZES, e as duas primeiras estavam erradas: o item nasceu no grupo de A&S e
   * depois foi para a barra, solto abaixo do Menu Gerencial. O pedido era a tela DENTRO do menu de
   * gestão, junto das outras configurações, e isso é um CARD do hub.
   *
   * SÃO DUAS AFIRMAÇÕES, E UMA SÓ NÃO BASTA: "saiu da barra" sem "chegou no hub" passaria verde com
   * o destino sumido das duas casas, que é o menu liberado e inalcançável da §A.23. Por isso o teste
   * lê também a lista de cards do hub.
   */
  it("Etapas Do Funil NÃO é item da barra: nem em A&S, nem solto na Administração", () => {
    expect(SELECAO.map((n) => n.codigo)).not.toContain("as-etapas");
    expect(ADMINISTRACAO.map((n) => n.codigo)).not.toContain("as-etapas");
    const grupos = gruposDeNavegacao(com("as-vagas", "as-etapas"), false);
    expect(grupos.find((g) => g.titulo === "Administração")).toBeUndefined();
    expect(grupos.find((g) => g.titulo === "Atração e Seleção")?.itens).toHaveLength(1);
  });

  it("Etapas Do Funil é CARD do hub de configuração, ao lado dos outros catálogos", () => {
    const card = CARDS.find((c) => c.codigo === "as-etapas");
    expect(card?.href).toBe("/admin/as/etapas");
    expect(card?.title).toBe("Etapas Do Funil");
    // §A.11: travessão é proibido em texto que chega ao usuário.
    expect(card?.desc ?? "").not.toContain("—");
  });

  it("mudar de casa NÃO mudou quem enxerga: o card é filtrado por `temMenu` (§A.23)", () => {
    // O hub aparece para o admin, e o CARD de dentro dele continua governado pelo código do menu:
    // quem não tem `as-etapas` não vê o card, exatamente como não via o item na barra.
    const grupos = gruposDeNavegacao(() => false, true);
    const admin = grupos.find((g) => g.titulo === "Administração");
    expect(admin?.itens.map((i) => i.href)).toEqual(["/admin"]);
    expect(CARDS.filter((c) => c.codigo === "as-etapas")).toHaveLength(1);
  });

  it("incluirInicio:false tira só o Início, e é o que a própria tela inicial usa", () => {
    const codigos = [...OPERACAO, ...SELECAO, ...ADMINISTRACAO].map((n) => n.codigo);
    const comTudo = gruposDeNavegacao(com(...codigos), false);
    const semInicio = gruposDeNavegacao(com(...codigos), false, { incluirInicio: false });

    const hrefs = (g: ReturnType<typeof gruposDeNavegacao>) =>
      g.flatMap((x) => x.itens.map((i) => i.href));

    expect(hrefs(comTudo)).toContain("/");
    expect(hrefs(semInicio)).not.toContain("/");
    // Nada MAIS pode sumir junto: a home mostra tudo o que a barra mostra, menos o link para ela mesma.
    expect(hrefs(comTudo).filter((h) => h !== "/")).toEqual(hrefs(semInicio));
  });

  it("todo destino tem descrição para o card, senão a home nasce com card mudo", () => {
    for (const n of [...OPERACAO, ...SELECAO, ...ADMINISTRACAO]) {
      expect(n.descricao.length, `${n.label} sem descrição`).toBeGreaterThan(10);
      // §A.11: travessão é proibido em texto que chega ao usuário.
      expect(n.descricao, `${n.label} com travessão`).not.toContain("—");
    }
  });
});
