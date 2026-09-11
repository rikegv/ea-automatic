"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ETAPA_TOM_PADRAO,
  VAGA_STATUS_SEMENTE,
  podeSairManualmente,
  podeSerDestinoManual,
  type VagaStatusTom,
  type VagaStatusItem,
} from "@ea/shared-types";
import { apiFetch } from "@/lib/api";

/**
 * ─ O CATÁLOGO DE STATUS DA VAGA, DO LADO DA TELA (onda B2) ──────────────────────────────────────
 *
 * A LISTA DE STATUS DEIXOU DE SER CONSTANTE (`VAGA_STATUS`/`VAGA_STATUS_LABEL` saíram do vocabulário
 * compartilhado) E PASSOU A SER DADO DO DIRETOR (`as_vaga_status`). Este módulo é o único lugar do
 * frontend que sabe buscá-la, no molde exato de `lib/as-etapas.ts`, com as mesmas duas camadas:
 *
 *   1. FUNÇÕES PURAS que recebem o catálogo EXPLICITAMENTE. Elas são a régua, e régua se testa sem
 *      rede e sem montar árvore de React.
 *   2. UMA PROMESSA MEMOIZADA em volta delas, porque o mesmo catálogo de dez linhas serve a Central
 *      de Vagas, o painel da vaga, o resumo dentro da Central de Candidatos e o gerenciador.
 *
 * ┌─ O PONTO INTEIRO DA ONDA: UMA FONTE SÓ, E ELA É A COLUNA ───────────────────────────────────┐
 * │ A tela oferecia "Entregue" no seletor de publicação e o backend recusava com 400, porque a   │
 * │ lista da tela era uma EXCLUSÃO escrita à mão e a do backend era uma PERMISSÃO escrita à mão. │
 * │ Duas listas, duas réguas, e elas discordavam. Agora quem responde "a trilha pode gravar este │
 * │ status?" é a coluna `daTrilha`, lida pelos DOIS lados, e o mesmo vale para `encerra`,        │
 * │ `recebeCandidato` e `movivelManualmente`. Nenhuma lista de código de status é escrita aqui.  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ OS QUATRO FLAGS RESPONDEM PERGUNTAS DIFERENTES, e hoje três deles COINCIDEM ───────────────┐
 * │ `encerra` e `recebeCandidato` valem o mesmo nos cinco status da semente, e a coincidência é  │
 * │ armadilha: um "Stand By" que o diretor crie é `recebeCandidato: false` (a vaga pausada não   │
 * │ capta gente nova) E `encerra: false` (a vaga continua viva). Quem trocar um pelo outro numa  │
 * │ consulta faz uma vaga PAUSADA ser tratada como TERMINADA: contagem congelada no cilindro,    │
 * │ contador de dias parado e o processo dado por acabado na trilha. Cada função daqui pergunta  │
 * │ UM flag, e o nome dela diz qual.                                                             │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: catálogo de processo. Código, rótulo, ordem, cor, papel e quatro booleanos. Nenhum dado
 * pessoal, nem direto nem agregado (nenhuma contagem de vaga sai daqui).
 */

/**
 * UMA LINHA DO CATÁLOGO COMO A REDE A ENTREGA: o `VagaStatusItem` compartilhado mais o `id`.
 *
 * O `id` é DETALHE DE ENDEREÇAMENTO (é ele que vai na URL do `PATCH` e do `DELETE` do gerenciador),
 * e por isso ele mora aqui e não no vocabulário: o comportamento inteiro (os quatro flags, o papel,
 * `podeSerDestinoManual`, `podeSairManualmente`) já está em `@ea/shared-types` e é lido de lá pelos
 * dois lados. O backend declara a mesma extensão com o mesmo nome de campo.
 */
export interface AsVagaStatus extends VagaStatusItem {
  id: number;
}

// ── AS FUNÇÕES PURAS: a régua, testável sem rede ────────────────────────────

/**
 * A ORDEM DA VIDA DA VAGA é a coluna `ordem`, e o desempate é o CÓDIGO.
 *
 * ORDEM REPETIDA É FEIA, NÃO É ERRO (o backend aceita, e o gerenciador deixa digitar), então o
 * desempate precisa ser estável: sem ele, duas linhas de mesma ordem trocariam de lugar a cada F5, e
 * os cards da Central de Vagas dançariam sem ninguém ter mexido em nada.
 */
export function statusOrdenados<T extends VagaStatusItem>(catalogo: readonly T[]): T[] {
  return [...catalogo].sort((a, b) => a.ordem - b.ordem || a.codigo.localeCompare(b.codigo));
}

/** Os que estão em circulação. O inativo fica de fora daqui e continua resolvendo o histórico. */
export function statusAtivos<T extends VagaStatusItem>(catalogo: readonly T[]): T[] {
  return statusOrdenados(catalogo).filter((s) => s.ativo);
}

