"use client";

/**
 * A RÉGUA DO ENVIO DO LINK DO PORTAL, fora das telas para poder ser testada.
 *
 * O envio acontece em DOIS caminhos, e os dois falam com as mesmas TRÊS rotas: o CAMINHO 1 é o
 * clique "Enviar Para Admissão" no funil de A&S (individual e em lote), e o CAMINHO 2 é o RH
 * enviando pelo Gerenciador do Portal. São três e não quatro porque o LOTE não tem rota de envio
 * própria: o e-mail dele sai de dentro da saída em lote que a tela já chamava, e uma rota a mais
 * mandaria tudo duas vezes. As rotas, a montagem da consulta e o VOCABULÁRIO da recusa
 * moram aqui, e não dentro de cada modal: são quatro superfícies dizendo a mesma coisa, e quatro
 * redações da mesma recusa divergem no primeiro ajuste.
 *
 * ┌─ §A.6 ATRAVESSA ESTE ARQUIVO INTEIRO ───────────────────────────────────────────────────────┐
 * │ NENHUMA função daqui recebe, monta ou devolve endereço de e-mail em claro, e nenhuma monta   │
 * │ frase com o endereço dentro. O que a tela mostra é o `destinoMascarado` que o servidor       │
 * │ manda, tal como ele veio. O motivo da recusa é CÓDIGO no contrato justamente para a frase    │
 * │ poder mudar sem o log mudar junto, e é aqui que o código vira frase de tela.                 │
 * │                                                                                              │
 * │ A URL do link NÃO passa por aqui em caminho nenhum: o envio por e-mail não devolve URL, e é  │
 * │ essa a diferença dele para a emissão manual que já existia.                                  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

import { useCallback, useEffect, useState } from "react";
import type {
  DestinatarioDoLink,
  MotivoDeRecusaDeEnvio,
  PreviaDoEnvioEmLote,
  ResultadoDoEnvioDoLink,
} from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";

// ── As rotas ────────────────────────────────────────────────────────────────────────────────────

/**
 * O ENVIO MANUAL DE UMA ADMISSÃO, que é o caminho 2 (o RH, pelo Gerenciador) e também o destino
 * final do caminho 1 depois que a ponte A&S -> Esteira existir.
 *
 * ┌─ ELA NÃO MORA SOB `portal/`, E ISSO É DECISÃO DE INFRAESTRUTURA ─────────────────────────────┐
 * │ `portal/` é o prefixo que a barreira do Fernando allowlista para o CANDIDATO na internet, e  │
 * │ uma rota que EMITE E ENTREGA CREDENCIAL não pode morar lá: no dia em que a allowlist for     │
 * │ escrita por prefixo em vez de por caminho, quem estiver do lado de fora ganha o disparo do   │
 * │ link de qualquer admissão. As leituras desta frente (`previa`, `sem-link`) já nasceram em    │
 * │ `esteira/portal/envio` por essa mesma razão, e o envio passa a morar junto delas.            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ELA VIAJA SEM CORPO. A origem é `MANUAL` POR CONSTRUÇÃO DA ROTA, e não por um campo enviado pela
 * tela: origem que vem de fora é superfície para FORJAR o registro de quem disparou, que é
 * justamente o dado que a trilha do envio existe para guardar.
 */
export const rotaEnviarLink = (admissaoId: string) =>
  `/esteira/portal/envio/admissao/${admissaoId}`;

/*
 * NÃO EXISTE ROTA DE ENVIO EM LOTE, e a ausência é deliberada.
 *
 * O gancho do envio mora dentro do `registrarSaida` do backend, e a saída em lote que a tela já
 * chama passa por ele PESSOA A PESSOA: o e-mail já sai por ali. Uma rota de lote por cima seria um
 * SEGUNDO disparo sobre as mesmas pessoas, e cada candidato receberia o link duas vezes (a segunda
 * emissão ainda matando a sessão aberta pela primeira). O lote desta tela é: prévia nominal
 * (`ROTA_PREVIA_DO_ENVIO`) para dar ciência, e o botão confirmando pela saída em lote de sempre.
 */

