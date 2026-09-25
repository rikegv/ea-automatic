"use client";

import { useMemo, useRef, useState } from "react";
import {
  CAMPOS_IMPORT_CANDIDATO,
  type CampoImportCandidato,
  type CenarioImportCandidato,
  type ConfiancaImport,
  type MapaColunasCandidato,
  type PreviaImportCandidato,
  type ResultadoImportCandidato,
  type StatusLinhaImportCandidato,
  type VagaListItem,
} from "@ea/shared-types";
import { apiUpload } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { BlocoCarregando } from "@/components/ui/Spinner";
import { StatusPill } from "@/components/ui/StatusPill";
import type { PillTone } from "@/components/ui/Pill";
import { cn } from "@/lib/cn";

/**
 * IMPORTAÇÃO DE CANDIDATOS POR PLANILHA, com a IA lendo o cabeçalho (Central de Candidatos, A&S).
 *
 * Espelha a UX da importação de Lojas (`admin/ImportarLojasModal`): sobe a planilha em qualquer
 * formato, a IA diz QUAIS COLUNAS são Nome, CPF, E-mail e afins, o time confere e corrige o de/para
 * antes de gravar, e nada é escrito sem o aceite explícito. O que muda aqui é o alvo (pessoas, não
 * lojas) e o passo do CENÁRIO na frente: importar só para a base (Sem Vaga) ou já vinculando os
 * importados a uma vaga (Com Vaga).
 *
 * O FLUXO, em cinco passos, cada um numa tela:
 *   1. CENÁRIO: Sem Vaga ou Com Vaga. Com Vaga escolhe a vaga num seletor com busca (§A.35).
 *   2. UPLOAD: sobe .xlsx, .xls ou .csv; o backend lê e a IA sugere o de/para. Recusa da leitura
 *      aparece AQUI, com a mensagem do backend e o convite a escolher outro arquivo: nunca se
 *      avança com dado ilegível, e nunca se mostra erro técnico cru.
 *   3. DE/PARA: cada campo-alvo é um seletor editável, pré-marcado pela IA, com a confiança e a
 *      observação à vista. Só o Nome é obrigatório para avançar. O passo TAMBÉM DECLARA O QUE A
 *      LEITURA ENTENDEU (qual aba, qual linha virou cabeçalho) e deixa TROCAR A ABA: base real de
 *      ERP vem com linha de título antes do cabeçalho e com mais de uma aba, e o pior desfecho é o
 *      time achar que o sistema leu a aba certa quando leu a outra, em silêncio.
 *   4. CONFIRMAÇÃO: a amostra JÁ INTERPRETADA pelo de/para confirmado, para o time ver o que
 *      entendeu antes de gravar.
 *   5. RESULTADO: o relatório (importados, reaproveitados, vinculados, ignorados) e a lista por linha.
 *
 * A IA ACELERA, NÃO HABILITA: Vertex fora ou coluna não reconhecida, o de/para abre para o time
 * escolher na mão, nunca vira "não dá para importar hoje".
 *
 * §A.6: a planilha vai no CORPO do multipart, nunca em query string; o CPF nunca aparece em URL.
 * §A.11: sem travessão. §A.24: títulos e tags em Title Case. §A.41: modal de preenchimento, não
 * fecha ao clicar fora, sai por Cancelar.
 */

type Passo = "cenario" | "upload" | "depara" | "confirmar" | "resultado";

const ROTULO_CAMPO: Record<CampoImportCandidato, string> = {
  nome: "Nome",
  cpf: "CPF",
  email: "E-mail",
  telefone: "Telefone",
  nascimento: "Nascimento",
  cidade: "Cidade",
  uf: "UF",
};

const ROTULO_CONFIANCA: Record<ConfiancaImport, string> = {
  ALTA: "Alta",
  MEDIA: "Média",
  BAIXA: "Baixa",
};

const TOM_CONFIANCA: Record<ConfiancaImport, PillTone> = {
  ALTA: "ok",
  MEDIA: "wn",
  BAIXA: "or",
};

