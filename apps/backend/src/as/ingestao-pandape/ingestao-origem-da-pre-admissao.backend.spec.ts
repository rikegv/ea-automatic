import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { IngestaoPonteParaAdmissao } from "./ingestao-ponte-admissao";
import { bancoFingido } from "./ingestao-repositorio.tester-fake";

/**
 * ─ A ORIGEM DA PRE-ADMISSAO: `PANDAPE` PELA VARREDURA, `MANUAL` PELO FUNIL ─────────────────────
 *
 * Item 7 do diretor (OST de precedência, 30/09/2026). `criarPreAdmissaoDoFunil` gravava
 * `origem: "MANUAL"` FIXO, então toda pré-admissão nascida da varredura jurava ter sido feita à mão, e
 * a pergunta "quanto da esteira o motor trouxe?" tinha resposta errada para TODA a entrada automática,
 * que é justamente a frente que o diretor está ligando.
 *
 * UMA MARCA SO para tudo que vem do Pandapé, webhook ou varredura: o diretor NÃO quer distinguir as
 * duas portas, então não existe valor de enum novo e não há migration. O enum `origem` já tem
 * `PANDAPE`, e o webhook (`criarPreAdmissao`) já o gravava e não muda.
 *
 * §A.6: o CPF usado é um válido de teste, nunca de pessoa, e nada aqui vai a log.
 */

const CPF_DE_TESTE = "52998224725";
const CANDIDATURA = "00000000-0000-4000-8000-0000000000c1";
const VAGA = "00000000-0000-4000-8000-0000000000a1";

function montar() {
  const banco = bancoFingido([
    { quando: /from as_candidaturas where id =/, devolve: [{ admissao_id: null, vaga_id: VAGA }] },
    { quando: /from vagas where id =/, devolve: [{ posicoes_oficiais: 2, posicoes_banco: 0 }] },
    { quando: /group by posicao_lado/, devolve: [] },
  ]);
  const candidatos = {
    dadosDaPonteParaAdmissao: vi.fn().mockResolvedValue({
      candidato: {
        cpf: CPF_DE_TESTE,
        nome: "NomeSintetico SobrenomeSintetico",
        email: null,
        telefone: null,
        dataNascimento: null,
      },
      codCliente: null,
      cargoId: null,
      idVacancy: "9001",
      vagaFolha: {},
    }),
  };
  const admissoes = {
    vivasPorCpf: vi.fn().mockResolvedValue([]),
    criarPreAdmissaoDoFunil: vi
      .fn()
      .mockResolvedValue({ admissaoId: "00000000-0000-4000-8000-0000000000ad", jaExistia: false }),
  };
  const ponte = new IngestaoPonteParaAdmissao(banco.db, candidatos as never, admissoes as never);
  return { ponte, admissoes };
}

describe("a origem da pré-admissão criada pela varredura", () => {
  it("a ponte da ingestão passa `origem: PANDAPE`", async () => {
    const { ponte, admissoes } = montar();
    await ponte.criar(CANDIDATURA);
    /*
     * O QUE ISTO PROVA: o item 7. Sem esta linha, a pré-admissão nasceria `MANUAL` (o default do
     * parâmetro e da coluna), e não haveria como responder de onde veio a entrada automática.
     */
    expect(admissoes.criarPreAdmissaoDoFunil).toHaveBeenCalledTimes(1);
    expect(admissoes.criarPreAdmissaoDoFunil.mock.calls[0][0].origem).toBe("PANDAPE");
  });

  it("o caminho MANUAL do funil continua sem passar origem, então continua `MANUAL`", () => {
    /*
     * ─ POR QUE ISTO É MEDIDO NA FONTE, E NÃO EXERCITANDO O `registrarSaida` ──────────────────────
     *
     * A propriedade a provar é uma AUSENCIA: o caminho manual NÃO passa o campo, e é por isso que ele
     * continua byte-idêntico ao que já foi validado (§A.26). Instanciar o `CandidatosService` inteiro
     * para afirmar uma ausência arrastaria o módulo de Admissões, o Portal e uma dúzia de catálogos
     * para dentro deste teste, e mediria muito mais do que a pergunta.
     *
     * OS COMENTARIOS SAO RETIRADOS ANTES DE ASSERIR, e isso não é detalhe: o arquivo da ponte e o do
     * funil FALAM sobre `origem` em prosa, e uma varredura de fonte crua contaria a palavra dentro do
     * comentário como se fosse código. É uma armadilha que a casa já pagou.
     */
    const semComentarios = (caminho: string) =>
      readFileSync(join(__dirname, caminho), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");

    const funil = semComentarios("../candidatos/candidatos.service.ts");
    const chamadaDoFunil = /criarPreAdmissaoDoFunil\(\{([\s\S]*?)\n {6}\}\)/.exec(funil);
    expect(chamadaDoFunil, "a chamada do funil mudou de forma: reveja este teste").not.toBeNull();
    expect((chamadaDoFunil as RegExpExecArray)[1]).not.toContain("origem");

    // E A PONTE PASSA, no MESMO recorte de fonte: sem este par, o teste de cima poderia estar verde
    // porque NINGUEM passa o campo em lugar nenhum.
    expect(semComentarios("./ingestao-ponte-admissao.ts")).toContain('origem: "PANDAPE"');
  });
});
