// @vitest-environment happy-dom
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * ─ OS QUATRO RÓTULOS DA VAGA, PRESOS EM TESTE (OST da Central de Vagas, item 3) ────────────────
 *
 * O diretor renomeou quatro rótulos de tela, e SÓ o rótulo:
 *   Nome De Divulgação -> Nome Da Vaga
 *   Natureza           -> Tipo De Vaga
 *   Sazonalidade       -> Tipo De Processo
 *   Linha De Serviço   -> Célula De Atendimento
 *
 * ┌─ O QUE **NÃO** MUDOU, e é a metade da OST que protege o sistema ────────────────────────────┐
 * │ Coluna de banco, campo de DTO, chave de objeto e código de catálogo continuam com o nome     │
 * │ antigo (`nomeDivulgacao`, `natureza`, `sazonalidade`, `linhaServicoId`), e as ÂNCORAS dos     │
 * │ campos também (`vaga-natureza`, `vaga-sazonalidade`, `vaga-linha-servico`): é a âncora que    │
 * │ liga a pendência clicável ao campo, e trocá-la romperia esse par por ganho de tela nenhum.    │
 * │ Quem "terminar o renomeio" mexendo nelas quebra o corpo do POST ou a pendência clicável, e é  │
 * │ esta afirmação que fica vermelha.                                                            │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE FICOU FORA, de propósito, e o coordenador precisa saber ─────────────────────────────┐
 * │ 1. O MENU e a tela de catálogo `Linhas De Serviço` (`/admin/as/linhas-servico`): a OST não os │
 * │    listou e a §A.14 protege nome de menu. Renomear ali é decisão do diretor.                  │
 * │ 2. A lista de PENDÊNCIAS DA PUBLICAÇÃO, cujos rótulos moram no `shared-types`, que tem DONO   │
 * │    ÚNICO nesta frente (§A.39). Enquanto o dono não os trocar, a pendência da publicação vai   │
 * │    seguir dizendo os nomes antigos. A única das quatro que a camada de tela alcança é a célula │
 * │    de atendimento, e ela está afirmada aqui embaixo.                                          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */

import type { AsVagaStatus } from "@/lib/as-status-vaga";
import type { CatalogosDaTrilha } from "./TrilhaDaVaga";

vi.mock("@/lib/api", async () => {
  const real = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...real, apiFetch: vi.fn(async () => ({ id: "vaga-1" })) };
});

/** A cidade depende da UF do formulário e sairia buscando pela rede. Não é o assunto daqui. */
vi.mock("@/lib/as-cidades", async () => {
  const real = await vi.importActual<typeof import("@/lib/as-cidades")>("@/lib/as-cidades");
  return { ...real, useCidades: () => ({ cidades: [], carregando: false, erro: null }) };
});

import { TrilhaDaVaga } from "./TrilhaDaVaga";

const STATUS_ABERTA = {
  id: 1,
  codigo: "ABERTA",
  rotulo: "Aberta",
  ordem: 1,
  tom: "ok",
  daTrilha: true,
  encerra: false,
  recebeCandidato: true,
  papel: null,
  ativo: true,
} as unknown as AsVagaStatus;

const CATALOGOS: CatalogosDaTrilha = {
  opcoes: {
    cargos: [{ id: "c1", nome: "Operador" }],
    clientes: [],
    beneficios: [],
    motivos: ["Aumento de quadro"],
    consultores: [],
    escalas: ["12x36"],
    comerciais: [],
  },
  contexto: { papelAs: "CONSULTOR", nome: "Fulano", contraparte: [] },
  segmentos: [],
  optClientes: [{ value: "1", label: "Cliente Um" }],
  optCargos: [{ value: "c1", label: "Operador" }],
  statusVaga: [STATUS_ABERTA],
  /** UMA célula ativa, para o seletor abrir com opção em vez de com o aviso de catálogo vazio. */
  linhasAtivas: [{ id: 1, rotulo: "Atendimento", ativo: true } as never],
  carregandoLinhas: false,
};

/** O primeiro passo da trilha, que é onde os quatro rótulos vivem. */
function montarTrilha() {
  render(
    <TrilhaDaVaga
      modo={{ tipo: "nova" }}
      catalogos={CATALOGOS}
      token="t"
      onFechar={vi.fn()}
      onGravada={vi.fn()}
    />,
  );
}

