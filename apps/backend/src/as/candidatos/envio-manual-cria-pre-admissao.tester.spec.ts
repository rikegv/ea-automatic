import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { asCandidaturas } from "../../db/schema";
import { MOTIVO_DE_DESCARTE_VALIDO } from "../motivos-descarte/motivos-descarte.fake";
import {
  bancoFingido,
  linhaFingida,
  usuarioFingido,
} from "./fronteira-encerrada.tester-fake";

/**
 * ─ O CAMINHO MANUAL CONTINUA CRIANDO A PRE-ADMISSAO (trava anti-dano-colateral) ────────────────
 *
 * ESCRITO A PARTIR DO REQUISITO, pelo `tester`, como contrapeso da frente "a varredura nunca cria
 * admissao". A regra do diretor tem DUAS metades, e so uma delas e um corte:
 *
 *   "O UNICO GATILHO QUE ENVIA PARA ADMISSAO E O GATILHO DA ESTEIRA, E NAO DAS ATS."
 *
 * Os dois gatilhos que FICAM sao o webhook e o ENVIO MANUAL DO FUNIL (`registrarSaida` com
 * `ENVIADO_PARA_ADMISSAO`). Esta spec existe porque, antes dela, NENHUMA suite do repositorio
 * exercitava a criacao da pre-admissao pelo caminho manual: o dano colateral seria silencioso.
 *
 * ┌─ CORRECAO DE PREMISSA, MEDIDA (gap devolvido ao coordenador) ────────────────────────────────┐
 * │ O mapa de alcance diz que `SITUACOES_QUE_PEDEM_PONTE_PARA_ADMISSAO` e "a regua do caminho      │
 * │ manual" e que mexer nela "desliga o envio do funil". NAO E: varri o repositorio inteiro e      │
 * │ aquela constante nao tem consumidor nenhum neste arquivo. Quem escolhe o caminho travado aqui  │
 * │ e `ocupaPosicao(dto.situacao)` (`consomePosicao`, `@ea/shared-types`), e quem dispara a ponte  │
 * │ e o `if (this.admissoes && ponte)` logo depois. Os unicos consumidores daquela lista sao        │
 * │ `desfechoDaIngestaoExterna` e `ponteDeveDisparar`, os DOIS do lado da varredura.               │
 * │                                                                                               │
 * │ POR QUE ISSO IMPORTA PARA O CONSERTO: a lista que o mapa manda preservar por seguranca vai     │
 * │ ficar SEM consumidor efetivo depois do corte, o que e o mesmo "sinal morto" que o mapa manda    │
 * │ evitar nos contadores do resumo. Decidir o que fazer com ela e do coordenador; o que este       │
 * │ arquivo garante e que o caminho manual continua criando, qualquer que seja a decisao.           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE EU MEDI ANTES DE ESCREVER, e e o que justifica o arquivo existir ─────────────────────┐
 * │ `AdmissoesService` entra no `CandidatosService` pelo QUINTO argumento, `@Optional()`. Varri as  │
 * │ 20 construcoes de `new CandidatosService(` do backend: TODAS passam QUATRO argumentos. Logo o   │
 * │ ramo `if (this.admissoes && ponte)` de `registrarSaida` NUNCA foi executado em teste, e         │
 * │ `criarPreAdmissaoDoFunil` so aparece em asserção de spec pelo lado da VARREDURA (a ponte que     │
 * │ vai ser removida). Quando aqueles arquivos sairem, a criacao de admissao pelo funil fica SEM     │
 * │ nenhuma cobertura. Este arquivo e essa cobertura.                                               │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE O DUBLE E LIGADO DEPOIS DA CONSTRUCAO ──────────────────────────────────────────────┐
 * │ `bancoFingido` e o unico dublê que modela o caminho travado inteiro (leitura da vaga com FOR    │
 * │ UPDATE, contagem por lado, escrita da candidatura e do historico), e ele constroi o servico com │
 * │ quatro argumentos. Acrescentar um quinto parametro LA tocaria um fake compartilhado por ~14      │
 * │ specs de outras frentes, o que esta fora do recorte desta tarefa (§A.14). `private readonly` e   │
 * │ modificador de TypeScript e nao existe em tempo de execucao, entao ligar a porta na instancia e  │
 * │ exatamente o que o Nest faz, sem tocar arquivo de ninguem.                                      │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: o CPF que circula e o sintetico do fake (`52998224725`, familia reservada com verificador
 * valido), e nenhuma asserção imprime o numero.
 */

