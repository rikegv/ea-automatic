import type { ResultadoDoEnvioEmLote } from "@ea/shared-types";

/**
 * O DUBLÊ DO ENVIO DO LINK, para as specs que instanciam o `CandidatosService` à mão.
 *
 * ┌─ POR QUE UM DUBLÊ DE VERDADE, E NÃO `{} as never` ──────────────────────────────────────────┐
 * │ Os dois ganchos do Portal em `registrarSaida` e em `reverterEnvioParaAdmissao` ABSORVEM      │
 * │ falha de propósito (a saída do funil é o fato, o envio é o aviso, §A.5). Com um objeto vazio │
 * │ no lugar do serviço, a chamada estouraria um `TypeError`, o `catch` o engoliria, e TODAS as  │
 * │ specs continuariam verdes sobre um gancho que nunca rodou. Seria teste passando por cima do  │
 * │ próprio mecanismo que ele deveria vigiar.                                                    │
 * │                                                                                              │
 * │ Com o dublê, o gancho EXECUTA, e a spec que quiser pode olhar o que foi chamado.             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ELE NÃO ENVIA NADA E NÃO TOCA BANCO: só registra o que pediram. A régua do envio de verdade
 * (ordem dos passos, inércia, mascaramento) é provada nas specs do próprio Portal, que é onde ela
 * mora; aqui o que se prova é que o funil CHAMA o gancho certo, na hora certa.
 */
export interface EnvioDoPortalFingido {
  /** Os lotes pedidos, na ordem. Cada item é a lista de candidaturas de uma chamada. */
  lotes: string[][];
  /** As admissões cujos links foram mandados revogar pela reversão do envio. */
  reversoes: string[];
  enviarParaCandidaturas(ids: string[], autorId: string): Promise<ResultadoDoEnvioEmLote>;
  revogarLinksDaReversao(admissaoId: string, autorId: string): Promise<number>;
}

export function envioDoPortalFingido(): EnvioDoPortalFingido {
  const fingido: EnvioDoPortalFingido = {
    lotes: [],
    reversoes: [],
    async enviarParaCandidaturas(ids) {
      fingido.lotes.push([...ids]);
      // O DESFECHO PADRÃO É O DE HOJE: sem a ponte A&S para Esteira, a candidatura não tem
      // admissão, então o envio recusa com `SEM_ADMISSAO` e NÃO emite link nenhum. Um dublê que
      // devolvesse sucesso descreveria um mundo que ainda não existe.
      return {
        enviados: 0,
        recusados: ids.map((candidaturaId) => ({
          candidaturaId,
          admissaoId: null,
          nome: "",
          destinoMascarado: null,
          podeEnviar: false,
          motivo: "SEM_ADMISSAO" as const,
        })),
      };
    },
    async revogarLinksDaReversao(admissaoId) {
      fingido.reversoes.push(admissaoId);
      return 0;
    },
  };
  return fingido;
}
