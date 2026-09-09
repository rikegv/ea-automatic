import "reflect-metadata";
import { BadRequestException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it } from "vitest";
import { VAGA_STATUS } from "@ea/shared-types";
import type { Database } from "../../db/client";
import { VAGA_STATUS_DA_TRILHA } from "../../domain/vaga";
import { CreateVagaDto } from "./vagas.dto";
import { VagasService } from "./vagas.service";

/**
 * ─ A TRILHA DE ABERTURA NÃO ENCERRA VAGA (achado BLOQUEANTE da auditoria, 08/09) ────────────────
 *
 * O QUE ESTAVA ABERTO. `CreateVagaDto.status` aceitava `@IsIn(VAGA_STATUS)`, a lista INTEIRA, e o
 * service gravava o valor cru nas duas rotas da trilha (`POST /as/vagas` e `PATCH /as/vagas/:id`).
 * O rascunho RECEBE candidato, então o cenário era alcançável de verdade: um COMUM pegava um
 * rascunho com gente pendurada no funil e publicava a vaga direto como `FECHADA`.
 *
 * E NADA RODAVA. Nem a trava 5 (todo candidato tratado, que é bloqueio DURO e nem Master fura), nem
 * a trava 6 (as posições oficiais foram entregues?), nem o 403 de quem não pode forçar, nem a
 * trilha do forçamento, que grava QUEM encerrou e QUANTAS faltavam. A vaga terminava sem que uma
 * linha registrasse que aquilo tinha acontecido, e sem ninguém ser avisado.
 *
 * SÃO TRÊS OS TERMINAIS, E O TESTE COBRE OS TRÊS NAS DUAS ROTAS. `FECHADA` e `CANCELADA` eram os
 * visíveis, porque eram os que o seletor da tela oferecia; `ENTREGUE` é o terceiro, está na mesma
 * `VAGA_STATUS_ENCERRADOS` e é o mais danoso dos três, porque além de encerrar ele AFIRMA que a
 * vaga entregou gente, e faz o cilindro da tela ler o número CONGELADO em vez da derivada.
 *
 * A LISTA NÃO É DIGITADA NO TESTE: ela é o COMPLEMENTO da permissão, então status novo no
 * vocabulário entra na cobertura sozinho, e a primeira asserção existe para avisar quando isso
 * acontecer em vez de deixar o novo passar despercebido.
 *
 * POR QUE ISSO INVALIDAVA O DESENHO DA ROTA DE FECHAR, que é o argumento decisivo: a justificativa
 * para NÃO haver `@Roles` em `POST :id/fechar` é, literalmente, "a autoridade é o service". Essa
 * frase só é verdadeira enquanto `fechar()` for a ÚNICA porta para o estado terminal. Não era.
 *
 * AS DUAS PORTAS SÃO AFIRMADAS AQUI, e de propósito: o DTO defende a rota HTTP de hoje, e a régua
 * do service defende a OPERAÇÃO, inclusive de um chamador interno que não passe por DTO nenhum.
 */

/** Os status que a trilha NÃO pode escrever: derivados, para status novo entrar sozinho no teste. */
const TERMINAIS = VAGA_STATUS.filter(
  (s) => !(VAGA_STATUS_DA_TRILHA as readonly string[]).includes(s),
);

/** O `db` nulo prova o ponto: a recusa acontece ANTES de qualquer ida ao banco. */
const service = new VagasService(null as unknown as Database);

function guarda(status: string | undefined, padrao: "RASCUNHO" | "ABERTA") {
  return (
    service as unknown as {
      travaStatusDaTrilha: (p: string | undefined, d: string) => string;
    }
  ).travaStatusDaTrilha(status, padrao);
}

function validarStatus(status: unknown) {
  const dto = plainToInstance(CreateVagaDto, { status });
  return validateSync(dto, { whitelist: true }).filter((e) => e.property === "status");
}