/**
 * A RAIZ DE `src`, RESOLVIDA PELO DIRETÓRIO DE TRABALHO e não por `import.meta.url`: sob happy-dom o
 * `URL` é o do DOM, que resolve relativo ao documento e não serve para abrir arquivo. As duas
 * tentativas cobrem rodar de `apps/frontend` e rodar da raiz do monorepo.
 */
const SRC = [join(process.cwd(), "src"), join(process.cwd(), "apps", "frontend", "src")].find((c) =>
  existsSync(c),
) as string;
function fonte(caminho: string): string {
  return readFileSync(join(SRC, caminho), "utf8");
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("a trilha de abertura de vaga", () => {
  it.each(["Nome da vaga", "Tipo de vaga", "Tipo de processo", "Célula de atendimento"])(
    'pergunta pelo rótulo novo "%s"',
    (rotulo) => {
      montarTrilha();
      expect(screen.getByText(rotulo)).toBeTruthy();
    },
  );

  it.each(["Nome de divulgação", "Natureza", "Sazonalidade", "Linha de serviço"])(
    'não pergunta mais pelo rótulo antigo "%s"',
    (rotulo) => {
      montarTrilha();
      expect(screen.queryByText(rotulo)).toBeNull();
    },
  );

  /** As âncoras são id, não texto: elas são o par da pendência clicável. */
  it.each(["vaga-nome-divulgacao", "vaga-natureza", "vaga-sazonalidade", "vaga-linha-servico"])(
    'mantém a âncora "%s", que a pendência clicável usa',
    (ancora) => {
      montarTrilha();
      /* `document` e não o `container` do render: a trilha vive dentro do `Modal`, que monta em
         portal, então o nó fica fora da árvore devolvida pelo `render`. */
      expect(document.querySelector(`#${ancora}`)).toBeTruthy();
    },
  );

  /**
   * OS NOMES DOS CAMPOS, afirmados na FONTE porque é ali que o renomeio erraria: um `rotulo` trocado
   * é tela, um `form.natureza` trocado é o corpo do POST deixando de casar com o DTO.
   */
  it("continua carregando os MESMOS campos, que são contrato e não rótulo", () => {
    const trilha = fonte("components/as/vagas/TrilhaDaVaga.tsx");
    for (const campo of ["nomeDivulgacao", "natureza", "sazonalidade", "linhaServicoId"]) {
      expect(trilha).toContain(`form.${campo}`);
    }
  });
});

/**
 * AS DUAS TELAS DE LEITURA são afirmadas na FONTE, e não renderizadas: são páginas do App Router,
 * que buscam a própria lista na montagem, e montá-las para conferir três palavras exigiria dublar a
 * tela inteira. O rótulo chega pelo atributo `rotulo=`, e é ele que se lê. A busca é pelo ATRIBUTO
 * justamente para não casar a palavra solta no meio de um comentário, que daria falso vermelho.
 */
describe("a ficha da vaga, na Central de Vagas", () => {
  const pagina = fonte("app/(app)/as/vagas/page.tsx");

  it.each(["Tipo de vaga", "Tipo de processo", "Célula de atendimento"])(
    'lê de volta pelo rótulo novo "%s"',
    (rotulo) => {
      expect(pagina).toContain(`rotulo="${rotulo}"`);
    },
  );

  it.each(["Nome de divulgação", "Natureza", "Sazonalidade", "Linha de serviço"])(
    'não lê mais pelo rótulo antigo "%s"',
    (rotulo) => {
      expect(pagina).not.toContain(`rotulo="${rotulo}"`);
    },
  );
});

describe("a fila de vagas pendentes de revisão", () => {
  const pagina = fonte("app/(app)/as/vagas-pendentes-revisao/page.tsx");

  /** A coluna da tabela é TÍTULO, então ela vai em title case (§A.24). */
  it("tem a coluna Nome Da Vaga, e não mais a antiga", () => {
    expect(pagina).toContain("Nome Da Vaga");
    expect(pagina).not.toContain("Nome De Divulgação");
  });

  it("e a ficha ao lado pergunta pelo rótulo novo", () => {
    expect(pagina).toContain('rotulo="Nome da vaga"');
    expect(pagina).not.toContain('rotulo="Nome de divulgação"');
  });
});

describe("a pendência da célula de atendimento", () => {
  it("já lista a pendência com o nome novo", () => {
    expect(fonte("lib/as-linhas-servico.ts")).toContain('rotulo: "Célula de atendimento"');
  });
});