/** A PRÉVIA: quem recebe, para qual destino mascarado, e quem fica de fora e por quê. */
export const ROTA_PREVIA_DO_ENVIO = "/esteira/portal/envio/previa";

/** A porta que faltava: as admissões VIVAS que ainda não têm link nenhum, buscadas por NOME. */
export const ROTA_SEM_LINK = "/esteira/portal/envio/sem-link";

/**
 * A CONSULTA DA PRÉVIA, com os ids separados por vírgula, no mesmo formato que o `parseMulti` do
 * backend já lê em toda tela multi-select do sistema (§A.28).
 *
 * LISTA VAZIA DEVOLVE `null`, E ISSO É O CONTRATO DESTA FUNÇÃO: sem ninguém selecionado não há
 * prévia a pedir, e um `?candidaturas=` vazio viraria uma consulta que não casa com nada, com a
 * tela dizendo "ninguém recebe" para uma seleção que ela nem chegou a perguntar.
 */
export function rotaDaPrevia(candidaturaIds: string[]): string | null {
  const limpos = candidaturaIds.map((s) => s.trim()).filter(Boolean);
  if (limpos.length === 0) return null;
  const q = new URLSearchParams();
  q.set("candidaturas", limpos.join(","));
  return `${ROTA_PREVIA_DO_ENVIO}?${q.toString()}`;
}

/**
 * A BUSCA POR NOME do caminho 2. SEM BUSCA POR CPF, pela mesma razão da lista (§A.6): busca por
 * CPF em tela operacional é oráculo de existência.
 *
 * Nome vazio viaja SEM parâmetro (e não como `nome=`), porque quem abre o modal ainda não digitou
 * nada e a lista inicial é legítima: é o servidor quem decide o que mostrar sem busca.
 */
export function rotaSemLink(nome: string): string {
  const limpo = nome.trim();
  if (!limpo) return ROTA_SEM_LINK;
  const q = new URLSearchParams();
  q.set("nome", limpo);
  return `${ROTA_SEM_LINK}?${q.toString()}`;
}

// ── O vocabulário ───────────────────────────────────────────────────────────────────────────────

/**
 * A FRASE DO DIRETOR, PALAVRA POR PALAVRA, e é ela que o consultor lê antes de confirmar. O
 * objetivo declarado é ter CIÊNCIA: o clique que manda para a admissão também entrega uma
 * credencial de acesso ao prontuário, e quem clica precisa saber disso antes, não depois.
 */
export const AVISO_DO_ENVIO_DO_LINK =
  "Ao enviar para admissão, o candidato vai receber o link para envio de documentos.";

/**
 * O CÓDIGO DA RECUSA VIRA ETIQUETA, em Title Case (§A.24): é tag que classifica a linha na lista
 * de quem ficou de fora, e não frase.
 */
export const RECUSA_ETIQUETA: Record<MotivoDeRecusaDeEnvio, string> = {
  SEM_EMAIL: "Sem E-mail",
  EMAIL_INVALIDO: "E-mail Inválido",
  SEM_ADMISSAO: "Sem Admissão",
  CANAL_INDISPONIVEL: "Envio Indisponível",
  LINK_VIVO_EM_USO: "Link Ativo",
  ENVIADO_HA_POUCO: "Entregue Agora",
  FALHA_NO_ENVIO: "Falha No Envio",
};

/**
 * O CÓDIGO DA RECUSA VIRA FRASE, e cada uma diz DUAS coisas: que o link não vai sair, e o que
 * fazer no lugar. Uma recusa que só nomeia o problema deixa o consultor parado.
 *
 * NENHUMA delas cita o endereço (§A.6/S11): a lista de falhas do lote é copiada e colada em outro
 * lugar, e um endereço dentro da frase viaja junto sem ninguém perceber.
 */
