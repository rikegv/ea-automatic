import { BadRequestException } from "@nestjs/common";
import { ETAPAS_FUNIL_SEMENTE, type AsEtapaFunil, type EtapaTom } from "@ea/shared-types";

/**
 * ─ O CATÁLOGO DE ETAPAS, FINGIDO, PARA OS TESTES QUE NÃO SÃO SOBRE ELE ─────────────────────────
 *
 * INFRAESTRUTURA DE TESTE: nenhuma linha daqui roda em produção.
 *
 * POR QUE ELE EXISTE. Quando as etapas viraram catálogo, `CandidatosService` e `VagasService`
 * passaram a DEPENDER do `EtapasFunilService` (a etapa de nascimento, a validação do destino e a
 * ordem do funil saem de lá). Uma dúzia de specs que testam coisa COMPLETAMENTE OUTRA (ocupação de
 * vaga, trilha de redução de meta, lote de saída) passaram a precisar desse segundo argumento, e a
 * alternativa seria cada um inventar o seu, com listas ligeiramente diferentes.
 *
 * O CONTEÚDO É A SEMENTE, e é isso que mantém aqueles testes dizendo o que sempre disseram: as
 * cinco etapas de hoje, na ordem de hoje, com `CAPTACAO` como inicial. Nenhum deles muda de
 * significado por causa desta frente; eles só param de compilar sem alguém entregar o catálogo.
 *
 * QUEM TESTA O CATÁLOGO DE VERDADE NÃO USA ISTO: os specs do próprio `EtapasFunilService` rodam
 * contra o banco fingido (`etapas-funil.fake-db.ts`), porque lá o que está sob teste é justamente o
 * que este arquivo finge.
 */
export function catalogoDeEtapasFingido(codigos?: readonly string[]) {
  const linhas: AsEtapaFunil[] = ETAPAS_FUNIL_SEMENTE.filter(
    (e) => !codigos || codigos.includes(e.codigo),
  ).map((e, i) => ({
    id: i + 1,
    codigo: e.codigo,
    rotulo: e.rotulo,
    ordem: e.ordem,
    tom: e.tom as EtapaTom,
    inicial: e.codigo === "CAPTACAO",
    ativa: true,
  }));

  return {
    listar: async () => linhas,
    codigosAtivos: async () => linhas.map((e) => e.codigo),
    ordemPorCodigo: async () => new Map(linhas.map((e) => [e.codigo, e.ordem])),
    etapaInicial: async () => {
      const inicial = linhas.find((e) => e.inicial) ?? linhas[0];
      if (!inicial) throw new BadRequestException("Nenhuma etapa inicial.");
      return inicial;
    },
    // A MESMA RECUSA DO SERVIÇO DE VERDADE, e não um `true` complacente: spec que mande etapa
    // inexistente tem de ver a recusa aqui também, senão o dublê esconde o defeito que ele imita.
    exigirEtapaAtiva: async (codigo: string) => {
      const etapa = linhas.find((e) => e.codigo === codigo);
      if (!etapa) {
        throw new BadRequestException("Esta etapa não existe no funil. Recarregue a página.");
      }
      return etapa;
    },
  };
}
