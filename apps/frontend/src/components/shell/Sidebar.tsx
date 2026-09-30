"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { Papel } from "@ea/shared-types";
import { useAuth } from "@/lib/auth-context";
import { podeAbrirAdministracao } from "@/lib/admin-menus";
import { cn } from "@/lib/cn";
import { LogoSou } from "@/components/ui/LogoSou";
import { NavItem } from "@/components/ui/NavItem";
import { useLiberacaoCount } from "./LiberacaoAlerta";
import { useDiagnosticoAlerta } from "./DiagnosticoAlerta";
import { useRevisaoCount } from "./RevisaoAlerta";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
// A LISTA DE DESTINOS MORA EM `lib/navegacao`, e não mais aqui: a TELA INICIAL monta os cards
// dela a partir da MESMA lista, então barra e home não têm como discordar sobre o que a pessoa
// enxerga. Ver o cabeçalho daquele arquivo. A régua de permissão não mudou: continua `temMenu`.
import {
  OPERACAO,
  GERADOR_KIT,
  ASSINATURAS,
  BENEFICIOS,
  SELECAO,
  ADMINISTRACAO,
} from "@/lib/navegacao";

const PAPEL_ROTULO: Record<Papel, string> = {
  SUPER_ADMIN: "Super Admin",
  MASTER: "Master",
  COMUM: "Consultor",
};

const STORAGE_KEY = "ea-sidebar-pinned";


