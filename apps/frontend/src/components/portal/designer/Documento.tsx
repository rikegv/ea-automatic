import type { ChangeEvent, ReactNode } from "react";
import { Check, File, RefreshCw, TriangleAlert, User, ZoomIn } from "lucide-react";
import type { CampoDocumento, DocumentoCandidato, StatusDocumento } from "@/lib/portal/types";
import { cn } from "@/lib/portal/cn";
import { BarraProgresso } from "./ui";

/* ---------- Campo de dado lido pela IA ---------- */

export function CampoLido({ campo, valor, onChange }: { campo: CampoDocumento; valor?: string; onChange?: (e: ChangeEvent<HTMLInputElement>) => void }) {
  const alerta = campo.estado === "confira" || campo.estado === "nao-lido";
  const id = `campo-${campo.chave}`;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", campo.largo && "md:col-span-2")}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-semibold text-portal-ink">{campo.rotulo}</label>
        {campo.estado === "lido" && (
          <span className="flex items-center gap-1 text-xs font-semibold text-portal-ok-tx"><Check className="size-3.5" strokeWidth={2.5} aria-hidden />Lido</span>
        )}
        {campo.estado === "confira" && (
          <span className="flex items-center gap-1 text-xs font-semibold text-portal-at-tx"><TriangleAlert className="size-3.5" aria-hidden />Confira</span>
        )}
        {campo.estado === "nao-lido" && (
          <span className="flex items-center gap-1 text-xs font-semibold text-portal-at-tx"><TriangleAlert className="size-3.5" aria-hidden />Não lido</span>
        )}
      </div>
      <input
        id={id}
        name={campo.chave}
        type="text"
        disabled={campo.estado === "aguardando"}
        placeholder={campo.estado === "aguardando" ? "Preenchido após a leitura" : campo.placeholder}
        {...(onChange ? { value: valor ?? "", onChange } : { defaultValue: campo.valor })}
        aria-describedby={campo.dica ? `${id}-dica` : undefined}
        aria-invalid={alerta || undefined}
        className={cn(
          "h-12 w-full rounded-xl border-[1.5px] px-3.5 text-[15px] text-portal-ink outline-none transition-colors placeholder:text-portal-muted/70 focus:border-portal-primaria focus:ring-4 focus:ring-portal-primaria-tint",
          alerta ? "border-soulan-coral bg-[#FFFBF8]" : "border-portal-linha bg-white",
          campo.estado === "aguardando" && "bg-[#F8FAFB]",
        )}
      />
      {campo.dica && (
        <span id={`${id}-dica`} className={cn("text-xs leading-snug", alerta ? "text-portal-at-tx" : "text-portal-muted")}>{campo.dica}</span>
      )}
    </div>
  );
}

