import { VAGA_STATUS_SEMENTE, type VagaStatusTom, type VagaStatusItem } from "@ea/shared-types";
import { ReguaDeStatusDaVaga, type AsVagaStatusLinha } from "./vaga-status.service";

/**
 * ─ O CATÁLOGO DE STATUS DA VAGA, FINGIDO, PARA OS TESTES QUE NÃO SÃO SOBRE ELE ─────────────────
 *
 * INFRAESTRUTURA DE TESTE: nenhuma linha daqui roda em produção.
 *
 * POR QUE ELE EXISTE. Quando o status virou catálogo, `VagasService` e `CandidatosService` passaram
 * a DEPENDER do `VagaStatusService` (o código que o fechamento grava, a permissão da trilha, a trava
 * de "esta vaga recebe candidato?"). Duas dúzias de specs que testam coisa COMPLETAMENTE OUTRA
 * (ocupação de vaga, rastro de redução de meta, lote de saída) passaram a precisar desse terceiro
 * argumento, e a alternativa seria cada um inventar o seu, com listas ligeiramente diferentes.
 *
 * O CONTEÚDO É A SEMENTE (`VAGA_STATUS_SEMENTE`), e é isso que mantém aqueles testes dizendo o que
 * sempre disseram: os cinco status de hoje, com os papéis e os flags de hoje. Nenhum deles muda de
 * significado por causa desta frente; eles só param de compilar sem alguém entregar o catálogo.
 *
 * A RÉGUA DEVOLVIDA É A DE VERDADE (`ReguaDeStatusDaVaga`), e não um dublê dela: ela é uma classe
 * PURA, sem banco, e é justamente ela que carrega o fail-closed (código desconhecido LANÇA, papel
 * sem linha LANÇA). Substituí-la por um objeto complacente esconderia exatamente o defeito que os
 * testes precisam ver.
 *
 * QUEM TESTA O CATÁLOGO DE VERDADE NÃO USA ISTO: os specs do próprio `VagaStatusService` rodam
 * contra o banco fingido (`vaga-status.fake-db.ts`).
 */
/**
 * ─ O `VAGA_BANCO`, QUE A SEMENTE NÃO TEM E O BANCO TEM ─────────────────────────────────────────
 *
 * A semente do shared-types descreve os CINCO status oferecidos. O BANCO tem SEIS linhas, porque a
 * migration 0102 semeia a partir de `enum_range(NULL::vaga_status)` e o `VAGA_BANCO` continua no
 * enum (dormente desde 07/09; o Postgres não remove valor de enum). Ele entra pelo FALLBACK do
 * `LEFT JOIN`: papel LIVRE, INATIVO, não encerra, RECEBE candidato, fora da trilha e não movível.
 *
 * ELE PRECISA ESTAR AQUI, e não é capricho: a régua é FAIL-CLOSED e LANÇA para código desconhecido,
 * então um fake sem esta linha faria os testes que exercitam o status dormente verem uma exceção
 * onde a produção vê `true`. O dublê tem de imitar o banco que existe, não a lista que se oferece.
 */
const VAGA_BANCO_DORMENTE: VagaStatusItem = {
  codigo: "VAGA_BANCO",
  rotulo: "VAGA_BANCO",
  ordem: 106,
  tom: "nt",
  ativo: false,
  papel: "LIVRE",
  encerra: false,
  recebeCandidato: true,
  daTrilha: false,
  movivelManualmente: false,
};

/** AS LINHAS, SÍNCRONAS, para quem precisa DERIVAR uma lista de casos de teste do catálogo. */
export function linhasDeStatusFingidas(
  ajustes: readonly Partial<VagaStatusItem>[] = [],
): AsVagaStatusLinha[] {
  return montar(ajustes);
}

export function catalogoDeStatusFingido(
  ajustes: readonly Partial<VagaStatusItem>[] = [],
): {
  listar: (incluirInativos?: boolean) => Promise<AsVagaStatusLinha[]>;
  regua: () => Promise<ReguaDeStatusDaVaga>;
  codigoDoPapel: (papel: VagaStatusItem["papel"]) => Promise<string>;
} {
  const linhas = montar(ajustes);
  const regua = new ReguaDeStatusDaVaga(linhas);
  return {
    listar: async (incluirInativos = false) =>
      incluirInativos ? linhas : linhas.filter((l) => l.ativo),
    regua: async () => regua,
    codigoDoPapel: async (papel) => regua.codigoDoPapel(papel),
  };
}

/** O corpo comum das duas portas acima. */
function montar(ajustes: readonly Partial<VagaStatusItem>[]): AsVagaStatusLinha[] {
  const base: readonly VagaStatusItem[] = [...VAGA_STATUS_SEMENTE, VAGA_BANCO_DORMENTE];
  const linhas: AsVagaStatusLinha[] = base.map((s, i) => {
    const ajuste = ajustes.find((a) => a.codigo === s.codigo);
    return { id: i + 1, ...s, tom: s.tom as VagaStatusTom, ...ajuste };
  });
  // AJUSTE COM CÓDIGO NOVO ENTRA COMO LINHA NOVA: é como um spec finge um status do diretor
  // ("Stand By") sem precisar de banco.
  for (const [i, a] of ajustes.entries()) {
    if (!a.codigo || linhas.some((l) => l.codigo === a.codigo)) continue;
    linhas.push({
      id: 200 + i,
      codigo: a.codigo,
      rotulo: a.rotulo ?? a.codigo,
      ordem: a.ordem ?? 200 + i,
      tom: (a.tom ?? "nt") as VagaStatusTom,
      ativo: a.ativo ?? true,
      papel: a.papel ?? "LIVRE",
      encerra: a.encerra ?? false,
      recebeCandidato: a.recebeCandidato ?? true,
      daTrilha: a.daTrilha ?? false,
      movivelManualmente: a.movivelManualmente ?? true,
    });
  }
  return linhas;
}
