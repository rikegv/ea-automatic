/* ARQUIVO GERADO por `pnpm ajuda:registro`. NÃO EDITE À MÃO.
 *
 * Ele é o barrel das FAMÍLIAS de artigos (o bloco "Antes De Começar" e "Se Der Errado" que todos os
 * artigos de uma mesma tela têm igual). Gerado pelo mesmo motivo do barrel dos artigos: seria o
 * único arquivo que todo agente de conteúdo tocaria (§A.39). Acrescentou família? Rode o comando.
 */

import type { FamiliaDeArtigos } from "../tipos";
import { familia as familia_acesso_e_usuarios } from "./familias/acesso-e-usuarios";
import { familia as familia_alto_volume_cadastro } from "./familias/alto-volume-cadastro";
import { familia as familia_as_candidatos } from "./familias/as-candidatos";
import { familia as familia_as_funil } from "./familias/as-funil";
import { familia as familia_as_vagas } from "./familias/as-vagas";
import { familia as familia_assinante_empresa } from "./familias/assinante-empresa";
import { familia as familia_assinaturas } from "./familias/assinaturas";
import { familia as familia_beneficios } from "./familias/beneficios";
import { familia as familia_cadastros_do_cliente } from "./familias/cadastros-do-cliente";
import { familia as familia_catalogo_admissao } from "./familias/catalogo-admissao";
import { familia as familia_catalogo_as } from "./familias/catalogo-as";
import { familia as familia_esteira } from "./familias/esteira";
import { familia as familia_gerador_kit } from "./familias/gerador-kit";
import { familia as familia_gerenciador } from "./familias/gerenciador";
import { familia as familia_ifractal } from "./familias/ifractal";
import { familia as familia_liberacao } from "./familias/liberacao";
import { familia as familia_motor_de_documentos } from "./familias/motor-de-documentos";
import { familia as familia_nao_conformidades } from "./familias/nao-conformidades";
import { familia as familia_nova_admissao } from "./familias/nova-admissao";
import { familia as familia_portal } from "./familias/portal";
import { familia as familia_regua_e_documentos } from "./familias/regua-e-documentos";
import { familia as familia_sala_espera } from "./familias/sala-espera";
import { familia as familia_saude_da_ingestao } from "./familias/saude-da-ingestao";
import { familia as familia_saude_do_sistema } from "./familias/saude-do-sistema";
import { familia as familia_vt_time } from "./familias/vt-time";

export const FAMILIAS: FamiliaDeArtigos[] = [
  familia_acesso_e_usuarios,
  familia_alto_volume_cadastro,
  familia_as_candidatos,
  familia_as_funil,
  familia_as_vagas,
  familia_assinante_empresa,
  familia_assinaturas,
  familia_beneficios,
  familia_cadastros_do_cliente,
  familia_catalogo_admissao,
  familia_catalogo_as,
  familia_esteira,
  familia_gerador_kit,
  familia_gerenciador,
  familia_ifractal,
  familia_liberacao,
  familia_motor_de_documentos,
  familia_nao_conformidades,
  familia_nova_admissao,
  familia_portal,
  familia_regua_e_documentos,
  familia_sala_espera,
  familia_saude_da_ingestao,
  familia_saude_do_sistema,
  familia_vt_time,
];

export const FAMILIA_POR_CODIGO: Record<string, FamiliaDeArtigos> = Object.fromEntries(
  FAMILIAS.map((f) => [f.codigo, f]),
);
