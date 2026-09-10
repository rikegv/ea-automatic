import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { EtapasFunilAdminController } from "./etapas-funil-admin.controller";
import { EtapasFunilService } from "./etapas-funil.service";
import {
  bancoFingido,
  comoLista,
  etapasSemente,
  metodo,
  TAB_CANDIDATURAS,
  TAB_HISTORICO,
  type LinhaEtapa,
} from "./etapas-funil.fake-db";

/**
 * ─ INATIVAR UMA ETAPA: O VERBO QUE FALTAVA, COM AS DUAS TRAVAS QUE NÃO PODEM FALTAR ─────────────
 *
 * ┌─ O DEFEITO QUE ESTE ARQUIVO FECHA (apontado pelo diretor) ─────────────────────────────────────┐
 * │ A tela mostra a coluna Status com "Ativa" e NÃO TINHA COMO INATIVAR. Quem quisesse tirar uma    │
 * │ etapa de circulação precisava clicar em REMOVER e torcer para existir histórico, porque é o     │
 * │ histórico que desvia o `remover` da camada que APAGA para a que INATIVA. Sem histórico, o mesmo │
 * │ clique apaga a linha: o resultado dependia do estado do banco, e não da intenção de quem clicou.│
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A REGRA MUDOU EM 10/09/2026, POR DECISÃO DO DIRETOR, e este arquivo mudou com ela ────────────┐
 * │ ATÉ ALI, `inativar` PERMITIA a etapa com candidatura VIVA dentro, e a permissão estava afirmada │
 * │ aqui em dois casos deste mesmo arquivo ("não faz as três camadas" e o contraste com o           │
 * │ `remover`). O efeito era a ETAPA FANTASMA: as candidaturas vivas seguiam apontando para um       │
 * │ código que sumiu do seletor, do filtro e da tela de mover. O diretor mandou IGUALAR AO           │
 * │ `remover`, e os dois casos foram VIRADOS, não apagados: teste que documenta uma decisão          │
 * │ revogada sem dizer que foi revogada é pior que teste ausente.                                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ESTE ARQUIVO GUARDA, e cada caso responde a uma pergunta diferente:
 *  1. INATIVAR NÃO APAGA. A linha fica, com `ativa = false`, e continua resolvendo o histórico.
 *  2. AS TRÊS RECUSAS VALEM AQUI (inicial, última ativa e candidatura viva). As duas primeiras são
 *     sobre o ESTADO em que o catálogo fica, e não sobre o verbo que levou até ele; a terceira é a
 *     camada 1 do `remover`, e vale nos dois verbos desde a decisão acima.
 *  3. AS CAMADAS 2 E 3 DO `remover` CONTINUAM NÃO EXISTINDO AQUI: quem chama já decidiu que a linha
 *     FICA, então não há histórico a contar para escolher entre apagar e preservar. Isto é medido
 *     pelas CONSULTAS, e não pela leitura do código, senão o teste diria "está escrito assim" em vez
 *     de "se comporta assim".
 *  4. O CACHE INVALIDA. Este serviço serve leitura de cache por um minuto, e uma inativação que não
 *     invalidasse deixaria a etapa recebendo gente nova por até 60 segundos depois de sair de
 *     circulação, que é justamente o erro que o cabeçalho da classe diz que dói.
 *  5. A RÉGUA DO VIVO É `SITUACOES_VIVAS`, NUNCA `= 'ATIVO'`, e isso é medido com uma etapa que só
 *     tem `ALOCADO` dentro: a implementação ingênua acharia a etapa vazia e inativaria por cima de
 *     gente que continua no funil.
 *
 * §A.11: as frases de recusa entram no teste, e nenhuma delas pode conter travessão.
 * §A.6: etapa, situação e contagem. Nenhum dado pessoal passa por aqui.
 */

/**
 * ─ O CATÁLOGO PADRÃO: as cinco de hoje, a primeira inicial, todas ativas ────────────────────────
 *
 * DUAS ETAPAS COM PAPÉIS OPOSTOS, e é a diferença entre elas que este arquivo mede:
 *  . `CHEIA` (Triagem) tem DUAS candidaturas vivas, uma `ATIVO` e uma `ALOCADO`. A `ALOCADO` está
 *    ali de propósito: quem contar só `situacao = 'ATIVO'` encontra UMA, e a frase da recusa passa a
 *    dizer o número errado. Ela tem histórico também, que é o que leva o `remover` à camada 2.
 *  . `VAZIA` (Entrevista Soulan) não tem ninguém. É o alvo de tudo que precisa PASSAR, e o fato de
 *    ela passar no MESMO catálogo em que a `CHEIA` recusa é o que prova que a contagem é POR ETAPA,
 *    e não uma soma de todo mundo que está vivo em qualquer lugar do funil.
 */
