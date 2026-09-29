/**
 * ─ O MENU AJUDA NA BARRA, PARA TODOS, SEM CONCESSÃO (decisão do diretor, 28/09/2026) ─────────────
 *
 * ESCRITO PELO `tester` (§A.38). O requisito tem DUAS metades, e a segunda é a que costuma se perder:
 *   1. a barra DESENHA o item para QUALQUER usuário, inclusive o COMUM sem nenhum menu administrativo;
 *   2. a ROTA continua aberta, isto é, `/ajuda` continua SEM par em `ROTA_MENU`.
 *
 * ┌─ POR QUE AS DUAS JUNTAS, E O QUE ACONTECE SE UMA SÓ FOR FEITA ───────────────────────────────┐
 * │ Desenhar o item sem a rota aberta entrega um atalho que leva a um "sem permissão", que é pior    │
 * │ que não ter o item. Abrir a rota sem desenhar o item é o estado de ontem: a tela existe e ninguém │
 * │ a acha. E acrescentar um par em `ROTA_MENU` "para ficar coerente" é a regressão provável desta     │
 * │ frente: ela trancaria a Ajuda atrás de uma concessão, o oposto do que o diretor pediu.             │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A PRIMEIRA METADE É **ASSERÇÃO DE FONTE**, E ISSO ESTÁ DITO SEM MAQUIAGEM ───────────────────┐
 * │ Um teste de RENDER da `Sidebar` seria mais forte, e não cabe aqui: ela importa por `@/…`, e o     │
 * │ alias só existe no `vitest.config.ts` do frontend, que não é o config com que esta pasta é         │
 * │ rodada. Escrever o render obrigaria a trocar o comando da suíte inteira por causa de um arquivo.   │
 * │                                                                                                │
 * │ Então a asserção é sobre o CÓDIGO da barra, e ela prova uma coisa precisa: o item está no NÍVEL   │
 * │ DE CIMA do JSX, fora de qualquer `{condição && …}`. É essa a diferença entre "todos veem" e "quem  │
 * │ tem alguma coisa vê", e é ela que a fonte mostra. Quem pinta é a prova visual do coordenador       │
 * │ (§A.13), que não se delega.                                                                      │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ §A.23 ESTÁ RESPEITADA, E É BOM DIZER POR QUÊ ───────────────────────────────────────────────┐
 * │ Visibilidade de atalho de LEITURA não é concessão de operação: o menu `ajuda` continua no        │
 * │ registro, continua governando o CARD do `/admin` e continua liberado usuário por usuário pelo     │
 * │ diretor. O que esta frente muda é só a BARRA, e nenhum seed de concessão roda.                    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { menuDaRota } from "../lib/menu-rotas";

const RAIZ_REPO = path.resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const SIDEBAR = path.join(RAIZ_REPO, "apps/frontend/src/components/shell/Sidebar.tsx");
const ROTAS_DE_MENU = path.join(RAIZ_REPO, "apps/frontend/src/lib/menu-rotas.ts");
const SPEC_DAS_ROTAS = path.join(RAIZ_REPO, "apps/frontend/src/lib/menu-rotas.spec.ts");

/** Sem comentário de JSX (`{/* … *\/}`) nem de bloco: eles desequilibram a contagem de chaves. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
}

/**
 * ─ A PROFUNDIDADE DE CHAVES ATÉ UM PONTO DO JSX, E POR QUE ELA É A MEDIDA CERTA ─────────────────
 *
 * Todo grupo da barra é `{condição && (…)}`: enquanto o grupo está aberto, existe UMA chave sem fechar.
 * Então "profundidade 0" no ponto do item significa, literalmente, "não está dentro de condição
 * nenhuma", que é exatamente o requisito do diretor. Atributo (`className={cn(…)}`) é balanceado e não
 * afeta a conta.
 */
function profundidadeDeChaves(fonte: string, ate: number): number {
  let nivel = 0;
  for (let i = 0; i < ate; i += 1) {
    if (fonte[i] === "{") nivel += 1;
    if (fonte[i] === "}") nivel -= 1;
  }
  return nivel;
}