/** A linha do catálogo, ativa ou não. `undefined` quando o código não está na lista recebida. */
export function statusDoCodigo<T extends VagaStatusItem>(
  codigo: string,
  catalogo: readonly T[],
): T | undefined {
  return catalogo.find((s) => s.codigo === codigo);
}

/**
 * ─ O CATÁLOGO CORRENTE, E POR QUE ELE EXISTE ────────────────────────────────────────────────────
 *
 * Ele é o valor PADRÃO das perguntas de flag (`vagaEncerrada`, `vagaRecebeCandidato`,
 * `ordemDoStatusVaga`), e nasce sendo a SEMENTE, que é o comportamento de hoje, letra por letra.
 *
 * POR QUE ELE NÃO É "UM GLOBAL POR PREGUIÇA": `vagaEncerrada` é chamada lá no fundo de `preenchidas`,
 * `origemContagem`, `processoDaVaga`, `desfechoDaVaga` e `diasEmAberto`, que por sua vez são chamadas
 * de dezenas de pontos de tela e de três specs. Exigir o catálogo em todas elas espalharia um
 * parâmetro por toda a Central de Vagas para responder um booleano, e o dia em que alguém esquecesse
 * de passá-lo a resposta seria ERRADA EM SILÊNCIO, que é exatamente o defeito que esta onda mata.
 *
 * QUEM RENDERIZA NÃO DEPENDE DELE: rótulo, cor, cards, filtro e seletores recebem o catálogo do
 * `useStatusVaga`, explicitamente. O corrente serve às perguntas de COMPORTAMENTO, que precisam de
 * uma resposta síncrona no meio de uma conta.
 *
 * ELE É ATUALIZADO A CADA LEITURA BEM-SUCEDIDA, então depois do primeiro `carregarStatusVaga` ele é
 * o catálogo de verdade, com os status que o diretor criou.
 */
let corrente: readonly VagaStatusItem[] = VAGA_STATUS_SEMENTE;

/** O catálogo que as perguntas de flag usam quando ninguém passa um. */
export function catalogoCorrente(): readonly VagaStatusItem[] {
  return corrente;
}

/**
 * O RÓTULO, E O FALLBACK É O PRÓPRIO CÓDIGO. Nunca vazio, nunca `undefined`.
 *
 * PILL VAZIA É PIOR QUE PILL FEIA: um retângulo colorido sem texto não diz em que pé a vaga está e
 * nem parece um defeito, então some do olho de quem revisa. Mostrando `STAND_BY` cru, a tela fica
 * feia e continua informando, e quem vê sabe que falta cadastro. É a mesma régua de `rotuloDaEtapa`.
 */
export function rotuloDoStatusVaga(
  codigo: string,
  catalogo: readonly VagaStatusItem[] = corrente,
): string {
  return statusDoCodigo(codigo, catalogo)?.rotulo ?? codigo;
}

/** O tom da linha, com o neutro como fallback. A cor da pill sai daqui e do gerenciador, juntas. */
export function tomDoStatus(
  codigo: string,
  catalogo: readonly VagaStatusItem[] = corrente,
): VagaStatusTom {
  return statusDoCodigo(codigo, catalogo)?.tom ?? ETAPA_TOM_PADRAO;
}

/**
 * O PROCESSO DESTA VAGA ACABOU? É a coluna `encerra`, e nada mais.
 *
 * ELA CONGELA TRÊS COISAS AO MESMO TEMPO: o número do cilindro de posições (que passa a ler a
 * contagem do fechamento em vez da derivada), o contador de dias em aberto e o lado "desfecho" da
 * trilha. Responder `true` para uma vaga viva para o relógio dela; responder `false` para uma
 * encerrada faz o histórico voltar a se mexer. É o flag mais caro de errar desta onda.
 *
 * CÓDIGO DESCONHECIDO NÃO ENCERRA. A vaga fica VIVA, que é o estado em que o resto da tela continua
 * funcionando: a contagem segue derivada e o contador segue correndo. Dar `true` por não conhecer o
 * código congelaria em silêncio uma vaga que ninguém encerrou.
 */
export function vagaEncerrada(
  codigo: string,
  catalogo: readonly VagaStatusItem[] = corrente,
): boolean {
  return statusDoCodigo(codigo, catalogo)?.encerra ?? false;
}

