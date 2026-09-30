"use client";

/**
 * ─ ROTA DA FILA DE REVISÃO DE DIVERGÊNCIAS DA INGESTÃO ─────────────────────────────────────────
 *
 * A página é fina de propósito: cabeçalho e a fila. A tela inteira mora em
 * `components/admin/divergencias/FilaDeDivergencias`, que é onde ela é TESTÁVEL como componente (a
 * régua desta tela está no JSX: qual ação a linha oferece, e o que o KPI faz no filtro).
 */

import { PageHead } from "@/components/ui/PageHead";
import { FilaDeDivergencias } from "@/components/admin/divergencias/FilaDeDivergencias";

export default function DivergenciasIngestaoPage() {
  return (
    <>
      <PageHead
        eyebrow="Administração"
        title="Divergências Da Ingestão"
        subtitle="Onde o Pandapé discorda do EA. O EA venceu e nada foi sobrescrito: aqui o time olha a diferença e decide. Resolvida, sai da fila."
      />
      <FilaDeDivergencias />
    </>
  );
}
