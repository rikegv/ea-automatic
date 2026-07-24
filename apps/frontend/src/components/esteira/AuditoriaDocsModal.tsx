"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuditoriaStatus, ProgressoRegua, ResultadoAuditoria } from "@ea/shared-types";
import { apiFetch, apiOpenInline, apiUpload, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/Modal";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { caixaAlta } from "@/lib/nome";
import { rotuloParado } from "@/lib/parado";

// ── Tipos locais (espelham o detalhe de admissão e o catálogo de tipos) ──────
interface DocDetalhe {
  nome: string;
  // Tipo a auditar/reauditar NESTA linha. Vem do backend porque pode ser um tipo EQUIVALENTE ao da
  // régua (OST A / Bloco 3: a "Foto para Crachá" preenche o slot "Foto 3x4").
  tipoDocumentoId?: string;
  exigencia: "OBRIGATORIO" | "NAO_OBRIGATORIO" | "FACULTATIVO";
  // AGUARDANDO_AUDITORIA: documento coletado (ex.: pull do Pandapé) porém a IA ainda não auditou.
  estado: "PENDENTE" | "ENTREGUE" | "INCONFORME" | "AGUARDANDO_AUDITORIA";
  // Motivo persistido do veredito (BLOCO 2): texto acionável da IA, sem PII (§A.6). Pode ser null.
  observacao?: string | null;
  // OST B1 / Bloco 3: nome do consultor que validou o documento À MÃO. Null = veredito é da IA.
  // Fica VISÍVEL na linha, para quem abrir depois saber quem assumiu o documento.
  validadoPorNome?: string | null;
  validadoEm?: string | null;
  // OST motivo verdadeiro / Bloco 5: horas paradas em AGUARDANDO_AUDITORIA, quando passou do limiar
  // (6h). `null` ou ausente significa "nada a sinalizar": QUEM decide o limiar é o backend
  // (`domain/auditoria-parada`), a tela só exibe. Sem regra duplicada no front.
  paradoHa?: number | null;
}
interface AdmissaoDetalhe {
  candidato: { nome: string };
  documentos: DocDetalhe[];
  /**
   * OST do Drive / Bloco 1: link PERSISTIDO do prontuário. Antes o modal só mostrava a pasta quando
   * o arquivamento acontecia NAQUELA sessão (estado `arquivado`), então quem abrisse depois não
   * tinha como chegar ao Drive por aqui. Ausente = ainda não há pasta, e aí a tela diz por quê em
   * vez de exibir botão morto.
   */
  drivePastaUrl?: string | null;
  driveAsoUrl?: string | null;
}
interface TipoDocumento {
  id: string;
  codigo: string;
  nome: string;
}

/** Resposta do POST de auditoria de UM documento (contrato Fase 4 / F2). */
interface AuditarResp {
  resultado: ResultadoAuditoria;
  documento: { tipoDocumentoId: string; estado: string };
  progresso: ProgressoRegua;
  sinalizador?: string;
  arquivado?: { pastaUrl: string; pastaJaExistia?: boolean; ignorados?: number };
  /**
   * OST produção / Bloco 1: a régua fechou mas o envio ao Drive falhou. Vem preenchido em QUALQUER
   * caminho que feche a régua (auditar, reauditar, validar por humano), porque a falha silenciosa
   * foi exatamente o defeito: a tela dizia "Análise finalizada" e o prontuário ficava vazio.
   */
  avisoDrive?: string;
}

/**
 * BLOCO 2 — o que dá para VISUALIZAR de um documento. Vem SEM caminho de arquivo: a tela só conhece
 * o índice e o rótulo, e pede o arquivo N por índice (§A.6).
 */
interface ArquivosResp {
  disponivel: boolean;
  mensagem?: string;
  arquivos: { indice: number; rotulo: string; mime: string; tamanhoBytes: number }[];
}

/** BLOCO 3 — resposta do descarte, com o aviso do Drive quando o arquivo já havia subido. */
interface DescartarResp {
  documento: { tipoDocumentoId: string; estado: string };
  arquivosRemovidos: number;
  driveJaArquivado: boolean;
  avisoDrive?: string;
}

const EXIG_ROTULO: Record<DocDetalhe["exigencia"], string> = {
  OBRIGATORIO: "Obrigatório",
  NAO_OBRIGATORIO: "Não obrigatório",
  FACULTATIVO: "Facultativo",
};

// Veredito da IA → tom da pill (DESIGN-SYSTEM): validado verde, inconforme vermelho, pendente âmbar.
const STATUS_TONE: Record<AuditoriaStatus, PillTone> = {
  VALIDADO: "ok",
  INCONFORME: "dg",
  PENDENTE: "wn",
};
const STATUS_ROTULO: Record<AuditoriaStatus, string> = {
  VALIDADO: "Validado",
  INCONFORME: "Inconforme",
  PENDENTE: "Pendente",
};
// Estado persistido inicial (antes de auditar nesta sessão) → veredito equivalente para exibição.
// AGUARDANDO_AUDITORIA fica de fora: não é veredito da IA, tem pill própria (ver `pillDoc`).
const ESTADO_PARA_STATUS: Record<"ENTREGUE" | "INCONFORME" | "PENDENTE", AuditoriaStatus> = {
  ENTREGUE: "VALIDADO",
  INCONFORME: "INCONFORME",
  PENDENTE: "PENDENTE",
};

/**
 * Pill a exibir para um documento. Veredito desta sessão tem prioridade; senão deriva do estado
 * persistido. AGUARDANDO_AUDITORIA (coletado, IA ainda não rodou) recebe pill azul própria; PENDENTE
 * "nunca tocado" não recebe pill (null).
 */
function pillDoc(
  result: ResultadoAuditoria | undefined,
  estado: DocDetalhe["estado"],
): { tone: PillTone; rotulo: string } | null {
  if (result) return { tone: STATUS_TONE[result.status], rotulo: STATUS_ROTULO[result.status] };
  if (estado === "AGUARDANDO_AUDITORIA") return { tone: "in", rotulo: "Aguardando auditoria" };
  if (estado === "PENDENTE") return null;
  const s = ESTADO_PARA_STATUS[estado];
  return { tone: STATUS_TONE[s], rotulo: STATUS_ROTULO[s] };
}

const ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

/**
 * Botão SÓ ÍCONE da linha do documento (quadrado, mesma altura e mesma moldura dos botões com
 * rótulo). Existe por causa do orçamento de largura da linha: cinco botões com texto não cabem ao
 * lado do nome do documento, e o nome é quem identifica a linha. Os três que viraram ícone
 * (Reauditar, Visualizar, Descartar) têm símbolo inequívoco; os dois que decidem alguma coisa
 * (enviar arquivo e Validar) mantêm o texto. Todo botão de ícone leva `title` (tooltip) e
 * `aria-label`, então o rótulo continua disponível para quem passa o mouse e para leitor de tela.
 */
const BTN_ICONE =
  "inline-flex h-[38px] w-[38px] flex-none items-center justify-center rounded-lg border " +
  "border-[var(--border)] bg-[var(--surface)] text-dim transition hover:bg-[var(--surface-2)] " +
  "hover:text-text disabled:opacity-50";

/**
 * Botão COM rótulo da linha do documento. `flex-none` é a outra metade da regra de layout: sem ele
 * o botão também encolheria e o texto quebraria letra a letra, que é exatamente o defeito que se
 * está corrigindo. Quem não cabe DESCE de fila (o container tem `flex-wrap`), ninguém se espreme.
 */
const BTN_TEXTO =
  "inline-flex h-[38px] flex-none items-center gap-1.5 whitespace-nowrap rounded-lg border " +
  "border-[var(--border)] bg-[var(--surface)] px-3 text-[12.5px] font-semibold text-dim " +
  "transition hover:bg-[var(--surface-2)] disabled:opacity-50";

/**
 * Modal de auditoria documental por IA (F2 / INT-3) de uma admissão. Por documento da régua:
 * "Auditar documento" → seleção de arquivo (PDF/JPG/PNG) → spinner → badge do veredito + motivo.
 * Barra de progresso da régua obrigatória ("X de Y validados"). Quando a régua fecha, o backend
 * arquiva no Drive e devolve `arquivado.pastaUrl`, exibido como aviso com link. Nenhum binário é
 * persistido nem exibido; só status e motivo (§A.3 r.7 / §A.6). CPF não aparece aqui.
 */
export function AuditoriaDocsModal({
  admissaoId,
  onClose,
}: {
  admissaoId: string;
  /** Fecha o modal; recebe `true` se houve ao menos uma auditoria (para a lista recarregar). */
  onClose: (mudou: boolean) => void;
}) {
  const { token } = useAuth();
  const [detalhe, setDetalhe] = useState<AdmissaoDetalhe | null>(null);
  const [tipos, setTipos] = useState<TipoDocumento[]>([]);
  const [progresso, setProgresso] = useState<ProgressoRegua | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Estado por documento (chave = tipoDocumentoId).
  const [resultados, setResultados] = useState<Record<string, ResultadoAuditoria>>({});
  const [auditandoId, setAuditandoId] = useState<string | null>(null);
  const [erroDoc, setErroDoc] = useState<Record<string, string>>({});
  const [arquivado, setArquivado] = useState<string | null>(null);
  /**
   * OST do Drive / Bloco 3: a pasta do prontuário JÁ EXISTIA e foi reutilizada, em vez de criada.
   * O diretor pediu que isso apareça na tela: sem o aviso, ninguém sabe se o prontuário nasceu agora
   * ou se o sistema escreveu dentro de uma pasta que a equipe já mantinha à mão.
   */
  const [pastaReutilizada, setPastaReutilizada] = useState(false);
  const mudouRef = useRef(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // BLOCO 2 — arquivos visualizáveis por tipo, carregados sob demanda (chave = tipoDocumentoId).
  const [arquivosPorTipo, setArquivosPorTipo] = useState<Record<string, ArquivosResp>>({});
  const [carregandoArquivos, setCarregandoArquivos] = useState<string | null>(null);
  // BLOCO 3 — aviso do Drive depois de descartar um documento que já havia sido arquivado.
  const [avisoDrive, setAvisoDrive] = useState<string | null>(null);

  /** Marca que houve mudança, para a lista de trás recarregar ao fechar. */
  const mudou = useCallback(() => {
    mudouRef.current = true;
  }, []);

  /**
   * Recarrega só a ficha. Usado depois da validação humana, que muda o que a linha EXIBE (o nome de
   * quem validou vem do backend, não é montado no cliente).
   */
  const recarregarDetalhe = useCallback(async () => {
    try {
      setDetalhe(await apiFetch<AdmissaoDetalhe>(`/esteira/admissao/${admissaoId}`, { token }));
    } catch {
      // Falha ao recarregar não desfaz a ação que acabou de dar certo: a tela segue com o que tem.
    }
  }, [admissaoId, token]);

  /**
   * Recarrega SÓ a barra de progresso. Usado pelo DESCARTE (Bloco 3), que devolve um documento ao
   * estado PENDENTE e portanto MEXE na régua obrigatória: sem isto a barra continuaria contando um
   * documento que não está mais lá.
   */
  const recarregarProgresso = useCallback(async () => {
    try {
      setProgresso(
        await apiFetch<ProgressoRegua>(`/esteira/auditoria/${admissaoId}/progresso`, { token }),
      );
    } catch {
      // Igual acima: a barra é informativa, não desfaz a ação que deu certo.
    }
  }, [admissaoId, token]);

  // Carga inicial: ficha (documentos), catálogo de tipos e progresso da régua.
  useEffect(() => {
    let vivo = true;
    Promise.all([
      apiFetch<AdmissaoDetalhe>(`/esteira/admissao/${admissaoId}`, { token }),
      apiFetch<TipoDocumento[]>("/catalogos/tipos-documento", { token }),
      apiFetch<ProgressoRegua>(`/esteira/auditoria/${admissaoId}/progresso`, { token }),
    ])
      .then(([det, tip, prog]) => {
        if (!vivo) return;
        setDetalhe(det);
        setTipos(tip);
        setProgresso(prog);
      })
      .catch((e) => {
        if (vivo)
          setLoadError(e instanceof ApiError ? e.message : "Falha ao carregar os documentos.");
      });
    return () => {
      vivo = false;
    };
  }, [admissaoId, token]);

  // Mapa nome do documento → tipoDocumentoId (ambos vêm da mesma tabela TipoDocumento).
  const idPorNome = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tipos) m.set(t.nome, t.id);
    return m;
  }, [tipos]);

  const auditar = useCallback(
    async (tipoDocumentoId: string, file: File) => {
      setAuditandoId(tipoDocumentoId);
      setErroDoc((e) => ({ ...e, [tipoDocumentoId]: "" }));
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("tipoDocumentoId", tipoDocumentoId);
        const resp = await apiUpload<AuditarResp>(
          `/esteira/auditoria/${admissaoId}/documento`,
          fd,
          token,
        );
        mudouRef.current = true;
        setResultados((r) => ({ ...r, [tipoDocumentoId]: resp.resultado }));
        if (resp.progresso) setProgresso(resp.progresso);
        if (resp.arquivado?.pastaUrl) setArquivado(resp.arquivado.pastaUrl);
        if (resp.arquivado?.pastaJaExistia) setPastaReutilizada(true);
        setAvisoDrive(resp.avisoDrive ?? null);
      } catch (e) {
        const msg =
          e instanceof ApiError
            ? e.message
            : "Falha de rede ao auditar o documento. Verifique a conexão e tente de novo.";
        setErroDoc((er) => ({ ...er, [tipoDocumentoId]: msg }));
      } finally {
        setAuditandoId(null);
      }
    },
    [admissaoId, token],
  );

  /**
   * OST A / Bloco 5 — REAUDITAR: pede nova análise do documento JÁ COLETADO, sem novo upload. O
   * backend reusa os arquivos da staging e, se já tiverem sido expurgados, busca de novo no Pandapé.
   */
  const reauditar = useCallback(
    async (tipoDocumentoId: string, confirmarSobrescritaHumana = false) => {
      setAuditandoId(tipoDocumentoId);
      setErroDoc((e) => ({ ...e, [tipoDocumentoId]: "" }));
      try {
        const resp = await apiFetch<AuditarResp>(`/esteira/auditoria/${admissaoId}/reauditar`, {
          method: "POST",
          token,
          body: confirmarSobrescritaHumana
            ? { tipoDocumentoId, confirmarSobrescritaHumana: true }
            : { tipoDocumentoId },
        });
        mudouRef.current = true;
        setResultados((r) => ({ ...r, [tipoDocumentoId]: resp.resultado }));
        if (resp.progresso) setProgresso(resp.progresso);
        if (resp.arquivado?.pastaUrl) setArquivado(resp.arquivado.pastaUrl);
        if (resp.arquivado?.pastaJaExistia) setPastaReutilizada(true);
        setAvisoDrive(resp.avisoDrive ?? null);
        mudou();
      } catch (e) {
        // OST B1 / Bloco 4: 409 = o documento foi VALIDADO POR HUMANO. A IA não sobrescreve em
        // silêncio: perguntamos, com o nome de quem validou (que vem na mensagem do backend), e só
        // seguimos com o aceite. Recusando, nada acontece.
        if (e instanceof ApiError && e.status === 409) {
          setAuditandoId(null);
          if (window.confirm(e.message)) {
            await reauditarRef.current?.(tipoDocumentoId, true);
          }
          return;
        }
        const msg =
          e instanceof ApiError
            ? e.message
            : "Falha de rede ao reauditar o documento. Verifique a conexão e tente de novo.";
        setErroDoc((er) => ({ ...er, [tipoDocumentoId]: msg }));
      } finally {
        setAuditandoId(null);
      }
    },
    [admissaoId, token, mudou],
  );
  // O retry após a confirmação precisa chamar a versão atual da função (evita dependência circular).
  const reauditarRef = useRef<typeof reauditar | null>(null);
  reauditarRef.current = reauditar;

  /**
   * OST B1 / Bloco 3 — VALIDAR POR HUMANO: o consultor assume o documento como válido quando a IA
   * erra. Qualquer consultor pode (decisão do diretor). O nome de quem validou passa a aparecer na
   * linha, e a partir daí a coleta automática e o lote não tocam mais neste documento.
   */
  const validarPorHumano = useCallback(
    async (tipoDocumentoId: string) => {
      setAuditandoId(tipoDocumentoId);
      setErroDoc((e) => ({ ...e, [tipoDocumentoId]: "" }));
      try {
        const resp = await apiFetch<{ progresso?: ProgressoRegua; avisoDrive?: string }>(
          `/esteira/auditoria/${admissaoId}/validar-humano`,
          { method: "POST", token, body: { tipoDocumentoId } },
        );
        if (resp.progresso) setProgresso(resp.progresso);
        // O caminho da validação humana é o que fechou a régua no caso real, então é o que mais
        // precisa mostrar o aviso quando o Drive recusa.
        setAvisoDrive(resp.avisoDrive ?? null);
        mudou();
        await recarregarDetalhe();
      } catch (e) {
        const msg =
          e instanceof ApiError
            ? e.message
            : "Falha de rede ao validar o documento. Verifique a conexão e tente de novo.";
        setErroDoc((er) => ({ ...er, [tipoDocumentoId]: msg }));
      } finally {
        setAuditandoId(null);
      }
    },
    [admissaoId, token, mudou, recarregarDetalhe],
  );

  /**
   * BLOCO 2 — VISUALIZAR: abre o arquivo N daquele documento em aba nova, servido da STAGING.
   * O caminho NUNCA sai do servidor: a tela pede por (admissão, tipo, índice) e recebe o binário
   * inline, no mesmo padrão do `/kit/download` (§A.6).
   */
  const abrirArquivo = useCallback(
    async (tipoDocumentoId: string, indice: number) => {
      try {
        await apiOpenInline(
          `/esteira/auditoria/${admissaoId}/documento/${tipoDocumentoId}/arquivo/${indice}`,
          token,
        );
      } catch (e) {
        const msg =
          e instanceof ApiError
            ? e.message
            : "Falha ao abrir o documento. Verifique a conexão e tente de novo.";
        setErroDoc((er) => ({ ...er, [tipoDocumentoId]: msg }));
      }
    },
    [admissaoId, token],
  );

  /**
   * BLOCO 2 — clique em "Visualizar": consulta o que existe na staging daquele tipo.
   *  - 1 arquivo  → abre direto (o caso comum, sem clique extra);
   *  - N arquivos → lista os N na linha (frente e verso, páginas da CTPS). O veredito é do CONJUNTO,
   *    então o consultor precisa poder ver o conjunto, não só a primeira peça;
   *  - 0 arquivos → mostra o aviso de indisponível. NÃO é erro: passadas as 48h de TTL, ou fechada a
   *    régua (staging expurgada), o arquivo simplesmente não está mais aqui.
   */
  const visualizar = useCallback(
    async (tipoDocumentoId: string) => {
      setCarregandoArquivos(tipoDocumentoId);
      setErroDoc((e) => ({ ...e, [tipoDocumentoId]: "" }));
      try {
        const resp = await apiFetch<ArquivosResp>(
          `/esteira/auditoria/${admissaoId}/documento/${tipoDocumentoId}/arquivos`,
          { token },
        );
        setArquivosPorTipo((a) => ({ ...a, [tipoDocumentoId]: resp }));
        if (resp.disponivel && resp.arquivos.length === 1) {
          await abrirArquivo(tipoDocumentoId, resp.arquivos[0].indice);
        }
      } catch (e) {
        const msg =
          e instanceof ApiError
            ? e.message
            : "Falha ao consultar os arquivos deste documento. Verifique a conexão e tente de novo.";
        setErroDoc((er) => ({ ...er, [tipoDocumentoId]: msg }));
      } finally {
        setCarregandoArquivos(null);
      }
    },
    [admissaoId, token, abrirArquivo],
  );

  /**
   * BLOCO 3 — DESCARTAR: tira o documento do fluxo em UMA operação (staging, estado, marcas de dedup,
   * validação humana e trilha). Pede confirmação antes, porque o efeito prático é o candidato ter de
   * reenviar o documento.
   *
   * O ponto que o consultor precisa entender e por isso está no texto da confirmação: depois do
   * descarte, o MESMO arquivo volta a ser aceito. Sem limpar a marca de dedup (que esta operação faz
   * no servidor), o reenvio do mesmo arquivo seria silenciosamente ignorado.
   */
  const descartar = useCallback(
    async (tipoDocumentoId: string, nomeDoc: string) => {
      const ok = window.confirm(
        `Descartar "${nomeDoc}"?\n\nO documento sai da análise e volta a ser cobrado como pendente. ` +
          `O candidato precisará reenviar o arquivo (o mesmo arquivo volta a ser aceito).\n\n` +
          `Esta ação não pode ser desfeita.`,
      );
      if (!ok) return;

      setAuditandoId(tipoDocumentoId);
      setErroDoc((e) => ({ ...e, [tipoDocumentoId]: "" }));
      setAvisoDrive(null);
      try {
        const resp = await apiFetch<DescartarResp>(`/esteira/auditoria/${admissaoId}/descartar`, {
          method: "POST",
          token,
          body: { tipoDocumentoId },
        });
        // O veredito da sessão e a lista de arquivos daquele tipo deixam de valer: o documento
        // voltou a PENDENTE e não há mais arquivo na staging.
        setResultados((r) => {
          const { [tipoDocumentoId]: _fora, ...resto } = r;
          return resto;
        });
        setArquivosPorTipo((a) => {
          const { [tipoDocumentoId]: _fora, ...resto } = a;
          return resto;
        });
        if (resp.avisoDrive) setAvisoDrive(resp.avisoDrive);
        mudou();
        await recarregarDetalhe();
        await recarregarProgresso();
      } catch (e) {
        const msg =
          e instanceof ApiError
            ? e.message
            : "Falha de rede ao descartar o documento. Verifique a conexão e tente de novo.";
        setErroDoc((er) => ({ ...er, [tipoDocumentoId]: msg }));
      } finally {
        setAuditandoId(null);
      }
    },
    [admissaoId, token, mudou, recarregarDetalhe, recarregarProgresso],
  );

  /**
   * OST A / Bloco 4 — ORDEM DE LEITURA do modal: primeiro os documentos com VEREDITO, depois os
   * recebidos que ainda não foram auditados, e por último os NÃO RECEBIDOS. Dentro de cada faixa a
   * ordem alfabética do backend é preservada (ordenação estável).
   */
  const documentos = useMemo(() => {
    const faixa = (d: DocDetalhe): number => {
      const tipoId = d.tipoDocumentoId ?? idPorNome.get(d.nome);
      if (tipoId && resultados[tipoId]) return 0;
      if (d.estado === "ENTREGUE" || d.estado === "INCONFORME") return 0;
      // PENDENTE COM motivo também foi auditado (ex.: tipo sem regra ativa na régua).
      if (d.estado === "PENDENTE" && d.observacao) return 0;
      if (d.estado === "AGUARDANDO_AUDITORIA") return 1;
      return 2;
    };
    return [...(detalhe?.documentos ?? [])].sort((a, b) => faixa(a) - faixa(b));
  }, [detalhe, resultados, idPorNome]);

  /**
   * Link do prontuário: o da SESSÃO tem prioridade (acabou de arquivar, é o mais fresco), senão o
   * persistido. `driveAsoUrl` entra como último recurso porque o ASO arquiva antes da régua fechar e
   * aponta para a MESMA pasta do funcionário: melhor levar o consultor lá do que não levar a lugar
   * nenhum.
   */
  const linkProntuario = arquivado ?? detalhe?.drivePastaUrl ?? detalhe?.driveAsoUrl ?? null;

  const pct =
    progresso && progresso.obrigatoriosTotal > 0
      ? Math.round((progresso.obrigatoriosEntregues / progresso.obrigatoriosTotal) * 100)
      : 0;

  return (
    <Modal
      onClose={() => onClose(mudouRef.current)}
      // A largura do modal NÃO é a regra de layout da linha, é só folga. A regra vive na própria
      // linha (ver o comentário do container de ações): piso de largura para o nome + ações que
      // QUEBRAM. Alargar o modal já foi tentado uma vez, quando os botões eram 3, e voltou a
      // quebrar quando entraram Visualizar e Descartar. Com a regra na linha, um sexto botão
      // desce para a segunda fila em vez de espremer o nome.
      className="max-w-4xl"
      ariaLabel="Auditar documentos"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow !mb-1">Auditoria documental por IA</div>
          {/* Bloco 1 da OST: nome do candidato em CAIXA ALTA (exibição). Carregando/erro não passam
              pelo helper: são estado da tela, não nome. */}
          <h3 className="truncate text-[18px] font-extrabold">
            {detalhe
              ? caixaAlta(detalhe.candidato.nome)
              : loadError
                ? "não informado"
                : "Carregando…"}
          </h3>
          <p className="psub !mb-0 mt-1">
            Envie cada documento para análise. O arquivo é efêmero, guardamos só o veredito.
          </p>
        </div>
        <button
          type="button"
          className="grid h-9 w-9 flex-none place-items-center rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-dim transition hover:bg-[var(--surface-2)] hover:text-text"
          onClick={() => onClose(mudouRef.current)}
          aria-label="Fechar"
        >
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>

      {/* ── Barra de progresso da régua obrigatória ──────────────────────── */}
      {progresso && (
        <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
            <span className="font-semibold text-text">
              {progresso.obrigatoriosEntregues} de {progresso.obrigatoriosTotal} obrigatórios
              validados
            </span>
            <span className={cn(progresso.completa ? "text-ok" : "text-dim")}>
              {progresso.completa ? "Régua completa" : `${pct}%`}
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]"
            role="progressbar"
            aria-valuenow={progresso.obrigatoriosEntregues}
            aria-valuemin={0}
            aria-valuemax={progresso.obrigatoriosTotal}
            aria-label="Progresso da régua obrigatória"
          >
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${pct}%`,
                background: progresso.completa ? "var(--ok)" : "var(--accent)",
              }}
            />
          </div>
          {progresso.faltantes.length > 0 && (
            <p className="mt-2 text-[12px] text-warn">Faltam: {progresso.faltantes.join(" · ")}</p>
          )}
        </div>
      )}

      {/* ── ACESSO AO PRONTUÁRIO NO DRIVE (OST do Drive, Bloco 1) ───────────
          Link da sessão (acabou de arquivar) OU o persistido no banco, nesta ordem. Sem link não há
          botão morto: quando a régua já fechou e mesmo assim não há pasta, o que aparece é o MOTIVO,
          que é o caso da falha de arquivamento. Régua ainda aberta não mostra nada, porque não há
          nada a mostrar e o progresso logo acima já diz onde o processo está. */}
      {linkProntuario ? (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[rgba(46,158,99,0.12)] px-3 py-2 text-sm text-ok">
          <Icon name="check" className="h-4 w-4 flex-none" />
          Prontuário arquivado no Drive.
          <a
            href={linkProntuario}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-accent underline"
          >
            Abrir pasta
          </a>
          {pastaReutilizada && (
            <span className="w-full text-[12.5px] text-dim">
              A pasta já existia no Drive e foi reaproveitada, nenhuma pasta nova foi criada.
            </span>
          )}
        </p>
      ) : (
        progresso?.completa && (
          <p className="mb-4 flex flex-wrap items-start gap-2 rounded-xl border border-[rgba(201,138,18,0.35)] bg-[rgba(201,138,18,0.1)] px-3 py-2 text-[12.5px] text-warn">
            <Icon name="alert" className="mt-0.5 h-4 w-4 flex-none" />
            Régua completa, mas ainda não há pasta no Drive para esta admissão. Os documentos seguem
            guardados aqui e o sistema tenta enviar de novo na próxima ação. Se insistir, avise a TI.
          </p>
        )
      )}

      {/* ── BLOCO 3: limite honesto do descarte ──────────────────────────────
          O EA não usa API de exclusão do Drive. Quando o documento descartado JÁ havia sido
          arquivado (só acontece com o ASO, que sobe ao ser validado, sem esperar a régua), a tela
          DIZ isso, em vez de deixar o consultor achar que o arquivo saiu de lá também. */}
      {avisoDrive && (
        <p className="mb-4 flex flex-wrap items-start gap-2 rounded-xl border border-[rgba(201,138,18,0.35)] bg-[rgba(201,138,18,0.1)] px-3 py-2 text-[12.5px] text-warn">
          <Icon name="alert" className="mt-0.5 h-4 w-4 flex-none" />
          {avisoDrive}
        </p>
      )}

      {/* ── Lista de documentos da régua ─────────────────────────────────── */}
      {loadError ? (
        <p className="py-8 text-center text-sm text-danger">{loadError}</p>
      ) : !detalhe ? (
        <p className="py-8 text-center text-sm text-faint">Carregando documentos…</p>
      ) : documentos.length === 0 ? (
        <p className="py-8 text-center text-sm text-faint">
          Sem régua para este par cliente+cargo (nenhum documento exigido).
        </p>
      ) : (
        <div className="space-y-2">
          {documentos.map((d) => {
            // Tipo REAL da linha (pode ser o equivalente, Bloco 3); o nome é só fallback.
            const tipoId = d.tipoDocumentoId ?? idPorNome.get(d.nome);
            const result = tipoId ? resultados[tipoId] : undefined;
            // Pill do documento (veredito da sessão, estado persistido ou "aguardando auditoria").
            const pill = pillDoc(result, d.estado);
            const auditando = auditandoId === tipoId;
            const erro = tipoId ? erroDoc[tipoId] : undefined;
            // Já houve veredito? Muda só o rótulo do botão de UPLOAD (enviar arquivo novo).
            const jaTeveVeredito =
              Boolean(result) || (d.estado !== "PENDENTE" && d.estado !== "AGUARDANDO_AUDITORIA");
            return (
              <div key={d.nome} className="rounded-xl border border-[var(--border)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {/* PISO DE LARGURA DO NOME (regra de layout desta linha). `min-w-0` deixava a
                      coluna encolher sem fundo: com cinco botões ela chegou a ~1 caractere e o nome
                      renderizou na vertical, uma letra por linha. `basis-[240px]` + `min-w-[200px]`
                      dão um piso que o flex não pode violar; `flex-1` continua aproveitando toda a
                      sobra quando ela existe (§A.20). */}
                  <div className="min-w-[200px] flex-1 basis-[240px]">
                    {/* `break-words` em vez de `truncate`: se o rótulo ainda exceder a coluna, ele
                        QUEBRA em duas linhas em vez de virar reticências. O nome do documento é a
                        informação que identifica a linha, não pode sumir. */}
                    <div className="break-words text-[13.5px] font-semibold text-text">{d.nome}</div>
                    <div className="text-[11.5px] text-faint">{EXIG_ROTULO[d.exigencia]}</div>
                    {/* OST B1 / Bloco 3: QUEM validou fica VISÍVEL na linha, não só na trilha. */}
                    {d.validadoPorNome && (
                      <div className="mt-0.5 flex items-center gap-1 text-[11.5px] text-ok">
                        <Icon name="check" className="h-3 w-3 flex-none" />
                        <span className="truncate" title={`Validado por ${d.validadoPorNome}`}>
                          Validado por {d.validadoPorNome}
                        </span>
                      </div>
                    )}
                    {/* OST motivo verdadeiro / Bloco 5: MARCADOR DE TEMPO PARADO. Aparece SÓ quando o
                        backend diz que passou do limiar; não é contador permanente de coluna. Sem
                        ele, um documento travado por falha de sistema fica indistinguível de um
                        documento que o candidato simplesmente não mandou, e foi assim que um caso
                        real ficou 14h parado sem ninguém saber. */}
                    {typeof d.paradoHa === "number" && (
                      <div
                        className="mt-0.5 flex items-center gap-1 text-[11.5px] font-semibold text-warn"
                        title="Auditoria parada além do esperado. Use Reauditar; se insistir, avise a TI."
                      >
                        <Icon name="alert" className="h-3 w-3 flex-none" />
                        <span>Parado há {rotuloParado(d.paradoHa)}</span>
                      </div>
                    )}
                  </div>
                  {/* AÇÕES QUE QUEBRAM. Antes era `flex-none`: a barra de botões tomava a largura
                      que quisesse e o resto sobrava (ou não) para o nome. Sem `flex-none` e com
                      `flex-wrap`, quando os botões não cabem eles descem para uma segunda fila, e
                      quem NÃO cede é o nome. `basis-full sm:basis-auto` põe as ações numa linha
                      própria em tela estreita, onde lado a lado não cabe de jeito nenhum. */}
                  <div className="flex basis-full flex-wrap items-center justify-end gap-2 sm:basis-auto">
                    {pill && <Pill tone={pill.tone}>{pill.rotulo}</Pill>}
                    <input
                      ref={(el) => {
                        if (tipoId) fileRefs.current[tipoId] = el;
                      }}
                      type="file"
                      accept={ACCEPT}
                      className="hidden"
                      disabled={!tipoId || auditando}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f && tipoId) void auditar(tipoId, f);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      className={cn(BTN_TEXTO, "hover:text-text")}
                      disabled={!tipoId || auditando}
                      title={tipoId ? "Enviar um arquivo para auditar" : "Tipo de documento não identificado"}
                      onClick={() => tipoId && fileRefs.current[tipoId]?.click()}
                    >
                      {auditando ? (
                        <>
                          <Spinner /> Processando…
                        </>
                      ) : (
                        <>
                          <Icon name="doc" className="h-4 w-4" />
                          {jaTeveVeredito ? "Enviar novo arquivo" : "Auditar documento"}
                        </>
                      )}
                    </button>
                    {/* OST A / Bloco 5: nova análise do arquivo JÁ coletado, sem upload. Disponível
                        em qualquer estado, porque quem decide que a IA errou é o consultor.
                        SÓ ÍCONE (ver o comentário do container): a seta circular de "refazer" é
                        inequívoca e o rótulo continua acessível por tooltip e por leitor de tela. */}
                    <button
                      type="button"
                      className={BTN_ICONE}
                      disabled={!tipoId || auditando}
                      title="Reauditar: reanalisar o documento já recebido, sem enviar arquivo de novo"
                      aria-label="Reauditar documento"
                      onClick={() => tipoId && void reauditar(tipoId)}
                    >
                      <Icon name="refresh" className="h-4 w-4" />
                    </button>
                    {/* OST B1 / Bloco 3: o consultor assume o documento como válido quando a IA erra.
                        Some quando já há validação humana (o nome do validador aparece na linha). */}
                    {!d.validadoPorNome && (
                      <button
                        type="button"
                        className={cn(BTN_TEXTO, "hover:text-ok")}
                        disabled={!tipoId || auditando}
                        title="Assumir este documento como válido, por decisão sua"
                        onClick={() => tipoId && void validarPorHumano(tipoId)}
                      >
                        <Icon name="check" className="h-4 w-4" />
                        Validar
                      </button>
                    )}
                    {/* BLOCO 2 — VISUALIZAR: abre o arquivo servido da STAGING. Antes desta OST não
                        havia caminho nenhum para ver o documento, e o consultor julgava um reprovado
                        no escuro, só pelo motivo da IA. */}
                    <button
                      type="button"
                      className={BTN_ICONE}
                      disabled={!tipoId || auditando || carregandoArquivos === tipoId}
                      title="Visualizar: abrir o documento recebido para conferir"
                      aria-label="Visualizar documento"
                      onClick={() => tipoId && void visualizar(tipoId)}
                    >
                      {carregandoArquivos === tipoId ? (
                        <Spinner />
                      ) : (
                        <Icon name="eye" className="h-4 w-4" />
                      )}
                    </button>
                    {/* BLOCO 3 — DESCARTAR: tira o documento do fluxo em uma operação só, incluindo a
                        marca de dedup (sem ela o reenvio do mesmo arquivo seria ignorado). */}
                    <button
                      type="button"
                      className={cn(BTN_ICONE, "hover:text-danger")}
                      disabled={!tipoId || auditando}
                      title="Descartar este documento: o candidato precisará reenviar"
                      aria-label="Descartar documento"
                      onClick={() => tipoId && void descartar(tipoId, d.nome)}
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* BLOCO 2 — resultado do "Visualizar". Só aparece depois do clique. */}
                {(() => {
                  const arqs = tipoId ? arquivosPorTipo[tipoId] : undefined;
                  if (!arqs) return null;
                  // Indisponível: TTL de 48h vencido, ou régua fechada e staging expurgada. Decisão
                  // do diretor: NÃO oferecer rebaixar do Pandapé nem rodar coleta de novo.
                  if (!arqs.disponivel) {
                    return (
                      <p className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[12.5px] text-dim">
                        {arqs.mensagem}
                      </p>
                    );
                  }
                  // Arquivo único já abriu sozinho no clique; não precisa de lista.
                  if (arqs.arquivos.length <= 1) return null;
                  // Conjunto (frente e verso, páginas da CTPS): o veredito é do conjunto, então
                  // TODAS as peças ficam abertas para conferência, não só a primeira.
                  return (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11.5px] text-faint">
                        {arqs.arquivos.length} arquivos neste documento:
                      </span>
                      {arqs.arquivos.map((a) => (
                        <button
                          key={a.indice}
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11.5px] font-semibold text-dim transition hover:bg-[var(--surface-2)] hover:text-text"
                          onClick={() => tipoId && void abrirArquivo(tipoId, a.indice)}
                        >
                          <Icon name="eye" className="h-3 w-3" />
                          {a.rotulo}
                        </button>
                      ))}
                    </div>
                  );
                })()}

                {/* Motivo do veredito (texto da regra, sem PII) */}
                {/* Motivo do veredito (BLOCO 2): o da sessão tem prioridade; senão o persistido
                    (INCONFORME/PENDENTE) ou a explicação do AGUARDANDO. Texto da regra, sem PII. */}
                {(() => {
                  const motivo = result?.motivo ?? d.observacao;
                  if (!motivo) return null;
                  const st = result?.status ?? d.estado;
                  const cor =
                    st === "VALIDADO" || st === "ENTREGUE"
                      ? "text-ok"
                      : st === "INCONFORME"
                        ? "text-danger"
                        : st === "AGUARDANDO_AUDITORIA"
                          ? "text-dim"
                          : "text-warn";
                  return <p className={cn("mt-2 text-[12.5px]", cor)}>{motivo}</p>;
                })()}
                {erro && (
                  <p className="mt-2 text-[12.5px] text-danger" role="alert">
                    {erro}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

/** Spinner inline (Tailwind animate-spin), herda a cor do texto. */
function Spinner() {
  return (
    <span
      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
  );
}