describe("ASSERÇÃO DE FONTE: a barra desenha a Ajuda sem condição nenhuma", () => {
  const fonte = semComentarios(readFileSync(SIDEBAR, "utf8"));
  const posicao = fonte.indexOf('href="/ajuda"');

  it("existe um item de navegação para `/ajuda` na barra", () => {
    expect(posicao, "a barra não tem item para /ajuda").toBeGreaterThan(-1);
    const elemento = fonte.slice(fonte.lastIndexOf("<", posicao), fonte.indexOf("/>", posicao) + 2);
    expect(elemento).toContain("<NavItem");
    expect(elemento).toMatch(/label="Ajuda"/);
  });

  /**
   * ESTE É O TESTE DA FRENTE. Dentro do grupo Administração o item existiria e o consultor COMUM sem
   * menu administrativo não veria NADA, porque o grupo inteiro depende de `temAdministracao`. É o
   * defeito mais provável, porque é o lugar "natural" de encostar o item novo.
   */
  it("o item está no nível de cima do JSX, FORA de qualquer `{condição && …}`", () => {
    const abreReturn = fonte.indexOf("return (", fonte.indexOf("export function Sidebar"));
    expect(abreReturn).toBeGreaterThan(-1);
    const trecho = fonte.slice(abreReturn, posicao);
    expect(
      profundidadeDeChaves(fonte.slice(abreReturn), posicao - abreReturn),
      "o item da Ajuda está dentro de um bloco condicional: quem não satisfaz a condição não o vê",
    ).toBe(0);
    // E, por garantia de leitura, a condição do grupo Administração fica ANTES dele e já fechou.
    expect(trecho).toContain("temAdministracao");
  });

  /**
   * NENHUMA RÉGUA DE PERMISSÃO NO ITEM. `temMenu("ajuda")` ou `isAdmin` ali seria a concessão voltando
   * pela porta de trás, com o item existindo no código e invisível para quase todo mundo.
   */
  it("o item não consulta `temMenu` nem `isAdmin`", () => {
    const elemento = fonte.slice(fonte.lastIndexOf("<NavItem", posicao), fonte.indexOf("/>", posicao) + 2);
    expect(elemento).not.toContain("temMenu");
    expect(elemento).not.toContain("isAdmin");
  });
});

describe("a ROTA da Ajuda continua aberta, e o teste que já existia continua lá", () => {
  /**
   * COMPORTAMENTAL, e duplica de propósito a asserção de `lib/menu-rotas.spec.ts`: o risco real desta
   * OST é alguém "fechar o par" ao ver o item novo na barra, e a asserção repetida aqui, ao lado do
   * item, é a que fala com quem estiver olhando a barra.
   */
  it("`menuDaRota` devolve nulo para `/ajuda` e para o artigo", () => {
    expect(menuDaRota("/ajuda")).toBeNull();
    expect(menuDaRota("/ajuda/anexar-o-aso-no-exame")).toBeNull();
  });

  it("`ROTA_MENU` não ganhou par para `/ajuda`", () => {
    const fonte = semComentarios(readFileSync(ROTAS_DE_MENU, "utf8"));
    const bloco = fonte.slice(fonte.indexOf("ROTA_MENU"), fonte.indexOf("export function menuDaRota"));
    expect(bloco).not.toMatch(/prefixo:\s*"\/ajuda"/);
  });

  /**
   * O TESTE ALHEIO CONTINUA DE PÉ, e conferir isso é legítimo: enfraquecer a asserção de lá seria a
   * forma silenciosa de "resolver" um vermelho, e ninguém olharia um arquivo que não mudou de tamanho.
   */
  it("`menu-rotas.spec.ts` continua afirmando o nulo, sem enfraquecimento", () => {
    const fonte = readFileSync(SPEC_DAS_ROTAS, "utf8");
    expect(fonte).toContain('expect(menuDaRota("/ajuda")).toBeNull()');
    expect(fonte).toContain('expect(menuDaRota("/ajuda/anexar-o-aso-no-exame")).toBeNull()');
    expect(fonte).not.toMatch(/\.(skip|todo)\s*\(/);
  });
});