/**
 * AINDA ENTRA GENTE NOVA NESTA VAGA? É a coluna `recebeCandidato`, e NÃO é o contrário de `encerra`.
 *
 * O "Stand By" é o caso que separa os dois: vaga pausada não capta ninguém e continua viva. Espelha
 * a trava 2 do backend, e a autoridade é dela: aqui é só o botão de alocar aparecendo onde ele tem o
 * que fazer.
 *
 * CÓDIGO DESCONHECIDO NÃO RECEBE, e a assimetria com `vagaEncerrada` é deliberada: os dois erram
 * para o lado SEGURO, e o lado seguro de cada um é o oposto do outro. Não encerrar mantém a tela
 * viva; não receber esconde um botão que o backend recusaria de qualquer jeito.
 */
export function vagaRecebeCandidato(
  codigo: string,
  catalogo: readonly VagaStatusItem[] = corrente,
): boolean {
  return statusDoCodigo(codigo, catalogo)?.recebeCandidato ?? false;
}

/**
 * A POSIÇÃO DO STATUS NA VIDA DA VAGA, para ordenar linha de tabela.
 *
 * O `VAGA_STATUS.indexOf` QUE ESTE HELPER SUBSTITUI NÃO QUEBRARIA COM A LISTA FORA: ele passaria a
 * devolver `-1` para TODO status e a coluna ordenaria errado EM SILÊNCIO, com todas as linhas
 * empatadas. É o mesmo defeito que as etapas documentaram, e é o mais perigoso desta onda.
 *
 * O DESCONHECIDO VAI PARA O FIM, nunca para o começo: `-1` ordena ANTES da primeira linha, então um
 * status inativado, ou criado por outra sessão e ainda não carregado aqui, apareceria no TOPO.
 */
export function ordemDoStatusVaga(
  codigo: string | null | undefined,
  catalogo: readonly VagaStatusItem[] = corrente,
): number {
  if (!codigo) return Number.MAX_SAFE_INTEGER;
  return statusDoCodigo(codigo, catalogo)?.ordem ?? Number.MAX_SAFE_INTEGER;
}

/**
 * ─ O QUE A TRILHA DE ABERTURA OFERECE, E É AQUI QUE O DEFEITO VIVO MORRE ────────────────────────
 *
 * A LISTA É `ativo && daTrilha`, LIDA DO CATÁLOGO: é PERMISSÃO, a mesma coluna que o backend
 * consulta para aceitar ou recusar. Antes eram duas listas escritas à mão, uma por exclusão (a tela)
 * e outra por inclusão (o servidor), e elas discordavam em "Entregue": a tela oferecia, o clique
 * dava 400, e quem clicou tinha escolhido a opção que a própria tela mostrou.
 *
 * O QUE ISSO TIRA DAQUI, SEM NINGUÉM PRECISAR ESCREVER OS NOMES:
 *   . os que ENCERRAM a vaga (`daTrilha: false` nos três), que era a porta vetada pela auditoria de
 *     segurança: encerrar a vaga tem duas portas com régua (fechar e cancelar), e o seletor de um
 *     formulário não é a terceira;
 *   . os INATIVOS, que o diretor tirou de circulação;
 *   . e o status novo que ele criar entra SOZINHO, se marcar `daTrilha`. Lista fixa faria o
 *     contrário: status novo nascendo invisível, que é o mesmo erro com o sinal trocado.
 *
 * O PAPEL `RASCUNHO` É A ÚNICA SUBTRAÇÃO, E ELA NÃO É UMA SEGUNDA LISTA: é o PAPEL, campo do próprio
 * catálogo, e não um código digitado. O rascunho é o BOTÃO "Salvar Rascunho", não uma escolha de
 * status; oferecê-lo aqui daria dois caminhos para o mesmo estado, e o segundo publicaria uma vaga
 * chamando-a de rascunho. O backend continua aceitando `RASCUNHO` pela trilha, que é o que faz o
 * botão funcionar.
 *
 * A TELA NÃO É A TRAVA: quem recusa continua sendo o servidor. Esta lista é o que a tela OFERECE.
 */
export function statusDePublicacao<T extends VagaStatusItem>(catalogo: readonly T[]): T[] {
  return statusAtivos(catalogo).filter((s) => s.daTrilha && s.papel !== "RASCUNHO");
}

/**
 * ─ OS DESTINOS DO MOVIMENTO MANUAL ─────────────────────────────────────────────────────────────
 *
 * A RÉGUA É `podeSerDestinoManual`, do vocabulário compartilhado, e o backend confere a MESMA função
 * sob a linha travada. Ela pede TRÊS coisas (ativo, movível e que NÃO encerre), e a terceira é o que
 * impede este gesto de virar uma terceira porta para o estado terminal, sem trava de candidato
 * tratado, sem gate de Master e sem carimbo de contagem.
 *
 * A ORIGEM SAI DA LISTA: mover para onde a vaga já está não é movimento, e o backend recusa com 409.
 */
export function destinosManuais<T extends VagaStatusItem>(
  catalogo: readonly T[],
  origem: string,
): T[] {
  return statusOrdenados(catalogo).filter((s) => podeSerDestinoManual(s) && s.codigo !== origem);
}