const ENVIO = "ENVIADO_PARA_ADMISSAO" as const;
const ADMISSAO = "11111111-2222-3333-4444-555555555555";

/** A porta do nucleo da Admissao, anotando o que o funil pediu. */
function admissoesFingido() {
  return {
    vivasPorCpf: vi.fn().mockResolvedValue([]),
    criarPreAdmissaoDoFunil: vi
      .fn()
      .mockResolvedValue({ admissaoId: ADMISSAO, jaExistia: false }),
  };
}

function cenarioDoEnvioManual() {
  const b = bancoFingido({
    candidaturas: [linhaFingida({ id: "cand-1", situacao: "ALOCADO", posicaoLado: "OFICIAL" })],
  });
  const admissoes = admissoesFingido();
  (b.service as unknown as { admissoes?: unknown }).admissoes = admissoes;
  return { b, admissoes };
}

describe("o envio manual do funil CONTINUA criando a pre-admissao", () => {
  it("`registrarSaida` com ENVIADO_PARA_ADMISSAO cria a pre-admissao, uma vez", async () => {
    const { b, admissoes } = cenarioDoEnvioManual();

    await b.service.registrarSaida(
      "cand-1",
      { situacao: ENVIO, motivo: "foi para a esteira" } as never,
      usuarioFingido("COMUM") as never,
    );

    expect(admissoes.criarPreAdmissaoDoFunil).toHaveBeenCalledTimes(1);
    // A SAIDA ACONTECEU DE VERDADE: a candidatura foi para a situacao de envio. Sem esta linha, o
    // teste passaria num cenario que nem chegou ao ramo da ponte.
    expect(b.situacaoDe("cand-1")).toBe(ENVIO);
  });

  /*
   * O ELO E A METADE DA PONTE QUE A TELA DO FUNIL LE. Criar a admissao e nao gravar
   * `as_candidaturas.admissao_id` deixaria a candidatura orfa da admissao que ela originou, e o
   * envio do link do Portal (que le o elo) devolveria `SEM_ADMISSAO` para sempre.
   */
  it("a candidatura passa a apontar para a admissao criada", async () => {
    const { b } = cenarioDoEnvioManual();

    await b.service.registrarSaida(
      "cand-1",
      { situacao: ENVIO, motivo: "foi para a esteira" } as never,
      usuarioFingido("COMUM") as never,
    );

    const elo = b.updates.find(
      (u) => u.tabela === asCandidaturas && "admissaoId" in u.valores,
    );
    expect(elo?.valores.admissaoId).toBe(ADMISSAO);
  });

  /*
   * A OUTRA SAIDA NAO CRIA NADA, e e o par necessario do teste de cima: um "conserto" que fizesse
   * toda saida criar admissao passaria nos dois primeiros e quebraria o funil inteiro.
   * `APROVADO`/`ALOCADO` consomem posicao e NAO sao "esta pessoa vai ser admitida".
   */
  it("saida de DESCARTE conclui e nao cria pre-admissao nenhuma", async () => {
    const { b, admissoes } = cenarioDoEnvioManual();

    /*
     * O MOTIVO VEM DO CATALOGO FINGIDO, e nao de um texto inventado: `registrarSaida` confere o
     * descarte contra `motivos_descarte` antes de qualquer transacao, e um nome fora da lista seria
     * recusado por 400. ELA TEM DE CONCLUIR, e e por isso que nao ha `catch` aqui: engolir a excecao
     * faria o teste nao distinguir "nao criou" de "estourou antes de chegar la", e foi assim que a
     * primeira versao deste caso SOBREVIVEU a mutacao que mandava toda saida criar admissao.
     */
    await b.service.registrarSaida(
      "cand-1",
      { situacao: "DESCARTADO", motivo: MOTIVO_DE_DESCARTE_VALIDO } as never,
      // MASTER porque a candidatura do cenario esta ALOCADA, e tirar da vaga quem ja recebeu a
      // posicao e acao de Master (trava do desvinculo). O papel nao e o assunto deste caso.
      usuarioFingido("MASTER") as never,
    );

    expect(b.situacaoDe("cand-1")).toBe("DESCARTADO");
    expect(admissoes.criarPreAdmissaoDoFunil).not.toHaveBeenCalled();
    expect(
      b.updates.find((u) => u.tabela === asCandidaturas && "admissaoId" in u.valores),
    ).toBeUndefined();
  });
});
