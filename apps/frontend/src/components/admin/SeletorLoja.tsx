"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

/**
 * SELETOR DE LOJA / UNIDADE (cenário 1, etapa 3). UM componente, usado nos QUATRO pontos onde a loja
 * é escolhida: liberação individual, liberação em lote (uma por linha), wizard e edição.
 *
 * TRÊS COMPORTAMENTOS QUE SÃO A REGRA, e não detalhe de tela:
 *
 * 1. **Cliente SEM lojas não pergunta nada.** O componente devolve `null` e some. A maioria dos 247
 *    clientes não tem loja, e para eles a admissão fica no nome do cliente, como sempre foi. Mostrar
 *    um seletor vazio seria cobrar uma resposta que não existe.
 * 2. **Trocar o cliente LIMPA a loja.** Uma loja do CRM não pode sobreviver a uma troca para o DIA.
 *    O componente avisa o pai (`onChange(undefined)`) assim que o cliente muda, ANTES mesmo de a
 *    lista nova chegar, para não haver uma janela em que a tela mostra a loja antiga com o cliente
 *    novo.
 * 3. **Loja inativa não vira opção.** A rota `/ativas` já filtra. Admissão antiga que aponte para
 *    uma loja inativa continua válida no banco; o que não se pode é escolher uma agora.
 *
 * §A.11: sem travessão. §A.24: o rótulo é título, então Title Case.
 */

export interface LojaAtiva {
  id: string;
  nome: string;
  endereco: string | null;
}

export function SeletorLoja({
  codCliente,
  value,
  onChange,
  label = "Loja / Unidade",
  compacto = false,
  disabled = false,
}: {
  /** Cliente da admissão. Vazio ou nulo esconde o seletor: sem cliente não há catálogo. */
  codCliente: string | null | undefined;
  value: string | undefined;
  onChange: (lojaId: string | undefined) => void;
  label?: string;
  /** No lote, o seletor entra dentro da linha do candidato, sem rótulo próprio. */
  compacto?: boolean;
  disabled?: boolean;
}) {
  const [lojas, setLojas] = useState<LojaAtiva[]>([]);
  const [carregando, setCarregando] = useState(false);
  // Guarda o cliente da ÚLTIMA carga, para distinguir "primeira montagem" de "o cliente mudou".
  const clienteAnterior = useRef<string | null | undefined>(undefined);
  /**
   * `onChange` numa REF, e não na lista de dependências. O pai recria a função a cada render, então
   * tê-la como dependência reexecutaria o efeito em laço e limparia a loja que o usuário acabou de
   * escolher. A ref mantém o efeito dependendo só do que importa (o cliente) sem silenciar regra de
   * lint nem chamar uma versão velha da função.
   */
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    // Cliente mudou de verdade (não é a montagem inicial): a loja escolhida deixa de valer AGORA,
    // antes de a lista nova chegar. É a regra 2 acima.
    if (clienteAnterior.current !== undefined && clienteAnterior.current !== codCliente) {
      onChangeRef.current(undefined);
    }
    clienteAnterior.current = codCliente;

    if (!codCliente) {
      setLojas([]);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    apiFetch<LojaAtiva[]>(`/admin/clientes/${encodeURIComponent(codCliente)}/lojas/ativas`)
      .then((r) => {
        if (!cancelado) setLojas(r);
      })
      // Falha ao listar não pode travar a liberação: sem lista, o seletor some e a admissão segue
      // sem loja, que é o mesmo desfecho de um cliente que não tem lojas.
      .catch(() => {
        if (!cancelado) setLojas([]);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [codCliente]);

  // REGRA 1: cliente sem lojas não pergunta nada.
  if (!codCliente || (!carregando && lojas.length === 0)) return null;

  const select = (
    <select
      className="ds-input"
      value={value ?? ""}
      disabled={disabled || carregando}
      onChange={(e) => onChange(e.target.value || undefined)}
      aria-label={label}
    >
      <option value="">{carregando ? "carregando lojas" : "Sem loja definida"}</option>
      {lojas.map((l) => (
        <option key={l.id} value={l.id}>
          {l.nome}
        </option>
      ))}
    </select>
  );

  if (compacto) return select;

  return (
    <div className="min-w-0">
      <span className="ds-label">{label}</span>
      {select}
    </div>
  );
}

/**
 * LOJA POR LINHA NO LOTE (Q9). Uma lista de "candidato mais seletor", e não um seletor só para o
 * lote inteiro, porque o mesmo lote costuma ter gente de lojas diferentes.
 *
 * Some inteiro quando o cliente não tem lojas: o componente busca uma vez e, achando lista vazia,
 * não desenha nada. Assim o modal do lote continua idêntico ao de hoje para os 241 clientes que não
 * têm loja nenhuma.
 */
export function LojasDoLote({
  codCliente,
  pessoas,
  valores,
  onChange,
}: {
  codCliente: string;
  pessoas: { admissaoId: string; nome: string }[];
  valores: Record<string, string | undefined>;
  onChange: (admissaoId: string, lojaId: string | undefined) => void;
}) {
  const [temLojas, setTemLojas] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelado = false;
    apiFetch<LojaAtiva[]>(`/admin/clientes/${encodeURIComponent(codCliente)}/lojas/ativas`)
      .then((r) => {
        if (!cancelado) setTemLojas(r.length > 0);
      })
      .catch(() => {
        if (!cancelado) setTemLojas(false);
      });
    return () => {
      cancelado = true;
    };
  }, [codCliente]);

  if (!temLojas) return null;

  return (
    <div className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="ds-label">Loja De Cada Um</span>
        <span className="text-[11px] text-dim">
          quem ficar sem loja vira pendência individual, não bloqueia
        </span>
      </div>
      {pessoas.map((p) => (
        <div key={p.admissaoId} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr]">
          <span className="truncate text-sm text-text">{p.nome}</span>
          <SeletorLoja
            codCliente={codCliente}
            value={valores[p.admissaoId]}
            onChange={(lojaId) => onChange(p.admissaoId, lojaId)}
            compacto
            label={`Loja de ${p.nome}`}
          />
        </div>
      ))}
    </div>
  );
}
