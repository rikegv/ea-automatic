import { describe, expect, it } from "vitest";
import { sqlExecutavel } from "../candidatos/retencao-lgpd.tester-fake";
import {
  projetarInscricao,
  projetarVaga,
  type InscricaoProjetada,
} from "../../domain/pandape-varredura-projecao";
import { IngestaoHttp } from "./ingestao-http";
import { IngestaoRepositorio } from "./ingestao-repositorio";
import { lerDataDeCorte } from "./ingestao-varredura.service";
import { CAMINHO_INSCRICOES, CAMINHO_PASTAS, CAMINHO_VAGAS } from "./ingestao-ciclo";

/**
 * ─ O QUE O CONTRATO DO `tester` NÃO ALCANÇA, MEDIDO AQUI ───────────────────────────────────────
 *
 * A cobertura comportamental (`ingestao-varredura.comportamental.spec.ts`, escrita pelo `tester` a
 * partir do requisito) audita o CICLO contra um mundo falso. Ela não alcança, e não deveria, as três
 * peças de infraestrutura que ficam DEPOIS das portas:
 *   1. o adaptador HTTP, onde mora a trava do GET e a allowlist de caminho;
 *   2. o repositório, onde mora a forma do SQL (a guarda da anonimização, a lista nominal de colunas
 *      e o carimbo de SERVIDOR do encerramento da vaga);
 *   3. a leitura da data de corte, que é o que mantém a varredura INERTE até alguém decidir.
 *
 * PARTE DESTA COBERTURA É ASSERÇÃO DE FORMA sobre o texto do SQL, e o motivo é o mesmo já registrado
 * no expurgo: o filtro mora dentro de uma consulta em SQL cru, e um banco fingido que devolve linhas
 * prontas passa igual com a cláusula certa ou errada. Os comentários são apagados antes da leitura
 * (`sqlExecutavel`), senão a palavra da regra apareceria no comentário que a explica e o teste
 * ficaria verde com a cláusula removida.
 *
 * §A.6: nenhum dado real. As sentinelas abaixo são inventadas para serem procuradas onde não podem
 * aparecer, e o CPF usado é um válido de teste, nunca de pessoa.
 */

const CPF_DE_TESTE = "52998224725";

/** O item gordo, como a API entrega: 58 campos, com os quatro do art. 11 dentro. */
function itemCru(): Record<string, unknown> {
  return {
    idCandidate: 777,
    idMatch: 999,
    idVacancy: 9001,
    idVacancyFolder: 71,
    insertDate: "2026-09-10T10:00:00Z",
    name: "NomeSintetico",
    surname: "SobrenomeSintetico",
    cpf: CPF_DE_TESTE,
    email: "email-sintetico@exemplo",
    phone: "telefone-sintetico",
    birthDate: "1990-01-15T00:00:00",
    cep: "00000-000",
    address: "endereco-sintetico",
    addressNumber: "10",
    latitude: -1.1,
    longitude: -2.2,
    summary: "resumo-de-curriculo-sintetico",
    experiences: [{ company: "empresa-sintetica", salary: 1 }],
    studies: [{ course: "estudo-sintetico" }],
    idRace: "sensivel-raca",
    idSexualOrientation: "sensivel-orientacao",
    idGenderIdentity: "sensivel-genero",
    hasDeficiency: true,
    deficiencies: ["sensivel-deficiencia"],
  };
}

describe("a projeção do item de inscrição", () => {
  it("não carrega NENHUM dos quatro campos do art. 11, nem o texto livre do currículo", () => {
    const p = projetarInscricao(itemCru());
    const chaves = Object.keys(p as unknown as Record<string, unknown>);
    for (const proibido of [
      "idRace",
      "idSexualOrientation",
      "idGenderIdentity",
      "hasDeficiency",
      "deficiencies",
      "summary",
      "experiences",
      "studies",
      "address",
      "latitude",
      "longitude",
      "cep",
    ]) {
      expect(chaves, `\`${proibido}\` atravessou a projeção`).not.toContain(proibido);
    }
    const serializado = JSON.stringify(p);
    expect(serializado).not.toContain("sensivel");
    expect(serializado).not.toContain("resumo-de-curriculo");
    expect(serializado).not.toContain("endereco-sintetico");
  });

  it("CIDADE e UF ficam de fora enquanto o nome do campo não for confirmado contra a API", () => {
    /*
     * O plano mapeia `location3`/`location2`, e esses nomes NÃO estão na lista de campos medidos.
     * Errar e pegar `address` poria LOGRADOURO dentro de `as_candidatos.cidade`, que é justamente a
     * coluna que o expurgo PRESERVA: o dado pessoal sobreviveria à anonimização sem nada falhar.
     * Este teste existe para que, no dia em que as duas colunas entrarem, alguém tenha de vir aqui
     * dizer de qual campo elas vieram.
     */
    const chaves = Object.keys(
      projetarInscricao(itemCru()) as unknown as Record<string, unknown>,
    );
    expect(chaves).not.toContain("cidade");
    expect(chaves).not.toContain("uf");
    expect(chaves).not.toContain("location2");
    expect(chaves).not.toContain("location3");
  });

  it("é FAIL-CLOSED: item sem pessoa, sem vaga ou sem data de inscrição não vira nada", () => {
    expect(projetarInscricao({ ...itemCru(), idCandidate: null })).toBeNull();
    expect(projetarInscricao({ ...itemCru(), idVacancy: null })).toBeNull();
    expect(projetarInscricao({ ...itemCru(), insertDate: null })).toBeNull();
    expect(projetarVaga({ reference: "1234567" })).toBeNull();
  });
});