export const RECUSA_FRASE: Record<MotivoDeRecusaDeEnvio, string> = {
  SEM_EMAIL:
    "O cadastro deste candidato não tem e-mail, então o link não vai sair. Cadastre o e-mail e envie o link pelo Gerenciador do Portal.",
  EMAIL_INVALIDO:
    "O e-mail do cadastro não é um endereço válido, então o link não vai sair. Corrija o cadastro e envie o link pelo Gerenciador do Portal.",
  SEM_ADMISSAO:
    "A admissão deste candidato ainda não existe no sistema, então o link não vai sair agora. Assim que a admissão nascer, envie o link pelo Gerenciador do Portal.",
  CANAL_INDISPONIVEL:
    "O envio de e-mail ainda não está ligado no sistema, então o link não vai sair. Gere o link pelo Gerenciador do Portal e passe para o candidato.",
  // A SEGUNDA QUE NÃO É PROBLEMA, IRMÃ DA DE BAIXO E DIFERENTE DELA. Aqui a credencial ACABOU DE
  // SER ENTREGUE e o candidato ainda não abriu; lá embaixo ele JÁ ENTROU. O que o consultor tem de
  // fazer é diferente: aqui ele espera, lá ele não mexe. Emitir agora derrubaria o link que acabou
  // de sair, e a pessoa ficaria com duas entregas das quais a primeira, a que ela vai abrir, morreu.
  //
  // "ENTREGUE", E NÃO "ENVIADO", e a palavra mudou por uma razão medida: a janela passou a cobrir
  // TAMBÉM o link gerado à mão (o consultor copia a URL e manda pelo WhatsApp), que é entrega sem
  // e-mail nenhum. Enquanto a frase falava em "caixa de entrada", ela mandava a pessoa procurar
  // numa caixa onde nunca chegou nada, justamente no caminho que o ajuste acabou de proteger.
  ENVIADO_HA_POUCO:
    "O link desta pessoa foi entregue agora há pouco e ainda está valendo. Peça para ela usar o link que já recebeu; para gerar outro, aguarde alguns minutos.",
  // A OUTRA QUE NÃO É PROBLEMA (eram seis motivos e uma abstenção; hoje são sete e duas), e a
  // frase não pode soar como falha: o candidato está com
  // o portal ABERTO neste instante. Reemitir mataria a sessão de quem está enviando documento, e
  // o sistema se ABSTÉM. Antes deste código a abstenção voltava com motivo nulo e caía no ramo
  // "não sei o que houve", justamente no caso mais comum dos seis.
  LINK_VIVO_EM_USO:
    "O link deste candidato está valendo e ele já entrou no portal, então não precisa de um novo. Enviar outro agora encerraria o acesso que ele está usando.",
  FALHA_NO_ENVIO:
    "O e-mail não chegou a sair agora. Tente enviar de novo pelo Gerenciador do Portal.",
};

/** Motivo fora do catálogo não derruba a tela: vira etiqueta neutra, nunca o glifo (§A.11). */
export function etiquetaDaRecusa(motivo: MotivoDeRecusaDeEnvio | string | null): string {
  if (!motivo) return "Não Informado";
  return (RECUSA_ETIQUETA as Record<string, string | undefined>)[motivo] ?? "Não Informado";
}

/** A frase da recusa. Motivo desconhecido vira uma frase honesta, e não um código cru na tela. */
export function fraseDaRecusa(motivo: MotivoDeRecusaDeEnvio | string | null): string {
  if (!motivo) return "O link não vai sair para este candidato.";
  return (
    (RECUSA_FRASE as Record<string, string | undefined>)[motivo] ??
    "O link não vai sair para este candidato. Envie o link pelo Gerenciador do Portal."
  );
}

/** O destino como a tela o mostra. Sem destino, o marcador da §A.11, nunca o glifo. */
export function destinoVisivel(destinoMascarado: string | null | undefined): string {
  return destinoMascarado && destinoMascarado.trim() ? destinoMascarado : "não informado";
}

// ── A ciência do envio, no individual ───────────────────────────────────────────────────────────

/**
 * O QUE O CONSULTOR LÊ ANTES DE CONFIRMAR UM ENVIO INDIVIDUAL.
 *
 * São TRÊS estados e não dois, e o terceiro é o que costuma ser esquecido: a prévia pode não ter
 * voltado (rede, canal, sessão). Calar nesse caso faria a tela prometer um e-mail que ela não
 * conferiu; dizer "não vai sair" seria mentir para o lado contrário. Ela diz que não conferiu, e
 * diz que o envio para a admissão acontece de todo jeito, que é o fato que importa para a decisão.
 */
