import { describe, expect, it } from "vitest";
import {
  AREAS_DE_NASCIMENTO,
  AREA_POR_CONTROLLER,
  MENUS,
  MENUS_BLOQUEADOS_COMUM,
  MENUS_SOMENTE_SUPER_ADMIN,
  filtrarMenusPorPapel,
  MENUS_PADRAO_COMUM,
  TODOS_CODIGOS_MENU,
  areasDeNascimento,
  codigosPadraoDoPapel,
  menuDaOperacao,
  temIntersecao,
} from "./menus";

describe("registro de menus", () => {
  it("códigos são únicos", () => {
    expect(new Set(TODOS_CODIGOS_MENU).size).toBe(TODOS_CODIGOS_MENU.length);
  });

  it("todo menu tem rótulo, rota e grupo válido", () => {
    for (const m of MENUS) {
      expect(m.rotulo.length).toBeGreaterThan(0);
      expect(m.href.startsWith("/")).toBe(true);
      expect(["OPERACAO", "ADMIN"]).toContain(m.grupo);
    }
  });
});

describe("mapa operação -> menu", () => {
  it("coringa Controller.* reivindica qualquer handler daquela controller", () => {
    // regua reivindica ReguaController.* e TiposDocumentoController.*
    expect(menuDaOperacao("ReguaController", "upsert")).toBe("regua");
    expect(menuDaOperacao("TiposDocumentoController", "remove")).toBe("regua");
  });

  it("handler exato tem precedência de reivindicação", () => {
    expect(menuDaOperacao("AdmissoesController", "create")).toBe("nova");
    expect(menuDaOperacao("AdmissoesController", "editar")).toBe("gerenciador");
    expect(menuDaOperacao("AdmissoesController", "liberar")).toBe("liberacao");
  });

  it("operação NÃO reivindicada devolve null (rota ABERTA, régua de leitura preservada)", () => {
    // leitura de catálogo / leitura compartilhada
    expect(menuDaOperacao("ClientesController", "list")).toBeNull();
    expect(menuDaOperacao("CatalogosController", "clientes")).toBeNull();
    expect(menuDaOperacao("AdmissoesController", "listar")).toBeNull();
    expect(menuDaOperacao("AuthController", "me")).toBeNull();
  });

  it("a tela de USUÁRIOS não é reivindicada por menu (segue sob @Roles admin, Bloco 4)", () => {
    expect(menuDaOperacao("UsersController", "listar")).toBeNull();
    expect(menuDaOperacao("UsersController", "definirMenus")).toBeNull();
  });

  it("ações restritas seguem fora do menu (continuam @Roles admin)", () => {
    expect(menuDaOperacao("AdmissoesController", "recusar")).toBeNull();
    expect(menuDaOperacao("AdmissoesController", "deletar")).toBeNull();
    expect(menuDaOperacao("NaoConformidadesController", "decidirLiberacao")).toBeNull();
  });

  it("Gerador de kit: as 5 operações da tela caem TODAS no menu gerador-kit", () => {
    for (const h of ["processar", "statusProcessar", "downloadFuncionario", "reimportar", "downloadZip"]) {
      expect(menuDaOperacao("KitController", h)).toBe("gerador-kit");
    }
  });

  it("PAUSA: pausar/retomar caem no menu `esteira`, que o COMUM tem por padrão", () => {
    // "Qualquer consultor pausa e retoma" (decisão do diretor). Como `esteira` é do grupo Operação e
    // o padrão do COMUM é TODO o grupo Operação, cair neste menu É a permissão. Se alguém mover a
    // pausa para um menu de Administração, este teste quebra antes de o COMUM perder o botão.
    expect(menuDaOperacao("EsteiraController", "pausar")).toBe("esteira");
    expect(menuDaOperacao("EsteiraController", "retomar")).toBe("esteira");
    expect(codigosPadraoDoPapel("COMUM")).toContain("esteira");
  });

  it("kit-tipos: a LISTA (dropdown do Gerador de kit) é ABERTA; só as escritas são gated por kit-regras", () => {
    expect(menuDaOperacao("KitTiposController", "list")).toBeNull(); // dropdown do Gerador de kit
    expect(menuDaOperacao("KitTiposController", "criar")).toBe("kit-regras");
    expect(menuDaOperacao("KitTiposController", "atualizar")).toBe("kit-regras");
    expect(menuDaOperacao("KitTiposController", "remover")).toBe("kit-regras");
  });
});