// ── O ADAPTADOR HTTP: GET APENAS ───────────────────────────────────────────────────────────────

interface ApiFalsa {
  chamadasDePastas: number;
  listarVagasAtivas(): Promise<unknown[]>;
  listarPastasDaVaga(id: number): Promise<{ idVacancyFolder: number; name: string }[]>;
  listarInscricoesDaVaga(id: number, page: number, size: number): Promise<InscricaoProjetada[]>;
}

function apiFalsa(pastas: { idVacancyFolder: number; name: string }[] = []): ApiFalsa {
  return {
    chamadasDePastas: 0,
    async listarVagasAtivas() {
      return [{ idVacancy: 1, reference: "1", job: "j", city: "c", numberVacancies: 1 }];
    },
    async listarPastasDaVaga() {
      this.chamadasDePastas += 1;
      return pastas;
    },
    async listarInscricoesDaVaga() {
      return [];
    },
  };
}

describe("o adaptador HTTP da varredura", () => {
  it("RECUSA qualquer verbo que não seja GET", async () => {
    const http = new IngestaoHttp(apiFalsa() as never);
    await expect(http.requisitar("POST", CAMINHO_VAGAS, {})).rejects.toThrow(/GET apenas/);
    await expect(http.requisitar("PATCH", CAMINHO_INSCRICOES, {})).rejects.toThrow(/GET apenas/);
    await expect(http.requisitar("PUT", CAMINHO_VAGAS, {})).rejects.toThrow(/GET apenas/);
  });

  it("RECUSA o caminho que ESCREVE no funil do Pandapé, mesmo por GET", async () => {
    /*
     * O verbo certo num caminho que escreve continua sendo escrita: o que está proibido é o EFEITO
     * no funil de um ATS de terceiro. `POST /v1/Match/UpdateFolder` e `PATCH /v2/matches/{id}/update`
     * MOVEM CANDIDATO no sistema de quem opera a vaga, e nada do nosso lado falha quando acontece.
     */
    const http = new IngestaoHttp(apiFalsa() as never);
    await expect(http.requisitar("GET", "/v1/Match/UpdateFolder", {})).rejects.toThrow(
      /não chama este caminho/,
    );
    await expect(http.requisitar("GET", "/v2/matches/1/update", {})).rejects.toThrow(
      /não chama este caminho/,
    );
  });

  it("cacheia as pastas por vaga, e recarrega quando o ciclo pede", async () => {
    const api = apiFalsa([{ idVacancyFolder: 71, name: "Triados" }]);
    const http = new IngestaoHttp(api as never);
    await http.requisitar("GET", CAMINHO_PASTAS, { idVacancy: 9001 });
    await http.requisitar("GET", CAMINHO_PASTAS, { idVacancy: 9001 });
    expect(api.chamadasDePastas, "sem cache, a volta paga uma chamada por PÁGINA").toBe(1);
    await http.requisitar("GET", CAMINHO_PASTAS, { idVacancy: 9001, recarregar: true });
    expect(api.chamadasDePastas).toBe(2);
  });

  it("lista vazia NÃO substitui um cache bom, porque falha de rede devolve vazio", async () => {
    const api = apiFalsa([{ idVacancyFolder: 71, name: "Triados" }]);
    const http = new IngestaoHttp(api as never);
    const primeira = (await http.requisitar("GET", CAMINHO_PASTAS, { idVacancy: 9001 })) as {
      data: unknown[];
    };
    expect(primeira.data).toHaveLength(1);
    api.listarPastasDaVaga = async () => [];
    const segunda = (await http.requisitar("GET", CAMINHO_PASTAS, {
      idVacancy: 9001,
      recarregar: true,
    })) as { data: unknown[] };
    expect(segunda.data, "a tradução de etapa da vaga sumiria por 12 horas").toHaveLength(1);
  });
});

// ── A DATA DE CORTE: A VARREDURA NASCE INERTE ──────────────────────────────────────────────────

