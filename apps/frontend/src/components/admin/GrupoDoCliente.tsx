"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/Button";

/**
 * O GRUPO DO CLIENTE, em LEITURA, dentro da ficha (cenário 2, etapa 1).
 *
 * SÓ LEITURA, e isso é decisão de desenho: a edição vive na tela de grupos, onde a lista inteira de
 * CNPJs está à vista. Um segundo lugar de edição, aqui, criaria duas telas capazes de divergir sobre
 * a mesma coisa.
 *
 * Carrega SOB DEMANDA, quando a ficha abre, igual ao catálogo de lojas logo acima.
 */
export function GrupoDoCliente({
  codCliente,
  onAbrirGrupos,
}: {
  codCliente: string;
  onAbrirGrupos: () => void;
}) {
  const [grupo, setGrupo] = useState<{ id: string; nome: string; ativo: boolean } | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    apiFetch<{ id: string; nome: string; ativo: boolean } | null>(
      `/admin/grupos-cliente/do-cliente/${encodeURIComponent(codCliente)}`,
    )
      .then((r) => {
        if (!cancelado) setGrupo(r);
      })
      .catch(() => {
        if (!cancelado) setGrupo(null);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [codCliente]);

  return (
    <div className="mt-4 border-t border-[var(--border)] pt-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="ds-label">Grupo</span>
        {carregando ? (
          <span className="text-sm text-faint">carregando</span>
        ) : grupo ? (
          <>
            <span className="text-sm font-semibold text-text">{grupo.nome}</span>
            {!grupo.ativo && (
              <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10.5px] font-semibold text-faint">
                Inativo
              </span>
            )}
          </>
        ) : (
          <span className="text-sm text-faint">sem grupo</span>
        )}
        {/* Botão, e não link: é a porta de entrada do cadastro de grupos a partir da ficha. */}
        <Button
          variant="secondary"
          onClick={onAbrirGrupos}
          className="ml-auto shrink-0 px-3.5 py-1.5 text-[12.5px] text-accent"
        >
          Cadastrar Grupos
        </Button>
      </div>
      <p className="mt-1 text-xs text-faint">
        O grupo junta CNPJs de lojas diferentes num nome só, para filtrar e analisar. A edição fica na
        tela de grupos.
      </p>
    </div>
  );
}
