import { describe, expect, it } from "vitest";
import {
  conferirDatabase,
  DATABASE_DE_PRODUCAO,
  FASES,
  FASES_DO_GUIA,
  loteDaSimulacao,
} from "./arnes-lote-fabricado";

/**
 * ─ O CONTRATO DO LOTE DE SIMULAÇÃO: as travas que a auditoria cobrou, medidas ───────────────────
 *
 * ┌─ POR QUE ESTE ARQUIVO EXISTE, se o arnês é uma ferramenta e não código de produção ────────────┐
 * │ Porque as três coisas que ele promete são de SEGURANÇA, e promessa de segurança escrita em      │
 * │ comentário é promessa que a próxima edição desfaz em silêncio: a recusa de produção, o CPF que  │
 * │ NÃO escala com o lote, e o determinismo de que depende a idempotência. Nenhuma delas precisa de │
 * │ Postgres para ser medida, então nenhuma delas tem desculpa para não estar aqui.                 │
 * │                                                                                                 │
 * │ ELE É UM TESTE DE VERDADE (o nome casa com o padrão do vitest), ao contrário do arnês, que fica │
 * │ FORA da suíte de propósito. Importar o arnês não roda nada: `main()` só dispara quando ele é o  │
 * │ programa executado.                                                                             │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("o lote de simulação do arnês", () => {
  describe("a guarda de produção continua valendo para a fase nova", () => {
    /**
     * A GUARDA É ANTERIOR À ESCOLHA DA FASE, e é isso que se mede: ela não é uma lista de fases
     * permitidas, que a fase seguinte esqueceria de entrar. É o database que decide, e a fase nova
     * não tem como afrouxá-lo, porque não passa por ele.
     */
    it("recusa o database de produção", () => {
      expect(() =>
        conferirDatabase(`postgres://ea:segredo@127.0.0.1:5432/${DATABASE_DE_PRODUCAO}`),
      ).toThrow(/PRODUÇÃO/);
    });

    it("recusa o nome desconhecido, em vez de aceitar por omissão", () => {
      expect(() => conferirDatabase("postgres://ea:segredo@127.0.0.1:5432/qualquer_coisa")).toThrow(
        /allowlist/,
      );
    });

    it("recusa a URL ausente", () => {
      expect(() => conferirDatabase(undefined)).toThrow(/DATABASE_URL/);
    });

    it("aceita a homologação, que é onde o lote deve nascer", () => {
      expect(conferirDatabase("postgres://ea:segredo@127.0.0.1:5433/ea_automatic_homolog")).toBe(
        "ea_automatic_homolog",
      );
    });

    /** A senha vai na URL, e a mensagem de recusa é lida por gente. Só o NOME pode sair. */
    it("não publica a URL na mensagem de recusa", () => {
      try {
        conferirDatabase("postgres://ea:SENHA_SECRETA@127.0.0.1:5432/ea_automatic");
        throw new Error("deveria ter recusado");
      } catch (err) {
        expect((err as Error).message).not.toContain("SENHA_SECRETA");
      }
    });
  });

  describe("a fase de simulação fica fora do `todas`", () => {
    /**
     * A SIMULAÇÃO TROCA A LISTA DE VAGAS ATIVAS INTEIRA, e o ciclo encerra a vaga espelhada que
     * saiu da lista. Dentro do `todas`, ela desfaria o estado que a fase `5-volta` acabou de
     * montar, e quem lesse o resultado veria a fase 5 falhando sem ter falhado.
     */
    it("a fase existe, e não está entre as fases do guia", () => {
      expect(FASES).toContain("simulacao");
      expect(FASES_DO_GUIA as readonly string[]).not.toContain("simulacao");
    });
  });

  describe("o CPF não escala com o lote", () => {
    /**
     * ─ O ITEM DE VETO, MEDIDO ────────────────────────────────────────────────────────────────
     *
     * Não existe faixa de CPF reservada para teste: `999...` com dígito válido é estruturalmente
     * emissível. Como `uq_as_candidatos_cpf` é único e a ingestão desempata POR CPF, um CPF do
     * lote que coincida com o de uma pessoa real FUNDE as duas fichas, e fusão não se desfaz.
     *
     * A régua é um bloco pequeno, fixo e documentado. O teto abaixo é o que impede o lote de
     * crescer e levar o bloco de CPF junto sem ninguém reparar: acrescentar uma vaga à vitrine é
     * livre, acrescentar CPF não é.
     */
    const TETO_DE_CPFS = 12;

    it("a esmagadora maioria do lote entra sem CPF", () => {
      const inscricoes = todasAsInscricoes();
      const comCpf = inscricoes.filter((i) => i.cpf !== null);
      expect(comCpf.length).toBeLessThanOrEqual(TETO_DE_CPFS);
      expect(inscricoes.length).toBeGreaterThan(comCpf.length * 3);
    });

    it("quem não tem CPF tem NULO, e não um CPF de dígito quebrado", () => {
      // `cpfParaBanco` trata CPF inválido como AUSENTE em silêncio: um dígito quebrado
      // exercitaria o caminho do nulo enquanto alguém acredita estar exercitando o do CPF.
      for (const i of todasAsInscricoes()) {
        if (i.cpf === null) continue;
        expect(i.cpf).toMatch(/^999\d{8}$/);
      }
    });

    it("o bloco de CPF está todo numa vaga só, e é a primeira", () => {
      const lote = loteDaSimulacao();
      const vagas = Object.keys(lote.inscricoes)
        .map(Number)
        .filter((v) => (lote.inscricoes[v] ?? []).some((i) => i.cpf !== null));
      expect(vagas).toHaveLength(1);
    });
  });

  describe("o predicado único alcança TODA linha do lote", () => {
    /**
     * `select count(*) from as_identidades_externas where identificador like 'ARNES-%'` é a prova,
     * em uma linha de SQL, de que o lote não está numa base. Ela só vale se NENHUMA pessoa escapar
     * do prefixo, inclusive as que entram sem CPF, que são a maioria.
     */
    it("todo candidato do lote carrega o prefixo `ARNES-`", () => {
      const inscricoes = todasAsInscricoes();
      expect(inscricoes.length).toBeGreaterThan(0);
      for (const i of inscricoes) expect(String(i.idCandidate)).toMatch(/^ARNES-\d{6}$/);
    });

    it("toda vaga do lote carrega o prefixo `SIM-VAGA-`", () => {
      for (const v of loteDaSimulacao().vagasAtivas) {
        expect(String(v.reference)).toMatch(/^SIM-VAGA-\d{2}$/);
      }
    });
  });

  describe("a tela diz que aquilo é simulação", () => {
    /**
     * MEDIDO: na lista, nada mais denuncia o dado fabricado. `origem` é `PANDAPE` fixo, o CPF não
     * sai na lista e a homologação não tem tarja de ambiente. Sobra o nome, e ele tem de abrir com
     * a marca, porque o começo é o que a coluna estreita preserva quando corta.
     */
    it("o nome de toda pessoa ABRE com a marca, em caixa alta", () => {
      for (const i of todasAsInscricoes()) expect(i.name).toBe("SIMULADO");
    });

    it("o nome de divulgação de toda vaga ABRE com a mesma marca", () => {
      for (const v of loteDaSimulacao().vagasAtivas) {
        expect(String(v.job).startsWith("SIMULADO ")).toBe(true);
      }
    });

    /** O e-mail é `.invalid` (RFC 2606) e o telefone é de zeros: nenhum dos dois é de alguém. */
    it("o contato não é contato de ninguém", () => {
      for (const i of todasAsInscricoes()) {
        expect(String(i.email)).toMatch(/\.invalid$/);
        expect(i.phone).toBe("00000000000");
      }
    });
  });

  describe("o lote é determinístico, e é disso que vem a idempotência", () => {
    /**
     * "RODEI DUAS VEZES E NÃO DUPLICOU" só prova alguma coisa se as duas rodadas pedirem a MESMA
     * coisa. Qualquer sorteio aqui (id, sequência, ordem) faria a segunda rodada criar gente nova
     * e o resultado pareceria idempotente porque ninguém contou.
     */
    it("duas montagens do lote são idênticas", () => {
      expect(JSON.stringify(loteDaSimulacao())).toBe(JSON.stringify(loteDaSimulacao()));
    });

    it("não há sequência repetida entre as pessoas", () => {
      const ids = todasAsInscricoes().map((i) => i.idCandidate);
      expect(new Set(ids).size).toBe(ids.length);
    });

    /** A vitrine começa em 2001 para não encostar nas quatro pessoas das fases do guia (1 a 4). */
    it("a vitrine não reescreve as pessoas das fases do guia", () => {
      for (const i of todasAsInscricoes()) {
        expect(Number(String(i.idCandidate).replace("ARNES-", ""))).toBeGreaterThan(4);
      }
    });
  });

  describe("a vitrine tem o que o diretor precisa olhar", () => {
    it("são doze vagas, com metas diferentes", () => {
      const vagas = loteDaSimulacao().vagasAtivas;
      expect(vagas).toHaveLength(12);
      expect(new Set(vagas.map((v) => v.numberVacancies)).size).toBeGreaterThan(4);
    });

    it("as cinco etapas mapeadas recebem gente, em quantidades diferentes", () => {
      const lote = loteDaSimulacao();
      const porPasta = new Map<number, number>();
      for (const i of todasAsInscricoes()) {
        const pasta = Number(i.idVacancyFolder);
        porPasta.set(pasta, (porPasta.get(pasta) ?? 0) + 1);
      }
      expect(porPasta.size).toBe(5);
      expect(new Set(porPasta.values()).size).toBeGreaterThan(3);
      // As pastas do lote são as cinco que ele declara, e nenhuma outra: pasta fora do de/para
      // seria gente recusada em silêncio, e a fase de vitrine não serve para medir isso.
      const declaradas = (lote.pastas ?? []).map((p) => p.idVacancyFolder);
      for (const pasta of porPasta.keys()) expect(declaradas).toContain(pasta);
    });
  });
});

/** Todas as inscrições do lote, achatadas, na ordem em que a porta fabricada as entrega. */
function todasAsInscricoes(): {
  idCandidate: unknown;
  name: unknown;
  cpf: string | null;
  email: unknown;
  phone: unknown;
  idVacancyFolder: unknown;
}[] {
  const lote = loteDaSimulacao();
  return Object.values(lote.inscricoes).flat() as ReturnType<typeof todasAsInscricoes>;
}