describe("a data de corte", () => {
  it("ausente, vazia ou ilegível mantém a varredura INERTE", () => {
    expect(lerDataDeCorte(undefined)).toBeNull();
    expect(lerDataDeCorte("   ")).toBeNull();
    expect(lerDataDeCorte("ontem")).toBeNull();
  });

  it("configurada, é uma data FIXA, e não `agora menos alguma coisa`", () => {
    const d = lerDataDeCorte("2026-09-18T00:00:00Z");
    expect(d?.toISOString()).toBe("2026-09-18T00:00:00.000Z");
  });
});

// ── O REPOSITÓRIO: A FORMA DO SQL ──────────────────────────────────────────────────────────────

function repositorioFalso(respostas: unknown[][] = []): {
  repo: IngestaoRepositorio;
  sqls: string[];
  papeis: string[];
} {
  const sqls: string[] = [];
  const papeis: string[] = [];
  const fila = [...respostas];
  const db = {
    execute: (q: unknown) => {
      sqls.push(sqlExecutavel(q));
      return Promise.resolve(fila.shift() ?? []);
    },
  };
  const vagaStatus = {
    async codigoDoPapel(papel: string) {
      papeis.push(papel);
      return papel === "FECHAMENTO" ? "FECHADA" : "RASCUNHO";
    },
    async regua() {
      return {
        /*
         * UM CÓDIGO POR PAPEL, e não um "tudo que não for rascunho é ABERTA": desde que a vaga
         * espelhada passou a nascer na FILA DE REVISÃO, este dublê precisa distinguir o papel
         * REVISAO do papel ABERTURA, senão a afirmação do destino ficaria verde com os dois.
         */
        codigoDoPapel: (papel: string) => {
          papeis.push(papel);
          if (papel === "RASCUNHO") return "RASCUNHO";
          if (papel === "REVISAO") return "PENDENTE_REVISAO";
          return "ABERTA";
        },
        /*
         * O PAPEL `REVISAO` PASSOU A SER PERGUNTADO TAMBEM NA VOLTA (OST de precedência, 30/09/2026):
         * é ele que autoriza o ATS a escrever os quatro campos da vaga. Sem esta segunda resposta, o
         * dublê diria "não está em revisão" para TODA vaga, e a volta nunca escreveria campo nenhum.
         */
        ehDoPapel: (codigo: string, papel: string) =>
          (codigo === "FECHADA" && papel === "FECHAMENTO") ||
          (codigo === "PENDENTE_REVISAO" && papel === "REVISAO"),
      };
    },
  };
  const etapas = { async etapaInicial() { return { codigo: "CAPTACAO" }; } };
  return {
    repo: new IngestaoRepositorio(db as never, vagaStatus as never, etapas as never),
    sqls,
    papeis,
  };
}

