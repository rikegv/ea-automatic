"use client";

import { useMemo, useRef, useState } from "react";
import {
  CAMPOS_IMPORT_CANDIDATO,
  UFS,
  type AplicarImportCurriculo,
  type CampoEscalarCurriculo,
  type CampoImportCandidato,
  type CandidatoCurriculo,
  type CenarioImportCandidato,
  type ConfiancaImport,
  type ItemPreviaCurriculo,
  type MapaColunasCandidato,
  type PreviaImportCandidato,
  type PreviaImportCurriculo,
  type ResultadoImportCandidato,
  type ResultadoImportCurriculo,
  type StatusLinhaImportCandidato,
  type VagaListItem,
} from "@ea/shared-types";
import { apiFetch, apiUpload } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { BlocoCarregando } from "@/components/ui/Spinner";
import { StatusPill } from "@/components/ui/StatusPill";
import type { PillTone } from "@/components/ui/Pill";
import { cn } from "@/lib/cn";
import { useOrdenacao, type ColunaOrdenavel as ColunaOrd } from "@/lib/ordenacao";

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

/**
 * A FONTE da importação, escolhida no passo do cenário. "planilha" é o fluxo histórico (a IA mapeia
 * COLUNA); "curriculo" é o fluxo novo (a IA extrai VALOR de cada PDF/Word). O trilho de passos é o
 * mesmo para os dois; o que muda é o upload (um arquivo tabular vs. um lote de currículos) e o passo
 * do meio (de/para de coluna vs. revisão de valor).
 */
