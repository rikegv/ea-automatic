import { createPublicKey, generateKeyPairSync, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cunharLink, cunharSessao, verificarLink } from "../domain/portal-identidade";
import { PortalSessaoGuard } from "./portal-sessao.guard";

/**
 * DUAS CHAVES, E NÃO UMA (decisão 10 do documento de regras, levada ao pé da letra).
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PARA PEGAR ──────────────────────────────────────────────────────┐
 * │ O portal passa a ter DOIS bilhetes assinados: o do LINK (72 horas) e o da SESSÃO (30         │
 * │ minutos). Assinados pela MESMA chave, a única coisa que os separa é o claim `typ`, e uma     │
 * │ linha só. No dia em que essa linha cair numa refatoração, um link de 72 horas passa a valer  │
 * │ como sessão de 72 horas: o candidato que recebeu o link fica com a sessão aberta três dias,  │
 * │ escrevendo no armazenamento, e NADA falha. Nem teste, nem log, nem produção.                 │
 * │                                                                                              │
 * │ Com chaves SEPARADAS, o mesmo descuido vira assinatura inválida, que é um erro barulhento.   │
 * │ A checagem de `typ` continua existindo nos dois verificadores; a chave separada é a rede     │
 * │ embaixo dela, e é ela que este arquivo mede.                                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O ARQUIVO DO `tester` (`portal-identidade.tester.spec.ts`) prova a confusão de tipo com a MESMA
 * chave, que é a defesa de dentro. Este prova a de fora, que é a defesa que sobrevive à remoção da
 * primeira. As duas juntas são o que fecha o caso.
 *
 * §A.6: nenhum valor real. As chaves são sorteadas no próprio arquivo.
 */

const PAR_DO_LINK = gerar();
const PAR_DA_SESSAO = gerar();

function gerar() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return { privada: privateKey, publica: publicKey };
}

const AGORA = Date.UTC(2026, 8, 20, 12, 0, 0);
const ADMISSAO = "11111111-1111-4111-8111-111111111111";
const JTI = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** O guard real, alimentado com a chave pública que se quiser testar. */
function guardCom(publica: KeyObject) {
  const b64 = Buffer.from(publica.export({ type: "spki", format: "pem" }) as string).toString("base64");
  return new PortalSessaoGuard({ get: () => b64 } as never);
}

function contextoCom(token: string) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: `Bearer ${token}` } }) }),
  } as never;
}

const linkDoPar = (par: typeof PAR_DO_LINK, agoraMs = Date.now()) =>
  cunharLink({ admissaoId: ADMISSAO, jti: JTI, agoraMs, ttlHoras: 72 }, par.privada);

const sessaoDoPar = (par: typeof PAR_DA_SESSAO, agoraMs = Date.now()) =>
  cunharSessao({ admissaoId: ADMISSAO, jti: JTI, agoraMs, ttlMinutos: 30 }, par.privada);

describe("a chave do LINK não abre a SESSÃO, e vice-versa", () => {
  it("cada par abre o SEU bilhete, que é o caso feliz", async () => {
    expect(verificarLink(linkDoPar(PAR_DO_LINK, AGORA), PAR_DO_LINK.publica, AGORA).ok).toBe(true);
    await expect(
      guardCom(PAR_DA_SESSAO.publica).canActivate(contextoCom(sessaoDoPar(PAR_DA_SESSAO))),
    ).resolves.toBe(true);
  });

  it("uma SESSÃO assinada com a chave DO LINK é recusada pelo guard", async () => {
    // O `typ` está certo, o prazo está em pé, e mesmo assim ela morre: é a chave que não confere.
    await expect(
      guardCom(PAR_DA_SESSAO.publica).canActivate(contextoCom(sessaoDoPar(PAR_DO_LINK))),
    ).rejects.toThrow();
  });

  it("um LINK assinado com a chave DA SESSÃO é recusado pelo verificador do link", () => {
    expect(verificarLink(linkDoPar(PAR_DA_SESSAO, AGORA), PAR_DO_LINK.publica, AGORA)).toEqual({
      ok: false,
      motivo: "ASSINATURA",
    });
  });

  it("A REDE DEBAIXO DA CHECAGEM DE TIPO: mesmo IGNORANDO o `typ`, o bilhete do link não vira sessão", async () => {
    // Este é o teste que justifica o par separado existir. Ele simula o descuido futuro: alguém
    // remove a conferência de `typ`, e a pergunta passa a ser só "a assinatura fecha?".
    const link = linkDoPar(PAR_DO_LINK);
    await expect(guardCom(PAR_DA_SESSAO.publica).canActivate(contextoCom(link))).rejects.toThrow();
    // E o contrário também: a sessão apresentada como link não passa nem pela assinatura.
    expect(verificarLink(sessaoDoPar(PAR_DA_SESSAO), PAR_DO_LINK.publica, Date.now())).toEqual({
      ok: false,
      motivo: "ASSINATURA",
    });
  });

  it("a chave pública do link é DERIVÁVEL da privada, que é como o serviço a obtém", () => {
    // O serviço não lê uma segunda env para a pública do link: ele a deriva da privada. Uma
    // variável a menos para configurar errado, e uma pública que não fosse o par faria o serviço
    // recusar todo link que ele mesmo acabou de assinar.
    const derivada = createPublicKey(PAR_DO_LINK.privada);
    expect(verificarLink(linkDoPar(PAR_DO_LINK, AGORA), derivada, AGORA).ok).toBe(true);
  });
});
