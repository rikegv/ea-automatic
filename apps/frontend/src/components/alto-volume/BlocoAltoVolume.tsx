"use client";

import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import type { GrupoDoSeletor, ProjetoDoSeletor } from "@/lib/alto-volume";

/**
 * ALTO VOLUME (onda 2): o flag e os seletores, em UM lugar só.
 *
 * Componente compartilhado porque este bloco aparece TRÊS vezes (liberação individual, liberação em
 * lote e wizard de nova admissão) e as três têm de se comportar igual. Triplicar o JSX seria
 * triplicar a chance de as telas divergirem, que é exatamente como um vínculo nasce diferente
 * dependendo da porta por onde a admissão entrou.
 *
 * O componente é BURRO de propósito: não busca nada, não valida nada e não decide se aparece. Quem
 * carrega a lista, aplica a sugestão e monta o gate é a tela; aqui só existe desenho e o clique.
 */
export function BlocoAltoVolume({
  ligado,
  onLigado,
  projetos,
  projetoSel,
  onProjeto,
  grupos,
  grupoSel,
  onGrupo,
  sugeridoId,
  idAria,
}: {
  ligado: boolean;
  onLigado: (v: boolean) => void;
  projetos: ProjetoDoSeletor[];
  projetoSel: string;
  onProjeto: (v: string) => void;
  grupos: GrupoDoSeletor[];
  grupoSel: string;
  onGrupo: (v: string) => void;
  /** Projeto que o período sugeriu, se houve. Só para explicar a pré-escolha ao consultor. */
  sugeridoId?: string;
  /** Distingue os rótulos acessíveis quando dois blocos coexistem na mesma página. */
  idAria: string;
}) {
  const sugerido = sugeridoId ? projetos.find((p) => p.id === sugeridoId) : undefined;

  return (
    <div className="grid gap-2.5 rounded-xl border border-[var(--border)] px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="ds-label !mb-0">Alto Volume</span>
        <button
          type="button"
          role="switch"
          aria-checked={ligado}
          aria-label={`Alto Volume (${idAria})`}
          onClick={() => onLigado(!ligado)}
          className={cn(
            "relative h-[22px] w-[42px] rounded-full border transition",
            ligado
              ? "border-[rgba(46,158,99,0.5)] bg-[rgba(46,158,99,0.24)]"
              : "border-[var(--border)] bg-[rgba(255,255,255,0.06)]",
          )}
        >
          <span
            className={cn(
              "absolute top-[2px] h-[16px] w-[16px] rounded-full bg-white transition-all",
              ligado ? "left-[23px]" : "left-[2px]",
            )}
          />
        </button>
      </div>

      {!ligado && (
        <p className="text-[11.5px] text-dim">
          Este cliente tem projeto de Alto Volume. Ligue para vincular esta admissão a um projeto.
          {sugerido ? ` Pela data de admissão, o projeto seria "${sugerido.nome}".` : ""}
        </p>
      )}

      {ligado && (
        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="ds-label">
              Projeto <span className="text-danger">*</span>
            </span>
            <Select
              value={projetoSel}
              onChange={onProjeto}
              placeholder="Selecione o projeto…"
              ariaLabel={`Projeto de Alto Volume (${idAria})`}
              menuFit
              options={projetos.map((p) => ({
                value: p.id,
                label: `${p.nome} (${fmtPeriodo(p)})`,
              }))}
            />
            {sugerido && projetoSel === sugerido.id && (
              <span className="text-[11.5px] text-dim">
                Sugerido pela data de admissão, que cai no período deste projeto. Troque se não for
                este o projeto.
              </span>
            )}
            {!projetoSel && (
              <span className="text-[11.5px] text-warn">
                Com o Alto Volume ligado, escolher o projeto é obrigatório. Desligue se esta admissão
                não é de projeto.
              </span>
            )}
          </label>

          {/* GRUPO: só aparece quando o projeto TEM grupo cadastrado, e segue opcional mesmo assim.
              Projeto sem grupo não tem o que perguntar, e forçar a leva quando ela não foi decidida
              seria inventar dado. */}
          {projetoSel && grupos.length > 0 && (
            <label className="grid gap-1.5">
              <span className="ds-label">Grupo de entrada</span>
              <Select
                value={grupoSel}
                onChange={onGrupo}
                placeholder="Sem grupo definido"
                ariaLabel={`Grupo de entrada (${idAria})`}
                menuFit
                options={[
                  { value: "", label: "Sem grupo definido" },
                  ...grupos.map((g) => ({
                    value: g.id,
                    label: `${g.rotulo} (${fmtData(g.dataEntrada)})`,
                  })),
                ]}
              />
              <span className="text-[11.5px] text-dim">
                Opcional. A leva de entrada dentro do projeto, quando já estiver definida.
              </span>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

/** `YYYY-MM-DD` para `DD/MM/AAAA`, sem passar por `Date` (que jogaria a data um dia para trás). */
function fmtData(iso: string): string {
  const [a, m, d] = (iso ?? "").split("-");
  return a && m && d ? `${d}/${m}/${a}` : "não informado";
}

function fmtPeriodo(p: ProjetoDoSeletor): string {
  return `${fmtData(p.dataInicio)} a ${fmtData(p.dataFim)}`;
}
