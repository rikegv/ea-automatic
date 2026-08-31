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
  const temAdministracao = isAdmin || podeAbrirAdministracao(temMenu);
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
      className={cn(
        "glass side z-[20] m-4 mr-0 flex shrink-0 flex-col gap-1.5 transition-[width] duration-200",
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
          {SELECAO.filter((n) => temMenu(n.codigo)).map((n) => (
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

      {/* Administração: o card "Menu Gerencial" aparece para admin OU para quem tem ao menos um menu
          administrativo (ex.: a consultora de auditoria com Regras + Régua). */}
      {temAdministracao && (
        <>
          {temAlgoAcimaDeAdministracao && <div className="nav-sep" />}
          <div className={cn("nav-label", !expanded && "hidden")}>Administração</div>
          <NavItem
            href="/admin"
            icon="cog"
            label="Menu Gerencial"
            active={isActive(pathname, "/admin")}
            expanded={expanded}
            badge={diagAlerta.total}
          />
        </>
      )}

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