describe("padrão do papel (decisão do diretor 24/07/2026): COMUM enxerga toda a Operação", () => {
  it("COMUM recebe TODOS os menus de Operação, INCLUINDO o Gerador de kit, e NENHUM de Administração", () => {
    const c = codigosPadraoDoPapel("COMUM");
    expect(c).toEqual(MENUS_PADRAO_COMUM);
    // padrão = exatamente o grupo OPERACAO.
    expect([...c].sort()).toEqual(
      MENUS.filter((m) => m.grupo === "OPERACAO")
        .map((m) => m.codigo)
        .sort(),
    );
    expect(c).toContain("esteira");
    expect(c).toContain("liberacao");
    expect(c).toContain("gerador-kit"); // a inversão desta OST
    expect(c).not.toContain("clientes"); // Administração fica fora do padrão
    expect(c).not.toContain("usuarios");
  });

  it("padrão do COMUM não inclui nenhum menu de Administração (concessão pontual)", () => {
    const c = new Set(codigosPadraoDoPapel("COMUM"));
    for (const m of MENUS) if (m.grupo === "ADMIN") expect(c.has(m.codigo)).toBe(false);
    expect(codigosPadraoDoPapel("COMUM").length).toBeLessThan(TODOS_CODIGOS_MENU.length);
  });

  it("Diagnóstico e Usuários são bloqueados para COMUM (são @Roles admin-only)", () => {
    expect(MENUS_BLOQUEADOS_COMUM.has("diagnostico")).toBe(true);
    expect(MENUS_BLOQUEADOS_COMUM.has("usuarios")).toBe(true);
    // e não estão no padrão (padrão é só Operação).
    for (const b of MENUS_BLOQUEADOS_COMUM) expect(codigosPadraoDoPapel("COMUM")).not.toContain(b);
  });

  it("SUPER_ADMIN recebe todos; MASTER recebe todos MENOS os exclusivos do Super Admin", () => {
    expect(codigosPadraoDoPapel("SUPER_ADMIN")).toEqual(TODOS_CODIGOS_MENU);

    // A SEGMENTAÇÃO DE ÁREA não mexeu neste teste, e isso ERA a prova da virada: com todo menu
    // carimbado ADM e o MASTER na área ADM, "todos os menus da minha área" é literalmente "todos os
    // menus". Quem o mudou foi a decisão SEGUINTE do diretor, de esconder de quem não é SUPER_ADMIN
    // as telas que ele não pode usar: a de Usuários e, agora, a de Área Por Menu. A diferença é
    // escrita como subtração explícita para que qualquer poda a mais quebre aqui.
    expect(codigosPadraoDoPapel("MASTER")).toEqual(
      TODOS_CODIGOS_MENU.filter((c) => !MENUS_SOMENTE_SUPER_ADMIN.has(c)),
    );
  });
});

/**
 * SEGMENTAÇÃO DE ÁREA (fundação do módulo de A&S).
 *
 * O QUE ESTES CASOS TRAVAM, e por que cada um existe:
 *  - a IDENTIDADE do dia da virada (ninguém perdeu acesso);
 *  - a REGRA DE OURO (a área nunca concede, só limita);
 *  - a TRAVA DUPLA da §A.23 (o padrão do COMUM não pode vazar menu de A&S);
 *  - o FAIL-CLOSED (sem área, nada);
 *  - a porta dos fundos das operações que só o `@Roles` protege.
 */
