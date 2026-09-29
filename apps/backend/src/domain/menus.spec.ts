import { describe, expect, it } from "vitest";
import {
  AREAS_DE_NASCIMENTO,
  AREA_POR_CONTROLLER,
  MENUS,
  MENUS_BLOQUEADOS_COMUM,
  MENUS_SOMENTE_SUPER_ADMIN,
  filtrarMenusPorPapel,
  MENUS_PADRAO_COMUM,
  MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER,
  restricaoDeConcessao,
  MENUS_QUE_NASCEM_FORA_DA_ADM,
  TODOS_CODIGOS_MENU,
  baseDeMenusDoMaster,
  masterPrecisaDeMarcacao,
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
      expect(["OPERACAO", "ADMIN", "SELECAO"]).toContain(m.grupo);
    }
  });
});

describe("mapa operação -> menu", () => {
  it("coringa Controller.* reivindica qualquer handler daquela controller", () => {
    // regua reivindica ReguaController.* e TiposDocumentoController.*
    expect(menuDaOperacao("ReguaController", "upsert")).toBe("regua");
    expect(menuDaOperacao("TiposDocumentoController", "remove")).toBe("regua");
  });

  /**
   * MENU DE DICAS (exigência S12). A controller não tem `@Roles`, e operação que nenhum menu
   * reivindica passa LIVRE pelo `MenuGuard`: sem esta reivindicação, qualquer sessão autenticada
   * escreveria o texto que aparece na tela PÚBLICA do candidato. O coringa de `regua` (que já
   * reivindica `TiposDocumentoController`) NÃO alcança classe nova.
   */
  it("as Dicas De Documento são reivindicadas pelo menu próprio, leitura incluída", () => {
    for (const h of ["list", "upsert", "reativar", "remove"]) {
      expect(menuDaOperacao("DicasDocumentoController", h)).toBe("dicas-documento");
    }
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
    // DUAS SUBTRAÇÕES, e são de naturezas diferentes: `MENUS_SOMENTE_SUPER_ADMIN` some da LISTA
    // dele (não é concedível), e `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER` só não vem DE NASCENÇA (o
    // diretor concede pela tela). As duas escritas como subtração explícita para que qualquer poda
    // a mais quebre aqui.
    expect(codigosPadraoDoPapel("MASTER")).toEqual(
      TODOS_CODIGOS_MENU.filter(
        (c) => !MENUS_SOMENTE_SUPER_ADMIN.has(c) && !MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER.has(c),
      ),
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

  it("IDENTIDADE DA VIRADA: todo menu NASCE na área ADM, salvo os NOMINALMENTE declarados", () => {
    // É o carimbo que a migration copiou para a tabela, então ele é a prova de que a troca de fonte
    // foi uma identidade. Se algum menu deixar de nascer em ADM sem decisão do diretor, quebra aqui.
    //
    // O RECORTE JÁ MUDOU DUAS VEZES, e a segunda é a que interessa. Ele nasceu como "todo menu de
    // hoje" (o dia da virada, quando A&S não existia), virou "todo menu FORA DO GRUPO SELECAO"
    // quando a Central de Vagas nasceu, e agora é "todo menu fora da LISTA NOMINAL". A troca
    // aconteceu porque o diretor mandou a tela de Etapas Do Funil para o grupo ADMIN: com a prova
    // amarrada ao grupo, um menu de A&S na Administração a quebrava sem nada de errado ter
    // acontecido, e um menu da Admissão largado no grupo SELECAO escapava dela sem ninguém decidir.
    //
    // A PROVA FICOU MAIS FORTE, e é isto que o par de casos afirma: agora ela cobre TODOS os menus,
    // sem exceção derivada de campo nenhum, e a única saída é o nome escrito à mão na lista.
    for (const m of MENUS) {
      if (MENUS_QUE_NASCEM_FORA_DA_ADM.has(m.codigo)) continue;
      expect(areasDeNascimento(m), m.codigo).toContain("ADM");
    }
  });

  it("a lista de exceções é EXATA: quem está nela nasce fora de ADM, e ninguém mais nasce fora", () => {
    // O SEGUNDO SENTIDO DO CRUZAMENTO, e sem ele a lista viraria um esconderijo: bastaria acrescentar
    // um código para o menu sair da prova de cima sem que sua área fosse conferida por ninguém.
    //
    // A IGUALDADE É COM O CONJUNTO DERIVADO do registro, e não um `toContain`: sobrar nome (menu que
    // já não é mais de A&S e continuou listado) é tão erro quanto faltar nome (menu novo que nasceu
    // fora de ADM e ninguém declarou). Os dois lados quebram aqui, e é isso que obriga a próxima
    // exceção a ser deliberada.
    const nascemForaDaAdm = MENUS.filter((m) => !areasDeNascimento(m).includes("ADM")).map(
      (m) => m.codigo,
    );
    expect([...MENUS_QUE_NASCEM_FORA_DA_ADM].sort()).toEqual([...nascemForaDaAdm].sort());
    // E A LISTA NÃO CITA MENU QUE NÃO EXISTE: código órfão aqui protegeria um menu apagado e
    // deixaria o vivo de mesmo nome sem prova nenhuma.
    for (const c of MENUS_QUE_NASCEM_FORA_DA_ADM) expect(TODOS_CODIGOS_MENU).toContain(c);
  });

  it("o GRUPO deixou de opinar sobre ÁREA: a tela de Etapas Do Funil é ADMIN e nasce em AS", () => {
    // O CASO CONCRETO que obrigou a reescrita da identidade (decisão do diretor: a tela de
    // configuração das etapas vai para junto das demais configurações). As duas declarações vivem
    // em campos diferentes e nenhuma manda na outra: `grupo` decide ONDE o menu aparece, `areas`
    // decide QUEM o enxerga.
    const etapas = MENUS.find((m) => m.codigo === "as-etapas")!;
    expect(etapas.grupo).toBe("ADMIN");
    expect(areasDeNascimento(etapas)).toEqual(["AS"]);
    // A MUDANÇA DE GRUPO NÃO PODE TER TORNADO O MENU DISTRIBUÍVEL (§A.23), e este é o ponto que a
    // OST mandou conferir em vez de supor: o padrão do COMUM é o que `backfill-menus-comum` concede.
    expect(MENUS_PADRAO_COMUM).not.toContain("as-etapas");
    expect(codigosPadraoDoPapel("COMUM")).not.toContain("as-etapas");
    // AS DUAS LISTAS DE BLOQUEIO SAÍRAM DAQUI (regra do diretor, 27/09/2026), e a troca é de CASA,
    // não de intensidade: o menu virou CONCEDÍVEL pessoa a pessoa, e quem impede o MASTER de ganhá-lo
    // pelo bypass de ÁREA é a entrada nominal em `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER`. As duas
    // listas de baixo TRAVARIAM a concessão, uma na gravação e outra na leitura, que é exatamente o
    // descarte silencioso que a frente foi feita para acabar.
    expect(MENUS_BLOQUEADOS_COMUM.has("as-etapas")).toBe(false);
    expect(MENUS_SOMENTE_SUPER_ADMIN.has("as-etapas")).toBe(false);
    expect(masterPrecisaDeMarcacao("as-etapas")).toBe(true);
  });

  it("menu de A&S NASCE só na área AS, em grupo próprio, e fora do padrão do COMUM", () => {
    // As três travas da §A.23 sobre o mesmo menu: área AS (não aparece para quem é da Admissão),
    // grupo SELECAO (fora do filtro `grupo === "OPERACAO"` de qualquer backfill) e ausência do padrão
    // do COMUM (ninguém recebe o módulo de A&S por concessão em massa).
    const central = MENUS.find((m) => m.codigo === "as-vagas")!;
    expect(central.grupo).toBe("SELECAO");
    expect(areasDeNascimento(central)).toEqual(["AS"]);
    expect(MENUS_PADRAO_COMUM).not.toContain("as-vagas");
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
  it("sobraram DUAS, e são as telas que CONCEDEM permissão", () => {
    /**
     * ─ ESTA LISTA ENCOLHEU DE NOVE PARA DUAS (regra do diretor, 27/09/2026) ─────────────────────
     *
     * A REGRA NOVA, com todas as letras: o Super Admin concede QUALQUER tela a QUALQUER usuário.
     * Não existe mais tela de configuração que ele não possa conceder, e é ele que decide, pessoa a
     * pessoa, quem enxerga e quem configura o quê.
     *
     * ┌─ O QUE ESTA LISTA FAZ, e é por isso que ela era incompatível com a regra ────────────────┐
     * │ Ela é aplicada ao RESULTADO por `filtrarMenusPorPapel`: REMOVE o menu de quem não é       │
     * │ SUPER_ADMIN, ou seja, o torna IMPOSSÍVEL DE CONCEDER. O diretor marcava a pessoa na tela  │
     * │ de permissões e o `/auth/me` dela devolvia a lista sem o menu, em silêncio. Somada ao     │
     * │ filtro da GRAVAÇÃO, a caixa aparecia marcável, a tela salvava sem reclamar e o acesso     │
     * │ nunca chegava.                                                                            │
     * └───────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * OS SETE CATÁLOGOS DE A&S SAÍRAM (`as-etapas`, `as-status-vaga`, `as-motivos-cancelamento`,
     * `as-linhas-servico`, `as-segmentos`, `as-comerciais`, `as-motivos-reenvio`), junto com o
     * `as-motivos-descarte`, que já havia saído antes pela mesma decisão. Os argumentos que os
     * trouxeram aqui continuam VERDADEIROS e deixaram de ser motivo para NÃO CONCEDER: quem edita
     * as etapas edita o vocabulário do histórico, quem edita o status da vaga edita TRAVAS, quem
     * edita os comerciais mexe em NOME DE PESSOA. Tudo isso diz que o catálogo é RESTRITO, e
     * restrito passou a significar "concedido a quem o diretor marcar", não "só o diretor".
     *
     * A RESTRIÇÃO DELES MUDOU DE CASA E CONTINUA INTEIRA: `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER`
     * (bloco abaixo) fecha o bypass de ÁREA do MASTER, sem o qual todo MASTER de A&S ganharia os
     * sete sozinhos; e as sete controllers de administração são reivindicadas por menu, sem o que
     * remover o `@Roles` teria ABERTO as rotas (o `MenuGuard` é fail-open para operação sem dono).
     * Ver `as/catalogos-concediveis.rbac.spec.ts`, que prova as duas metades handler por handler.
     *
     * ─ POR QUE AS DUAS QUE SOBRARAM NÃO ENTRAM NA REGRA NOVA (decisão do diretor) ───────────────
     *
     * `usuarios` marca menu por usuário e cadastra ÁREA; `menu-areas` escreve a ÁREA de cada menu,
     * que é o teto aplicado por cima de tudo. São as telas que CONCEDEM permissão, e torná-las
     * concedíveis criaria caminho de AUTO-CONCESSÃO: quem recebesse passaria a poder conceder a si
     * mesmo qualquer outro menu, e a decisão individual deixaria de ser do diretor. As duas seguem
     * `@Roles("SUPER_ADMIN")` na controller, com `operacoes: []`.
     *
     * ESTA LISTA CONTINUA PINADA POR INTEIRO, e falhar ao acrescentar ou remover um código é o
     * comportamento desejado: entrar ou sair daqui é decisão do diretor (§A.23), nunca efeito
     * colateral de uma frente.
     */
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
      [...new Set([...MENUS_SOMENTE_SUPER_ADMIN, ...MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER])].sort(),
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

/**
 * ══ OS MENUS EM QUE O MASTER TAMBÉM PRECISA DA MARCAÇÃO (decisão do diretor, Dicas De Documento) ══
 *
 * O QUE ESTE BLOCO TRAVA, e os quatro casos são complementares:
 *  1. a lista é NOMINAL e só contém código que existe (nada de menu fantasma);
 *  2. ela é ADITIVA: todo menu FORA dela continua não exigindo marcação do MASTER;
 *  3. ela NÃO PODE ENCOSTAR em `MENUS_SOMENTE_SUPER_ADMIN`, porque as duas se contradizem: uma
 *     torna o menu concedível sob marcação, a outra o REMOVE da lista de quem não é SUPER_ADMIN,
 *     ou seja, o tornaria impossível de conceder. Juntas, entregariam uma tela que só o diretor
 *     usa para sempre, que é exatamente o que ele NÃO pediu;
 *  4. a porta do NASCIMENTO está fechada: `codigosPadraoDoPapel("MASTER")` não entrega o menu, e é
 *     essa função que o `criar` de usuário grava e o grandfather do `seed-menus.ts` distribui.
 */
describe("menus que exigem marcação explícita do MASTER", () => {
  it("todo código da lista EXISTE no registro (lista nominal, sem menu fantasma)", () => {
    for (const c of MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER) {
      expect(TODOS_CODIGOS_MENU).toContain(c);
    }
  });

  it("as Dicas De Documento estão na lista (o texto vai para a tela PÚBLICA do candidato)", () => {
    expect(masterPrecisaDeMarcacao("dicas-documento")).toBe(true);
  });

  /**
   * ─ A LISTA É PINADA POR INTEIRO, e ela CRESCEU quando a outra encolheu ──────────────────────────
   *
   * Os sete catálogos de configuração de A&S vieram de `MENUS_SOMENTE_SUPER_ADMIN` (regra do diretor,
   * 27/09/2026) e ESTA é a única casa que atende as duas exigências ao mesmo tempo: o menu NASCE só
   * para o SUPER_ADMIN (§A.23) e mesmo assim é CONCEDÍVEL, pessoa a pessoa.
   *
   * SEM A ENTRADA NOMINAL AQUI, TIRAR O `@Roles` DAS CONTROLLERS ENTREGARIA OS SETE A TODO MASTER DE
   * A&S: o `MenuGuard` deixa o MASTER passar por PERTENCER À ÁREA, sem marcação, e há MASTER na área
   * AS em produção. Não sobraria decisão individual nenhuma para o diretor tomar, que é o ponto
   * inteiro da regra dele.
   *
   * PINADA porque entrar aqui é decisão do diretor, nunca efeito colateral: a prova quebrar ao
   * acrescentar um código é o comportamento desejado.
   */
  it("a lista é EXATAMENTE as Dicas, os Motivos De Descarte, os sete catálogos de A&S e a Ajuda", () => {
    expect([...MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER].sort()).toEqual(
      [
        "dicas-documento",
        // CENTRAL DE AJUDA, e é o único da lista que não é catálogo de configuração: ela não tem
        // escrita para segurar (`operacoes: []`, o manual mora no frontend). Ela está aqui só para
        // cumprir a §A.23 ao pé da letra, porque sem a entrada nominal todo MASTER nasceria com o
        // menu por `codigosPadraoDoPapel`, que é concessão em massa decidida pela fábrica.
        "ajuda",
        "as-motivos-descarte",
        "as-etapas",
        "as-status-vaga",
        "as-motivos-cancelamento",
        "as-linhas-servico",
        "as-segmentos",
        "as-comerciais",
        "as-motivos-reenvio",
      ].sort(),
    );
  });

  /**
   * ─ OS MOTIVOS DE DESCARTE, E POR QUE ESTA É A ÚNICA CASA QUE ATENDE AS DUAS EXIGÊNCIAS ───────
   *
   * O DIRETOR PEDIU DUAS COISAS AO MESMO TEMPO, e elas parecem opostas: o menu NASCE só para o
   * SUPER_ADMIN (§A.23) e mesmo assim é CONCEDÍVEL, um a um, pela tela de permissões.
   *
   * As outras duas listas atendem a primeira QUEBRANDO a segunda:
   *   . `MENUS_SOMENTE_SUPER_ADMIN` some com o menu do `/auth/me` de quem não é SUPER_ADMIN, então
   *     a marcação do diretor seria gravada e não valeria nada;
   *   . `MENUS_BLOQUEADOS_COMUM` é filtrada ao SALVAR a config de um COMUM, então o menu nem chega
   *     a ser gravado para ele.
   *
   * Esta atende as duas: o menu não vem de nascença para MASTER nenhum (`baseDeMenusDoMaster` o
   * esconde, e é `codigosPadraoDoPapel` que o `criar` de usuário grava e o grandfather distribui),
   * o `MenuGuard` exige a marcação nominal inclusive do MASTER, e a marcação, quando existe,
   * sobrevive a todos os filtros. QUEM SEGURA A ROTA É O MENU: a
   * `MotivosDescarteAdminController` deixou de ter `@Roles`.
   */
  it("os Motivos De Descarte exigem marcação TAMBÉM do MASTER (senão todo MASTER de A&S edita)", () => {
    expect(masterPrecisaDeMarcacao("as-motivos-descarte")).toBe(true);
    // A PORTA DO NASCIMENTO, fechada nos três papéis que não são o dono do menu (§A.23).
    expect(codigosPadraoDoPapel("MASTER")).not.toContain("as-motivos-descarte");
    expect(codigosPadraoDoPapel("COMUM")).not.toContain("as-motivos-descarte");
    expect(MENUS_PADRAO_COMUM).not.toContain("as-motivos-descarte");
    expect(codigosPadraoDoPapel("SUPER_ADMIN")).toContain("as-motivos-descarte");
  });

  it("os Motivos De Descarte são CONCEDÍVEIS: nenhuma das duas listas de papel os trava", () => {
    // Se qualquer uma das duas voltar a conter o código, a concessão do diretor vira marcação
    // gravada e inútil, que é o defeito que esta frente foi feita para acabar.
    expect(MENUS_SOMENTE_SUPER_ADMIN.has("as-motivos-descarte")).toBe(false);
    expect(MENUS_BLOQUEADOS_COMUM.has("as-motivos-descarte")).toBe(false);
    // E a marcação sobrevive ao filtro por papel, nos dois papéis que podem recebê-la.
    expect(filtrarMenusPorPapel(["as-motivos-descarte"], "MASTER")).toEqual([
      "as-motivos-descarte",
    ]);
    expect(filtrarMenusPorPapel(["as-motivos-descarte"], "COMUM")).toEqual(["as-motivos-descarte"]);
    expect(baseDeMenusDoMaster(["as-motivos-descarte"])).toContain("as-motivos-descarte");
  });

  /**
   * ══ CENTRAL DE AJUDA: NASCE FECHADA, E É CONCEDÍVEL (§A.23) ═════════════════════════════════════
   *
   * O QUE ESTE CASO TRAVA, e nenhuma das metades bastaria sozinha:
   *  1. o menu não vem DE NASCENÇA para MASTER nem para COMUM. `codigosPadraoDoPapel` é o que o
   *     `criar` de usuário grava e o que o grandfather do `seed-menus.ts` distribui, então é ela que
   *     transformaria o registro em CONCESSÃO. Para o COMUM a trava é o grupo `ADMIN` (fora do padrão,
   *     que é só `OPERACAO`); para o MASTER é a entrada nominal em
   *     `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER`, sem a qual ele receberia a base inteira;
   *  2. e mesmo assim ele é CONCEDÍVEL aos dois papéis, porque estar em qualquer uma das outras duas
   *     listas faria a marcação do diretor ser descartada em silêncio (uma na leitura, outra na
   *     gravação), que é o defeito medido em 26/09/2026.
   *
   * A ÁREA ENTRA NO MESMO CASO porque é ela que decide QUEM enxerga depois de concedido: o manual
   * ensina o sistema INTEIRO, e carimbado só como ADM ele sumiria da barra do time de A&S mesmo
   * liberado, já que a área é um TETO aplicado por cima da marcação.
   */
  it("a CENTRAL DE AJUDA nasce fechada (nem MASTER nem COMUM), segue concedível, e é das DUAS áreas", () => {
    // 1. A PORTA DO NASCIMENTO, fechada nos dois papéis que não são o dono do menu (§A.23).
    expect(codigosPadraoDoPapel("MASTER")).not.toContain("ajuda");
    expect(codigosPadraoDoPapel("COMUM")).not.toContain("ajuda");
    expect(MENUS_PADRAO_COMUM).not.toContain("ajuda");
    // O SUPER_ADMIN é o dono do menu no dia em que ele nasce.
    expect(codigosPadraoDoPapel("SUPER_ADMIN")).toContain("ajuda");
    // A trava do COMUM é o GRUPO (o padrão é exatamente o grupo OPERACAO); a do MASTER é a nominal.
    expect(MENUS.find((m) => m.codigo === "ajuda")!.grupo).toBe("ADMIN");
    expect(masterPrecisaDeMarcacao("ajuda")).toBe(true);

    // 2. E CONTINUA CONCEDÍVEL: nenhuma das duas listas que TRAVAM a concessão o contém, e a marcação
    // sobrevive ao filtro por papel nos dois papéis que podem recebê-la.
    expect(MENUS_SOMENTE_SUPER_ADMIN.has("ajuda")).toBe(false);
    expect(MENUS_BLOQUEADOS_COMUM.has("ajuda")).toBe(false);
    expect(restricaoDeConcessao("ajuda")).toBe("NENHUMA");
    expect(filtrarMenusPorPapel(["ajuda"], "MASTER")).toEqual(["ajuda"]);
    expect(filtrarMenusPorPapel(["ajuda"], "COMUM")).toEqual(["ajuda"]);
    expect(baseDeMenusDoMaster(["ajuda"])).toContain("ajuda");

    // 3. AS DUAS ÁREAS, como o `inicio`: o manual ensina os dois lados do sistema.
    expect(areasDeNascimento(MENUS.find((m) => m.codigo === "ajuda")!)).toEqual(["ADM", "AS"]);
    // E por CONTER ADM, ele fica fora da lista de quem nasce FORA da Admissão, como o `inicio`.
    expect(MENUS_QUE_NASCEM_FORA_DA_ADM.has("ajuda")).toBe(false);

    // 4. NÃO REIVINDICA OPERAÇÃO NENHUMA, e isso é o desenho: o manual mora no frontend, tipado, sem
    // tabela, sem controller e sem rota de API. Se alguém acrescentar backend ao menu um dia, este
    // caso quebra antes, e a reivindicação passa a ser uma decisão em vez de um efeito.
    expect(MENUS.find((m) => m.codigo === "ajuda")!.operacoes).toEqual([]);
  });

  it("ADITIVA: nenhum menu FORA da lista passou a exigir marcação do MASTER", () => {
    for (const c of TODOS_CODIGOS_MENU) {
      if (MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER.has(c)) continue;
      expect(masterPrecisaDeMarcacao(c)).toBe(false);
    }
  });

  it("NÃO se cruza com MENUS_SOMENTE_SUPER_ADMIN: uma concede sob marcação, a outra impede conceder", () => {
    for (const c of MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER) {
      expect(MENUS_SOMENTE_SUPER_ADMIN.has(c)).toBe(false);
    }
  });

  it("o menu CONTINUA CONCEDÍVEL: o filtro por papel não o tira da lista de um MASTER marcado", () => {
    // É a diferença prática para o precedente das Etapas Do Funil. Uma marcação gravada no banco
    // sobrevive ao filtro, então a concessão do diretor vale de verdade.
    expect(filtrarMenusPorPapel(["dicas-documento", "esteira"], "MASTER")).toEqual([
      "dicas-documento",
      "esteira",
    ]);
    expect(filtrarMenusPorPapel(["dicas-documento"], "COMUM")).toEqual(["dicas-documento"]);
  });

  it("a base do MASTER esconde o menu nominal e revela o que ele TEM marcado", () => {
    expect(baseDeMenusDoMaster([])).not.toContain("dicas-documento");
    expect(baseDeMenusDoMaster(["dicas-documento"])).toContain("dicas-documento");
    // E não mexe em mais nada: a diferença é exatamente a lista nominal.
    expect(TODOS_CODIGOS_MENU.filter((c) => !baseDeMenusDoMaster([]).includes(c)).sort()).toEqual(
      [...MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER].sort(),
    );
  });

  it("A PORTA DO NASCIMENTO ESTÁ FECHADA: MASTER novo não nasce com o menu", () => {
    // `codigosPadraoDoPapel` é o que o `criar` de usuário grava e o que o grandfather do
    // `seed-menus.ts` distribui. Se ela entregasse a lista inteira, o MASTER recuperaria o menu por
    // outra porta e a trava do `MenuGuard` não adiantaria nada.
    expect(codigosPadraoDoPapel("MASTER")).not.toContain("dicas-documento");
    // O SUPER_ADMIN continua recebendo tudo: ele é o dono do menu no dia em que ele nasce (§A.23).
    expect(codigosPadraoDoPapel("SUPER_ADMIN")).toContain("dicas-documento");
    // E o COMUM segue como sempre: fora do padrão, porque é menu de Administração.
    expect(codigosPadraoDoPapel("COMUM")).not.toContain("dicas-documento");
    // ...mas CONCEDÍVEL, ou seja, fora do bloqueio do COMUM.
    expect(MENUS_BLOQUEADOS_COMUM.has("dicas-documento")).toBe(false);
  });
});

/**
 * ══ A RESTRIÇÃO DE CONCESSÃO QUE A TELA DE PERMISSÕES CONSOME, DERIVADA E NUNCA DIGITADA ══════════
 *
 * ┌─ O DEFEITO QUE ESTA FUNÇÃO EXISTE PARA MATAR, medido em 26/09/2026 ─────────────────────────┐
 * │ A tela de permissões guardava uma TERCEIRA cópia desta regra, escrita à mão dentro do       │
 * │ componente, com DOIS códigos, enquanto o backend aplicava ONZE. As duas divergiram, e o     │
 * │ resultado era o pior possível numa tela de concessão: a caixa aparecia MARCÁVEL, o diretor  │
 * │ marcava, a tela salvava SEM RECLAMAR e o servidor descartava em silêncio.                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS TESTES ABAIXO AFIRMAM A DERIVAÇÃO, não os valores de hoje um por um: é a derivação que faz um
 * menu novo nascer com a resposta certa sem ninguém lembrar de atualizar a tela, e é ela que impede a
 * divergência de voltar. Um valor pinado à mão aqui seria a QUARTA cópia do mesmo problema.
 */
describe("a restrição de concessão que desce para a tela", () => {
  it("todo menu do registro recebe uma resposta, e ela é um dos três valores", () => {
    for (const c of TODOS_CODIGOS_MENU) {
      expect(["NENHUMA", "SO_SUPER_ADMIN", "NAO_PARA_COMUM"], c).toContain(
        restricaoDeConcessao(c),
      );
    }
  });

  it("é DERIVADA das duas listas, nos dois sentidos", () => {
    for (const c of TODOS_CODIGOS_MENU) {
      const r = restricaoDeConcessao(c);
      if (MENUS_SOMENTE_SUPER_ADMIN.has(c)) expect(r, c).toBe("SO_SUPER_ADMIN");
      else if (MENUS_BLOQUEADOS_COMUM.has(c)) expect(r, c).toBe("NAO_PARA_COMUM");
      else expect(r, c).toBe("NENHUMA");
    }
  });

  /**
   * A ORDEM IMPORTA, e o caso existe de verdade: `usuarios` e `menu-areas` estão nas DUAS listas.
   * Responder `NAO_PARA_COMUM` ali sugeriria que o MASTER receberia, que é falso, e a tela
   * habilitaria a caixa para ele.
   */
  it("menu nas DUAS listas responde SO_SUPER_ADMIN, que é a mais forte", () => {
    for (const c of ["usuarios", "menu-areas"]) {
      expect(MENUS_SOMENTE_SUPER_ADMIN.has(c), c).toBe(true);
      expect(MENUS_BLOQUEADOS_COMUM.has(c), c).toBe(true);
      expect(restricaoDeConcessao(c)).toBe("SO_SUPER_ADMIN");
    }
  });

  /**
   * ═ `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER` NÃO ENTRA NA DERIVAÇÃO, E A AUSÊNCIA É O PONTO ═══════
   *
   * Ela não RESTRINGE a concessão, ela a EXIGE (o menu deixa de vir de graça pelo papel). Tratá-la
   * como restrição desabilitaria na tela exatamente as caixas que o diretor precisa marcar, e os sete
   * catálogos de A&S voltariam a ser inconcedíveis por outro caminho.
   */
  it("exigir marcação do MASTER NÃO é restrição: os menus dessa lista são concedíveis", () => {
    for (const c of MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER) {
      expect(restricaoDeConcessao(c), c).toBe("NENHUMA");
    }
  });

  it("menu que não existe no registro responde NENHUMA, sem estourar", () => {
    // A tela lê a TABELA, que pode ter uma linha que o código já não conhece (menu apagado do
    // registro e ainda ativo no banco). Responder em vez de lançar mantém a tela de pé.
    expect(restricaoDeConcessao("menu-que-nao-existe")).toBe("NENHUMA");
  });
});
