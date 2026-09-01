import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { LojasService } from "./lojas.service";
import { AplicarImportacaoDto, CreateLojaDto, UpdateLojaDto } from "./lojas.dto";

/**
 * Catálogo de LOJAS de um cliente (cenário 1, etapa 1).
 *
 * ANINHADA EM `admin/clientes/:codCliente/lojas` de propósito: a loja não existe fora do cliente, e
 * a rota carregar o dono é o que impede a tela de mandar a loja de um cliente para outro. O
 * `codCliente` nunca vem do corpo.
 *
 * ACESSO ABERTO A QUALQUER AUTENTICADO, leitura E escrita, por decisão do diretor (Q3, 01/09/2026).
 * A recomendação original era restringir a escrita a Master e Super Admin; o diretor mudou, e a razão
 * é operacional: quem sabe em qual loja a pessoa vai trabalhar é o consultor que opera a liberação, e
 * ele é perfil COMUM. Fechar o cadastro obrigaria a pedir uma loja nova para a administração no meio
 * de uma liberação.
 *
 * O ENFORCER vigente dos catálogos é o MENU (a OST de permissão de menu trocou o `@Roles` de método
 * pelo menu, e `rbac-catalogos.spec.ts` trava isso), então "aberto" aqui significa: NENHUMA operação
 * deste controller é reivindicada em `domain/menus`. Não é omissão, é a decisão, e
 * `lojas-escrita-aberta.spec.ts` quebra se alguém reivindicá-las um dia sem pedido do diretor.
 *
 * NADA de `@Roles`, nem em classe nem em método: foi a régua de classe que derrubou a Liberação para
 * o perfil Comum, e o `JwtAuthGuard` global continua exigindo sessão em tudo.
 */
@Controller("admin/clientes/:codCliente/lojas")
export class LojasController {
  constructor(private readonly lojas: LojasService) {}

  /** LEITURA (ativas e inativas): a tela de administração filtra. Liberada a qualquer autenticado. */
  @Get()
  list(@Param("codCliente") codCliente: string) {
    return this.lojas.list(codCliente);
  }

  /** LEITURA das ATIVAS: é o que alimenta o seletor da liberação e do wizard (etapa 3). */
  @Get("ativas")
  listAtivas(@Param("codCliente") codCliente: string) {
    return this.lojas.listAtivas(codCliente);
  }

  @Post()
  create(@Param("codCliente") codCliente: string, @Body() dto: CreateLojaDto) {
    return this.lojas.create(codCliente, dto);
  }

  @Patch(":id")
  update(
    @Param("codCliente") codCliente: string,
    @Param("id") id: string,
    @Body() dto: UpdateLojaDto,
  ) {
    return this.lojas.update(codCliente, id, dto);
  }

  /** Reativa a loja (volta às opções selecionáveis). */
  @Patch(":id/reativar")
  reativar(@Param("codCliente") codCliente: string, @Param("id") id: string) {
    return this.lojas.reativar(codCliente, id);
  }

  /**
   * PRÉVIA DA IMPORTAÇÃO (etapa 2): lê a planilha e diz o que vai acontecer, SEM GRAVAR NADA.
   *
   * DECLARADA ANTES do `@Patch(":id")` e do `@Delete(":id")` não é problema aqui (é POST), mas o
   * caminho `importar/previa` fica antes de qualquer `:id` por disciplina: o Nest casa rotas na
   * ordem de declaração, e um `:id` acima engoliria "importar" como se fosse um id de loja.
   *
   * O ARQUIVO VAI NO CORPO (multipart), NUNCA em query string (§A.6). O buffer vive na requisição,
   * não passa pela staging e nada do conteúdo é logado.
   *
   * `mapeamento` opcional: quando vem preenchido, a IA NÃO é consultada. É o caminho da correção,
   * que deixa o consultor mexer numa coluna e ver a prévia recalcular na hora, de graça.
   */
  @Post("importar/previa")
  @UseInterceptors(FileInterceptor("file"))
  previaImportacao(
    @Param("codCliente") codCliente: string,
    @UploadedFile() file?: Express.Multer.File,
    @Body("mapeamento") mapeamentoJson?: string,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException("Envie a planilha.");
    // O mapeamento chega como TEXTO no multipart (o corpo não é JSON). Texto inválido é erro do
    // chamador, não motivo para 500.
    let mapa;
    if (mapeamentoJson) {
      try {
        mapa = JSON.parse(mapeamentoJson) as {
          colunaNome: number | null;
          colunaEndereco: number | null;
          colunaCodigo: number | null;
        };
      } catch {
        throw new BadRequestException("Mapeamento de colunas inválido.");
      }
    }
    return this.lojas.previaImportacao(codCliente, file.buffer, mapa);
  }

  /**
   * APLICA a importação. Recebe as LINHAS que a prévia mostrou, não o arquivo (Q14, opção A do
   * diretor): é o que garante que o gravado é exatamente o que a pessoa viu na tela.
   */
  @Post("importar/aplicar")
  aplicarImportacao(
    @Param("codCliente") codCliente: string,
    @Body() dto: AplicarImportacaoDto,
  ) {
    return this.lojas.aplicarImportacao(codCliente, dto.linhas);
  }

  /**
   * INATIVAÇÃO (exclusão lógica, §A.3/§A.6). O DELETE só seta `ativo=false`, preservando o vínculo
   * das admissões que já usam a loja. Reversível pela reativação.
   */
  @Delete(":id")
  remove(@Param("codCliente") codCliente: string, @Param("id") id: string) {
    return this.lojas.inativar(codCliente, id);
  }
}