describe("segmentação por área: o NASCIMENTO (a fonte viva é a tabela, testada no serviço)", () => {
  // O QUE MUDOU NESTE ARQUIVO: a área VIGENTE de cada menu mudou-se para a tabela `menus.areas`, então
  // ela não é mais testável aqui, sem banco. O que sobra no domínio, e que estes casos travam, é o
  // NASCIMENTO (com que áreas um menu entra no catálogo) e a REGRA de interseção, que é pura.
  //
  // Os casos de visibilidade vigente vivem agora em `auth/menu-areas.service.spec.ts`.

  it("IDENTIDADE DA VIRADA: todo menu de hoje NASCE na área ADM", () => {
    // É o carimbo que a migration copiou para a tabela, então ele é a prova de que a troca de fonte
    // foi uma identidade. Se algum menu deixar de nascer em ADM sem decisão do diretor, quebra aqui.
    for (const m of MENUS) expect(areasDeNascimento(m)).toContain("ADM");
  });

  it("o Início NASCE nas DUAS áreas: ninguém encara uma barra lateral vazia", () => {
    const inicio = MENUS.find((m) => m.codigo === "inicio")!;
    expect(areasDeNascimento(inicio)).toEqual(["ADM", "AS"]);
  });

  it("menu que NÃO declara área nasce em ADM, a direção fail-closed", () => {
    expect(areasDeNascimento({ codigo: "x", rotulo: "X", href: "/x", grupo: "ADMIN", ordem: 99, operacoes: [] })).toEqual(["ADM"]);
    // Lista vazia declarada também cai no default: um menu sem área nenhuma não seria visto por ninguém.
    expect(areasDeNascimento({ codigo: "y", rotulo: "Y", href: "/y", grupo: "ADMIN", ordem: 99, operacoes: [], areas: [] })).toEqual(["ADM"]);
  });

  it("o índice de nascimento cobre todos os menus registrados", () => {
    // É o que o convergedor consome para semear menu novo. Um menu fora dele nasceria sem área.
    for (const c of TODOS_CODIGOS_MENU) expect(AREAS_DE_NASCIMENTO.has(c)).toBe(true);
  });

  it("REGRA DE VISIBILIDADE: há interseção, então enxerga", () => {
    expect(temIntersecao(["ADM"], ["ADM"])).toBe(true);
    expect(temIntersecao(["ADM", "AS"], ["AS"])).toBe(true);
    expect(temIntersecao(["ADM"], ["AS"])).toBe(false);
  });

  it("FAIL-CLOSED: conjunto vazio de qualquer lado não enxerga nada", () => {
    // Usuário sem área não vê menu nenhum; menu sem área não é visto por ninguém.
    expect(temIntersecao([], ["ADM", "AS"])).toBe(false);
    expect(temIntersecao(["ADM", "AS"], [])).toBe(false);
    expect(temIntersecao([], [])).toBe(false);
  });

  it("TRAVA DUPLA §A.23: o padrão do COMUM só admite menu de OPERACAO que NASÇA em ADM", () => {
    // A primeira trava é o grupo próprio dos menus de A&S. Esta é a de reserva: mesmo que um menu de
    // A&S apareça um dia no grupo OPERACAO por engano, o backfill não o entrega a ninguém.
    //
    // NASCIMENTO e não área vigente de propósito: esta lista é constante de módulo, consumida por
    // scripts que rodam fora do backend, e conceder em massa tem de ser a operação conservadora.
    for (const codigo of MENUS_PADRAO_COMUM) {
      const menu = MENUS.find((m) => m.codigo === codigo);
      expect(menu?.grupo).toBe("OPERACAO");
      expect(areasDeNascimento(menu!)).toContain("ADM");
    }
  });

  it("o padrão do papel NÃO recorta por área: quem aplica o teto é a fonte viva", () => {
    // Recortar aqui recriaria a SEGUNDA FONTE de autorização que esta frente eliminou. O MASTER recebe
    // todos os menus, e é o `MenuAreasService` que transforma isso em "todos os da minha área".
    expect(codigosPadraoDoPapel("SUPER_ADMIN")).toEqual(TODOS_CODIGOS_MENU);
    expect(codigosPadraoDoPapel("MASTER")).not.toContain("usuarios");
    expect(codigosPadraoDoPapel("COMUM")).toEqual(
      MENUS_PADRAO_COMUM.filter((c) => c !== "usuarios" && c !== "menu-areas"),
    );
  });

  it("AREA_POR_CONTROLLER cobre as superfícies que só o @Roles protege, todas em ADM", () => {
    // A limitação aceita pelo diretor: estas 8 operações não pertencem a menu nenhum, então a tela do
    // diretor não as governa e elas seguem carimbadas em código. Sem este mapa, um Master de A&S
    // alcançaria a tela de Usuários pela API e se concederia a área ADM.
    for (const c of [
      "UsersController",
      "DiagnosticoController",
      "AdmissoesController",
      "NaoConformidadesController",
      "ClientesController",
      "CatalogosController",
    ]) {
      expect(AREA_POR_CONTROLLER.get(c)).toEqual(["ADM"]);
    }
  });
});