type Fonte = "planilha" | "curriculo";

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
  const [fonte, setFonte] = useState<Fonte | null>(null);
  const [cenario, setCenario] = useState<CenarioImportCandidato | null>(null);
  const [vagaId, setVagaId] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<PreviaImportCandidato | null>(null);
  const [mapa, setMapa] = useState<MapaColunasCandidato | null>(null);
  /**
   * O RAMO DE CURRÍCULO, à parte do ramo de planilha para não tocar nenhum estado do fluxo histórico.
   * `arquivosCurriculo` é o lote escolhido; `previaCurriculo` é o que a IA leu (metadados: arquivo,
   * confiança por campo, erro de leitura); `candidatosCurriculo` é a edição do time, indexada pelo
   * `indice` estável do item, para a ordenação clicável poder reordenar a tela sem perder o vínculo.
   */
  const [arquivosCurriculo, setArquivosCurriculo] = useState<File[]>([]);
  const [previaCurriculo, setPreviaCurriculo] = useState<PreviaImportCurriculo | null>(null);
  const [candidatosCurriculo, setCandidatosCurriculo] = useState<
    Record<number, CandidatoCurriculo>
  >({});
  const [resultadoCurriculo, setResultadoCurriculo] = useState<ResultadoImportCurriculo | null>(
    null,
  );
  const curriculoInputRef = useRef<HTMLInputElement>(null);
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
        label: v.nomeDivulgacao ?? v.codigo ?? "Vaga sem nome",
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
   * A REGRA DO NOME, espelhada do ramo de planilha: só o Nome torna uma linha gravável. Uma linha de
   * nome vazio é PULADA, não bloqueia as demais; o que bloqueia o avanço é o lote inteiro sem nome
   * nenhum (não há o que gravar). `candidatosCurriculoLista` segue a ordem estável dos itens.
   */
  const candidatosCurriculoLista = useMemo(
    () =>
      previaCurriculo
        ? previaCurriculo.itens.map((i) => candidatosCurriculo[i.indice]).filter(Boolean)
        : [],
    [previaCurriculo, candidatosCurriculo],
  );
  const comNomeCurriculo = candidatosCurriculoLista.filter((c) => c.nome.trim() !== "").length;
  const semNomeCurriculo = previaCurriculo !== null && comNomeCurriculo === 0;
  /** Do índice do item para o nome do arquivo, para o passo de resultado casar linha com currículo. */
  const arquivoPorIndice = useMemo(() => {
    const m = new Map<number, string>();
    previaCurriculo?.itens.forEach((i) => m.set(i.indice, i.arquivo));
    return m;
  }, [previaCurriculo]);

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
    if (fonte === "curriculo") {
      return {
        titulo: "Lendo Os Currículos",
        detalhe:
          "A IA lê cada arquivo e extrai nome, CPF, e-mail e os telefones. Pode levar alguns segundos por arquivo.",
      };
    }
    return {
      titulo: "Lendo A Planilha",
      detalhe:
        "Identificando as colunas de nome, CPF, e-mail e os demais dados. Pode levar alguns segundos.",
    };
  }, [carregando, passo, fonte]);

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

  /**
   * SOBE O LOTE DE CURRÍCULOS e pede a prévia: um POST multipart com o campo `files` repetido, um por
   * arquivo (§A.6: o binário vai no CORPO, nunca em query string). A IA lê cada arquivo e devolve o
   * valor que achou por campo; a recusa de UM arquivo vira `erroLeitura` no item, sem derrubar o lote.
   * Só uma falha geral (rede, backend fora) volta para o passo do upload para o time tentar de novo.
   */
  async function pedirPreviaCurriculo(files: File[]) {
    setCarregando(true);
    setErro(null);
    try {
      const form = new FormData();
      for (const f of files) form.append("files", f);
      const p = await apiUpload<PreviaImportCurriculo>(
        "/as/candidatos/importar-curriculo/previa",
        form,
        token,
      );
      setPreviaCurriculo(p);
      // A edição começa no que a IA leu; clona os telefones para não compartilhar o array do contrato.
      const inicial: Record<number, CandidatoCurriculo> = {};
      for (const item of p.itens) {
        inicial[item.indice] = { ...item.candidato, telefones: [...item.candidato.telefones] };
      }
      setCandidatosCurriculo(inicial);
      setPasso("depara");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler os currículos.");
      setArquivosCurriculo([]);
      setPreviaCurriculo(null);
      setCandidatosCurriculo({});
      setPasso("upload");
    } finally {
      setCarregando(false);
    }
  }

  /** Recebe o lote do seletor de arquivo e dispara a leitura (mesma UX do upload de planilha). */
  async function escolherCurriculos(files: File[]) {
    setArquivosCurriculo(files);
    if (files.length === 0) {
      setPreviaCurriculo(null);
      setCandidatosCurriculo({});
      setErro(null);
      return;
    }
    await pedirPreviaCurriculo(files);
  }

  /** Edita UM campo escalar de UM currículo, pelo índice estável do item. */
  function editarCampoCurriculo(indice: number, campo: CampoEscalarCurriculo, valor: string) {
    setCandidatosCurriculo((prev) => ({
      ...prev,
      [indice]: { ...prev[indice], [campo]: valor },
    }));
  }

  /** Substitui a lista de telefones de UM currículo (editor de N telefones). */
  function editarTelefonesCurriculo(indice: number, telefones: string[]) {
    setCandidatosCurriculo((prev) => ({
      ...prev,
      [indice]: { ...prev[indice], telefones },
    }));
  }

  /**
   * GRAVA o lote de currículos revisado. Vai JSON (não multipart): os binários já foram lidos na
   * prévia e descartados; o que grava são os VALORES que o time confirmou. Os candidatos seguem na
   * ordem estável dos itens; o backend pula a linha sem nome, como no ramo de planilha.
   */
  async function aplicarCurriculo() {
    if (!cenario || !previaCurriculo) return;
    setCarregando(true);
    setErro(null);
    try {
      const payload: AplicarImportCurriculo = {
        cenario,
        ...(cenario === "COM_VAGA" && vagaId ? { vagaId } : {}),
        // Telefone em branco (campo aberto e removido pela metade) não vira telefone cadastrado.
        candidatos: previaCurriculo.itens.map((i) => {
          const c = candidatosCurriculo[i.indice];
          return { ...c, telefones: c.telefones.map((t) => t.trim()).filter(Boolean) };
        }),
      };
      const r = await apiFetch<ResultadoImportCurriculo>(
        "/as/candidatos/importar-curriculo/aplicar",
        { method: "POST", body: payload, token },
      );
      setResultadoCurriculo(r);
      setPasso("resultado");
      // A Central recarrega por baixo, como no ramo de planilha.
      onImportado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gravar a importação.");
    } finally {
      setCarregando(false);
    }
  }

  const podeAvancarCenario =
    fonte !== null && (cenario === "SEM_VAGA" || (cenario === "COM_VAGA" && Boolean(vagaId)));

  return (
    <Modal onClose={onClose} ariaLabel="Importar candidatos" className="max-w-[860px] p-6">
      <div className="mb-4">
        <div className="eyebrow !mb-1">Atração E Seleção</div>
        <h2 className="font-display text-xl font-bold">Importar Candidatos</h2>
        <p className="mt-1 text-[13px] text-dim">
          {fonte === "curriculo" ? (
            <>
              Suba os currículos em PDF ou Word, um lote de uma vez. A IA lê cada arquivo e extrai
              nome, CPF, e-mail e os telefones, e você confere e corrige antes de gravar. Nada é
              gravado sem o seu aceite.
            </>
          ) : (
            <>
              Suba a planilha do jeito que ela veio. A leitura entende quais colunas são nome, CPF,
              e-mail e os demais dados, e você confere e corrige antes de gravar. Nada é gravado sem
              o seu aceite.
            </>
          )}
        </p>
      </div>

      {/* O TRILHO DOS PASSOS: dá contexto de onde a pessoa está no fluxo. */}
      <ol className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-faint">
        {(
          [
            ["cenario", "Cenário"],
            ["upload", fonte === "curriculo" ? "Currículo" : "Planilha"],
            ["depara", fonte === "curriculo" ? "Revisão" : "De, Para"],
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
          {/* A FONTE: planilha (fluxo histórico) ou currículo (PDF/Word, extração por IA). Fica no
              topo porque decide o que o próximo passo vai pedir, o upload de um arquivo tabular ou o
              lote de currículos. §A.24: Title Case no título do card. */}
          <div className="grid gap-2">
            <span className="ds-label">Origem Dos Dados</span>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  [
                    "planilha",
                    "Planilha",
                    "Sobe uma planilha (.xlsx, .xls ou .csv) e a IA mapeia as colunas.",
                  ],
                  [
                    "curriculo",
                    "Currículo (PDF Ou Word)",
                    "Sobe um lote de currículos e a IA extrai os dados de cada um.",
                  ],
                ] as [Fonte, string, string][]
              ).map(([valor, titulo, descricao]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setFonte(valor)}
                  aria-pressed={fonte === valor}
                  className={cn(
                    "rounded-xl border p-4 text-left transition",
                    fonte === valor
                      ? "border-accent bg-[var(--surface-2)] ring-1 ring-[var(--accent)]"
                      : "border-[var(--border)] hover:bg-[var(--surface-2)]",
                  )}
                >
                  <div className="font-display text-base font-bold">{titulo}</div>
                  <p className="mt-1 text-[12.5px] text-dim">{descricao}</p>
                </button>
              ))}
            </div>
          </div>

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

      {/* ── PASSO 2: UPLOAD (PLANILHA) ──────────────────────────────────────────────────────── */}
      {fonte === "planilha" && passo === "upload" && (
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

      {/* ── PASSO 3: DE, PARA (PLANILHA) ────────────────────────────────────────────────────── */}
      {fonte === "planilha" && passo === "depara" && previa && mapa && (
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
                {previa.totalLinhas} {previa.totalLinhas === 1 ? "linha" : "linhas"} a
                importar.{" "}
              </>
            )}
            Só o Nome é obrigatório: os demais campos podem ficar sem coluna.
          </p>
        </div>
      )}

      {/* ── PASSO 4: CONFIRMAÇÃO (PLANILHA) ─────────────────────────────────────────────────── */}
      {fonte === "planilha" && passo === "confirmar" && previa && mapa && (
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
                O arquivo tem {totalNoArquivo} linhas e esta importação alcança {previa.totalLinhas}
                ;
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

      {/* ── PASSO 5: RESULTADO (PLANILHA) ───────────────────────────────────────────────────── */}
      {fonte === "planilha" && passo === "resultado" && resultado && (
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

      {/* ── PASSO 2: UPLOAD (CURRÍCULO) ─────────────────────────────────────────────────────── */}
      {fonte === "curriculo" && passo === "upload" && (
        <div className="grid gap-2">
          <span className="ds-label">Currículos (PDF Ou Word)</span>
          <input
            ref={curriculoInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="ds-input"
            onChange={(e) => void escolherCurriculos(Array.from(e.target.files ?? []))}
            aria-label="Currículos em PDF ou Word"
            disabled={carregando}
          />
          <p className="text-[11.5px] text-faint">
            Aceita .pdf e .docx, vários de uma vez. A IA lê cada arquivo e extrai nome, CPF, e-mail,
            telefones e os demais dados no próximo passo.
          </p>

          {/* ENQUANTO A IA LÊ: a lista dos arquivos do lote, para a espera não parecer travada num
              lote de muitos currículos. §A.11: sem travessão. */}
          {carregando && arquivosCurriculo.length > 0 && (
            <ul className="mt-1 grid gap-1 text-[11.5px] text-dim">
              {arquivosCurriculo.map((f, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Icon
                    name="doc"
                    aria-hidden="true"
                    className="h-3.5 w-3.5 flex-none text-faint"
                  />
                  <span className="truncate">{f.name}</span>
                </li>
              ))}
            </ul>
          )}

          {/* A RECUSA GERAL DA LEITURA, na mesma tela em que se escolhe o arquivo. Recusa de UM
              currículo não cai aqui: vira aviso por linha no passo de revisão. */}
          {erro && (
            <div
              role="alert"
              className="mt-2 rounded-xl border border-[var(--danger)] bg-[rgba(220,70,70,0.08)] p-3"
            >
              <div className="font-display text-sm font-bold text-[var(--danger)]">
                Não Foi Possível Ler Os Currículos
              </div>
              <p className="mt-1 text-[12.5px] text-text">{erro}</p>
              <p className="mt-1 text-[11.5px] text-dim">
                Nada foi importado. Tente de novo ou escolha outros arquivos.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── PASSO 3: REVISÃO DE VALOR (CURRÍCULO) ───────────────────────────────────────────── */}
      {fonte === "curriculo" && passo === "depara" && previaCurriculo && (
        <RevisaoCurriculo
          itens={previaCurriculo.itens}
          candidatos={candidatosCurriculo}
          totalComNome={comNomeCurriculo}
          semNome={semNomeCurriculo}
          onCampo={editarCampoCurriculo}
          onTelefones={editarTelefonesCurriculo}
        />
      )}

      {/* ── PASSO 4: CONFIRMAÇÃO (CURRÍCULO) ────────────────────────────────────────────────── */}
      {fonte === "curriculo" && passo === "confirmar" && previaCurriculo && (
        <div className="grid gap-3">
          <p className="text-[13px] text-dim">
            Confira como os currículos foram interpretados. {comNomeCurriculo}{" "}
            {comNomeCurriculo === 1 ? "currículo será importado" : "currículos serão importados"};
            linhas sem nome são ignoradas.
          </p>
          <div className="ea-scroll max-h-[340px] overflow-auto rounded-xl border border-[var(--border)]">
            <table className="ds-table w-full min-w-[720px] text-sm">
              <thead>
                <tr>
                  <th className="text-center">Nome</th>
                  <th className="text-center">CPF</th>
                  <th className="text-center">E-mail</th>
                  <th className="text-center">Telefones</th>
                  <th className="text-center">Nascimento</th>
                  <th className="text-center">Cidade</th>
                  <th className="text-center">UF</th>
                </tr>
              </thead>
              <tbody>
                {previaCurriculo.itens.map((item) => {
                  const c = candidatosCurriculo[item.indice];
                  if (!c) return null;
                  return (
                    <tr key={item.indice}>
                      <td className="font-semibold">
                        {c.nome.trim() || <span className="text-faint">não informado</span>}
                      </td>
                      <CelulaConfirmacao valor={c.cpf} />
                      <CelulaConfirmacao valor={c.email} />
                      <td className="text-center text-dim">
                        {c.telefones.filter((t) => t.trim() !== "").join(", ") || (
                          <span className="text-faint">não informado</span>
                        )}
                      </td>
                      <CelulaConfirmacao valor={c.nascimento} />
                      <CelulaConfirmacao valor={c.cidade} />
                      <CelulaConfirmacao valor={c.uf} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── PASSO 5: RESULTADO (CURRÍCULO) ──────────────────────────────────────────────────── */}
      {fonte === "curriculo" && passo === "resultado" && resultadoCurriculo && (
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-3">
            <ResumoCartao rotulo="Importados" valor={resultadoCurriculo.importados} tom="ok" />
            <ResumoCartao
              rotulo="Reaproveitados"
              valor={resultadoCurriculo.reaproveitados}
              tom="ok"
            />
            <ResumoCartao rotulo="Vinculados" valor={resultadoCurriculo.vinculados} tom="ok" />
            <ResumoCartao rotulo="Ignorados" valor={resultadoCurriculo.ignorados} tom="wn" />
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-dim">
            <span>
              <strong className="text-text">{resultadoCurriculo.contagem.total}</strong> no total
            </span>
            <span>
              <strong className="text-text">{resultadoCurriculo.contagem.novos}</strong> novos
            </span>
            <span>
              <strong className="text-text">{resultadoCurriculo.contagem.duplicadosCpf}</strong>{" "}
              duplicados por CPF
            </span>
            <span>
              <strong className="text-text">{resultadoCurriculo.contagem.semCpf}</strong> sem CPF
            </span>
            <span>
              <strong className="text-text">{resultadoCurriculo.contagem.invalidos}</strong>{" "}
              inválidos
            </span>
          </div>

          {resultadoCurriculo.linhas.length > 0 && (
            <div className="ea-scroll max-h-[320px] overflow-auto rounded-xl border border-[var(--border)]">
              <table className="ds-table w-full min-w-[560px] text-sm">
                <thead>
                  <tr>
                    <th className="text-center">Currículo</th>
                    <th className="text-center">Nome</th>
                    <th className="text-center">Status</th>
                    <th className="text-center">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {resultadoCurriculo.linhas.map((l) => (
                    <tr key={l.indice}>
                      <td className="text-dim">
                        {arquivoPorIndice.get(l.indice) ?? (
                          <span className="text-faint">não informado</span>
                        )}
                      </td>
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
                // No ramo de currículo, só o lote sem nome nenhum bloqueia (linha sem nome é pulada).
                <Button
                  disabled={(fonte === "curriculo" ? semNomeCurriculo : semNome) || carregando}
                  onClick={() => setPasso("confirmar")}
                >
                  Avançar
                </Button>
              )}
              {/* ACIMA DO TETO, O BOTÃO NÃO CHAMA O BACKEND: a gravação é recusada lá (ela não
                  importa arquivo cortado pela metade), então oferecer o clique só produziria um
                  erro depois do aceite. O caminho é dividir o arquivo, e o aviso diz isso. */}
              {passo === "confirmar" && fonte === "planilha" && (
                <Button disabled={carregando || acimaDoTeto} onClick={() => void aplicar()}>
                  Importar {previa ? `${previa.totalLinhas} ` : ""}
                  {previa && previa.totalLinhas === 1 ? "Candidato" : "Candidatos"}
                </Button>
              )}
              {passo === "confirmar" && fonte === "curriculo" && (
                <Button disabled={carregando} onClick={() => void aplicarCurriculo()}>
                  Importar {comNomeCurriculo} {comNomeCurriculo === 1 ? "Candidato" : "Candidatos"}
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

function ResumoCartao({ rotulo, valor, tom }: { rotulo: string; valor: number; tom: "ok" | "wn" }) {
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

/** Célula do passo de confirmação: o valor, ou "não informado" quando vazio (§A.11, sem travessão). */
function CelulaConfirmacao({ valor }: { valor: string }) {
  const v = valor.trim();
  return (
    <td className="text-center text-dim">
      {v || <span className="text-faint">não informado</span>}
    </td>
  );
}

/**
 * MARCA DE CONFIANÇA, discreta: um ponto ao lado do campo que a IA leu com pouca certeza (MÉDIA ou
 * BAIXA). Campo de confiança ALTA, ou sem confiança informada, não ganha marca, para o sinal só
 * aparecer onde o olho precisa conferir. §A.11: sem travessão no title.
 */
function MarcaConfianca({ nivel }: { nivel?: ConfiancaImport }) {
  if (!nivel || nivel === "ALTA") return null;
  return (
    <span
      title={`Confiança ${ROTULO_CONFIANCA[nivel]}, confira o valor lido`}
      aria-label={`Confiança ${ROTULO_CONFIANCA[nivel]}`}
      className="flex-none"
    >
      <span
        className={cn(
          "block h-2 w-2 rounded-full",
          nivel === "MEDIA" ? "bg-[var(--warn)]" : "bg-[var(--danger)]",
        )}
      />
    </span>
  );
}

/**
 * EDITOR DE N TELEFONES: o currículo pode trazer vários, e todos são cadastrados (decisão do
 * diretor). Cada telefone é um campo com o seu botão de remover, e "Adicionar telefone" cria mais
 * um. Lista vazia mostra só o botão de adicionar. §A.24: o botão é AÇÃO, escrita normal.
 */
function TelefonesEditor({
  telefones,
  nivel,
  onChange,
}: {
  telefones: string[];
  nivel?: ConfiancaImport;
  onChange: (telefones: string[]) => void;
}) {
  function trocar(i: number, valor: string) {
    const prox = [...telefones];
    prox[i] = valor;
    onChange(prox);
  }
  function remover(i: number) {
    onChange(telefones.filter((_, j) => j !== i));
  }
  return (
    <div className="grid min-w-[180px] gap-1.5">
      {telefones.map((tel, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            className="ds-input w-full text-[13px]"
            value={tel}
            onChange={(e) => trocar(i, e.target.value)}
            placeholder="Telefone"
            aria-label={`Telefone ${i + 1}`}
          />
          {i === 0 && <MarcaConfianca nivel={nivel} />}
          <button
            type="button"
            onClick={() => remover(i)}
            aria-label={`Remover telefone ${i + 1}`}
            className="flex-none rounded-lg border border-[var(--border)] p-1.5 text-dim transition hover:text-[var(--danger)]"
          >
            <Icon name="x" aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...telefones, ""])}
        className="inline-flex items-center gap-1 justify-self-start text-[12px] text-accent transition hover:underline"
      >
        <Icon name="plus" aria-hidden="true" className="h-3.5 w-3.5" />
        Adicionar telefone
      </button>
    </div>
  );
}

/**
 * REVISÃO DE VALOR do lote de currículos: UMA LINHA POR ARQUIVO, com os campos editáveis (o
 * currículo não tem colunas, então a de/para da planilha vira revisão do VALOR que a IA leu). Cada
 * célula é editável; a UF usa o Select do design system com busca (§A.35, nunca `<select>` nativo);
 * a confiança por campo aparece como marca discreta; a recusa de leitura de um arquivo vira aviso na
 * linha, que segue editável para o time digitar na mão. §A.12/§A.20: máscara única, sem esmagar;
 * §A.29: cabeçalho ordenável por clique. §A.11: sem travessão; célula vazia some (placeholder).
 */
function RevisaoCurriculo({
  itens,
  candidatos,
  totalComNome,
  semNome,
  onCampo,
  onTelefones,
}: {
  itens: ItemPreviaCurriculo[];
  candidatos: Record<number, CandidatoCurriculo>;
  totalComNome: number;
  semNome: boolean;
  onCampo: (indice: number, campo: CampoEscalarCurriculo, valor: string) => void;
  onTelefones: (indice: number, telefones: string[]) => void;
}) {
  type LinhaRevisao = { item: ItemPreviaCurriculo; candidato: CandidatoCurriculo };

  const linhas = useMemo<LinhaRevisao[]>(
    () =>
      itens
        .map((item) => ({ item, candidato: candidatos[item.indice] }))
        .filter((l): l is LinhaRevisao => Boolean(l.candidato)),
    [itens, candidatos],
  );

  const colunas = useMemo<ColunaOrd<LinhaRevisao>[]>(
    () => [
      { chave: "arquivo", tipo: "texto", valor: (l) => l.item.arquivo },
      { chave: "nome", tipo: "texto", valor: (l) => l.candidato.nome },
      { chave: "cpf", tipo: "texto", valor: (l) => l.candidato.cpf },
      { chave: "email", tipo: "texto", valor: (l) => l.candidato.email },
      { chave: "nascimento", tipo: "data", valor: (l) => l.candidato.nascimento },
      { chave: "cidade", tipo: "texto", valor: (l) => l.candidato.cidade },
      { chave: "uf", tipo: "texto", valor: (l) => l.candidato.uf },
    ],
    [],
  );
  const ord = useOrdenacao(colunas, linhas);

  const ufOpcoes = useMemo(
    () => [
      { value: "", label: "não informado" },
      ...UFS.map((u) => ({ value: u.uf, label: u.uf, busca: u.nome })),
    ],
    [],
  );

  const temErro = itens.some((i) => i.erroLeitura);

  return (
    <div className="grid gap-3">
      <p className="text-[11.5px] text-dim">
        {totalComNome} {totalComNome === 1 ? "currículo com nome" : "currículos com nome"} a
        importar. Só o Nome é obrigatório; a linha sem nome é ignorada, as demais entram.
        {temErro
          ? " Um ou mais arquivos não puderam ser lidos: preencha os valores na mão na linha avisada."
          : ""}
      </p>

      <div className="ea-scroll max-h-[440px] overflow-auto rounded-xl border border-[var(--border)]">
        {/* §A.12/§A.20: máscara única de tabela, cabeçalho centralizado, min-width para não esmagar
            os campos editáveis e os telefones; a tabela rola na horizontal em telas estreitas. */}
        <table className="ds-table w-full min-w-[1040px] text-sm">
          <thead>
            <tr>
              <ColunaOrdenavel ord={ord} chave="arquivo" as="th" className="text-center">
                Arquivo
              </ColunaOrdenavel>
              <ColunaOrdenavel ord={ord} chave="nome" as="th" className="text-center">
                Nome *
              </ColunaOrdenavel>
              <ColunaOrdenavel ord={ord} chave="cpf" as="th" className="text-center">
                CPF
              </ColunaOrdenavel>
              <ColunaOrdenavel ord={ord} chave="email" as="th" className="text-center">
                E-mail
              </ColunaOrdenavel>
              <ColunaOrdenavel ord={ord} chave="nascimento" as="th" className="text-center">
                Nascimento
              </ColunaOrdenavel>
              <ColunaOrdenavel ord={ord} chave="cidade" as="th" className="text-center">
                Cidade
              </ColunaOrdenavel>
              <ColunaOrdenavel ord={ord} chave="uf" as="th" className="text-center">
                UF
              </ColunaOrdenavel>
              <th className="text-center">Telefones</th>
            </tr>
          </thead>
          <tbody>
            {ord.itens.map(({ item, candidato }) => {
              const indice = item.indice;
              return (
                <tr key={indice}>
                  <td className="align-top">
                    <div className="font-medium text-dim">{item.arquivo}</div>
                    {item.erroLeitura && (
                      <div
                        role="alert"
                        className="mt-1 flex items-start gap-1 text-[11px] text-[var(--danger)]"
                      >
                        <Icon
                          name="alert"
                          aria-hidden="true"
                          className="mt-0.5 h-3.5 w-3.5 flex-none"
                        />
                        <span>{item.erroLeitura}</span>
                      </div>
                    )}
                  </td>
                  <td className="align-top">
                    <div className="flex items-center gap-1">
                      <input
                        className="ds-input w-full min-w-[150px] text-[13px]"
                        value={candidato.nome}
                        onChange={(e) => onCampo(indice, "nome", e.target.value)}
                        placeholder="Nome"
                        aria-label={`Nome do currículo ${item.arquivo}`}
                      />
                      <MarcaConfianca nivel={item.confianca.nome} />
                    </div>
                  </td>
                  <td className="align-top">
                    <div className="flex items-center gap-1">
                      <input
                        className="ds-input w-full min-w-[130px] text-[13px]"
                        value={candidato.cpf}
                        onChange={(e) => onCampo(indice, "cpf", e.target.value)}
                        placeholder="CPF"
                        aria-label={`CPF do currículo ${item.arquivo}`}
                      />
                      <MarcaConfianca nivel={item.confianca.cpf} />
                    </div>
                  </td>
                  <td className="align-top">
                    <div className="flex items-center gap-1">
                      <input
                        type="email"
                        className="ds-input w-full min-w-[170px] text-[13px]"
                        value={candidato.email}
                        onChange={(e) => onCampo(indice, "email", e.target.value)}
                        placeholder="E-mail"
                        aria-label={`E-mail do currículo ${item.arquivo}`}
                      />
                      <MarcaConfianca nivel={item.confianca.email} />
                    </div>
                  </td>
                  <td className="align-top">
                    <div className="flex items-center gap-1">
                      {/* §A.35: input type=date é controle do navegador, exceção permitida. */}
                      <input
                        type="date"
                        className="ds-input w-full min-w-[150px] text-[13px]"
                        value={candidato.nascimento}
                        onChange={(e) => onCampo(indice, "nascimento", e.target.value)}
                        aria-label={`Nascimento do currículo ${item.arquivo}`}
                      />
                      <MarcaConfianca nivel={item.confianca.nascimento} />
                    </div>
                  </td>
                  <td className="align-top">
                    <div className="flex items-center gap-1">
                      <input
                        className="ds-input w-full min-w-[130px] text-[13px]"
                        value={candidato.cidade}
                        onChange={(e) => onCampo(indice, "cidade", e.target.value)}
                        placeholder="Cidade"
                        aria-label={`Cidade do currículo ${item.arquivo}`}
                      />
                      <MarcaConfianca nivel={item.confianca.cidade} />
                    </div>
                  </td>
                  <td className="align-top">
                    <div className="flex items-center gap-1">
                      {/* §A.35: Select do design system, nunca `<select>` nativo; a sigla mostra, a
                          busca acha pelo nome do estado. */}
                      <Select
                        value={candidato.uf}
                        onChange={(v) => onCampo(indice, "uf", v)}
                        options={ufOpcoes}
                        ariaLabel={`UF do currículo ${item.arquivo}`}
                        placeholder="UF"
                        searchable
                        className="min-w-[110px]"
                      />
                      <MarcaConfianca nivel={item.confianca.uf} />
                    </div>
                  </td>
                  <td className="align-top">
                    <TelefonesEditor
                      telefones={candidato.telefones}
                      nivel={item.confianca.telefones}
                      onChange={(tels) => onTelefones(indice, tels)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {semNome && (
        <p className="text-xs text-[var(--danger)]">
          Preencha o nome de pelo menos um currículo para continuar.
        </p>
      )}
    </div>
  );
}
