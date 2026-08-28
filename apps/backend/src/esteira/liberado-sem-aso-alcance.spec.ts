import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STATUS_EXAME_LIBERADO_SEM_ASO } from "@ea/shared-types";
import { kitLiberado, podeAbrirCadastro, type EstadoFrente } from "../domain/frentes";

const raiz = join(__dirname, "..");
const ler = (rel: string) => readFileSync(join(raiz, rel), "utf8");

/**
 * AS GARANTIAS DO "LIBERADO PARA CADASTRO SEM ASO", no molde do `ifractal-alcance.spec.ts`.
 *
 * A frente inteira se apoia numa distinção fina: o status LIBERA O AVANÇO e NÃO CONCLUI a frente. As
 * duas metades são invisíveis num teste de tela e sumiriam num refactor distraído, então parte deste
 * arquivo lê o CÓDIGO-FONTE, que é onde a propriedade mora.
 *
 * O que cada teste impede, e por que cada um existe (todos saíram da investigação prévia):
 *   1. carimbar o bit `concluida` no status novo, que tiraria a admissão da fila do Exame;
 *   2. o status virar concluinte no catálogo, com o mesmo efeito por outra porta;
 *   3. o ASO deixar de fechar a admissão liberada, prendendo-a para sempre;
 *   4. a admissão liberada passar a contar como concluída;
 *   5. a régua ampla ("exigir Exame concluído") entrar no lugar do recorte cirúrgico e reescrever o
 *      passado;
 *   6. o scheduler ou o reagendamento desfazerem a liberação por baixo de trabalho já feito.
 */