/**
 * MENU EXCLUSIVO DO SUPER_ADMIN (decisão do diretor: esconder a tela de Usuários de quem não pode
 * usá-la). A tela já era `@Roles("SUPER_ADMIN")` no backend e continuava APARECENDO para o Master,
 * que abria e tomava 403 em tudo. Estes testes travam as duas metades da regra: o Super Admin
 * continua vendo, e ninguém mais vê.
 */
describe("menus exclusivos do SUPER_ADMIN", () => {
  it("são exclusivos a tela de Usuários e a de Área Por Menu", () => {
    // A de Área Por Menu entrou aqui por um motivo mais forte que a régua de sempre: ela ESCREVE a
    // fonte da autorização por área, então quem a alcança redefine o que cada time enxerga.
    expect([...MENUS_SOMENTE_SUPER_ADMIN]).toEqual(["usuarios", "menu-areas"]);
  });

  it("SUPER_ADMIN continua recebendo `usuarios`", () => {
    expect(codigosPadraoDoPapel("SUPER_ADMIN")).toContain("usuarios");
    expect(filtrarMenusPorPapel(["usuarios", "esteira"], "SUPER_ADMIN")).toEqual([
      "usuarios",
      "esteira",
    ]);
  });

  it("MASTER NÃO recebe os exclusivos, e não perde mais nada além deles", () => {
    const depois = codigosPadraoDoPapel("MASTER");
    expect(depois).not.toContain("usuarios");
    expect(depois).not.toContain("menu-areas");
    // A DIFERENÇA É EXATAMENTE O CONJUNTO DE EXCLUSIVOS. É o teste que impede a regra de virar uma
    // poda ampla por descuido: qualquer menu a mais que sumir da lista do Master quebra aqui.
    expect(TODOS_CODIGOS_MENU.filter((c) => !depois.includes(c)).sort()).toEqual(
      [...MENUS_SOMENTE_SUPER_ADMIN].sort(),
    );
  });

  it("COMUM não recebe `usuarios` nem por marcação antiga gravada no banco", () => {
    expect(codigosPadraoDoPapel("COMUM")).not.toContain("usuarios");
    // O filtro roda sobre o RESULTADO, então uma linha herdada em `usuario_menus` também é cortada.
    expect(filtrarMenusPorPapel(["usuarios", "esteira"], "COMUM")).toEqual(["esteira"]);
  });

  it("o filtro por papel não mexe em nenhum outro menu", () => {
    const semExclusivos = TODOS_CODIGOS_MENU.filter((c) => !MENUS_SOMENTE_SUPER_ADMIN.has(c));
    expect(filtrarMenusPorPapel(TODOS_CODIGOS_MENU, "MASTER")).toEqual(semExclusivos);
  });
});
