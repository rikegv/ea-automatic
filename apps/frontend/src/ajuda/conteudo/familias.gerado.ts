/* ARQUIVO GERADO por `pnpm ajuda:registro`. NÃO EDITE À MÃO.
 *
 * Ele é o barrel das FAMÍLIAS de artigos (o bloco "Antes De Começar" e "Se Der Errado" que todos os
 * artigos de uma mesma tela têm igual). Gerado pelo mesmo motivo do barrel dos artigos: seria o
 * único arquivo que todo agente de conteúdo tocaria (§A.39). Acrescentou família? Rode o comando.
 */

import type { FamiliaDeArtigos } from "../tipos";
import { familia as familia_beneficios } from "./familias/beneficios";
import { familia as familia_esteira } from "./familias/esteira";
import { familia as familia_gerenciador } from "./familias/gerenciador";
import { familia as familia_liberacao } from "./familias/liberacao";
import { familia as familia_nova_admissao } from "./familias/nova-admissao";
import { familia as familia_portal } from "./familias/portal";
import { familia as familia_sala_espera } from "./familias/sala-espera";

export const FAMILIAS: FamiliaDeArtigos[] = [
  familia_beneficios,
  familia_esteira,
  familia_gerenciador,
  familia_liberacao,
  familia_nova_admissao,
  familia_portal,
  familia_sala_espera,
];

export const FAMILIA_POR_CODIGO: Record<string, FamiliaDeArtigos> = Object.fromEntries(
  FAMILIAS.map((f) => [f.codigo, f]),
);