export function fraseDaCienciaDoEnvio(previa: DestinatarioDoLink | null | undefined): string {
  if (!previa) {
    return `${AVISO_DO_ENVIO_DO_LINK} Não foi possível conferir o destino do link agora, e o envio para a admissão acontece do mesmo jeito.`;
  }
  if (previa.podeEnviar) {
    return `${AVISO_DO_ENVIO_DO_LINK} O link vai para ${destinoVisivel(previa.destinoMascarado)}.`;
  }
  // A ABSTENÇÃO NÃO LEVA O "NÃO VAI SAIR": aqui nada falhou, o candidato já está dentro do portal
  // com um link que vale. Dizer que o link não saiu faria o consultor procurar um problema que
  // não existe, e a frase da própria recusa já explica o que está acontecendo.
  if (previa.motivo === "LINK_VIVO_EM_USO") {
    return `${AVISO_DO_ENVIO_DO_LINK} ${fraseDaRecusa(previa.motivo)}`;
  }
  return `${AVISO_DO_ENVIO_DO_LINK} Neste caso o link NÃO vai sair. ${fraseDaRecusa(previa.motivo)}`;
}

/** O desfecho de um envio avulso, dito em uma frase: para onde foi e até quando vale. */
export function fraseDoResultado(r: ResultadoDoEnvioDoLink, quando: string): string {
  if (!r.enviado) return fraseDaRecusa(r.motivo);
  return `O link foi enviado por e-mail para ${destinoVisivel(r.destinoMascarado)} e vale até ${quando}.`;
}

// ── A prévia do lote ────────────────────────────────────────────────────────────────────────────

export interface PreviaSeparada {
  recebem: DestinatarioDoLink[];
  ficamDeFora: DestinatarioDoLink[];
}

/**
 * OS DOIS GRUPOS DA PRÉVIA, separados pelo `podeEnviar` do servidor e por mais nada.
 *
 * A tela NÃO reavalia quem pode receber: quem sabe se há e-mail, se ele é válido, se há admissão e
 * se o canal está ligado é o backend, e uma segunda régua aqui diria "vai receber" para alguém que
 * o servidor recusa em seguida. A separação é de APRESENTAÇÃO, e é exigência da auditoria: quem
 * fica de fora aparece SEPARADO, e não escondido no meio da lista de quem recebe.
 */
export function separarPrevia(previa: PreviaDoEnvioEmLote | null | undefined): PreviaSeparada {
  const itens = previa?.itens ?? [];
  return {
    recebem: itens.filter((i) => i.podeEnviar),
    ficamDeFora: itens.filter((i) => !i.podeEnviar),
  };
}

/** "1 pessoa" ou "N pessoas". §A.11: nada de "(s)" e nada de travessão. */
export function frasePessoas(n: number): string {
  return n === 1 ? "1 pessoa" : `${n} pessoas`;
}

/**
 * O RESUMO DA PRÉVIA, que é a linha de apoio do modal do lote. Ele conta pelos ITENS e não pelos
 * contadores do contrato: os dois deveriam bater, e quando não batem é a lista desenhada na tela
 * que o consultor está olhando, não o número.
 */
export function resumoDaPrevia(previa: PreviaDoEnvioEmLote | null | undefined): string {
  if (!previa) return "Conferindo quem vai receber o link do portal…";
  const { recebem, ficamDeFora } = separarPrevia(previa);
  if (recebem.length === 0 && ficamDeFora.length === 0) {
    return "Ninguém desta seleção recebe o link do portal agora.";
  }
  if (ficamDeFora.length === 0) {
    return `${frasePessoas(recebem.length)} vão receber o link do portal por e-mail.`;
  }
  if (recebem.length === 0) {
    return `Ninguém desta seleção recebe o link agora: ${frasePessoas(ficamDeFora.length)} ficam de fora.`;
  }
  return `${frasePessoas(recebem.length)} vão receber o link do portal por e-mail, e ${frasePessoas(ficamDeFora.length)} ficam de fora.`;
}

// ── O carregamento da prévia ────────────────────────────────────────────────────────────────────

