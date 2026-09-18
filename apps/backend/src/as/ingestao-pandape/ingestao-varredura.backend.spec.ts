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
        codigoDoPapel: (papel: string) => {
          papeis.push(papel);
          return papel === "RASCUNHO" ? "RASCUNHO" : "ABERTA";
        },
        ehDoPapel: (codigo: string, papel: string) =>
          codigo === "FECHADA" && papel === "FECHAMENTO",
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

  it("a vaga espelhada NASCE no papel RASCUNHO, sem cliente e sem cargo", async () => {
    const { repo, sqls, papeis } = repositorioFalso([[], [{ id: "v" }], []]);
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
        status: "RASCUNHO",
      },
    });
    const insert = sqls.find((s) => s.includes("insert into vagas")) ?? "";
    expect(insert).toContain("cod_cliente");
    expect(insert).toContain("null, null");
    /*
     * O STATUS ENTRA PELO PAPEL, e não pelo literal: o código é editável pelo diretor, e um
     * `'RASCUNHO'` gravado direto pararia de valer no dia da renomeação, com o FK RESTRICT
     * derrubando a ingestão inteira. O valor viaja como PARÂMETRO, então o que se afirma aqui é a
     * pergunta que o repositório fez ao catálogo.
     */
    expect(papeis).toContain("RASCUNHO");
    // A linha da varredura nasce junto: é ela que diz QUAIS vagas são da varredura, e sem isso o
    // encerramento automático alcançaria a vaga que um consultor cadastrou à mão.
    const matricula = sqls.find((s) => s.includes("insert into as_varredura_vagas")) ?? "";
    expect(matricula).not.toBe("");
    // A MATRÍCULA É POR LINHA (`vaga_id`), e não pelo número do ATS: aquela coluna de `vagas` é
    // digitada por gente, com índice NÃO unique, e casar por ela adota vaga de outro dono.
    expect(matricula).toContain("vaga_id");
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
