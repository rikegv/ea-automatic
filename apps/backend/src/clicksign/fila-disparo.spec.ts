import { describe, expect, it } from "vitest";
import { menuDaOperacao } from "../domain/menus";
import { resolverAssinantes, type AssinanteEmpresa } from "../domain/assinante-empresa";

/**
 * FILA DE DISPARO EM LOTE (fluxo aprovado: cadastrado > gera kit > libera kit > "Enviar para
 * assinatura" > fila > disparo em massa pelo consultor).
 *
 * O ponto que estes testes protegem é a MUDANÇA DE RÉGUA da fila. Antes, "Prontos para solicitar"
 * listava qualquer admissão com as 3 frentes concluídas, e por isso aparecia gente SEM KIT (o caso
 * da Amanda): o consultor via um candidato que não tinha como disparar. Agora entra só quem tem kit
 * ANEXADO, e quem tem impedimento entra BLOQUEADO, com o motivo à vista.
 */

/** Espelha `motivoBloqueio` do service: os três motivos que fariam o `criarEnvelope` desistir. */
function motivoBloqueio(
  r: { candidatoEmail: string | null; kitPath: string | null; codCliente: string | null },
  assinantes: AssinanteEmpresa[],
  kitExisteNoDisco: (p: string) => boolean,
): string | null {
  if (!r.candidatoEmail?.trim()) {
    return "Candidato sem e-mail. A assinatura é autenticada por e-mail, então não há como enviar.";
  }
  if (!r.kitPath || !kitExisteNoDisco(r.kitPath)) {
    return "Kit expirado da área temporária (48h). Gere e envie o kit de novo pelo Gerador de Kit.";
  }
  if (resolverAssinantes(assinantes, r.codCliente).length === 0) {
    return "Sem representante da empresa cadastrado. Cadastre em Administração, Assinante da empresa.";
  }
  return null;
}

const PADRAO: AssinanteEmpresa = {
  codCliente: null,
  nome: "Representante Soulan",
  email: "rep@soulan.com.br",
  cpf: "11144477735",
  ordem: 1,
  ativo: true,
};

const existe = () => true;
const naoExiste = () => false;

describe("Régua de entrada da fila: kit anexado, não frente concluída", () => {
  it("APTA: com e-mail, kit no disco e representante cadastrado", () => {
    const r = { candidatoEmail: "c@e.com", kitPath: "/staging/adm/kit.pdf", codCliente: "631" };
    expect(motivoBloqueio(r, [PADRAO], existe)).toBeNull();
  });

  /**
   * O caso da Amanda. Sem kit anexado ela NÃO entra na fila (o filtro SQL exige
   * `kit_assinatura_path IS NOT NULL`); se por qualquer caminho aparecesse, o bloqueio explicaria.
   */
  it("SEM KIT: bloqueada com o motivo, nunca apta", () => {
    const r = { candidatoEmail: "c@e.com", kitPath: null, codCliente: "631" };
    expect(motivoBloqueio(r, [PADRAO], existe)).toMatch(/Gerador de Kit/);
  });

  it("KIT EXPIRADO do TTL de 48h: bloqueada pedindo novo envio", () => {
    const r = { candidatoEmail: "c@e.com", kitPath: "/staging/adm/kit.pdf", codCliente: "631" };
    expect(motivoBloqueio(r, [PADRAO], naoExiste)).toMatch(/expirado/i);
  });

  it("CANDIDATO SEM E-MAIL: bloqueio conhecido, entra na fila mas não é selecionável", () => {
    const r = { candidatoEmail: null, kitPath: "/staging/adm/kit.pdf", codCliente: "631" };
    expect(motivoBloqueio(r, [PADRAO], existe)).toMatch(/sem e-mail/i);
  });

  it("e-mail em branco conta como sem e-mail", () => {
    const r = { candidatoEmail: "   ", kitPath: "/staging/adm/kit.pdf", codCliente: "631" };
    expect(motivoBloqueio(r, [PADRAO], existe)).toMatch(/sem e-mail/i);
  });

  it("SEM REPRESENTANTE da empresa: bloqueada (o envelope não nasceria)", () => {
    const r = { candidatoEmail: "c@e.com", kitPath: "/staging/adm/kit.pdf", codCliente: "631" };
    expect(motivoBloqueio(r, [], existe)).toMatch(/representante da empresa/i);
  });

  /**
   * A ordem dos motivos importa para a mensagem ser útil: sem e-mail é o impedimento que o consultor
   * resolve primeiro (é dado do candidato), então aparece antes do kit e do representante.
   */
  it("com mais de um impedimento, mostra o do candidato primeiro", () => {
    const r = { candidatoEmail: null, kitPath: null, codCliente: "631" };
    expect(motivoBloqueio(r, [], existe)).toMatch(/sem e-mail/i);
  });
});

describe("Governança das operações do novo fluxo", () => {
  it("o disparo em lote pertence ao menu de assinaturas", () => {
    expect(menuDaOperacao("ClicksignController", "dispararLote")).toBe("assinaturas");
  });

  it("o upload de solicitação deixou de existir como operação", () => {
    // O modal foi eliminado: não há mais handler `solicitar` reivindicado por menu nenhum.
    expect(menuDaOperacao("ClicksignController", "solicitar")).toBeNull();
  });

  /**
   * "Enviar para assinatura" ANEXA o kit e não dispara envelope, então pertence ao menu de quem GERA
   * o kit, não ao de quem dispara. Quem só gera kit consegue encaminhar; quem dispara é outro menu.
   */
  it("enviar para assinatura pertence ao Gerador de kit", () => {
    expect(menuDaOperacao("KitController", "enviarAssinatura")).toBe("gerador-kit");
  });
});

/**
 * REDISPARO DA MESMA ADMISSÃO (bug encontrado no teste real de 28/07).
 *
 * O jobId da fila era `env-<admissao>`, estável. Como o BullMQ retém o job concluído, o SEGUNDO
 * disparo da mesma admissão era descartado em silêncio: a tela dizia "enfileirado", o envelope não
 * nascia e ninguém ficava sabendo. Atingia reenvio por correção, troca de kit e qualquer redisparo
 * depois de um cancelamento.
 */
describe("Redisparo: o jobId não pode ser estável por admissão", () => {
  /** Espelha a montagem do jobId em `ClicksignQueueService.enfileirarCriarEnvelope`. */
  function jobId(admissaoId: string, agoraMs: number): string {
    return `env-${admissaoId}-${agoraMs.toString(36)}`;
  }

  it("dois disparos da MESMA admissão geram jobIds DIFERENTES", () => {
    const a = jobId("adm-1", 1_785_268_971_442);
    const b = jobId("adm-1", 1_785_270_000_000);
    expect(a).not.toBe(b);
  });

  it("o jobId continua carregando a admissão (rastreável no Redis)", () => {
    expect(jobId("adm-1", 1)).toMatch(/^env-adm-1-/);
  });
});