export interface EstadoDaPrevia {
  previa: PreviaDoEnvioEmLote | null;
  carregando: boolean;
  /** A prévia falhou. NÃO é erro de tela: o envio para a admissão segue, só a ciência faltou. */
  falhou: boolean;
}

/**
 * A PRÉVIA, BUSCADA AO ABRIR, e a falha dela NÃO trava o gesto.
 *
 * Isto é decisão de desenho e não descuido: a prévia é CIÊNCIA sobre um efeito colateral (o
 * e-mail), e o gesto principal é outro (mandar a pessoa para a admissão). Travar o funil inteiro
 * porque a conferência do e-mail não respondeu poria a operação de pé no chão por causa de um
 * aviso. A tela diz que não conferiu, e quem decide continua sendo o consultor.
 *
 * `ativo` existe para o modal só perguntar quando a seção do envio está aberta: buscar prévia de
 * quem vai ser DESCARTADO seria consulta inútil, e ainda apareceria no log de acesso do servidor.
 */
export function usePreviaDoEnvio(
  candidaturaIds: string[],
  token: string | null,
  ativo: boolean,
): EstadoDaPrevia {
  const [previa, setPrevia] = useState<PreviaDoEnvioEmLote | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  // A LISTA DE IDS ENTRA NA DEPENDÊNCIA COMO TEXTO: um array novo a cada render (que é o caso das
  // telas de seleção) refaria a consulta em laço infinito se entrasse por referência.
  const chave = candidaturaIds.join(",");

  const buscar = useCallback(async () => {
    const rota = rotaDaPrevia(chave ? chave.split(",") : []);
    if (!ativo || !rota) {
      setPrevia(null);
      setFalhou(false);
      return;
    }
    setCarregando(true);
    setFalhou(false);
    try {
      setPrevia(await apiFetch<PreviaDoEnvioEmLote>(rota, { token }));
    } catch {
      setPrevia(null);
      setFalhou(true);
    } finally {
      setCarregando(false);
    }
  }, [chave, token, ativo]);

  useEffect(() => {
    void buscar();
  }, [buscar]);

  return { previa, carregando, falhou };
}

/**
 * A PRÉVIA DE UMA PESSOA SÓ, que é a mesma consulta com um id. O individual não ganha rota própria
 * de propósito: duas rotas para a mesma pergunta divergiriam na primeira vez que a régua de quem
 * pode receber mudasse, e a divergência apareceria justamente entre o aviso individual e o do lote.
 */
export function usePreviaIndividual(
  candidaturaId: string,
  token: string | null,
  ativo: boolean,
): { destinatario: DestinatarioDoLink | null; carregando: boolean; falhou: boolean } {
  const { previa, carregando, falhou } = usePreviaDoEnvio([candidaturaId], token, ativo);
  return { destinatario: previa?.itens[0] ?? null, carregando, falhou };
}

// ── O disparo ───────────────────────────────────────────────────────────────────────────────────

/**
 * O ENVIO AVULSO DE UMA ADMISSÃO, que é o caminho 2 (o RH, pelo Gerenciador do Portal).
 *
 * SEM CORPO, de propósito: a rota já É a origem `MANUAL` (ver `rotaEnviarLink`), e um `{ origem }`
 * vindo da tela seria a maneira de carimbar a trilha com uma origem que não aconteceu.
 */
export function enviarLinkDaAdmissao(
  admissaoId: string,
  token: string | null,
): Promise<ResultadoDoEnvioDoLink> {
  return apiFetch<ResultadoDoEnvioDoLink>(rotaEnviarLink(admissaoId), { method: "POST", token });
}

/**
 * A MENSAGEM DE UMA FALHA DE REDE, que é coisa diferente de uma RECUSA.
 *
 * Recusa é resposta do servidor com motivo (e aí a frase vem de `fraseDaRecusa`); falha é a
 * chamada que não completou. Misturar as duas faria "o candidato não tem e-mail" e "o servidor não
 * respondeu" chegarem ao consultor com a mesma cara.
 */
export function mensagemDaFalha(e: unknown, padrao: string): string {
  return e instanceof ApiError ? e.message : padrao;
}
