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
  const linhas: (AsEtapaFunil & {
    entregaAoCliente: boolean;
    destinoDoCancelamento: boolean;
    destinoDaReabertura: boolean;
    temEntrevista: boolean;
  })[] =
    ETAPAS_FUNIL_SEMENTE.filter((e) => !codigos || codigos.includes(e.codigo)).map((e, i) => ({
      id: i + 1,
      codigo: e.codigo,
      rotulo: e.rotulo,
      ordem: e.ordem,
      tom: e.tom as EtapaTom,
      inicial: e.codigo === "CAPTACAO",
      ativa: true,
      /*
       * OS DOIS FLAGS DA FRENTE B, ESPELHANDO A SEMENTE DA MIGRATION 0130, e não um `false` cômodo:
       * `ENTREVISTA_CLIENTE` é a etapa de entrega ao cliente, e é ela que faz a derivação de status
       * da vaga acontecer. Um dublê que respondesse sempre `false` esconderia justamente o
       * comportamento novo dos testes que passam por ele sem serem sobre ele.
       */
      entregaAoCliente: e.codigo === "ENTREVISTA_CLIENTE",
      /*
       * O DESTINO DO CANCELAMENTO FICA VAZIO AQUI, e a ausência é fiel: `STAND_BY` nasceu na
       * migration 0111 e NÃO está em `ETAPAS_FUNIL_SEMENTE` (o próprio arquivo explica por quê), que
       * é a lista de onde este dublê é montado. Quem testa o cancelamento com Stand By monta o
       * catálogo com a etapa, em vez de este dublê fingir uma linha que a semente não tem.
       */
      destinoDoCancelamento: false,
      /*
       * O DESTINO DA REABERTURA, ESPELHANDO A SEMENTE DA MIGRATION 0138: `TRIAGEM`, que ESTÁ em
       * `ETAPAS_FUNIL_SEMENTE` (ao contrário do `STAND_BY` logo acima). Um dublê que respondesse
       * sempre `false` faria a reabertura da vaga ENTREGUE recusar por configuração em todo spec que
       * passa por aqui sem ser sobre isso, e esconderia o comportamento que a frente construiu.
       */
      destinoDaReabertura: e.codigo === "TRIAGEM",
      /*
       * O FLAG DA FRENTE E, ESPELHANDO A SEMENTE DA MIGRATION 0131, e são DUAS etapas, não uma:
       * `ENTREVISTA_SOULAN` e `ENTREVISTA_CLIENTE`. Um dublê que marcasse só a primeira esconderia
       * justamente o caso que a OST manda prever (a entrevista também acontece na etapa Cliente), e
       * um que respondesse sempre `false` recusaria toda marcação nos testes que passam por aqui
       * sem serem sobre isso.
       */
      temEntrevista: e.codigo === "ENTREVISTA_SOULAN" || e.codigo === "ENTREVISTA_CLIENTE",
    }));

  return {
    listar: async () => linhas,
    codigosAtivos: async () => linhas.map((e) => e.codigo),
    ordemPorCodigo: async () => new Map(linhas.map((e) => [e.codigo, e.ordem])),
    codigosDeEntregaAoCliente: async () =>
      new Set(linhas.filter((e) => e.entregaAoCliente).map((e) => e.codigo)),
    etapaDoCancelamento: async () => linhas.find((e) => e.destinoDoCancelamento && e.ativa) ?? null,
    etapaDaReabertura: async () => linhas.find((e) => e.destinoDaReabertura && e.ativa) ?? null,
    codigosComEntrevista: async () =>
      new Set(linhas.filter((e) => e.temEntrevista && e.ativa).map((e) => e.codigo)),
    /** A MESMA recusa do serviço de verdade (etapa inexistente PRIMEIRO, depois "não tem entrevista"). */
    exigirEtapaComEntrevista: async (codigo: string) => {
      const etapa = linhas.find((e) => e.codigo === codigo);
      if (!etapa) {
        throw new BadRequestException("Esta etapa não existe no funil. Recarregue a página.");
      }
      if (!etapa.temEntrevista || !etapa.ativa) {
        throw new BadRequestException(`A etapa "${etapa.rotulo}" não tem entrevista.`);
      }
      return etapa;
    },
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
