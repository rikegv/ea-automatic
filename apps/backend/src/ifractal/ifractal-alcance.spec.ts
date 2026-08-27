import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { kitLiberado, podeAbrirCadastro, type EstadoFrente } from "../domain/frentes";
import { codigoDoRotulo } from "./ifractal-status.service";

const raiz = join(__dirname, "..");
const ler = (rel: string) => readFileSync(join(raiz, rel), "utf8");

/**
 * AS TRÊS GARANTIAS DA FRENTE IFRACTAL, cobradas pelo diretor ao aprovar a OST:
 *   1. o gate da assinatura só conta as frentes certas;
 *   2. a admissão NÃO fica presa esperando o iFractal;
 *   3. as quatro frentes de antes seguem intactas.
 *
 * Parte destes testes lê o CÓDIGO-FONTE em vez de exercitar a função, e isso é deliberado: o que se
 * quer travar aqui é uma PROPRIEDADE do texto da consulta (o filtro por tipo existir), que nenhuma
 * chamada em memória revelaria e que um refactor distraído removeria em silêncio. É o mesmo defeito
 * da §A.27, e o teste existe para ele não voltar por uma porta nova.
 */
describe("frente iFractal: alcance sobre o que já existia", () => {
  it("1. o gate da assinatura conta SÓ Auditoria, Exame e Cadastro", () => {
    const src = ler("clicksign/clicksign-gestao.service.ts");
    // `indexOf` a partir do início pegaria um `const rows` de outro método antes deste, e o slice
    // sairia vazio: um teste que passa medindo string vazia é pior que teste nenhum.
    const ini = src.indexOf("const concluidas");
    expect(ini).toBeGreaterThan(-1);
    const trecho = src.slice(ini, src.indexOf("const rows", ini));
    expect(trecho.length).toBeGreaterThan(100);

    // A contagem nomeia os três tipos do gate.
    expect(trecho).toContain("'AUDITORIA', 'EXAME', 'CADASTRO_CONTRATO'");
    // E não conta o iFractal nem a Integração.
    expect(trecho).not.toContain("IFRACTAL");
    expect(trecho).not.toContain("INTEGRACAO");
    // A contagem cega (sem filtro de tipo) não pode voltar.
    expect(trecho).not.toMatch(/count\(\*\) filter \(\s*where \$\{[^}]*concluida\}\s*\)/);
  });

  it("2. a admissão concluída NÃO depende do iFractal", () => {
    const src = ler("db/expressoes-admissao.ts");
    // A expressão que Painel, Gerenciador e Alto Volume leem continua olhando só Cadastro e
    // Integração. Se alguém pendurar o iFractal aqui, as três contagens se movem de uma vez.
    expect(src).toContain("f.tipo = 'CADASTRO_CONTRATO'");
    expect(src).toContain("i.tipo = 'INTEGRACAO'");
    expect(src).not.toContain("IFRACTAL");
  });

  it("2b. o iFractal não entra em gate nenhum: nem o do Cadastro, nem o do kit", () => {
    const tresConcluidas: EstadoFrente[] = [
      { tipo: "AUDITORIA", concluida: true },
      { tipo: "EXAME", concluida: true },
      { tipo: "CADASTRO_CONTRATO", concluida: true },
    ];
    // Com o iFractal ABERTO, o kit continua liberado: a credencial de ponto não segura a assinatura.
    expect(kitLiberado([...tresConcluidas, { tipo: "IFRACTAL", concluida: false }])).toBe(true);
    // E o iFractal concluído NÃO substitui o Cadastro no gate.
    expect(
      kitLiberado([
        { tipo: "AUDITORIA", concluida: true },
        { tipo: "EXAME", concluida: true },
        { tipo: "IFRACTAL", concluida: true },
      ]),
    ).toBe(false);
    // O gate do Cadastro segue olhando só Auditoria e Exame.
    expect(
      podeAbrirCadastro([
        { tipo: "AUDITORIA", concluida: true },
        { tipo: "EXAME", concluida: true },
        { tipo: "IFRACTAL", concluida: false },
      ]),
    ).toBe(true);
  });

  it("3. as consultas de frente que não nomeiam tipo continuam sem existir", () => {
    // Varredura do mesmo tipo que a investigação fez à mão, agora travada em teste: nenhuma
    // contagem sobre `frentes_admissao` pode voltar a ser cega ao tipo.
    for (const rel of [
      "clicksign/clicksign-gestao.service.ts",
      "gerencial/gerencial.service.ts",
      "beneficios/beneficios-fila.service.ts",
      "admin/alto-volume/alto-volume-analise.service.ts",
    ]) {
      const src = ler(rel);
      const cegas = src.match(/from frentes_admissao (\w+)\s+where [^)]*?\)/gi) ?? [];
      for (const c of cegas) expect(c).toMatch(/\.tipo\s*=/);
    }
  });

  it("o código do status é estável e sobrevive ao rename do rótulo", () => {
    // O time renomeia "Não Cadastrado" para o que quiser; o CÓDIGO gravado na frente não muda,
    // senão as admissões que já estão nele apontariam para o nada.
    expect(codigoDoRotulo("Não Cadastrado")).toBe("NAO_CADASTRADO");
    expect(codigoDoRotulo("Pendente De Envio")).toBe("PENDENTE_DE_ENVIO");
    expect(codigoDoRotulo("Aguardando Ponto")).toBe("AGUARDANDO_PONTO");
  });
});