describe("a trilha de abertura só escreve RASCUNHO e ABERTA", () => {
  it("a lista de terminais que o teste cobre é exatamente ENTREGUE, FECHADA e CANCELADA", () => {
    // Guarda do próprio teste: se o vocabulário ganhar status, ele entra aqui sem ninguém lembrar.
    expect(TERMINAIS).toEqual(["ENTREGUE", "FECHADA", "CANCELADA"]);
  });

  describe("porta 1, o DTO (as duas rotas usam o MESMO corpo, então uma asserção cobre as duas)", () => {
    it.each(TERMINAIS)("recusa o status %s no corpo", (status) => {
      expect(validarStatus(status)).toHaveLength(1);
    });

    it.each([...VAGA_STATUS_DA_TRILHA])("aceita o status %s", (status) => {
      expect(validarStatus(status)).toHaveLength(0);
    });

    it("aceita o corpo SEM status, que é o rascunho salvo pela metade", () => {
      expect(validarStatus(undefined)).toHaveLength(0);
    });

    it("recusa lixo que não é status nenhum, sem depender da lista", () => {
      expect(validarStatus("PUBLICADA")).toHaveLength(1);
      expect(validarStatus("")).toHaveLength(1);
    });
  });

  describe("porta 2, a régua do service (a autoridade que o desenho da rota de fechar invoca)", () => {
    it.each(TERMINAIS)("recusa %s na CRIAÇÃO, antes de tocar o banco", (status) => {
      expect(() => guarda(status, "ABERTA")).toThrow(BadRequestException);
    });

    it.each(TERMINAIS)("recusa %s na CONTINUAÇÃO do rascunho, antes de tocar o banco", (status) => {
      expect(() => guarda(status, "RASCUNHO")).toThrow(BadRequestException);
    });

    /**
     * A RECUSA DIZ O QUE FAZER, e não só que não pode: quem chegou aqui queria encerrar a vaga, e
     * a frase precisa mandá-lo para a porta certa. §A.11: sem travessão.
     */
    it("a recusa manda a pessoa para a ação de fechar vaga, e não usa travessão", () => {
      const erro = (() => {
        try {
          guarda("FECHADA", "ABERTA");
          return null;
        } catch (e) {
          return e as BadRequestException;
        }
      })();
      const msg = String((erro?.getResponse() as { message?: string })?.message ?? "");
      expect(msg).toContain("fechar vaga");
      expect(msg).not.toContain("—");
    });

    it("deixa passar RASCUNHO e ABERTA, que é o que a trilha existe para escrever", () => {
      expect(guarda("RASCUNHO", "ABERTA")).toBe("RASCUNHO");
      expect(guarda("ABERTA", "RASCUNHO")).toBe("ABERTA");
    });

    /**
     * OS PADRÕES DE CADA ROTA, que a correção não podia trocar: criar sem status PUBLICA (a trilha
     * cheia manda `ABERTA`), continuar sem status mantém RASCUNHO.
     */
    it("mantém os padrões das duas rotas quando o corpo não manda status", () => {
      expect(guarda(undefined, "ABERTA")).toBe("ABERTA");
      expect(guarda(undefined, "RASCUNHO")).toBe("RASCUNHO");
    });

    it("recusa valor que não é status nenhum, em vez de gravá-lo cru", () => {
      expect(() => guarda("VAGA_BANCO", "ABERTA")).toThrow(BadRequestException);
      expect(() => guarda("", "ABERTA")).toThrow(BadRequestException);
    });
  });

  /**
   * ─ PORTA 3: AS ROTAS CHAMAM A GUARDA DE VERDADE ────────────────────────────────────────────
   *
   * POR QUE ESTE BLOCO EXISTE, e ele saiu de uma falha do próprio teste. A porta 2 chama a régua
   * DIRETO, então ela prova que a régua RECUSA e não prova que alguém a CONSULTA. Medindo por
   * mutação, desligar as duas chamadas em `create` e `atualizar` deixava a porta 2 inteira VERDE:
   * é a mesma distância entre "a trava existe" e "a trava roda" que deixou a ausência de `@Roles`
   * sem cobertura, e que o tester apontou no item 5.
   *
   * O `db` NULO É A ASSERÇÃO, e não um atalho: a recusa tem de acontecer ANTES de qualquer ida ao
   * banco. Se a guarda deixar de ser chamada, o caminho segue para a régua dos obrigatórios ou para
   * o banco, e nos dois casos a MENSAGEM muda, que é o que estes testes conferem. Casar pela frase
   * é deliberado aqui: as duas recusas são `BadRequestException`, então só o texto distingue "você
   * não pode encerrar a vaga por aqui" de "faltam campos obrigatórios".
   */
  describe("porta 3, as rotas consultam a guarda antes de tocar o banco", () => {
    const semBanco = new VagasService(null as unknown as Database);

    it.each(TERMINAIS)("`create` recusa %s pela guarda, e não pela régua dos obrigatórios", async (status) => {
      const erro = await semBanco
        .create({ status } as unknown as CreateVagaDto, "user-1")
        .catch((e) => e);

      expect(erro).toBeInstanceOf(BadRequestException);
      expect(String((erro.getResponse() as { message?: string })?.message)).toContain("fechar vaga");
    });

    it.each(TERMINAIS)("`atualizar` recusa %s pela guarda, com o rascunho já lido", async (status) => {
      /** O mínimo que a rota lê antes da guarda: a vaga existe e está em RASCUNHO. */
      const comRascunho = new VagasService({
        query: { vagas: { findFirst: async () => ({ id: "vaga-1", status: "RASCUNHO", abertoPorId: "user-1" }) } },
      } as unknown as Database);

      const erro = await comRascunho
        .atualizar("vaga-1", { status } as unknown as CreateVagaDto)
        .catch((e) => e);

      expect(erro).toBeInstanceOf(BadRequestException);
      expect(String((erro.getResponse() as { message?: string })?.message)).toContain("fechar vaga");
    });
  });
});