describe("o repositório da ingestão", () => {
  it("o INSERT do candidato carimba `origem` e NÃO cita as colunas proibidas", async () => {
    const { repo, sqls } = repositorioFalso([[{ id: "novo" }]]);
    await repo.escrever({
      tabela: "as_candidatos",
      acao: "insert",
      valores: { nome: "Fulano Sintetico", cpf: CPF_DE_TESTE, email: null, telefone: null },
    });
    const insert = sqls[0];
    expect(insert, "sem origem, 137 mil cadastros jurariam ter sido feitos à mão").toContain(
      "'PANDAPE'",
    );
    expect(insert).toContain("insert into as_candidatos (nome, cpf, email, telefone, data_nascimento, origem)");
    // A LISTA NOMINAL É O QUE MANTÉM ESTAS TRÊS FORA DE ALCANCE. `banco_talentos` concede retenção
    // perpétua; `criado_em` histórico faz a pessoa nascer com o prazo vencido; `atualizado_em`
    // empurra o relógio do expurgo 48 vezes por dia.
    expect(insert).not.toContain("banco_talentos");
    expect(insert).not.toContain("criado_em");
    expect(insert).not.toContain("atualizado_em");
    expect(insert).not.toContain("criado_por_id");
  });

  it("o UPDATE do candidato é CONDICIONAL e guarda a ficha anonimizada", async () => {
    const { repo, sqls } = repositorioFalso([[{ id: "x" }]]);
    await repo.escrever({
      tabela: "as_candidatos",
      acao: "update",
      onde: { id: "x" },
      comparaAntes: ["nome"],
      valores: { nome: "Fulano Sintetico", cpf: CPF_DE_TESTE },
    });
    const update = sqls[0];
    expect(update).toContain("anonimizado_em is null");
    expect(update).toContain("is distinct from");
    expect(update, "citar a coluna é escolher empurrar o relógio do expurgo").not.toContain(
      "atualizado_em =",
    );
  });

  it("zero linha com a ficha ANONIMIZADA é RECUSA, e não `nada mudou`", async () => {
    // Sem esta distinção, o desempate por CPF re-identificaria de 30 em 30 minutos quem o expurgo
    // acabou de anonimizar, e a varredura de retenção nunca mais volta a uma linha carimbada.
    const { repo } = repositorioFalso([[], [{ marca: 1 }]]);
    await expect(
      repo.escrever({
        tabela: "as_candidatos",
        acao: "update",
        onde: { id: "x" },
        valores: { nome: "Fulano Sintetico" },
      }),
    ).rejects.toThrow(/anonimizado/i);
  });

  it("zero linha SEM anonimização é a reentrega idêntica, e não escreve nada", async () => {
    const { repo } = repositorioFalso([[], []]);
    const r = await repo.escrever({
      tabela: "as_candidatos",
      acao: "update",
      onde: { id: "x" },
      valores: { nome: "Fulano Sintetico" },
    });
    expect(r.linhasAfetadas).toBe(0);
  });

  it("a identidade externa grava `coletado_em` EXPLÍCITO", async () => {
    const { repo, sqls } = repositorioFalso([[{ id: "i" }]]);
    await repo.escrever({
      tabela: "as_identidades_externas",
      acao: "upsert",
      chaveDeConflito: ["fonte", "identificador"],
      valores: {
        fonte: "PANDAPE",
        identificador: "777",
        candidato_id: "c",
        coletado_em: "2026-09-18T12:00:00.000Z",
      },
    });
    expect(sqls[0]).toContain("coletado_em");
    expect(sqls[0]).toContain("on conflict (fonte, identificador) do nothing");
  });

  it("a ingestão não escreve em tabela fora da lista", async () => {
    const { repo } = repositorioFalso();
    await expect(
      repo.escrever({ tabela: "usuarios", acao: "insert", valores: {} }),
    ).rejects.toThrow(/não escreve na tabela/);
  });

  it("o conflito de identidade grava DOIS IDS, e nunca o CPF nem o nome", async () => {
    const { repo, sqls } = repositorioFalso([[{ id: "k" }]]);
    await repo.escrever({
      tabela: "as_ingestao_conflitos",
      acao: "upsert",
      chaveDeConflito: ["fonte", "identificador"],
      valores: { candidato_id: "c", fonte: "PANDAPE", identificador: "777" },
    });
    expect(sqls[0]).toContain(
      "insert into as_ingestao_conflitos (candidato_id, fonte, identificador)",
    );
    expect(sqls[0]).not.toContain("cpf");
    expect(sqls[0]).not.toContain("nome");
    // Sem a chave, um caso irresolvido viraria 48 linhas por dia, para sempre.
    expect(sqls[0]).toContain("on conflict (fonte, identificador) do nothing");
  });

  /*
   * O NASCIMENTO MUDOU DE PAPEL POR DECISÃO DO DIRETOR, e o teste acompanha o requisito novo: a
   * vaga que o espelho traz SEM CLIENTE nasce na FILA DE REVISÃO (papel REVISAO, migration 0115), e
   * não mais no RASCUNHO. No rascunho ela ficava indistinguível da vaga que um consultor começou a
   * digitar, e as centenas de vagas espelhadas ficavam paradas sem nenhuma tela acusar.
   */
  it("a vaga espelhada NASCE na FILA DE REVISÃO, sem cliente e sem cargo que case", async () => {
    // As respostas, em ordem: a busca da vaga (nada), o CARGO do catálogo (não casou), o insert da
    // vaga e a matrícula. O cargo entrou na sequência quando o nascimento passou a resolvê-lo.
    const { repo, sqls, papeis } = repositorioFalso([[], [], [{ id: "v" }], []]);
    await repo.escrever({
      tabela: "vagas",
      acao: "upsert",
      chaveDeConflito: ["id_vacancy_pandape"],
      valores: {
        id_vacancy_pandape: 9001,
        codigo: "1234567",
        nome_divulgacao: "Cargo",
        cidade_id: null,
        posicoes_oficiais: 3,
        cod_cliente: null,
        cargo_id: null,
        status: "PENDENTE_REVISAO",
      },
    });
    const insert = sqls.find((s) => s.includes("insert into vagas")) ?? "";
    expect(insert).toContain("cod_cliente");
    /*
     * `cod_cliente` CONTINUA SENDO O LITERAL `null` DO SQL, e não um parâmetro: §A.5 é explícita,
     * adiar em vez de inventar, e não existe caminho de API para o cliente da vaga.
     *
     * `cargo_id` PASSOU A SER PARÂMETRO (`::uuid`), porque agora ele é RESOLVIDO, e não mais um
     * null escrito à mão que ignorava o valor. Aqui o catálogo não casou, então o parâmetro vale
     * nulo, que é o fail-closed: vaga sem cargo entra marcada para preenchimento manual.
     */
    expect(insert).toContain("null, ::uuid");
    // E o CARGO foi PERGUNTADO ao catálogo, filtrando `ativo`: inativar um cargo é o gesto que a
    // administração tem para dizer "pare de usar este", e ignorá-lo transformaria o gesto em nada.
    const cargo = sqls.find((x) => x.includes("from cargos")) ?? "";
    expect(cargo).toContain("ativo = true");
    // Sem acento e sem caixa, porque o título vem digitado por quem abriu a vaga no ATS.
    expect(cargo).toContain("translate(lower(nome)");
    /*
     * O STATUS ENTRA PELO PAPEL, e não pelo literal: o código é editável pelo diretor, e um
     * `'PENDENTE_REVISAO'` gravado direto pararia de valer no dia da renomeação, com o FK RESTRICT
     * derrubando a ingestão inteira. O valor viaja como PARÂMETRO, então o que se afirma aqui é a
     * pergunta que o repositório fez ao catálogo.
     */
    expect(papeis).toContain("REVISAO");
    // E o RASCUNHO deixou de ser perguntado: a fila de revisão é outro papel, e a vaga do espelho
    // não passa mais pelo status em que a trilha humana rascunha.
    expect(papeis).not.toContain("RASCUNHO");
    // A linha da varredura nasce junto: é ela que diz QUAIS vagas são da varredura, e sem isso o
    // encerramento automático alcançaria a vaga que um consultor cadastrou à mão.
    const matricula = sqls.find((s) => s.includes("insert into as_varredura_vagas")) ?? "";
    expect(matricula).not.toBe("");
    // A MATRÍCULA É POR LINHA (`vaga_id`), e não pelo número do ATS: aquela coluna de `vagas` é
    // digitada por gente, com índice NÃO unique, e casar por ela adota vaga de outro dono.
    expect(matricula).toContain("vaga_id");
  });


  /*
   * ─ O CARGO DA VAGA ESPELHADA, e por que ele é do NASCIMENTO e só dele ────────────────────────
   *
   * O título da vaga (`job` do ATS, gravado em `nome_divulgacao`) é o único texto que chega, e o
   * catálogo `cargos` é quem o traduz. O ganho é de PREENCHIMENTO: a vaga continua nascendo na fila
   * de revisão, e ninguém sai da fila por ter cargo.
   */
  it("o cargo que CASA no catálogo entra no nascimento da vaga", async () => {
    const CARGO = "00000000-0000-4000-8000-00000000c0c0";
    const { repo, sqls } = repositorioFalso([[], [{ id: CARGO }], [{ id: "v" }], []]);
    await repo.escrever({
      tabela: "vagas",
      acao: "upsert",
      chaveDeConflito: ["id_vacancy_pandape"],
      valores: {
        id_vacancy_pandape: 9001,
        codigo: "1234567",
        nome_divulgacao: "Auxiliar De Limpeza",
        cidade_id: null,
        posicoes_oficiais: 3,
        cod_cliente: null,
        cargo_id: null,
        status: "PENDENTE_REVISAO",
      },
    });
    // O valor do parâmetro não aparece no texto da instrução (é isso que faz dele parâmetro), então
    // o que se afirma é que a coluna deixou de ser o literal `null` e virou o valor resolvido.
    const insert = sqls.find((s) => s.includes("insert into vagas")) ?? "";
    expect(insert).toContain("cargo_id");
    expect(insert).not.toContain("null, null");
    // O TÍTULO NÃO VIAJA NO TEXTO DA CONSULTA: ele é texto livre do ATS, e a casa já mediu que campo
    // assim chega com nome de gente dentro. Ele entra como parâmetro, e nunca interpolado.
    expect(sqls.join(" ")).not.toContain("Auxiliar De Limpeza");
  });

  it("a VOLTA da vaga já existente NÃO escreve o cargo, e não o compara", async () => {
    // Da varredura, viva, com título novo chegando do ATS: o update mexe no que o ATS manda e NÃO
    // toca `cargo_id`. Escrever ali sobrescreveria, de 30 em 30 minutos, o cargo que uma PESSOA
    // escolheu na liberação, sem autor, sem data e sem trilha.
    /*
     * A VAGA ESTA EM REVISAO NESTE CASO, e o status mudou de `ABERTA` para `PENDENTE_REVISAO` na OST
     * de precedência (30/09/2026). Desde ela, a vaga JA LIBERADA não recebe mais os quatro campos do
     * ATS: naquele estado não haveria `update vagas` nenhum a inspecionar, e o que este teste afirma
     * (`cargo_id` fora do `set` e o catálogo `cargos` fora da volta) só é observável onde a escrita
     * acontece. A trava da vaga liberada é medida em `ingestao-precedencia.backend.spec.ts`.
     */
    const { repo, sqls } = repositorioFalso([
      [{ id: "v1", status: "PENDENTE_REVISAO", da_varredura: true, encerrou: false }],
      [{ id: "v1" }],
    ]);
    await repo.escrever({
      tabela: "vagas",
      acao: "upsert",
      chaveDeConflito: ["id_vacancy_pandape"],
      comparaAntes: ["codigo", "nome_divulgacao", "cidade_id", "posicoes_oficiais"],
      valores: {
        id_vacancy_pandape: 9001,
        codigo: "1234567",
        nome_divulgacao: "Titulo Novo Do Ats",
        cargo_id: null,
      },
    });
    const update = sqls.find((s) => s.includes("update vagas")) ?? "";
    expect(update).not.toBe("");
    expect(update, "o cargo escolhido por gente não é sobrescrito pelo ATS").not.toContain(
      "cargo_id",
    );
    // E o catálogo NEM É CONSULTADO na volta: a resolução é do nascimento, e uma consulta por vaga
    // por volta seria 621 consultas a cada 30 minutos para escrever nada.
    expect(sqls.some((x) => x.includes("from cargos"))).toBe(false);
  });


  /*
   * ─ O NASCIMENTO DA CANDIDATURA É DECLARADO, E HOJE É SÓ ISSO QUE ELE É ───────────────────────
   *
   * `criada` é o ÚNICO ponto do sistema que afirma "esta linha nasceu agora", e `linhasAfetadas`
   * NÃO serve de substituto: ele vale 1 no insert e também valia 1 no `update` que mudou algo, que
   * são coisas opostas para quem lê.
   *
   * ┌─ ELE NÃO TEM LEITOR DE PRODUÇÃO DESDE 02/10/2026, E NENHUM CAMINHO CRIA ADMISSÃO DAQUI ────┐
   * │ O TEXTO QUE ESTAVA AQUI DIZIA O CONTRÁRIO, e foi reescrito em vez de apagado porque era     │
   * │ justamente o tipo de frase que entrega à próxima sessão uma justificativa escrita para       │
   * │ religar o fio: ele afirmava que a ponte para a admissão disparava com este campo e que       │
   * │ apagá-lo "desligaria a admissão automática inteira em produção". NÃO EXISTE ADMISSÃO          │
   * │ AUTOMÁTICA PELA VARREDURA. "O único gatilho que envia para admissão é o gatilho da esteira,  │
   * │ e não o das ATS": a ponte foi REMOVIDA, e com ela todo leitor deste campo.                   │
   * │                                                                                             │
   * │ O MOTIVO MEDIDO, para a frase antiga não voltar por outra porta: "Contratados" no funil do    │
   * │ Pandapé não é "enviado para admissão". A varredura lia a ETAPA, o webhook dispara na AÇÃO de │
   * │ enviar, e lendo a etapa a varredura criou 259 pré-admissões em produção, 254 delas de gente  │
   * │ que já estava na esteira, sem o `cod_cliente` que o webhook preenche.                        │
   * │                                                                                             │
   * │ ELE FICA, e a decisão é do coordenador com a auditoria: é a resposta HONESTA do repositório   │
   * │ sobre a própria escrita, e tirá-lo mexeria no contrato de `PortaBanco` por conta de uma       │
   * │ frente que não é a dele. Esta medição guarda o sinal, e nada mais: quem a ler não deve        │
   * │ concluir que existe algum caminho criando admissão a partir dela, porque não existe.          │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("a candidatura que NASCE devolve `criada`, e a que já existia devolve o contrário", async () => {
    /*
     * TRES RESPOSTAS, E A DO MEIO NASCEU NA OST DE PRECEDENCIA (30/09/2026): antes de INSERIR, o
     * repositório pergunta à TRILHA se aquela pessoa foi TRANSFERIDA para fora desta vaga por gente
     * (`vaga_de` em `as_candidatura_etapas`). Vazio é "não foi", e a candidatura nasce normalmente.
     * Este dublê responde por POSIÇÃO, então a leitura nova exige a linha vazia no meio.
     */
    const nascimento = repositorioFalso([[], [], [{ id: "cand-1" }]]);
    const criada = await nascimento.repo.escrever({
      tabela: "as_candidaturas",
      acao: "upsert",
      chaveDeConflito: ["candidato_id", "vaga_id"],
      valores: {
        candidato_id: "00000000-0000-4000-8000-0000000000c1",
        vaga_id: "00000000-0000-4000-8000-0000000000a1",
        etapa: "APROVACAO",
        situacao: "ENVIADO_PARA_ADMISSAO",
      },
    });
    expect(criada.criada).toBe(true);
    expect(criada.id).toBe("cand-1");

    /*
     * A VOLTA TRAZ OS VALORES ATUAIS DA LINHA, e não só o id: desde a OST de precedência o
     * repositório COMPARA os dois lados em vez de sobrescrever. Os valores aqui são IGUAIS aos que o
     * ATS manda, de propósito, para isolar o que este teste mede (`criada`) da fila de divergências.
     */
    const volta = repositorioFalso([
      [
        {
          id: "cand-1",
          etapa: "APROVACAO",
          situacao: "ENVIADO_PARA_ADMISSAO",
          motivo_descarte: null,
        },
      ],
    ]);
    const movida = await volta.repo.escrever({
      tabela: "as_candidaturas",
      acao: "upsert",
      chaveDeConflito: ["candidato_id", "vaga_id"],
      comparaAntes: ["etapa", "situacao"],
      valores: {
        candidato_id: "00000000-0000-4000-8000-0000000000c1",
        vaga_id: "00000000-0000-4000-8000-0000000000a1",
        etapa: "APROVACAO",
        situacao: "ENVIADO_PARA_ADMISSAO",
      },
    });
    /*
     * A LINHA NAO FOI ESCRITA, e esta frase é o OPOSTO da que estava aqui até 30/09/2026 ("a varredura
     * sobrescreve etapa e situação de quem já existe, e isso não mudou nesta frente"). Ela mudou: a
     * OST de precedência REMOVEU o `update as_candidaturas` inteiro, porque o `is distinct from` dele
     * não era proteção, era o gatilho, e a pessoa que o time avançava voltava em até 30 minutos.
     *
     * O QUE ESTE TESTE MEDE CONTINUA INTEIRO: candidatura que já existia NÃO é nascimento. Desde
     * 02/10/2026 o ATS não promove à admissão NINGUÉM, nem quem nasce nesta volta: a varredura
     * atualiza o funil e nada mais. E a linha também não é mais ESCRITA, pela trava de precedência.
     */
    expect(movida.linhasAfetadas).toBe(0);
    expect(movida.criada).toBe(false);
  });

  /*
   * ─ A FRONTEIRA DE PROPRIEDADE DA VAGA, QUE É O ACHADO A DO PARECER DE SEGURANÇA ──────────────
   *
   * `vagas.id_vacancy_pandape` é DIGITADO por gente (`as/vagas/vagas.service.ts`), com índice não
   * unique. O encerramento já tinha a fronteira; a busca, a reabertura e a matrícula não tinham, e
   * era a reabertura que APAGAVA o carimbo do qual o expurgo depende.
   */
  it("a vaga com o número do ATS digitado por gente é CONFLITO, e nunca adoção", async () => {
    const { repo, sqls } = repositorioFalso([
      [{ id: "v-de-gente", status: "FECHADA", da_varredura: false, encerrou: false }],
    ]);
    await expect(
      repo.escrever({
        tabela: "vagas",
        acao: "upsert",
        chaveDeConflito: ["id_vacancy_pandape"],
        valores: { id_vacancy_pandape: 9001, codigo: "do-ats", nome_divulgacao: "do-ats" },
      }),
    ).rejects.toThrow(/revis/i);
    // NADA foi escrito: nem update na vaga de gente, nem uma segunda linha com o mesmo número.
    expect(sqls.some((s) => s.includes("update vagas"))).toBe(false);
    expect(sqls.some((s) => s.includes("insert into vagas"))).toBe(false);
    // A busca já casa pela MATRÍCULA, e é ela que responde de quem é a linha.
    expect(sqls[0]).toContain("as_varredura_vagas");
    expect(sqls[0]).toContain("m.vaga_id = v.id");
  });

  it("NÃO reabre a vaga FECHADA por humano, mesmo sendo da varredura", async () => {
    // Da varredura, no papel FECHAMENTO, mas o carimbo em pé não é o que a varredura gravou.
    const { repo, sqls } = repositorioFalso([
      [{ id: "v1", status: "FECHADA", da_varredura: true, encerrou: false }],
      [],
    ]);
    await repo.escrever({
      tabela: "vagas",
      acao: "upsert",
      chaveDeConflito: ["id_vacancy_pandape"],
      valores: { id_vacancy_pandape: 9001, codigo: "do-ats", nome_divulgacao: "do-ats" },
    });
    const update = sqls.find((s) => s.includes("update vagas")) ?? "";
    /*
     * Com `encerrada_em = null`, a cláusula `... or v.encerrada_em is null` do expurgo protegeria
     * TODO MUNDO dentro daquela vaga, para sempre, e a varredura repetiria o gesto a cada volta.
     */
    expect(update, "reabrir o que um humano fechou apaga o carimbo do expurgo").not.toContain(
      "encerrada_em = null",
    );
  });

  it("REABRE a vaga que a PRÓPRIA varredura encerrou, e aí sim limpa o carimbo", async () => {
    const { repo, sqls } = repositorioFalso([
      [{ id: "v1", status: "FECHADA", da_varredura: true, encerrou: true }],
      [{ id: "v1" }],
    ]);
    await repo.escrever({
      tabela: "vagas",
      acao: "upsert",
      chaveDeConflito: ["id_vacancy_pandape"],
      valores: { id_vacancy_pandape: 9001, codigo: "do-ats", nome_divulgacao: "do-ats" },
    });
    const update = sqls.find((s) => s.includes("update vagas")) ?? "";
    // Vaga viva com `encerrada_em` carimbado deixaria o relógio de retenção correndo sobre quem
    // está dentro dela, que é o oposto do furo e é irreversível.
    expect(update).toContain("encerrada_em = null");
  });

  it("a busca da vaga do JOB DE PÁGINA também passa pela matrícula", async () => {
    // É esta leitura que decide EM QUAL vaga as candidaturas da página serão penduradas. Pelo
    // número do ATS (digitado por gente, sem índice unique), um `limit 1` podia devolver a vaga de
    // outro dono, e a varredura escreveria gente dentro dela.
    const { repo, sqls } = repositorioFalso([[]]);
    expect(await repo.vagaPorIdPandape(9001)).toBeNull();
    expect(sqls[0]).toContain("as_varredura_vagas");
    expect(sqls[0]).toContain("v.id = m.vaga_id");
  });

  it("a marca de água é UPDATE, e não matricula vaga nenhuma", async () => {
    const { repo, sqls } = repositorioFalso([[{ id_vacancy_pandape: "9001" }]]);
    await repo.escrever({
      tabela: "as_varredura_vagas",
      acao: "upsert",
      chaveDeConflito: ["id_vacancy_pandape"],
      comparaAntes: ["ultimo_insert_date"],
      valores: { id_vacancy_pandape: 9001, ultimo_insert_date: "2026-09-10T10:00:00Z" },
    });
    // Matricular toda vaga VARRIDA fazia o `exists` do encerramento não separar nada: a vaga
    // digitada por gente entrava na matrícula na primeira passada.
    expect(sqls[0]).not.toContain("insert into as_varredura_vagas");
    expect(sqls[0]).toContain("update as_varredura_vagas");
    // Reescrever a mesma marca de 30 em 30 minutos é escrita inútil, para sempre.
    expect(sqls[0]).toContain("is distinct from");
  });
});