/** Deriva um nome de exibição a partir do e-mail (sem cadastro de nome na Fase 1A). */
function displayName(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const { user, isAdmin, temMenu, logout } = useAuth();
  const liberacaoCount = useLiberacaoCount();
  const revisaoCount = useRevisaoCount();
  const diagAlerta = useDiagnosticoAlerta();
  const pathname = usePathname();
  const router = useRouter();

  // Preferência de fixação (congelar) persistida por usuário em localStorage (mesmo padrão do tema).
  const [pinned, setPinned] = useState(true);
  const [hovering, setHovering] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) setPinned(saved === "true");
  }, []);
  function togglePin() {
    setPinned((p) => {
      const next = !p;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }
  // Fixado = sempre expandido. Desafixado = recolhido; expande ao passar o mouse (temporário).
  const expanded = pinned || hovering;

  // Itens de Operação que ESTA pessoa vê. Calculado antes porque o cabeçalho do grupo depende
  // de haver algum: filtrar duas vezes deixaria as duas decisões livres para divergir.
  const operacaoVisivel = [...OPERACAO, GERADOR_KIT, ASSINATURAS, BENEFICIOS].filter((n) =>
    temMenu(n.codigo),
  );
  const temSelecao = SELECAO.some((n) => temMenu(n.codigo));
  // OS ITENS PRÓPRIOS DA ADMINISTRAÇÃO seguem a régua de sempre, `temMenu` do código de cada um. O
  // HUB tem a régua dele (admin ou algum menu da camada `/admin`), e a seção existe se houver
  // qualquer um dos dois: trocar um item de seção não pode trocar quem o enxerga (§A.23).
  const administracaoVisivel = ADMINISTRACAO.filter((n) => temMenu(n.codigo));
  const temHubGerencial = isAdmin || podeAbrirAdministracao(temMenu);
  const temAdministracao = temHubGerencial || administracaoVisivel.length > 0;
  // O SEPARADOR É DIVISOR ENTRE GRUPOS, então só existe se veio grupo antes dele. Sem isto, o
  // consultor só de A&S abriria a barra com um risco solto logo abaixo do logo.
  const temAlgoAcimaDeSelecao = operacaoVisivel.length > 0;
  const temAlgoAcimaDeAdministracao = temAlgoAcimaDeSelecao || temSelecao;

  const name = user ? displayName(user.email) : "não informado";
  const initial = name.charAt(0).toUpperCase() || "?";
  const papel = user ? PAPEL_ROTULO[user.papel] : "";

  // Botão de recolher/fixar, reusado no topo (mesmo elemento nos dois estados do menu).
  const toggleBtn = (
    <button
      type="button"
      onClick={togglePin}
      aria-label={pinned ? "Recolher menu" : "Fixar menu expandido"}
      title={pinned ? "Recolher menu" : "Fixar menu expandido"}
      aria-pressed={pinned}
      className="grid h-8 w-8 flex-none place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-text"
    >
      <Icon name={expanded ? "left" : "right"} className="h-[18px] w-[18px]" />
    </button>
  );

  return (
    <aside
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      /*
       * ─ A BARRA ROLA POR DENTRO, E É ISSO QUE ELIMINA O SEGUNDO SCROLL DA PÁGINA ─────────────────
       *
       * ┌─ O DEFEITO, MEDIDO E NÃO DEDUZIDO (30/09/2026) ──────────────────────────────────────────┐
       * │ Sem `max-h` e sem `overflow`, esta barra cresce com o número de menus da pessoa e EMPURRA  │
       * │ a casca inteira: medido em 1321 pixels de altura, contra uma janela de 1000. A casca é      │
       * │ `min-h-screen`, então ela acompanha, e o DOCUMENTO passa a rolar. Como o `<main>` já tem o  │
       * │ scroll dele, a tela fica com DOIS, e o de fora é o que estraga: rolar o documento levanta o │
       * │ `<main>` (que é `max-h-screen`, ancorado no topo) e deixa uma faixa morta embaixo, onde os  │
       * │ cards somem.                                                                                │
       * │                                                                                             │
       * │ REPRODUZIDO em 1600x1000 e 1536x720; em 1366x640 NÃO aparece, porque aí a barra encolhe     │
       * │ para 606 pixels e cabe. Era por isso que o defeito parecia intermitente: ele depende da      │
       * │ ALTURA da janela e da QUANTIDADE DE MENUS da pessoa, não da tela que está aberta.           │
       * └─────────────────────────────────────────────────────────────────────────────────────────────┘
       *
       * A CORREÇÃO É DAR ROLAGEM PRÓPRIA À BARRA, e não mexer no `<main>`: assim a casca nunca passa
       * da altura da janela, o documento para de rolar e sobra UM scroll só, o do conteúdo. De quebra
       * conserta um incômodo antigo: com menu longo, alcançar os itens de baixo exigia rolar a PÁGINA,
       * o que arrastava o conteúdo junto.
       *
       * POR QUE `overflow` AQUI NÃO CORTA NADA: esta barra não tem nenhum filho `absolute` nem
       * `fixed` (conferido por varredura antes de mexer), então não há popover para ser recortado. O
       * dia em que nascer um, ele precisa sair daqui ou virar camada própria.
       *
       * ┌─ A BARRA ROLA, MAS NÃO SE VÊ: `ea-scroll-oculto` ──────────────────────────────────────┐
       * │ Decisão do diretor: a barra de rolagem NÃO pode aparecer no menu. A do navegador vinha    │
       * │ cinza escura, colada na moldura de vidro, e destoava do tema em que a pessoa está.         │
       * │                                                                                            │
       * │ NÃO É O MESMO QUE TIRAR A ROLAGEM, e a diferença importa: roda do mouse, arraste, teclado  │
       * │ e leitor de tela continuam inteiros. Some o desenho, nunca o comportamento.                 │
       * │                                                                                            │
       * │ E NÃO VALE PARA TODA ÁREA QUE ROLA. A tabela usa a irmã VISÍVEL (`ea-scroll`), porque lá a │
       * │ barra é a única pista de que existe coluna fora do quadro. Aqui não é: a lista é curta,     │
       * │ conhecida, e o item cortado na borda já anuncia que há mais abaixo.                         │
       * └──────────────────────────────────────────────────────────────────────────────────────────┘
       */
      className={cn(
        "glass side ea-scroll-oculto z-[20] m-4 mr-0 flex max-h-[calc(100vh-2rem)] shrink-0 flex-col gap-1.5 overflow-y-auto overflow-x-hidden transition-[width] duration-200",
        expanded ? "w-[248px] p-[22px_16px]" : "w-[76px] p-[22px_12px]",
      )}
    >
      {/* Topo: o logo do SOU + botão recolher/fixar (setas). Qual logo aparece depende do ACESSO da
          pessoa (ver LogoSou): quem só faz A&S vê SOU Talent, quem só faz admissão vê SOU Adm, quem
          faz os dois vê os dois lado a lado, e o super admin vê SOUOperações. Recolhido mostra só
          o símbolo, que é neutro e serve a qualquer acesso. */}
      {expanded ? (
        <div className="mb-[18px] flex items-center gap-1">
          {/* ESPAÇADOR ESPELHO do botão de recolher (ajuste do diretor: o logo estava travado no
              canto esquerdo). Centrar o logo com o botão sozinho na linha exigiria tirá-lo do fluxo,
              e aí o lockup duplo (SOU Talent + SOU Adm, o mais largo) passaria por baixo dele. Com
              um espelho de 32px do outro lado, o logo centra no espaço que sobra e nada se cruza. */}
          <span aria-hidden className="h-8 w-8 flex-none" />
          <LogoSou variant="full" className="min-w-0 flex-1" />
          {toggleBtn}
        </div>
      ) : (
        <div className="mb-[18px] flex flex-col items-center gap-2">
          <LogoSou variant="symbol" />
          {toggleBtn}
        </div>
      )}

      {/* OST permissão de menu: a barra mostra SÓ os menus que o usuário tem (admin vê tudo por
          bypass). O Gerador de kit deixou de depender de `isAdmin` e passou ao menu `gerador-kit`.

          O CABEÇALHO SÓ APARECE SE SOBROU ITEM, igual ao grupo de Atração e Seleção logo abaixo.
          Antes ele era desenhado sempre, então quem não tem NENHUM menu de Operação (o consultor
          só de A&S) via a palavra "OPERAÇÃO" sozinha sobre o vazio, com o separador. */}
      {operacaoVisivel.length > 0 && (
        <>
          <div className={cn("nav-label", !expanded && "hidden")}>Operação</div>
          {operacaoVisivel.map((n) => (
            <NavItem
              key={n.href}
              {...n}
              active={isActive(pathname, n.href)}
              expanded={expanded}
              badge={n.href === "/liberacao" ? liberacaoCount : 0}
            />
          ))}
        </>
      )}

      {/* Atração e Seleção: a seção só existe para quem tem ao menos um menu do grupo, então ela não
          abre um cabeçalho órfão sobre uma lista vazia para o time da Admissão. */}
      {temSelecao && (
        <>
          {temAlgoAcimaDeSelecao && <div className="nav-sep" />}
          <div className={cn("nav-label", !expanded && "hidden")}>Atração e Seleção</div>
          {SELECAO.filter((n) => temMenu(n.codigo)).map((n) => {
            // LIBERAR VAGA ganha o MESMO tratamento visual da Liberação Admissional: badge vermelho
            // com contador E a faixa vermelha de fundo (prop `critical`). A faixa fica sempre ligada,
            // igual ao Liberacao Admissional (critical estatico); o badge mostra o contador de vagas em revisao.
            const ehRevisao = n.href === "/as/vagas-pendentes-revisao";
            return (
              <NavItem
                key={n.href}
                {...n}
                active={isActive(pathname, n.href)}
                expanded={expanded}
                badge={ehRevisao ? revisaoCount : 0}
                critical={n.critical}
              />
            );
          })}
        </>
      )}

      {/* Administração: o card "Menu Gerencial" aparece para admin OU para quem tem ao menos um menu
          administrativo (ex.: a consultora de auditoria com Regras + Régua). */}
      {temAdministracao && (
        <>
          {temAlgoAcimaDeAdministracao && <div className="nav-sep" />}
          <div className={cn("nav-label", !expanded && "hidden")}>Administração</div>
          {temHubGerencial && (
            <NavItem
              href="/admin"
              icon="cog"
              label="Menu Gerencial"
              active={isActive(pathname, "/admin")}
              expanded={expanded}
              badge={diagAlerta.total}
            />
          )}
          {administracaoVisivel.map((n) => (
            <NavItem
              key={n.href}
              {...n}
              active={isActive(pathname, n.href)}
              expanded={expanded}
              badge={0}
            />
          ))}
        </>
      )}

      {/* AJUDA, VISÍVEL PARA TODOS, SEM CONCESSÃO (decisão do diretor de 28/09/2026). É o único item
          da barra desenhado INCONDICIONALMENTE, de propósito: ajuda é para todo mundo, então ela não
          passa por `temMenu` nem espera liberação na tela de permissões.

          ISTO NÃO CONCEDE OPERAÇÃO NENHUMA (§A.23): o menu `ajuda` é `operacoes: []`, e a rota
          `/ajuda` já é aberta a qualquer autenticado, fora de `ROTA_MENU` (`lib/menu-rotas`) por
          desenho. O que se acrescenta aqui é só o atalho de leitura.

          O MENU `ajuda` CONTINUA GOVERNANDO O CARD do Menu Gerencial (`admin/page.tsx`), que é OUTRA
          porta e segue sob a decisão do diretor, usuário por usuário. Não mexer numa porta ao mexer
          na outra.

          Fica FORA do grupo Administração e DEPOIS dele: dentro do grupo, o consultor COMUM sem menu
          administrativo não veria nada, porque o grupo inteiro depende de `temAdministracao`. Bloco
          próprio, sem cabeçalho, porque é um item só. O separador segue a régua dos outros grupos,
          existe apenas quando veio algo acima. */}
      {(temAlgoAcimaDeAdministracao || temAdministracao) && <div className="nav-sep" />}
      <NavItem
        href="/ajuda"
        icon="bulb"
        label="Ajuda"
        active={isActive(pathname, "/ajuda")}
        expanded={expanded}
        badge={0}
      />

      <div className={cn("side-user mt-auto", !expanded && "justify-center !px-1.5")}>
        <div className="av">{initial}</div>
        {expanded && (
          <div className="leading-tight">
            <b className="block text-[13px] font-semibold">{name}</b>
            <small className="text-[11px] text-faint">{papel}</small>
          </div>
        )}
      </div>

      <div className={cn("mt-2 flex gap-2", expanded ? "" : "flex-col items-center")}>
        {expanded ? (
          <Button
            variant="secondary"
            className="flex-1 px-3 py-2 text-[13px]"
            onClick={() => logout().then(() => router.replace("/login"))}
          >
            Sair
          </Button>
        ) : (
          <button
            type="button"
            onClick={() => logout().then(() => router.replace("/login"))}
            aria-label="Sair"
            title="Sair"
            className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-dim transition hover:bg-[var(--surface-2)] hover:text-text"
          >
            <Icon name="logout" className="h-[17px] w-[17px]" />
          </button>
        )}
        <ThemeToggle />
      </div>
    </aside>
  );
}
