/**
 * Payload do webhook RECEPTOR do Pandapé (INT-1 / §A.5). NÃO é um DTO validado por class-validator: o
 * `ValidationPipe` global tem `forbidNonWhitelisted: true` e o payload real traz MUITOS campos além do
 * id — validá-lo estritamente daria 400. Por isso o handler usa um pipe permissivo e este helper
 * apenas EXTRAI o `IdPreCollaborator` de forma tolerante a casing.
 *
 * O campo confirmado pelo suporte é `IdPreCollaborator`; toleramos variações de casing por robustez.
 */
export type PandapeWebhookPayload = Record<string, unknown>;

/**
 * Extrai o `IdPreCollaborator` do payload tolerando casing (`IdPreCollaborator` | `idPreCollaborator`
 * | `idPrecollaborator`) e aceitando number (converte para string). Retorna `undefined` se ausente ou
 * não conversível — o controller responde 400 nesse caso.
 */
export function extrairIdPreCollaborator(
  payload: PandapeWebhookPayload | undefined,
): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const chaves = ["IdPreCollaborator", "idPreCollaborator", "idPrecollaborator"];
  for (const chave of chaves) {
    const valor = (payload as Record<string, unknown>)[chave];
    if (typeof valor === "string" && valor.trim().length > 0) return valor.trim();
    if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  }
  return undefined;
}