/*
 * ─ A DATA DE NASCIMENTO MALFORMADA, QUE É O ACHADO C DO PARECER DE SEGURANÇA ───────────────────
 *
 * O funil `mensagemDoErro` deixa a MENSAGEM do Postgres passar de propósito, e há uma classe em que
 * ela carrega o VALOR: `date/time field value out of range: "1990-13-45"`. A data de nascimento
 * acabaria no log do ciclo e no `failedReason` do Redis, que é depósito sem TTL e fora do expurgo.
 */
/**
 * OS PARÂMETROS, E NÃO O TEXTO. `sqlExecutavel` derruba os valores de propósito (é o que o driver
 * faz), e uma afirmação sobre o texto ficaria verde com o valor inválido passando inteiro. O que se
 * mede aqui é o que VIAJA para o banco.
 */
function parametrosDaConsulta(q: unknown): unknown[] {
  const no = q as { queryChunks?: unknown[]; value?: unknown };
  if (Array.isArray(no?.queryChunks)) return no.queryChunks.flatMap(parametrosDaConsulta);
  // `{ value: [...] }` é o pedaço de TEXTO do SQL; o resto é valor interpolado.
  if (Array.isArray(no?.value)) return [];
  return [q];
}

describe("a data de nascimento que chega malformada do ATS", () => {
  async function nascimentoGravado(valor: unknown): Promise<unknown[]> {
    const consultas: unknown[] = [];
    const db = {
      execute: (q: unknown) => {
        consultas.push(q);
        return Promise.resolve([{ id: "novo" }]);
      },
    };
    const repo = new IngestaoRepositorio(db as never, null as never, null as never);
    await repo.escrever({
      tabela: "as_candidatos",
      acao: "insert",
      valores: { nome: "Fulano Sintetico", data_nascimento: valor },
    });
    return parametrosDaConsulta(consultas[0]);
  }

  it("mês 13 e dia 45 NÃO chegam ao banco: inválida é tratada como ausente", async () => {
    const parametros = await nascimentoGravado("1990-13-45T00:00:00");
    // `date/time field value out of range: "1990-13-45"` põe o VALOR na MENSAGEM do erro, e o funil
    // `mensagemDoErro` deixa a mensagem passar: dali ela vai para o log e para o `failedReason` do
    // Redis, que é depósito sem TTL e fora do alcance do expurgo.
    expect(parametros).not.toContain("1990-13-45");
    expect(parametros, "inválida é AUSENTE, e a inscrição não se perde por isso").toContain(null);
  });

  it("29 de fevereiro em ano NÃO bissexto também não passa", async () => {
    const parametros = await nascimentoGravado("2023-02-29");
    expect(parametros).not.toContain("2023-02-29");
    expect(parametros).toContain(null);
  });

  it("a data VÁLIDA continua entrando, com o datetime do ATS cortado", async () => {
    // O ATS entrega datetime completo, e a coluna é `date`. 2024 é bissexto, 29/02 existe.
    expect(await nascimentoGravado("2024-02-29T00:00:00")).toContain("2024-02-29");
  });

  it("o último dia do mês curto passa, e o dia seguinte não", async () => {
    expect(await nascimentoGravado("1990-04-30")).toContain("1990-04-30");
    expect(await nascimentoGravado("1990-04-31")).not.toContain("1990-04-31");
  });
});