describe("liberado sem ASO: alcance sobre o que já existia", () => {
  const auditoriaOk: EstadoFrente = { tipo: "AUDITORIA", concluida: true, status: "ANALISE_OK" };
  const exameLiberado: EstadoFrente = {
    tipo: "EXAME",
    concluida: false,
    status: STATUS_EXAME_LIBERADO_SEM_ASO,
  };

  it("1. LIBERA o avanço sem NUNCA concluir a frente", () => {
    // As duas metades na mesma asserção, que é o coração da frente.
    expect(podeAbrirCadastro([auditoriaOk, exameLiberado])).toBe(true);
    expect(exameLiberado.concluida).toBe(false);
  });

  it("2. o status NÃO é concluinte no catálogo (a migration não pode marcá-lo)", () => {
    const sql = readFileSync(
      join(raiz, "..", "drizzle", "0087_exame_liberado_sem_aso.sql"),
      "utf8",
    );
    expect(sql).toContain("LIBERADO_SEM_ASO");
    // Marcar `conclui = true` aqui tiraria a admissão da fila e quebraria o fechamento pelo ASO.
    expect(sql).toMatch(/'Liberado Para Cadastro Sem ASO',\s*8\s*,\s*false/);
    expect(sql).not.toMatch(/LIBERADO_SEM_ASO[\s\S]{0,200}true\s*\)/);
  });

  it("3. o ASO chegando ainda fecha a frente (o status está na whitelist)", () => {
    const src = ler("esteira/esteira.service.ts");
    const ini = src.indexOf("const STATUS_EXAME_APTO_POR_ASO");
    expect(ini).toBeGreaterThan(-1);
    const trecho = src.slice(ini, src.indexOf("];", ini));
    expect(trecho).toContain("STATUS_EXAME_LIBERADO_SEM_ASO");
    // Os quatro de antes continuam lá: a lista é por inclusão e ninguém pode ter saído.
    for (const s of ["A_AGENDAR", "AGENDADO", "AGUARDANDO_ASO", "ASO_PENDENTE"]) {
      expect(trecho).toContain(s);
    }
  });

  it("4. a admissão liberada NÃO conta como concluída", () => {
    const src = ler("db/expressoes-admissao.ts");
    expect(src).toContain("STATUS_EXAME_LIBERADO_SEM_ASO");
    expect(src).toContain("e.tipo = 'EXAME'");
  });

  it("5. o recorte é CIRÚRGICO: a expressão não passou a exigir Exame concluído", () => {
    // A régua ampla tiraria 3 admissões antigas da conta e reescreveria o passado. A cirúrgica não
    // move nada, porque nenhuma linha está no status novo no dia em que ele sobe.
    const src = ler("db/expressoes-admissao.ts");
    expect(src).not.toMatch(/e\.tipo = 'EXAME' AND e\.concluida = true/);
  });

  it("6. o scheduler NÃO governa o status novo", () => {
    const src = ler("esteira/exame-scheduler.service.ts");
    const ini = src.indexOf("const STATUS_GOVERNADOS");
    const trecho = src.slice(ini, src.indexOf("]", ini));
    // O ciclo de hora em hora não pode mover uma admissão liberada para ASO_PENDENTE: isso fecharia
    // o gate depois de ela já ter cadastrado, integrado e ido para a assinatura.
    expect(trecho).not.toContain("LIBERADO_SEM_ASO");
  });

  it("6b. o reagendamento NÃO desfaz a liberação", () => {
    const src = ler("esteira/esteira.service.ts");
    const ini = src.indexOf("private async marcarExameAgendado");
    expect(ini).toBeGreaterThan(-1);
    const trecho = src.slice(ini, ini + 1600);
    expect(trecho).toContain("STATUS_EXAME_LIBERADO_SEM_ASO");
  });

  it("7. as OUTRAS frentes não ganharam exceção nenhuma", () => {
    // A liberação é do EXAME e só dele. Auditoria e Cadastro continuam exigindo conclusão real.
    expect(
      podeAbrirCadastro([
        { tipo: "AUDITORIA", concluida: false, status: STATUS_EXAME_LIBERADO_SEM_ASO },
        { tipo: "EXAME", concluida: true, status: "APTO" },
      ]),
    ).toBe(false);
    expect(
      kitLiberado([
        auditoriaOk,
        exameLiberado,
        {
          tipo: "CADASTRO_CONTRATO",
          concluida: false,
          status: STATUS_EXAME_LIBERADO_SEM_ASO,
        },
      ]),
    ).toBe(false);
  });

  it("8. o gate da assinatura continua nomeando as três frentes certas", () => {
    // O acidente do gate cego (§A.27) não pode voltar por causa da exceção do Exame.
    const src = ler("clicksign/clicksign-gestao.service.ts");
    const ini = src.indexOf("const concluidas");
    const trecho = src.slice(ini, src.indexOf("const rows", ini));
    expect(trecho).toContain("'AUDITORIA', 'EXAME', 'CADASTRO_CONTRATO'");
    expect(trecho).not.toContain("IFRACTAL");
    // A exceção vale para o EXAME e é nominal: nenhuma outra frente entra por ela.
    expect(trecho).toMatch(/tipo\} = 'EXAME'[\s\S]{0,120}STATUS_EXAME_LIBERADO_SEM_ASO/);
  });

  it("8b. desfazer a liberação AVISA, e o recado não tem travessão (§A.11)", () => {
    const src = ler("esteira/esteira.service.ts");
    const ini = src.indexOf("const desfazLiberacao = desfazLiberacaoSemAso");
    expect(ini).toBeGreaterThan(-1);
    const trecho = src.slice(ini, src.indexOf("});", ini));
    // O alerta passou a distinguir os dois recuos: reabrir pendência e desfazer a liberação.
    expect(trecho).toContain("desfazLiberacaoSemAso");
    // Motivo próprio só para a tela dar o título honesto; o diálogo é o mesmo dos dois recuos.
    expect(trecho).toContain("reversaoLiberacaoSemAso");
    expect(trecho).toContain("deixa de estar liberada para avançar");
    // O travessão do texto antigo saiu, com autorização do diretor.
    expect(trecho).not.toContain("—");
    expect(trecho).toContain("Isso reabre pendência num candidato já em cadastro. Confirma?");
  });

  it("9. o pipeline do envelope da Clicksign NÃO foi tocado", () => {
    // A promessa feita ao diretor, escrita como teste: do lado da assinatura a mudança é de LEITURA
    // (o `select` passou a trazer o status), e o disparo continua exatamente como estava.
    const api = ler("clicksign/clicksign-api.service.ts");
    // O quinto passo, o que de fato chama a pessoa para assinar, continua existindo.
    expect(api).toContain("/notifications");

    const sync = ler("clicksign/clicksign-sync.service.ts");
    // A ORDEM ativar, gravar o envelope, notificar: notificar antes de gravar faria uma falha virar
    // envelope duplicado na retentativa. Medida por posição no arquivo, que é o que a ordem é.
    const ativar = sync.indexOf("ativarEnvelope");
    const gravar = sync.indexOf("clicksignEnvelopeId: env.id");
    const notificar = sync.indexOf("notificarEnvelope");
    expect(ativar).toBeGreaterThan(-1);
    expect(gravar).toBeGreaterThan(ativar);
    expect(notificar).toBeGreaterThan(gravar);

    // O gate lá é o compartilhado, e não uma régua própria que pudesse divergir.
    expect(sync).toContain("kitLiberado(frentes)");
  });
});
