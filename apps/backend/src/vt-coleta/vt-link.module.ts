import { Module } from "@nestjs/common";
import { VtLinkService } from "./vt-link.service";

/**
 * O EMISSOR DO LINK DO VT, SOZINHO NUM MÓDULO, e o isolamento é o ponto inteiro deste arquivo.
 *
 * POR QUE ELE SAIU DO `VtColetaModule`. O Portal do Candidato passou a precisar do MESMO emissor
 * (a ponte "abrir o formulário de VT" da tela da Sol), e no Nest importar um módulo torna
 * injetável TUDO que ele EXPORTA. Importar o `VtColetaModule` no portal teria tornado alcançáveis,
 * de dentro do caminho público do candidato, o scheduler da coleta, o serviço de solicitação (que
 * ESCREVE em `solicitacoes_vt`) e o de órfãos. Nenhum deles tem o que fazer ali.
 *
 * Com este módulo, o alcance do portal é literalmente UM provider, e isso é estrutura, não
 * comentário: a afirmação "entra uma porta só" é conferível pela lista de `exports` logo abaixo.
 * (O comentário equivalente em `as/as.module.ts` já MENTIU sobre alcance uma vez, e a auditoria
 * pegou. Aqui não há o que mentir, porque não há segunda coisa exportada.)
 *
 * NADA MUDOU PARA QUEM JÁ USAVA. O `VtColetaModule` importa este módulo, então o controller do
 * consultor e o `SolicitacaoVtService` seguem injetando o `VtLinkService` como sempre, e continua
 * havendo UMA instância dele no processo (módulo é singleton). O serviço em si não foi tocado.
 */
@Module({
  providers: [VtLinkService],
  exports: [VtLinkService],
})
export class VtLinkModule {}
