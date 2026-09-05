/**
 * O DESFECHO DO REPROCESSAR, em linguagem de operação. Módulo PURO, sem rede e sem banco.
 *
 * POR QUE EXISTE (caso Zelda, idPreCollaborator 421114, 05/09/2026). O botão Reprocessar do
 * Diagnóstico devolvia `{reenfileirado: true}` no instante do clique e a tela não lia nem isso: só
 * recarregava a lista. Como a lista mostra APENAS jobs falhados, e o `retry()` acabara de tirar o job
 * de "falhado" para "aguardando", a tela ficava vazia e PARECIA sucesso. Onze segundos depois o job
 * falhava de novo, e ninguém via. O diretor clicou, leu sucesso, e não havia sucesso.
 *
 * A REGRA: só diz que puxou quem puxou. Voltar para a fila não é desfecho, é começo, e tem estado
 * próprio. Três respostas possíveis, nunca duas.
 *
 * §A.6: nada aqui carrega CPF, URL ou nome de candidato. O motivo cru vem do `failedReason` do
 * BullMQ, que é a mensagem da exceção, e as exceções do EA já nascem sem dado pessoal.
 * §A.11: sem travessão em nenhum texto que chega ao usuário.
 */

/** Os três estados honestos do reprocessamento. */
export type DesfechoReprocesso = "CONCLUIDO" | "FALHOU" | "EM_PROCESSAMENTO";

/**
 * ONDE A ADMISSÃO CAIU depois de um reprocesso do Pandapé que deu certo. Serve para a mensagem dizer
 * o lugar exato, em vez de um "sucesso" genérico que obriga o operador a caçar o candidato.
 */
export type DestinoDoReprocesso = "LIBERACAO" | "ESTEIRA" | "NADA";

/**
 * TRADUÇÕES. Deliberadamente CURTA: só entram motivos que já foram vistos em produção, com a causa
 * entendida. Motivo desconhecido NÃO é traduzido, cai no `failedReason` cru, que já é legível ("CPF
 * inválido", não um código). Inventar tradução para falha que ninguém mediu é pior que não traduzir,
 * porque manda o operador para o lugar errado com ar de certeza.
 */
const TRADUCOES: { padrao: RegExp; texto: string }[] = [
  {
    padrao: /cpf\s+inv[áa]lido/i,
    texto:
      "O Pandapé devolve um CPF que não fecha o dígito verificador, no cadastro do candidato e em todos os campos de CPF do formulário. Enquanto o dado não mudar na origem, reprocessar vai falhar de novo.",
  },
  {
    padrao: /\b429\b|rate\s*limit|too\s+many\s+requests/i,
    texto:
      "O serviço externo recusou por excesso de chamadas (limite de cota). O job volta sozinho pela fila. Tente de novo em alguns minutos.",
  },
  {
    padrao: /timeout|etimedout|econnreset|econnrefused|fetch\s+failed|socket\s+hang\s+up/i,
    texto:
      "A chamada externa não respondeu a tempo. É falha de rede, não de dado: reprocessar de novo costuma resolver.",
  },
];

/**
 * O motivo em linguagem de operação, ou `undefined` quando não há tradução conhecida. Quem chama usa
 * o cru nesse caso, nunca um texto genérico do tipo "erro ao processar".
 */
export function traduzirMotivo(motivoCru: string | undefined): string | undefined {
  if (!motivoCru?.trim()) return undefined;
  return TRADUCOES.find((t) => t.padrao.test(motivoCru))?.texto;
}

/** O que a tela mostra, já pronto. Uma frase por estado, sem travessão (§A.11). */
export function mensagemDoReprocesso(entrada: {
  desfecho: DesfechoReprocesso;
  motivo?: string | undefined;
  destino?: DestinoDoReprocesso | undefined;
}): string {
  if (entrada.desfecho === "EM_PROCESSAMENTO") {
    return "O job voltou para a fila e ainda está rodando. Atualize em instantes.";
  }
  if (entrada.desfecho === "FALHOU") {
    const motivo = traduzirMotivo(entrada.motivo) ?? entrada.motivo?.trim();
    return motivo ? `Não puxou. ${motivo}` : "Não puxou, e o BullMQ não registrou o motivo.";
  }
  if (entrada.destino === "LIBERACAO") {
    return "Admissão reprocessada. Pré-admissão criada, veja em Liberação Admissional.";
  }
  if (entrada.destino === "ESTEIRA") {
    return "Admissão reprocessada. A admissão nasceu na esteira, com as frentes abertas.";
  }
  if (entrada.destino === "NADA") {
    // Não é sucesso nem falha, e mentir para qualquer um dos dois lados é o defeito que a tela tinha.
    return "Job reprocessado sem erro, mas nenhuma admissão foi criada. O evento provavelmente já era conhecido pelo EA.";
  }
  return "Job reprocessado com sucesso.";
}