const CHEIA = "TRIAGEM";
const VAZIA = "ENTREVISTA_SOULAN";

function montar(etapas: LinhaEtapa[] = etapasSemente()) {
  const { db, estado, consultas } = bancoFingido({
    etapas,
    candidaturas: [
      { id: "c1", etapa: CHEIA, situacao: "ATIVO" },
      { id: "c2", etapa: CHEIA, situacao: "ALOCADO" },
    ],
    historico: [{ id: "ev1", candidaturaId: "c1", etapaDe: "CAPTACAO", etapaPara: CHEIA }],
  });
  const service = new EtapasFunilService(db as never);
  const controller = new EtapasFunilAdminController(service as never);
  return { estado, consultas, service, controller };
}

/** O método, resolvido pelo nome que existir: a propriedade é o comportamento, não o nome. */
function inativarDo(alvo: object) {
  return metodo(alvo, ["inativar", "desativar"]);
}

const idDe = (estado: { etapas: LinhaEtapa[] }, codigo: string) =>
  estado.etapas.find((e) => e.codigo === codigo)!.id;

describe("inativar uma etapa: tira de circulação e NÃO apaga", () => {
  it("a linha CONTINUA na tabela, com `ativa = false`", async () => {
    const { service, estado } = montar();
    const alvo = idDe(estado, VAZIA);

    await inativarDo(service)(alvo);

    const linha = estado.etapas.find((e) => e.id === alvo);
    expect(linha, "inativar NÃO pode apagar a linha: é o histórico que depende dela").toBeDefined();
    expect(linha!.ativa).toBe(false);
    // O CÓDIGO É O QUE O HISTÓRICO GUARDA. Mexer nele aqui reescreveria a linha do tempo de quem
    // passou pela etapa, que é o motivo de o código ser imutável desde a criação.
    expect(linha!.codigo).toBe(VAZIA);
  });

  it("some da listagem padrão e continua em `listar(true)`, que é o que resolve o histórico", async () => {
    const { service, estado } = montar();

    await inativarDo(service)(idDe(estado, VAZIA));

    const ativas = comoLista(await service.listar()).map((e) => e.codigo);
    expect(ativas).not.toContain(VAZIA);
    const todas = comoLista(await service.listar(true)).map((e) => e.codigo);
    expect(todas).toContain(VAZIA);
  });

  it("o retorno é a etapa já inativada, e não o estado de antes", async () => {
    const { service, estado } = montar();

    const devolvida = (await inativarDo(service)(idDe(estado, VAZIA))) as Record<string, unknown>;

    expect(devolvida.ativa).toBe(false);
    expect(devolvida.codigo).toBe(VAZIA);
  });

  /**
   * O CACHE É A PARTE QUE PASSA DESPERCEBIDA. `todas()` serve de memória por 60 segundos, então uma
   * inativação sem `invalidar()` deixaria `exigirEtapaAtiva` ACEITANDO a etapa recém tirada de
   * circulação, e gente nova entraria numa etapa que a tela já não mostra.
   */
  it("a validação de entrada passa a RECUSAR a etapa no mesmo instante (o cache invalidou)", async () => {
    const { service, estado } = montar();
    await service.exigirEtapaAtiva(VAZIA); // aquece o cache com ela ATIVA

    await inativarDo(service)(idDe(estado, VAZIA));

    await expect(service.exigirEtapaAtiva(VAZIA)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("é IDEMPOTENTE: inativar o que já está inativo devolve a linha, sem erro", async () => {
    const { service, estado } = montar();
    const alvo = idDe(estado, VAZIA);
    await inativarDo(service)(alvo);

    const devolvida = (await inativarDo(service)(alvo)) as Record<string, unknown>;

    expect(devolvida.ativa).toBe(false);
    expect(estado.etapas.find((e) => e.id === alvo)).toBeDefined();
  });

  it("id que não existe é 404, e não um sucesso silencioso", async () => {
    const { service } = montar();

    await expect(inativarDo(service)(9999)).rejects.toBeInstanceOf(NotFoundException);
  });

  /**
   * ┌─ CASO VIRADO EM 10/09/2026 (decisão do diretor) ───────────────────────────────────────────┐
   * │ ELE AFIRMAVA O CONTRÁRIO: "não faz as três camadas: NENHUMA contagem de candidatura nem de  │
   * │ histórico é consultada", e a permissão de inativar etapa cheia estava escrita nele. A regra  │
   * │ mudou, e o caso mudou junto, medindo agora a linha divisória CERTA: a camada 1 (contar quem  │
   * │ está vivo) PASSOU A VALER; as camadas 2 e 3 (contar histórico para escolher entre apagar e   │
   * │ preservar) continuam sem sentido aqui, porque o verbo já decidiu que a linha FICA.           │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * É MEDIDO PELAS CONSULTAS, e não pela leitura do código: uma implementação que "contasse" em
   * memória, sem perguntar ao banco, contaria errado sem que a leitura do arquivo denunciasse.
   */
  it("faz a camada 1 (conta quem está vivo) e NÃO faz as camadas 2 e 3 (não consulta o histórico)", async () => {
    const { service, estado, consultas } = montar();
    const antes = consultas.length;

    await inativarDo(service)(idDe(estado, VAZIA));

    const tabelas = consultas.slice(antes).map((c) => c.tabela);
    expect(tabelas, "a camada 1 vale aqui: é ela que impede a etapa fantasma").toContain(
      TAB_CANDIDATURAS,
    );
    expect(
      tabelas,
      "o histórico só serve para escolher entre apagar e preservar, e aqui a linha FICA",
    ).not.toContain(TAB_HISTORICO);
  });

  /**
   * ┌─ CASO VIRADO EM 10/09/2026 (decisão do diretor) ───────────────────────────────────────────┐
   * │ ELE GUARDAVA A DIFERENÇA entre os dois verbos no mesmo alvo cheio: "o `remover` conta e      │
   * │ RECUSA, o `inativar` passa". A permissão do `inativar` era deliberada e estava escrita aqui  │
   * │ com todas as letras. O diretor REVOGOU: a etapa cheia é recusada nos DOIS verbos, e o que    │
   * │ este caso guarda agora é a IGUALDADE, no lugar da diferença.                                 │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * E A IGUALDADE É MEDIDA NA FRASE, não no tipo da exceção, porque é a FRASE que chega na tela e é
   * ela que diz quantas pessoas mover. Enquanto a camada 1 do `remover` continuar INLINE (ela não
   * foi trocada pela chamada ao ponto único, por ser código auditado e aprovado), é este caso que
   * segura a divergência: corrigir a régua em um dos verbos e esquecer o outro fica VERMELHO aqui.
   */
  it("a régua é a MESMA nos dois verbos: o mesmo alvo cheio recusa igual, com a mesma frase", async () => {
    const { service, estado, consultas } = montar();
    const alvo = idDe(estado, CHEIA);
    const antes = consultas.length;

    const doInativar = await inativarDo(service)(alvo).catch((e: Error) => e);
    const doRemover = await service.remover(alvo).catch((e: Error) => e as Error);

    expect(doInativar).toBeInstanceOf(BadRequestException);
    expect(doRemover).toBeInstanceOf(BadRequestException);
    // A MESMA frase, com o MESMO número, mudando só o verbo que a pessoa tentou usar.
    expect((doInativar as Error).message).toBe(
      (doRemover as Error).message.replace("antes de remover.", "antes de inativar."),
    );
    expect((doInativar as Error).message).toContain("2 candidaturas estão nesta etapa");
    // E os dois PERGUNTARAM AO BANCO: contagem que não consulta não é contagem.
    expect(consultas.slice(antes).map((c) => c.tabela)).toContain(TAB_CANDIDATURAS);
    expect(estado.etapas.find((e) => e.id === alvo)!.ativa, "a recusa não escreve nada").toBe(true);
  });
});

/**
 * ─ A RECUSA NOVA: ETAPA COM CANDIDATURA VIVA DENTRO (decisão do diretor, 10/09/2026) ────────────
 *
 * ┌─ O QUE ELA IMPEDE, e por que é pior do que parece ─────────────────────────────────────────────┐
 * │ A ETAPA FANTASMA. Inativar com gente viva dentro não move ninguém: as candidaturas continuam    │
 * │ apontando para um código que sumiu do seletor, do filtro e da tela de mover. Elas não param de   │
 * │ existir, param de ser ALCANÇÁVEIS, e nada falha, nada é logado e ninguém é avisado.             │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("a etapa CHEIA é recusada, com o número na frase", () => {
  it("recusa e NÃO escreve: a etapa continua ativa depois da tentativa", async () => {
    const { service, estado } = montar();
    const alvo = idDe(estado, CHEIA);

    await expect(inativarDo(service)(alvo)).rejects.toBeInstanceOf(BadRequestException);

    expect(estado.etapas.find((e) => e.id === alvo)!.ativa).toBe(true);
  });

  /**
   * A ARMADILHA QUE ESTE CASO EXISTE PARA PEGAR: contar `situacao = 'ATIVO'` acha UMA candidatura
   * onde há DUAS, e a frase passa a dizer para mover uma pessoa quando são duas. `ALOCADO`,
   * `APROVADO` e `ENVIADO_PARA_ADMISSAO` CONTINUAM NO FUNIL e continuam ocupando etapa.
   */
  it("conta pela régua de VIVO, e não só `ATIVO`: a `ALOCADO` entra no número", async () => {
    const { service, estado } = montar();

    const err = await inativarDo(service)(idDe(estado, CHEIA)).catch((e: Error) => e);

    expect((err as Error).message).toContain("2 candidaturas estão");
    expect((err as Error).message).toContain("Mova essas pessoas");
  });

  /**
   * UMA SÓ, E NO SINGULAR. A frase é lida por gente, e "1 candidaturas estão nesta etapa" é o tipo
   * de detalhe que faz a mensagem parecer erro de sistema em vez de instrução.
   *
   * E A SITUAÇÃO É `ALOCADO`, sozinha: se a régua fosse `= 'ATIVO'`, este caso encontraria ZERO,
   * INATIVARIA a etapa por cima de alguém que segue no funil, e o teste ficaria vermelho por não
   * ter recusa nenhuma. É a mesma medição do caso acima, pelo outro lado.
   */
  it("uma única candidatura viva, e `ALOCADO`: recusa, no SINGULAR", async () => {
    const { db, estado } = bancoFingido({
      etapas: etapasSemente(),
      candidaturas: [{ id: "c1", etapa: VAZIA, situacao: "ALOCADO" }],
      historico: [],
    });
    const service = new EtapasFunilService(db as never);

    const err = await inativarDo(service)(idDe(estado, VAZIA)).catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toContain("1 candidatura está");
    expect((err as Error).message).toContain("Mova essa pessoa");
    expect(estado.etapas.find((e) => e.codigo === VAZIA)!.ativa).toBe(true);
  });

  /**
   * A CONTAGEM É POR ETAPA, e não uma soma de todo mundo que está vivo no funil. O catálogo padrão
   * tem duas vivas na CHEIA, e a VAZIA passa no MESMO catálogo: sem esta linha, uma implementação
   * que esquecesse o filtro por etapa recusaria o funil inteiro e ninguém veria a diferença.
   */
  it("gente viva em OUTRA etapa não impede: a inativação da etapa vazia passa", async () => {
    const { service, estado } = montar();

    await inativarDo(service)(idDe(estado, VAZIA));

    expect(estado.etapas.find((e) => e.codigo === VAZIA)!.ativa).toBe(false);
    expect(estado.etapas.find((e) => e.codigo === CHEIA)!.ativa, "a outra não foi tocada").toBe(true);
  });

  /**
   * SÓ O VIVO SEGURA. Quem saiu do funil (`DESCARTADO`, `DESISTIU` e as demais saídas) fica com a
   * candidatura apontando para a etapa e NÃO é obstáculo: ninguém tem o que mover, e recusar aqui
   * transformaria histórico em pendência eterna, já que o expurgo por retenção ANONIMIZA e PRESERVA.
   */
  it("candidatura ENCERRADA na etapa não segura a inativação", async () => {
    const { db, estado } = bancoFingido({
      etapas: etapasSemente(),
      candidaturas: [
        { id: "c1", etapa: VAZIA, situacao: "DESCARTADO" },
        { id: "c2", etapa: VAZIA, situacao: "DESISTIU" },
      ],
      historico: [{ id: "ev1", candidaturaId: "c1", etapaDe: "CAPTACAO", etapaPara: VAZIA }],
    });
    const service = new EtapasFunilService(db as never);

    await inativarDo(service)(idDe(estado, VAZIA));

    expect(estado.etapas.find((e) => e.codigo === VAZIA)!.ativa).toBe(false);
  });

  /**
   * A ETAPA JÁ INATIVA COM GENTE VIVA DENTRO É A ETAPA FANTASMA EM SI, e ela é recusada, como no
   * `remover`: a contagem não olha `alvo.ativa`. A idempotência continua valendo para a etapa VAZIA
   * (caso próprio, acima), que é o clique repetido de verdade; aqui o estado é o que a regra nova
   * existe para não deixar nascer, e deixá lo passar calado seria a única porta em que o pior estado
   * é o único que não reclama.
   */
  it("a etapa JÁ INATIVA com gente viva dentro também é recusada", async () => {
    const etapas = etapasSemente().map((e) =>
      e.codigo === CHEIA ? { ...e, ativa: false } : e,
    );
    const { service, estado } = montar(etapas);

    await expect(inativarDo(service)(idDe(estado, CHEIA))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe("as travas de integridade, que valem para o verbo novo do mesmo jeito", () => {
  it("NÃO inativa a etapa INICIAL: a próxima candidatura ficaria sem lugar para nascer", async () => {
    const { service, estado } = montar();
    const inicial = estado.etapas.find((e) => e.inicial)!;

    await expect(inativarDo(service)(inicial.id)).rejects.toBeInstanceOf(BadRequestException);
    expect(estado.etapas.find((e) => e.id === inicial.id)!.ativa, "a recusa não pode ter escrito nada").toBe(
      true,
    );
  });

  /**
   * A ÚLTIMA ATIVA. O estado é incomum de propósito (a inicial aparece inativa, coisa que os verbos
   * do serviço não produzem sozinhos), e é justamente por isso que a trava existe: base migrada à
   * mão, carga antiga ou correção por SQL cru chegam nele, e sem a trava o catálogo terminaria com
   * ZERO etapa ativa, com a tela de mover abrindo vazia para o time inteiro.
   */
  it("NÃO inativa a ÚLTIMA ATIVA: funil sem etapa ativa não é funil", async () => {
    const etapas: LinhaEtapa[] = [
      { id: 1, codigo: "CAPTACAO", rotulo: "Captação", ordem: 1, tom: "nt", inicial: true, ativa: false },
      { id: 2, codigo: "OUTRA", rotulo: "Outra", ordem: 2, tom: "ok", inicial: false, ativa: true },
    ];
    const { service, estado } = montar(etapas);

    await expect(inativarDo(service)(2)).rejects.toBeInstanceOf(BadRequestException);
    expect(estado.etapas.find((e) => e.id === 2)!.ativa).toBe(true);
  });

  it("com DUAS ativas, inativar uma passa: a trava é da última, não de qualquer uma", async () => {
    const etapas: LinhaEtapa[] = [
      { id: 1, codigo: "CAPTACAO", rotulo: "Captação", ordem: 1, tom: "nt", inicial: true, ativa: true },
      { id: 2, codigo: "OUTRA", rotulo: "Outra", ordem: 2, tom: "ok", inicial: false, ativa: true },
    ];
    const { service, estado } = montar(etapas);

    await inativarDo(service)(2);

    expect(estado.etapas.find((e) => e.id === 2)!.ativa).toBe(false);
    expect(estado.etapas.filter((e) => e.ativa)).toHaveLength(1);
  });

  it("a etapa já inativa NÃO conta como a última ativa (é o que sustenta a idempotência)", async () => {
    const etapas: LinhaEtapa[] = [
      { id: 1, codigo: "CAPTACAO", rotulo: "Captação", ordem: 1, tom: "nt", inicial: true, ativa: true },
      { id: 2, codigo: "OUTRA", rotulo: "Outra", ordem: 2, tom: "ok", inicial: false, ativa: false },
    ];
    const { service } = montar(etapas);

    await expect(inativarDo(service)(2)).resolves.toBeDefined();
  });

  /**
   * AS FRASES CHEGAM NA TELA, então elas são parte do contrato e não decoração. Cada uma diz O QUE
   * FAZER (marcar outra como inicial, criar outra etapa), que é a diferença entre uma recusa e um
   * chamado. §A.11: travessão é proibido em texto de usuário.
   */
  it("as TRÊS recusas têm frase legível, dizem o caminho e não usam travessão (§A.11)", async () => {
    const { service, estado } = montar();
    const inicial = estado.etapas.find((e) => e.inicial)!;

    const frases: string[] = [];
    for (const chamada of [
      () => inativarDo(service)(inicial.id),
      () => {
        const so: LinhaEtapa[] = [
          { id: 1, codigo: "CAPTACAO", rotulo: "Captação", ordem: 1, tom: "nt", inicial: true, ativa: false },
          { id: 2, codigo: "OUTRA", rotulo: "Outra", ordem: 2, tom: "ok", inicial: false, ativa: true },
        ];
        return inativarDo(montar(so).service)(2);
      },
      () => inativarDo(service)(idDe(estado, CHEIA)),
    ]) {
      await chamada().catch((e: Error) => frases.push(e.message));
    }

    expect(frases).toHaveLength(3);
    expect(frases[0]).toContain("Marque outra como inicial");
    expect(frases[1]).toContain("Crie outra");
    expect(frases[2]).toContain("Mova essas pessoas");
    for (const f of frases) {
      expect(f.length, "recusa sem frase é chamado na certa").toBeGreaterThan(20);
      expect(f, `travessão proibido (§A.11): ${f}`).not.toContain("—");
    }
  });

  /**
   * A ORDEM DAS RECUSAS É PARTE DO CONTRATO, e não detalhe de implementação: a etapa INICIAL que
   * também está cheia tem de ouvir "marque outra como inicial", que é o que ela precisa fazer
   * PRIMEIRO. Mandar mover quarenta pessoas para descobrir depois que ela é a inicial é trabalho
   * jogado fora, e a ordem inversa faria exatamente isso.
   *
   * A trava da inicial e a da última ativa também custam ZERO consulta, então elas vêm antes
   * também por isso: só quem passa por elas paga a contagem no banco.
   */
  it("a etapa INICIAL e CHEIA ouve a frase da INICIAL: as travas de estado vêm antes da contagem", async () => {
    const { estado } = montar();
    // A CHEIA passa a ser a inicial, para o alvo violar as DUAS regras ao mesmo tempo.
    const etapas = estado.etapas.map((e) => ({ ...e, inicial: e.codigo === CHEIA }));
    const outro = montar(etapas);

    const err = await inativarDo(outro.service)(idDe(outro.estado, CHEIA)).catch((e: Error) => e);

    expect((err as Error).message).toContain("Marque outra como inicial");
    expect((err as Error).message).not.toContain("Mova");
  });
});

describe("a rota: a contraparte de `reativar`, na controller de escrita", () => {
  it("a controller expõe `inativar` e ela delega ao serviço", async () => {
    const { controller, estado } = montar();
    const alvo = idDe(estado, VAZIA);

    await inativarDo(controller)(alvo);

    expect(estado.etapas.find((e) => e.id === alvo)!.ativa).toBe(false);
  });

  /** A RECUSA CHEGA PELA ROTA, e não só pelo serviço: é por ela que a tela recebe a frase. */
  it("a recusa da etapa cheia sobe pela rota, com a frase que a tela mostra", async () => {
    const { controller, estado } = montar();

    const err = await inativarDo(controller)(idDe(estado, CHEIA)).catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toContain("Mova essas pessoas para outra etapa antes de inativar");
  });

  it("ida e volta: inativar e reativar devolvem a etapa à circulação com o MESMO código", async () => {
    const { controller, service, estado } = montar();
    const alvo = idDe(estado, VAZIA);

    await inativarDo(controller)(alvo);
    await controller.reativar(alvo);

    const linha = estado.etapas.find((e) => e.id === alvo)!;
    expect(linha.ativa).toBe(true);
    expect(linha.codigo).toBe(VAZIA);
    expect(comoLista(await service.listar()).map((e) => e.codigo)).toContain(VAZIA);
  });
});
