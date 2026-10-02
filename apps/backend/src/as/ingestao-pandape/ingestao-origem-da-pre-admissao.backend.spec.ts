import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ─ A ORIGEM DA PRE-ADMISSAO DO FUNIL: O CAMINHO MANUAL CONTINUA `MANUAL` ───────────────────────
 *
 * ┌─ O QUE SAIU DESTE ARQUIVO EM 02/10/2026, E POR QUE ────────────────────────────────────────┐
 * │ Saiu a metade que media a VARREDURA: ela passava `origem: "PANDAPE"` pela ponte para a       │
 * │ admissão, e a ponte foi removida. "O ÚNICO GATILHO QUE ENVIA PARA ADMISSÃO É O GATILHO DA     │
 * │ ESTEIRA, E NÃO DAS ATS": a varredura atualiza o funil e nada mais, então não há mais          │
 * │ pré-admissão nascida dela para carimbar. Medir um carimbo que nenhum código aplica seria      │
 * │ teste de nada.                                                                               │
 * │                                                                                              │
 * │ FICOU A OUTRA PROPRIEDADE, que tem sujeito vivo: o caminho MANUAL do funil NÃO passa o campo, │
 * │ e é por isso que ele continua gravando `MANUAL` por default, byte-idêntico ao que já foi      │
 * │ validado (§A.26). O parâmetro `origem` de `criarPreAdmissaoDoFunil` NÃO foi tocado nesta      │
 * │ frente: quem decide o que fazer com ele, agora que a varredura não o usa, é o diretor.        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE ISTO É MEDIDO NA FONTE, E NÃO EXERCITANDO O `registrarSaida` ───────────────────────┐
 * │ A propriedade a provar é uma AUSENCIA: o caminho manual NÃO passa o campo. Instanciar o       │
 * │ `CandidatosService` inteiro para afirmar uma ausência arrastaria o módulo de Admissões, o     │
 * │ Portal e uma dúzia de catálogos para dentro deste teste, e mediria muito mais do que a        │
 * │ pergunta.                                                                                    │
 * │                                                                                              │
 * │ OS COMENTARIOS SAO RETIRADOS ANTES DE ASSERIR, e isso não é detalhe: o arquivo do funil FALA  │
 * │ sobre `origem` em prosa, e uma varredura de fonte crua contaria a palavra dentro do           │
 * │ comentário como se fosse código. É uma armadilha que a casa já pagou.                         │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

const semComentarios = (caminho: string) =>
  readFileSync(join(__dirname, caminho), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("a origem da pré-admissão criada pelo funil", () => {
  it("o caminho MANUAL do funil não passa origem, então continua `MANUAL`", () => {
    const funil = semComentarios("../candidatos/candidatos.service.ts");
    const chamadaDoFunil = /criarPreAdmissaoDoFunil\(\{([\s\S]*?)\n {6}\}\)/.exec(funil);
    expect(chamadaDoFunil, "a chamada do funil mudou de forma: reveja este teste").not.toBeNull();
    const corpo = (chamadaDoFunil as RegExpExecArray)[1];
    /*
     * O CANARIO, e ele substitui o par que a metade removida fazia: sem ele, a asserção de ausência
     * ficaria verde também se o recorte viesse VAZIO (regex que casou no lugar errado, ou arquivo
     * lido pela metade). Estes três campos são os que a chamada tem de ter para ser a chamada certa.
     */
    expect(corpo).toContain("candidato");
    expect(corpo).toContain("codCliente");
    expect(corpo).toContain("possivelDuplicata");
    expect(corpo).not.toContain("origem");
  });
});