export function GradeCampos({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>;
}

/* ---------- Cabeçalho do documento ---------- */

export function CabecalhoDocumento({ titulo, tags }: { titulo: string; tags?: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex size-[52px] shrink-0 items-center justify-center rounded-[14px] bg-portal-primaria-tint"><File className="size-6 text-portal-primaria" aria-hidden /></div>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[22px] font-bold leading-tight md:text-[28px]">{titulo}</h1>
        {tags && <div className="flex flex-wrap gap-2">{tags}</div>}
      </div>
    </div>
  );
}

/* ---------- Pré-visualização do arquivo enviado ---------- */

export function PreviaDocumento({ arquivo, urlImagem, desfocado, altura = 280 }: { arquivo: string; urlImagem?: string; desfocado?: boolean; altura?: number }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex items-center justify-center overflow-hidden rounded-2xl border border-portal-linha bg-[#EEF2F6]" style={{ height: altura }}>
        {urlImagem ? (
          // Previa de imagem local (blob/objectURL); Image do Next nao serve para URL efemera.
          <img src={urlImagem} alt="Documento enviado" className="h-full w-full object-contain" />
        ) : (
          <div className={cn("flex aspect-[1.55] w-[78%] -rotate-2 gap-4 rounded-xl bg-white p-[18px] shadow-[0_8px_24px_rgba(0,36,67,0.12)]", desfocado && "blur-[2.5px]")}>
            <div className="flex w-[30%] items-center justify-center rounded-lg bg-[#DCE5EE]"><User className="size-9 text-[#9FB1C3]" strokeWidth={1.5} aria-hidden /></div>
            <div className="flex grow flex-col justify-center gap-3">
              {[80, 60, 70, 45].map((w) => <div key={w} className="h-2 rounded bg-[#D5DEE7]" style={{ width: `${w}%` }} />)}
            </div>
          </div>
        )}
        {desfocado && <div className="absolute left-[44%] top-1/2 h-[30%] w-[46%] rounded-[10px] border-2 border-dashed border-soulan-coral bg-soulan-coral/10" aria-hidden />}
        <span className="absolute left-3.5 top-3.5 rounded-md bg-white/90 px-2 py-1 text-[11px] font-semibold text-portal-muted">Pré-visualização</span>
        <button type="button" aria-label="Ampliar documento" className="absolute bottom-3 right-3 flex size-11 items-center justify-center rounded-xl border border-portal-linha bg-white">
          <ZoomIn className="size-[18px]" aria-hidden />
        </button>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[13px] text-portal-muted"><File className="size-4" aria-hidden />{arquivo}</span>
        <button type="button" className="flex items-center gap-1.5 text-[13px] font-semibold text-portal-primaria underline"><RefreshCw className="size-3.5" aria-hidden />Trocar arquivo</button>
      </div>
    </div>
  );
}

/* ---------- Trilha de documentos ---------- */

const statusTexto: Record<StatusDocumento, { texto: string; cor: string }> = {
  confirmado: { texto: "Confirmado", cor: "text-portal-ok-tx" },
  entregue: { texto: "Entregue", cor: "text-portal-ok-tx" },
  agora: { texto: "Agora", cor: "text-portal-primaria" },
  ajuste: { texto: "Precisa de ajuste", cor: "text-portal-at-tx" },
  "a-enviar": { texto: "A enviar", cor: "text-portal-muted" },
  pulado: { texto: "Pulado, volte depois", cor: "text-portal-muted" },
};

function MarcadorStatus({ status, n }: { status: StatusDocumento; n: number }) {
  const b = "flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold";
  if (status === "confirmado" || status === "entregue")
    return <div className={cn(b, "bg-soulan-verde")}><Check className="size-4 text-portal-ink" strokeWidth={3} aria-hidden /></div>;
  if (status === "agora") return <div className={cn(b, "bg-portal-primaria font-bold text-white shadow-[0_0_0_4px_#EAF1FA]")}>{n}</div>;
  if (status === "ajuste") return <div className={cn(b, "border-[1.5px] border-soulan-coral bg-portal-at-bg")}><TriangleAlert className="size-[15px] text-portal-at-tx" aria-hidden /></div>;
  if (status === "pulado") return <div className={cn(b, "border-[1.5px] border-dashed border-[#AEBBC8] bg-white text-portal-muted")}>{n}</div>;
  return <div className={cn(b, "border-[1.5px] border-[#D3DCE5] bg-white text-portal-muted")}>{n}</div>;
}

export function contarEntregues(docs: DocumentoCandidato[]) {
  return docs.filter((d) => d.status === "confirmado" || d.status === "entregue").length;
}

/** Trilha lateral (desktop, ≥ lg). */
export function TrilhaDocumentos({ documentos }: { documentos: DocumentoCandidato[] }) {
  return (
    <aside className="hidden w-80 shrink-0 flex-col gap-5 self-start rounded-card border border-portal-linha bg-white px-5 py-7 lg:flex" aria-label="A sua trilha de documentos">
      <div className="flex flex-col gap-1 px-2.5">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-portal-muted">A sua trilha</span>
        <span className="text-lg font-bold">Documentos da admissão</span>
      </div>
      <div className="px-2.5"><BarraProgresso entregues={contarEntregues(documentos)} total={documentos.length} /></div>
      <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
        {documentos.map((d, i) => {
          const s = statusTexto[d.status];
          const texto = !d.necessario && d.status === "a-enviar" ? "Opcional" : s.texto;
          return (
            <li key={d.id} className={cn("flex items-center gap-3 rounded-xl px-2.5 py-2", d.status === "agora" && "bg-portal-primaria-tint")} aria-current={d.status === "agora" ? "step" : undefined}>
              <MarcadorStatus status={d.status} n={i + 1} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className={cn("text-sm text-portal-ink", d.status === "agora" ? "font-bold" : d.status === "a-enviar" ? "font-medium" : "font-semibold")}>{d.nomeCurto}</span>
                <span className={cn("text-xs font-medium", s.cor)}>{texto}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

/** Barra de progresso compacta (mobile/tablet, < lg). */
export function TrilhaMobile({ documentos, atualId }: { documentos: DocumentoCandidato[]; atualId: string }) {
  const idx = documentos.findIndex((d) => d.id === atualId);
  return (
    <div className="flex flex-col gap-3 border-b border-portal-linha bg-white px-4 pb-4 pt-3.5 lg:hidden">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold text-portal-muted">Documento {idx + 1} de {documentos.length}</span>
          <span className="text-[15px] font-bold">{documentos[idx]?.nome}</span>
        </div>
      </div>
      <BarraProgresso entregues={contarEntregues(documentos)} total={documentos.length} />
    </div>
  );
}

/** Estrutura padrão das telas de documento: trilha + conteúdo. */
export function LayoutDocumento({ documentos, atualId, children }: { documentos: DocumentoCandidato[]; atualId: string; children: ReactNode }) {
  return (
    <>
      <TrilhaMobile documentos={documentos} atualId={atualId} />
      <main className="flex grow justify-center px-4 py-5 md:px-14 md:py-12">
        <div className="flex w-full max-w-[1328px] gap-7">
          <TrilhaDocumentos documentos={documentos} />
          <div className="min-w-0 grow">{children}</div>
        </div>
      </main>
    </>
  );
}