/**
 * ─ ESTA VAGA PODE TER O STATUS MOVIDO À MÃO? ────────────────────────────────────────────────────
 *
 * DUAS CONDIÇÕES, e a segunda NÃO é redundante (é o achado que o `tester` mediu do lado do backend):
 *
 *   1. `podeSairManualmente`: só sai de status que NÃO encerra. Reabrir vaga encerrada não é mover
 *      status, é desfazer um encerramento, com trava e trilha próprias.
 *   2. O RASCUNHO NÃO SAI POR AQUI. Ele não encerra, então a primeira condição o liberaria, e
 *      "Aberta" é destino manual de propósito: o rascunho com cliente, cargo, salário e posições
 *      VAZIOS terminaria PUBLICADO por este caminho, pulando a régua dos obrigatórios que só existe
 *      na trilha de abertura. O backend recusa com todas as letras ("o rascunho é publicado pela
 *      trilha de abertura"), e a tela não oferece o gesto para não mostrar a porta e trancá-la.
 *
 * CÓDIGO DESCONHECIDO NÃO SE MOVE: sem a linha do catálogo não há como saber se ele encerra, e o
 * gesto some até a leitura chegar.
 */
export function podeMoverStatusDaVaga(
  origem: string,
  catalogo: readonly VagaStatusItem[],
): boolean {
  const linha = statusDoCodigo(origem, catalogo);
  if (!linha) return false;
  return podeSairManualmente(linha) && linha.papel !== "RASCUNHO";
}

// ── A PROMESSA MEMOIZADA: uma requisição por carga de página ────────────────

let emVoo: Promise<AsVagaStatus[]> | null = null;

/**
 * O CATÁLOGO INTEIRO (ativos + inativos), memoizado. N telas montando ao mesmo tempo compartilham
 * UMA requisição, porque o que se guarda é a PROMESSA e não o resultado.
 *
 * A LEITURA É SEMPRE A COMPLETA (`?incluirInativos=1`), como no catálogo de etapas e pelo mesmo
 * motivo: a vaga que ficou parada num status desativado precisa do RÓTULO dele, senão a pill dela
 * mostra o código cru. Quem precisa só dos ativos filtra com `statusAtivos`.
 *
 * A FALHA NÃO FICA GRUDADA: no erro a memória é limpa, senão a primeira requisição que caísse
 * condenaria a página inteira a nunca mais ter catálogo até alguém recarregar.
 */
export function carregarStatusVaga(token?: string | null): Promise<AsVagaStatus[]> {
  if (!emVoo) {
    emVoo = apiFetch<AsVagaStatus[]>("/as/status-vaga?incluirInativos=1", { token })
      .then((linhas) => {
        // O CORRENTE PASSA A SER O DE VERDADE. Só na leitura BEM-SUCEDIDA: na falha, a semente
        // continua respondendo, e o comportamento de hoje segue de pé em vez de sumir.
        corrente = linhas;
        return linhas;
      })
      .catch((e) => {
        emVoo = null;
        throw e;
      });
  }
  return emVoo;
}

/** Depois de escrever no catálogo (o gerenciador), a memória tem de morrer. */
export function invalidarCatalogoDeStatusVaga(): void {
  emVoo = null;
}

export interface CatalogoDeStatusVaga {
  /** TODOS, na ordem da vida da vaga, inativos incluídos. */
  status: AsVagaStatus[];
  /** Só os em circulação. É esta lista que alimenta seletor, filtro e cards. */
  ativos: AsVagaStatus[];
  carregando: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
}

/**
 * O GANCHO QUE AS TELAS USAM. Não é contexto, pelo mesmo motivo de `useEtapas`: um provider no
 * `AppShell` faria toda tela do sistema carregar código de A&S para resolver uma pill de A&S.
 */
export function useStatusVaga(token?: string | null): CatalogoDeStatusVaga {
  const [status, setStatus] = useState<AsVagaStatus[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback(
    async (recarregando: boolean) => {
      if (recarregando) invalidarCatalogoDeStatusVaga();
      setCarregando(true);
      setErro(null);
      try {
        setStatus(statusOrdenados(await carregarStatusVaga(token)));
      } catch {
        // A TELA NÃO MORRE POR FALTA DE CATÁLOGO: com a lista vazia, o rótulo cai no código cru e o
        // resto da tela (vaga, cliente, cargo, posições) continua servindo.
        setErro("Não foi possível carregar o catálogo de status da vaga.");
      } finally {
        setCarregando(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void buscar(false);
  }, [buscar]);

  const recarregar = useCallback(() => buscar(true), [buscar]);

  return {
    status,
    ativos: status.filter((s) => s.ativo),
    carregando,
    erro,
    recarregar,
  };
}
