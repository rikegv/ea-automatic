"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { artigosDaRota } from "@/ajuda/registro";
import { PainelDeAjuda } from "./PainelDeAjuda";

/**
 * ─ O BOTÃO DE AJUDA DA TELA, E POR QUE ELE MORA NO CABEÇALHO COMPARTILHADO ─────────────────────
 *
 * Ele está dentro do `PageHead`, que 45 das 52 telas do sistema já usam e que resolve a rota sozinho.
 * Colocado aqui, o botão nasce nessas 45 telas SEM nenhuma delas ser editada, e a próxima tela que
 * nascer ganha o botão de graça. É o mesmo desenho que o modal do sistema usou: a regra mora no
 * componente, não na disciplina de quem edita a tela.
 *
 * ┌─ ELE APARECE SÓ ONDE EXISTE ARTIGO, E ISSO NÃO É ECONOMIA, É HONESTIDADE ────────────────────┐
 * │ Botão de ajuda que abre um painel vazio ensina a pessoa que a ajuda não serve, e ela não       │
 * │ clica de novo na tela em que a ajuda existiria. Enquanto o manual está sendo escrito, tela sem │
 * │ artigo simplesmente não mostra o botão.                                                        │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * As três telas internas que não usam o cabeçalho compartilhado (a esteira e as duas do controle
 * gerencial) recebem o botão à mão, em passo separado.
 */
export function BotaoDeAjuda() {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const artigos = artigosDaRota(pathname ?? "");

  if (artigos.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Abrir a ajuda desta tela"
        title="Abrir a ajuda desta tela"
        className="inline-flex flex-none items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[12.5px] font-semibold text-dim transition hover:border-[var(--accent)] hover:bg-[var(--surface-2)] hover:text-accent"
      >
        <Icon name="bulb" className="h-4 w-4" />
        Ajuda
      </button>

      {aberto && <PainelDeAjuda artigos={artigos} aoFechar={() => setAberto(false)} />}
    </>
  );
}