const ROTULO_STATUS_LINHA: Record<StatusLinhaImportCandidato, string> = {
  IMPORTADO: "Importado",
  REAPROVEITADO: "Reaproveitado",
  SEM_CPF: "Sem CPF",
  INVALIDO: "Inválido",
};

const TOM_STATUS_LINHA: Record<StatusLinhaImportCandidato, PillTone> = {
  IMPORTADO: "ok",
  REAPROVEITADO: "ok",
  SEM_CPF: "wn",
  INVALIDO: "dg",
};

export function ImportarCandidatosModal({
  vagasAbertas,
  token,
  onClose,
  onImportado,
}: {
  /** As vagas que podem receber alocação manual, a mesma lista dos demais modais desta tela. */
  vagasAbertas: VagaListItem[];
  token: string | null;
  onClose: () => void;
  /** A importação gravou: a Central recarrega a lista por baixo. */
  onImportado: () => void;
}) {
  const [passo, setPasso] = useState<Passo>("cenario");
  const [cenario, setCenario] = useState<CenarioImportCandidato | null>(null);
  const [vagaId, setVagaId] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<PreviaImportCandidato | null>(null);
  const [mapa, setMapa] = useState<MapaColunasCandidato | null>(null);
  /**
   * A ABA EM USO. Nasce do que o backend escolheu (`abaUsada`) e passa a ser a escolha do time
   * quando ele troca. Vai junto no `aplicar`: gravar de uma aba diferente da que foi conferida na
   * tela seria importar um arquivo que ninguém viu.
   */
  const [aba, setAba] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportCandidato | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const optVagas = useMemo(
    () =>
      vagasAbertas.map((v) => ({
        value: v.id,
        label: v.nomeDivulgacao ?? v.codigo ?? "Vaga sem nome de divulgação",
        // A busca acha também pelo código do processo e pelo cliente, sem poluir o rótulo (§A.35).
        busca: [v.codigo, v.clienteNome, v.cargoNome].filter(Boolean).join(" "),
      })),
    [vagasAbertas],
  );

  const colunasComoOpcoes = useMemo(
    () =>
      previa
        ? [
            { value: "", label: "não existe na planilha" },
            ...previa.cabecalho.map((nome, i) => ({
              value: String(i),
              label: nome || `coluna ${i + 1}`,
            })),
          ]
        : [],
    [previa],
  );

  const semNome = mapa !== null && mapa.nome === null;

  /**
   * O TETO DE LINHAS, e por que ele tem bloco próprio na tela.
   *
   * A leitura CORTA a planilha no teto, e `totalLinhas` já vem cortado: dizer "N linhas na planilha"
   * com esse N faz o time concluir que entrou tudo, e uma planilha de 5.000 pessoas perde 3.000 sem
   * ninguém ver. `descartadasPorTeto` é o que ficou de fora; o total do ARQUIVO é a soma dos dois.
   *
   * Campo opcional no contrato: backend que ainda não o envie cai em zero e a tela se comporta como
   * antes, sem aviso nenhum e sem quebrar.
   */
  const descartadasPorTeto = previa?.descartadasPorTeto ?? 0;
  const acimaDoTeto = descartadasPorTeto > 0;
  /** O que o arquivo tem de verdade, antes do corte. */
  const totalNoArquivo = (previa?.totalLinhas ?? 0) + descartadasPorTeto;

  /** As abas do arquivo como opções do seletor; só aparece quando há mais de uma. */
  const optAbas = useMemo(
    () => (previa?.abasDisponiveis ?? []).map((nome) => ({ value: nome, label: nome })),
    [previa],
  );

  /**
   * O QUE A LEITURA ENTENDEU, em uma frase. Montada só com o que o backend informou: CSV não tem
   * aba, e planilha sem título antes do cabeçalho não precisa justificar a linha 1. §A.11: vírgula
   * e ponto, nunca travessão.
   */
  const frasePrevia = useMemo(() => {
    if (!previa) return null;
    const partes: string[] = [];
    if (previa.abaUsada) partes.push(`Lendo a aba ${previa.abaUsada}`);
    if (previa.linhaCabecalho) {
      partes.push(
        partes.length > 0
          ? `cabeçalho na linha ${previa.linhaCabecalho}`
          : `Cabeçalho na linha ${previa.linhaCabecalho}`,
      );
    }
    return partes.length > 0 ? `${partes.join(", ")}.` : null;
  }, [previa]);

  /**
   * A ESPERA DECLARADA, e por que ela tem texto DIFERENTE por passo.
   *
   * O defeito que isto corrige: anexar a planilha dispara uma leitura que, na base real, leva cerca
   * de dez segundos (ler o arquivo mais a chamada da IA que identifica as colunas). Sem sinal
   * nenhum, a tela parece TRAVADA: quem espera anexa de novo, troca de arquivo ou desiste. Uma linha
   * de texto apagada no topo não bastava, porque não parecia atividade.
   *
   * São TRÊS esperas distintas, e dizer qual delas está em curso é o que dá a noção de progresso:
   * a primeira leitura (upload), a releitura da aba trocada (de, para) e a gravação (confirmação).
   *
   * §A.24: `titulo` é rótulo, Title Case; `detalhe` é frase de apoio, escrita normal. §A.11: sem
   * travessão.
   */
  const espera = useMemo(() => {
    if (!carregando) return null;
    if (passo === "confirmar") {
      return {
        titulo: "Gravando A Importação",
        detalhe: "Criando os candidatos e reaproveitando quem já existe pelo CPF.",
      };
    }
    if (passo === "depara") {
      return {
        titulo: "Lendo A Aba Escolhida",
        detalhe: "Identificando as colunas dessa aba e refazendo a sugestão do de, para.",
      };
    }
    return {
      titulo: "Lendo A Planilha",
      detalhe:
        "Identificando as colunas de nome, CPF, e-mail e os demais dados. Pode levar alguns segundos.",
    };
  }, [carregando, passo]);

  /**
   * PEDE A PRÉVIA ao backend, do arquivo inteiro ou de uma aba específica.
   *
   * A recusa NÃO é silenciosa e NÃO avança: a mensagem do backend (formato não suportado, arquivo
   * corrompido, planilha vazia, sem cabeçalho reconhecível) volta para a tela e o fluxo fica no
   * passo da planilha, para o time escolher outro arquivo. `preservarPrevia` é o caso da TROCA DE
   * ABA: falhar ali não pode apagar o de/para que já estava conferido na tela.
   */
  async function pedirPrevia(file: File, abaEscolhida: string | null, preservarPrevia = false) {
    setCarregando(true);
    setErro(null);
    try {
      const form = new FormData();
      // §A.6: o arquivo vai no CORPO, nunca em query string.
      form.append("file", file);
      if (abaEscolhida) form.append("aba", abaEscolhida);
      const p = await apiUpload<PreviaImportCandidato>(
        "/as/candidatos/importar/previa",
        form,
        token,
      );
      setPrevia(p);
      // A sugestão da IA é refeita para a aba nova: colunas diferentes, de/para diferente.
      setMapa(p.sugestao.mapa);
      setAba(p.abaUsada ?? abaEscolhida);
      setPasso("depara");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler a planilha.");
      if (!preservarPrevia) {
        setPrevia(null);
        setMapa(null);
        setAba(null);
        setPasso("upload");
      }
    } finally {
      setCarregando(false);
    }
  }

  /** Sobe a planilha e pede a prévia com o de/para sugerido pela IA. */
  async function escolherArquivo(file: File | null) {
    setArquivo(file);
    setAba(null);
    if (!file) {
      setPrevia(null);
      setMapa(null);
      setErro(null);
      return;
    }
    await pedirPrevia(file, null);
  }

  /**
   * TROCA A ABA: refaz a prévia e o de/para para a aba que o time escolheu.
   *
   * O estado `aba` só avança QUANDO A LEITURA VOLTA (dentro do `pedirPrevia`), nunca no clique.
   * Marcá-lo antes deixaria o seletor apontando para uma aba que falhou ao ser lida, e é esse valor
   * que o `aplicar` manda: a tela diria uma aba e a gravação leria outra.
   */
  async function trocarAba(nova: string) {
    if (!arquivo || nova === aba) return;
    await pedirPrevia(arquivo, nova, true);
  }

  /** Limpa a recusa e reabre o seletor de arquivo, para o time subir outro. */
  function escolherOutroArquivo() {
    setErro(null);
    setArquivo(null);
    setPrevia(null);
    setMapa(null);
    setAba(null);
    if (inputRef.current) {
      // Zerar o value é o que faz o `change` disparar de novo, mesmo no MESMO arquivo corrigido.
      inputRef.current.value = "";
      inputRef.current.click();
    }
  }

  function corrigirColuna(campo: CampoImportCandidato, valor: string) {
    setMapa((atual) =>
      atual ? { ...atual, [campo]: valor === "" ? null : Number(valor) } : atual,
    );
  }

  async function aplicar() {
    if (!arquivo || !cenario || !mapa) return;
    setCarregando(true);
    setErro(null);
    try {
      const form = new FormData();
      form.append("file", arquivo);
      form.append("cenario", cenario);
      if (cenario === "COM_VAGA" && vagaId) form.append("vagaId", vagaId);
      // A MESMA ABA que foi conferida na tela: sem isto, o aplicar poderia reler a aba padrão e
      // gravar um conteúdo que ninguém olhou no de/para.
      if (aba) form.append("aba", aba);
      /**
       * A ASSINATURA DO CABEÇALHO QUE FOI CONFERIDO NA TELA, ecoada de volta.
       *
       * O mapa de colunas é conferido pelo time contra UM cabeçalho específico. O aplicar recalcula
       * a assinatura da aba que recebeu e recusa quando diverge, então "mapa da aba A aplicado na
       * aba B" deixa de gravar a coluna errada em silêncio e passa a ser recusa explícita.
       *
       * A fonte é a `previa`, e não um estado paralelo, de propósito: `previa`, `mapa` e `aba` só
       * avançam juntos, dentro do `pedirPrevia`. Uma cópia à parte poderia ficar atrás depois de uma
       * troca de aba, e mandaria a assinatura de um cabeçalho que já não é o da tela.
       *
       * Prévia de backend antigo não traz o campo: nada é enviado e a gravação segue como antes.
       */
      if (previa?.assinaturaCabecalho) {
        form.append("assinaturaCabecalho", previa.assinaturaCabecalho);
      }
      form.append("mapa", JSON.stringify(mapa));
      const r = await apiUpload<ResultadoImportCandidato>(
        "/as/candidatos/importar/aplicar",
        form,
        token,
      );
      setResultado(r);
      setPasso("resultado");
      // A Central recarrega por baixo: quem foi importado já aparece na fila ao fechar.
      onImportado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gravar a importação.");
    } finally {
      setCarregando(false);
    }
  }

  const podeAvancarCenario = cenario === "SEM_VAGA" || (cenario === "COM_VAGA" && Boolean(vagaId));

  return (
    <Modal onClose={onClose} ariaLabel="Importar candidatos" className="max-w-[860px] p-6">
      <div className="mb-4">
        <div className="eyebrow !mb-1">Atração E Seleção</div>
        <h2 className="font-display text-xl font-bold">Importar Candidatos</h2>
        <p className="mt-1 text-[13px] text-dim">
          Suba a planilha do jeito que ela veio. A leitura entende quais colunas são nome, CPF,
          e-mail e os demais dados, e você confere e corrige antes de gravar. Nada é gravado sem o
          seu aceite.
        </p>
      </div>

      {/* O TRILHO DOS PASSOS: dá contexto de onde a pessoa está no fluxo. */}
      <ol className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-faint">
        {(
          [
            ["cenario", "Cenário"],
            ["upload", "Planilha"],
            ["depara", "De, Para"],
            ["confirmar", "Confirmação"],
            ["resultado", "Resultado"],
          ] as [Passo, string][]
        ).map(([p, rotulo], i) => (
          <li key={p} className="flex items-center gap-2">
            {i > 0 && <span className="text-faint">·</span>}
            <span className={cn(passo === p && "font-semibold text-accent")}>{rotulo}</span>
          </li>
        ))}
      </ol>

      {/* No passo da planilha a recusa tem bloco próprio, com a saída (escolher outro arquivo). */}
      {erro && passo !== "upload" && (
        <p className="mb-4 rounded-lg border border-[var(--danger)] bg-[rgba(220,70,70,0.08)] px-3 py-2 text-xs text-[var(--danger)]">
          {erro}
        </p>
      )}
      {/* A ESPERA, com o círculo girando e o que está acontecendo, no lugar da linha apagada que
          ninguém percebia. Fica acima do conteúdo do passo, então vale para os dois momentos de
          leitura (o upload e a troca de aba) e para a gravação, sem repetir bloco por passo. */}
      {espera && (
        <BlocoCarregando titulo={espera.titulo} detalhe={espera.detalhe} className="mb-4" />
      )}

      {/* ── PASSO 1: CENÁRIO ────────────────────────────────────────────────────────────────── */}
      {passo === "cenario" && (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                [
                  "SEM_VAGA",
                  "Sem Vaga",
                  "Importa as pessoas para a base. Elas ficam sem vaga e você aloca depois.",
                ],
                [
                  "COM_VAGA",
                  "Com Vaga",
                  "Importa as pessoas já vinculadas a uma vaga, como candidaturas.",
                ],
              ] as [CenarioImportCandidato, string, string][]
            ).map(([valor, titulo, descricao]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setCenario(valor)}
                aria-pressed={cenario === valor}
                className={cn(
                  "rounded-xl border p-4 text-left transition",
                  cenario === valor
                    ? "border-accent bg-[var(--surface-2)] ring-1 ring-[var(--accent)]"
                    : "border-[var(--border)] hover:bg-[var(--surface-2)]",
                )}
              >
                <div className="font-display text-base font-bold">{titulo}</div>
                <p className="mt-1 text-[12.5px] text-dim">{descricao}</p>
              </button>
            ))}
          </div>

          {cenario === "COM_VAGA" && (
            <label className="grid gap-1">
              <span className="ds-label">Vaga</span>
              {/* §A.35: seletor do design system com busca; a lista pode ter dezenas de vagas. */}
              <Select
                value={vagaId}
                onChange={setVagaId}
                options={optVagas}
                placeholder="Escolha a vaga"
                ariaLabel="Vaga para vincular os importados"
                searchable
              />
              {optVagas.length === 0 && (
                <span className="text-[11.5px] text-faint">
                  Nenhuma vaga aberta para receber candidatos no momento.
                </span>
              )}
            </label>
          )}
        </div>
      )}

      {/* ── PASSO 2: UPLOAD ─────────────────────────────────────────────────────────────────── */}
      {passo === "upload" && (
        <div className="grid gap-2">
          <span className="ds-label">Planilha De Candidatos</span>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="ds-input"
            onChange={(e) => void escolherArquivo(e.target.files?.[0] ?? null)}
            aria-label="Planilha de candidatos"
            // Durante a leitura o campo não aceita outro arquivo: anexar de novo no meio da espera
            // dispararia uma segunda leitura, e a resposta da primeira sobrescreveria a da segunda.
            disabled={carregando}
          />
          <p className="text-[11.5px] text-faint">
            Aceita .xlsx, .xls e .csv. A leitura encontra o cabeçalho mesmo com uma linha de título
            antes dele, e sugere o de, para das colunas no próximo passo.
          </p>

          {/* A RECUSA DA LEITURA, na mesma tela em que se escolhe o arquivo. A mensagem é a do
              backend (formato não suportado, arquivo corrompido, planilha vazia, sem cabeçalho
              reconhecível): dizer o motivo é o que permite ao time corrigir o arquivo. Nada avança
              daqui, porque não há dado legível para conferir. */}
          {erro && (
            <div
              role="alert"
              className="mt-2 rounded-xl border border-[var(--danger)] bg-[rgba(220,70,70,0.08)] p-3"
            >
              <div className="font-display text-sm font-bold text-[var(--danger)]">
                Não Foi Possível Ler A Planilha
              </div>
              <p className="mt-1 text-[12.5px] text-text">{erro}</p>
              <p className="mt-1 text-[11.5px] text-dim">
                Nada foi importado. Corrija o arquivo e suba de novo, ou escolha outro.
              </p>
              <div className="mt-3">
                <Button variant="secondary" onClick={escolherOutroArquivo}>
                  Escolher outro arquivo
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PASSO 3: DE, PARA ───────────────────────────────────────────────────────────────── */}
      {passo === "depara" && previa && mapa && (
        <div className="grid gap-4">
          {acimaDoTeto && (
            <AvisoTeto
              totalNoArquivo={totalNoArquivo}
              entram={previa.totalLinhas}
              ficamDeFora={descartadasPorTeto}
            />
          )}

          {/* O QUE A LEITURA ENTENDEU, declarado antes das colunas. É a linha que impede o time de
              supor que o sistema leu a aba certa quando leu a outra. */}
          {(frasePrevia || optAbas.length > 1) && (
            <div className="flex flex-wrap items-end justify-between gap-3">
              {frasePrevia && <p className="text-[11.5px] text-dim">{frasePrevia}</p>}
              {/* Mais de uma aba: o time troca e a prévia é refeita, inclusive a sugestão da IA.
                  §A.35: Select do design system, com busca quando a lista é longa. */}
              {optAbas.length > 1 && (
                <label className="grid gap-1">
                  <span className="ds-label">Aba Da Planilha</span>
                  <Select
                    value={aba ?? ""}
                    onChange={(v) => void trocarAba(v)}
                    options={optAbas}
                    placeholder="Escolha a aba"
                    ariaLabel="Aba da planilha a ser lida"
                    disabled={carregando}
                    className="min-w-[220px]"
                  />
                </label>
              )}
            </div>
          )}

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="ds-label">Colunas Da Planilha</span>
              <StatusPill
                tone={TOM_CONFIANCA[previa.sugestao.confianca]}
                label={`Confiança ${ROTULO_CONFIANCA[previa.sugestao.confianca]}`}
              />
            </div>
            {previa.sugestao.observacao && (
              <p className="mb-3 text-[11.5px] text-dim">{previa.sugestao.observacao}</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CAMPOS_IMPORT_CANDIDATO.map((campo) => (
                <label key={campo} className="grid gap-1">
                  <span className="ds-label">
                    {ROTULO_CAMPO[campo]}
                    {campo === "nome" && <span className="text-[var(--danger)]"> *</span>}
                  </span>
                  {/* §A.35: o Select do design system, nunca o nativo. A busca acha a coluna certa
                      numa planilha larga sem rolar a lista inteira. */}
                  <Select
                    value={mapa[campo] === null ? "" : String(mapa[campo])}
                    onChange={(v) => corrigirColuna(campo, v)}
                    options={colunasComoOpcoes}
                    ariaLabel={`Coluna de ${ROTULO_CAMPO[campo]}`}
                    searchable
                  />
                </label>
              ))}
            </div>
            {semNome && (
              <p className="mt-2 text-xs text-[var(--danger)]">
                Escolha qual coluna tem o nome do candidato para continuar.
              </p>
            )}
          </div>
          {/* A CONTAGEM NÃO PODE AFIRMAR "na planilha" QUANDO O NÚMERO JÁ FOI CORTADO. Acima do
              teto, a frase separa o que o arquivo tem do que entra; abaixo, os dois são o mesmo
              número e a frase antiga continua verdadeira. */}
          <p className="text-[11.5px] text-faint">
            {acimaDoTeto ? (
              <>
                {totalNoArquivo} linhas no arquivo, {previa.totalLinhas} dentro do limite desta
                importação.{" "}
              </>
            ) : (
              <>
                {previa.totalLinhas} {previa.totalLinhas === 1 ? "linha" : "linhas"} a importar.{" "}
              </>
            )}
            Só o Nome é obrigatório: os demais campos podem ficar sem coluna.
          </p>
        </div>
      )}

      {/* ── PASSO 4: CONFIRMAÇÃO ────────────────────────────────────────────────────────────── */}
      {passo === "confirmar" && previa && mapa && (
        <div className="grid gap-3">
          {/* O aviso do teto se repete AQUI de propósito: é o passo em que se clica para gravar, e
              é onde a conclusão errada ("entrou tudo") custaria as pessoas que ficaram de fora. */}
          {acimaDoTeto && (
            <AvisoTeto
              totalNoArquivo={totalNoArquivo}
              entram={previa.totalLinhas}
              ficamDeFora={descartadasPorTeto}
            />
          )}
          <p className="text-[13px] text-dim">
            Confira uma amostra de como a planilha foi interpretada.{" "}
            {acimaDoTeto ? (
              <>
                O arquivo tem {totalNoArquivo} linhas e esta importação alcança {previa.totalLinhas};
              </>
            ) : (
              <>
                São {previa.totalLinhas} {previa.totalLinhas === 1 ? "linha" : "linhas"} no total;
              </>
            )}{" "}
            abaixo, as primeiras.
          </p>
          <div className="ea-scroll max-h-[340px] overflow-auto rounded-xl border border-[var(--border)]">
            {/* §A.12/§A.20: máscara única de tabela, cabeçalho centralizado, sem esmagar. */}
            <table className="ds-table w-full min-w-[640px] text-sm">
              <thead>
                <tr>
                  {CAMPOS_IMPORT_CANDIDATO.map((campo) => (
                    <th key={campo} className="text-center">
                      {ROTULO_CAMPO[campo]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previa.amostra.map((linha, i) => (
                  <tr key={i}>
                    {CAMPOS_IMPORT_CANDIDATO.map((campo) => {
                      const idx = mapa[campo];
                      const valor = idx !== null ? (linha[idx] ?? "").trim() : "";
                      return (
                        <td
                          key={campo}
                          className={cn(
                            "text-center",
                            campo === "nome" ? "font-semibold" : "text-dim",
                          )}
                        >
                          {valor || <span className="text-faint">não informado</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── PASSO 5: RESULTADO ──────────────────────────────────────────────────────────────── */}
      {passo === "resultado" && resultado && (
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-3">
            <ResumoCartao rotulo="Importados" valor={resultado.importados} tom="ok" />
            <ResumoCartao rotulo="Reaproveitados" valor={resultado.reaproveitados} tom="ok" />
            <ResumoCartao rotulo="Vinculados" valor={resultado.vinculados} tom="ok" />
            <ResumoCartao rotulo="Ignorados" valor={resultado.ignorados} tom="wn" />
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-dim">
            <span>
              <strong className="text-text">{resultado.contagem.total}</strong> no total
            </span>
            <span>
              <strong className="text-text">{resultado.contagem.novos}</strong> novos
            </span>
            <span>
              <strong className="text-text">{resultado.contagem.duplicadosCpf}</strong> duplicados
              por CPF
            </span>
            <span>
              <strong className="text-text">{resultado.contagem.semCpf}</strong> sem CPF
            </span>
            <span>
              <strong className="text-text">{resultado.contagem.invalidos}</strong> inválidos
            </span>
          </div>

          {resultado.linhas.length > 0 && (
            <div className="ea-scroll max-h-[320px] overflow-auto rounded-xl border border-[var(--border)]">
              <table className="ds-table w-full min-w-[560px] text-sm">
                <thead>
                  <tr>
                    <th className="text-center">Linha</th>
                    <th className="text-center">Nome</th>
                    <th className="text-center">Status</th>
                    <th className="text-center">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.linhas.map((l) => (
                    <tr key={l.linha}>
                      <td className="text-center font-mono text-dim">{l.linha}</td>
                      <td className="font-semibold">{l.nome}</td>
                      <td className="text-center">
                        <span className="inline-flex justify-center">
                          <StatusPill
                            tone={TOM_STATUS_LINHA[l.status]}
                            label={ROTULO_STATUS_LINHA[l.status]}
                          />
                        </span>
                      </td>
                      <td className="text-dim">
                        {l.motivo ?? <span className="text-faint">não informado</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── RODAPÉ: navegação entre passos ──────────────────────────────────────────────────── */}
      <div className="mt-6 flex items-center justify-between gap-2">
        <div>
          {(passo === "depara" || passo === "confirmar") && (
            <Button
              variant="secondary"
              // Voltar no meio de uma leitura ou da gravação deixaria a resposta chegando num passo
              // que já mudou. A espera termina primeiro.
              disabled={carregando}
              onClick={() => setPasso(passo === "confirmar" ? "depara" : "upload")}
            >
              Voltar
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {passo === "resultado" ? (
            <Button onClick={onClose}>Concluir</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              {passo === "cenario" && (
                <Button disabled={!podeAvancarCenario} onClick={() => setPasso("upload")}>
                  Avançar
                </Button>
              )}
              {passo === "depara" && (
                // Avançar durante a releitura da aba levaria à confirmação o de/para da aba ANTIGA,
                // que é justamente a divergência que a assinatura do cabeçalho existe para barrar.
                <Button disabled={semNome || carregando} onClick={() => setPasso("confirmar")}>
                  Avançar
                </Button>
              )}
              {/* ACIMA DO TETO, O BOTÃO NÃO CHAMA O BACKEND: a gravação é recusada lá (ela não
                  importa arquivo cortado pela metade), então oferecer o clique só produziria um
                  erro depois do aceite. O caminho é dividir o arquivo, e o aviso diz isso. */}
              {passo === "confirmar" && (
                <Button disabled={carregando || acimaDoTeto} onClick={() => void aplicar()}>
                  Importar {previa ? `${previa.totalLinhas} ` : ""}
                  {previa && previa.totalLinhas === 1 ? "Candidato" : "Candidatos"}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

/**
 * O AVISO DO TETO DE LINHAS, visível e não uma nota de pé de tela.
 *
 * O defeito que ele corrige: a leitura corta a planilha no teto e a tela dizia "N linhas na
 * planilha" com o N JÁ CORTADO. Uma planilha de 5.000 candidatos anunciava 2.000, o time lia como
 * "entrou tudo", e 3.000 pessoas ficavam de fora sem ninguém saber. O aviso diz os TRÊS números
 * (o que o arquivo tem, o que entra, o que fica de fora) e o que fazer a respeito.
 *
 * §A.11: sem travessão. §A.24: Title Case no título, frase normal no corpo.
 */
function AvisoTeto({
  totalNoArquivo,
  entram,
  ficamDeFora,
}: {
  totalNoArquivo: number;
  entram: number;
  ficamDeFora: number;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-[var(--danger)] bg-[rgba(220,70,70,0.08)] p-3"
    >
      <div className="font-display text-sm font-bold text-[var(--danger)]">
        Planilha Acima Do Limite De Importação
      </div>
      <p className="mt-1 text-[12.5px] text-text">
        O arquivo tem <strong>{totalNoArquivo}</strong> linhas e o limite por importação é{" "}
        <strong>{entram}</strong>. As outras <strong>{ficamDeFora}</strong> linhas não seriam
        importadas, então a gravação fica bloqueada para ninguém ficar de fora sem aviso.
      </p>
      <p className="mt-1 text-[11.5px] text-dim">
        Divida a planilha em arquivos de até {entram} linhas e importe um por um.
      </p>
    </div>
  );
}

function ResumoCartao({
  rotulo,
  valor,
  tom,
}: {
  rotulo: string;
  valor: number;
  tom: "ok" | "wn";
}) {
  return (
    <div className="min-w-[120px] flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <div
        className={cn(
          "font-display text-2xl font-bold leading-none",
          tom === "ok" ? "text-[var(--ok)]" : "text-[var(--warn)]",
        )}
      >
        {valor}
      </div>
      <div className="mt-1 text-[11.5px] uppercase tracking-wide text-dim">{rotulo}</div>
    </div>
  );
}
