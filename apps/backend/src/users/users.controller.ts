import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser, Roles } from "../auth/decorators";
import { MenusService } from "../auth/menus.service";
import { codigosPadraoDoPapel } from "../domain/menus";
import {
  AtualizarUsuarioDto,
  CriarUsuarioDto,
  DefinirMenusDto,
  EspelharMenusDto,
} from "./users.dto";
import { UsersService } from "./users.service";

/**
 * Administração de usuários (OST-EA-GESTAO-USUARIOS). Nenhuma resposta expõe senhaHash; a senha
 * temporária em claro trafega apenas na criação e no reset (nunca é logada).
 *
 * RESTRITA AO SUPER_ADMIN (decisão do diretor na segmentação de área). Era Master + Super Admin.
 *
 * POR QUE APERTOU: esta é a tela onde as ÁREAS são cadastradas. Um Master que a alcançasse poderia se
 * conceder qualquer área, e a segmentação inteira viraria decorativa no exato ponto em que precisa
 * ser dura. O carimbo de área no `RolesGuard` já barra o Master de OUTRA área; esta restrição é a
 * camada a mais, e o diretor a escolheu por ser mais fácil de afrouxar depois do que de restringir
 * mais tarde.
 *
 * CONSEQUÊNCIA REGISTRADA, e ela é real: os Masters que administravam usuários perdem esta tela. É a
 * ÚNICA perda de acesso deliberada de toda a fundação de área; todo o resto foi identidade.
 */
@Roles("SUPER_ADMIN")
@Controller("admin/usuarios")
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly menus: MenusService,
  ) {}

  @Get()
  listar() {
    return this.users.listar();
  }

  /**
   * Catálogo de menus para a tela de configuração (OST permissão de menu, Bloco 4). Lido da tabela
   * `menus` (fonte de verdade), então menu novo aparece só rodando o seed, sem deploy da tela.
   * A rota herda o `@Roles` da classe: a configuração é restrita a MASTER/SUPER_ADMIN.
   */
  @Get("menus/catalogo")
  catalogoMenus() {
    return this.menus.catalogo();
  }

  /** Menus e ÁREAS atualmente marcados de UM usuário (para a tela de edição). */
  @Get(":id/menus")
  async menusDoUsuario(@Param("id") id: string) {
    const { codigos, areas } = await this.menus.permissaoDoUsuario(id);
    return { codigos: [...codigos], areas: [...areas] };
  }

  /**
   * Salva a associação USUÁRIO x MENU. Só admin (herda o @Roles da classe). Passa o papel do alvo
   * para o service filtrar os menus bloqueados para COMUM (Diagnóstico/Usuários).
   *
   * NÃO substitui mais o conjunto inteiro: a tela declara em `conhecidos` o catálogo que exibiu, e a
   * remoção acontece só dentro desse escopo. Menu que nasceu depois de a página carregar é
   * preservado em vez de apagado em silêncio, que foi o defeito que sumiu com o `assinaturas` e
   * depois com o `assinante-empresa`. O total preservado volta na resposta, para não ser invisível.
   */
  @Put(":id/menus")
  async definirMenus(@Param("id") id: string, @Body() dto: DefinirMenusDto) {
    // Sem o escopo declarado não dá para saber o que a tela podia remover, e adivinhar é justamente o
    // que apagava menu novo. Uma aba antiga leva erro VISÍVEL pedindo recarga, em vez de remoção
    // silenciosa. A mensagem é uma só, para o consultor entender o que fazer.
    if (!dto.conhecidos || dto.conhecidos.length === 0) {
      throw new BadRequestException(
        "Recarregue a página de usuários e salve de novo: esta aba está desatualizada e não sabe quais menus existem hoje.",
      );
    }
    const alvo = await this.users.findById(id);

    // ÁREA PRIMEIRO, MENU DEPOIS, e a ordem não é estética: o recorte de menu é feito PELA área, então
    // salvar o menu antes gravaria a marcação contra a área antiga e o resultado dependeria de qual
    // requisição chegou primeiro. Quando a tela manda áreas, elas valem já para esta gravação.
    const areas = dto.areas ? await this.menus.definirAreasDoUsuario(id, dto.areas) : undefined;
    const areasVigentes = areas ?? [...(await this.menus.areasDoUsuario(id))];

    const { aplicados, preservados } = await this.menus.salvarSelecaoDaTela(
      id,
      dto.menus,
      dto.conhecidos,
      alvo?.papel,
      areasVigentes,
    );
    return { ok: true, total: aplicados.length, preservados: preservados.length };
  }

  @Post()
  async criar(@Body() dto: CriarUsuarioDto) {
    // VALIDAR A FONTE DO ESPELHAMENTO ANTES DE QUALQUER EFEITO, e a ordem é o conserto: validar
    // depois de o usuário já ter sido inserido e as áreas gravadas deixava, num id inexistente, um
    // usuário meia-provisionado (com áreas e ZERO menu) persistido num request que devolveu 400.
    // Checar no topo faz a criação ser tudo ou nada.
    if (dto.espelharDeUsuarioId) {
      const fonte = await this.users.findById(dto.espelharDeUsuarioId);
      if (!fonte) {
        throw new BadRequestException("Usuário de origem do espelhamento não encontrado");
      }
    }

    const res = await this.users.criar(dto);
    // NINGUÉM NASCE SEM ÁREA (decisão do diretor): sem isto, todo usuário novo cairia no fail-closed e
    // entraria num sistema mudo. O dto exige a área, e ela é gravada ANTES dos menus, porque é ela que
    // recorta o padrão do papel logo abaixo.
    const areas = await this.menus.definirAreasDoUsuario(res.usuario.id, dto.areas);

    // ESPELHAMENTO OPCIONAL: quando o diretor escolhe nascer copiando outro usuário, os menus vêm da
    // FONTE em vez do padrão do papel. A existência da fonte já foi validada no topo, antes de criar.
    if (dto.espelharDeUsuarioId) {
      // O RECORTE É O PONTO: passam os CÓDIGOS da fonte, mas o papel e as áreas do ALVO. O
      // `definirMenusDoUsuario` descarta código inexistente, tira os bloqueados do COMUM, tira os
      // exclusivos de SUPER_ADMIN quando o alvo não é SUPER_ADMIN e recorta pela área viva do alvo.
      // Assim espelhar um SUPER_ADMIN sobre um COMUM nunca vaza menu que o alvo não poderia ter: o
      // resultado é sempre o já recortado pelo papel e pela área do alvo, nunca a cópia crua.
      const codigosFonte = [...(await this.menus.codigosDoUsuario(dto.espelharDeUsuarioId))];
      const aplicados = await this.menus.definirMenusDoUsuario(
        res.usuario.id,
        codigosFonte,
        dto.papel,
        areas,
      );
      return { ...res, areas, menusEspelhados: aplicados.length };
    }

    // Novo usuário nasce com o PADRÃO do papel (decisão do diretor, 24/07/2026): o COMUM enxerga toda
    // a Operação por padrão, em vez de nascer sem menu nenhum. Administração segue concessão pontual.
    //
    // O RECORTE POR ÁREA acontece DENTRO do `definirMenusDoUsuario`, contra a tabela (fonte viva), e
    // não mais sobre um mapa de código: um menu que o diretor acabou de remarcar já entra ou sai do
    // padrão do usuário criado no minuto seguinte.
    await this.menus.definirMenusDoUsuario(
      res.usuario.id,
      codigosPadraoDoPapel(dto.papel),
      dto.papel,
      areas,
    );
    return { ...res, areas };
  }

  /**
   * ESPELHAMENTO NA EDIÇÃO: copia os menus de um usuário-FONTE sobre um usuário-alvo que JÁ existe.
   * Herda o `@Roles("SUPER_ADMIN")` da classe, como toda esta tela.
   *
   * É SUBSTITUIÇÃO DELIBERADA, que é a própria semântica de "espelhar": o alvo passa a enxergar o que
   * a fonte enxerga, não a união do que já tinha com o da fonte. Usar o `definirMenusDoUsuario` (que
   * troca o conjunto inteiro) e não o `salvarSelecaoDaTela` (que preserva o que a tela não conhecia) é
   * intencional: aqui não há uma tela declarando escopo, há um gesto explícito de "deixe igual ao
   * daquele usuário".
   *
   * O RECORTE continua sendo o ponto: passam os CÓDIGOS da fonte com o papel e as áreas do ALVO, então
   * espelhar um SUPER_ADMIN sobre um COMUM resulta nos menus já recortados pelo papel e pela área do
   * alvo, nunca a cópia crua.
   */
  @Post(":id/espelhar")
  async espelharMenus(@Param("id") id: string, @Body() dto: EspelharMenusDto) {
    // Espelhar um usuário sobre ele mesmo não faz nada útil e quase sempre é engano da tela; recusar
    // com mensagem clara evita um "salvei e nada mudou" sem explicação.
    if (dto.deUsuarioId === id) {
      throw new BadRequestException("Escolha um usuário diferente para espelhar");
    }
    // Alvo inexistente é 404 (o recurso da rota não existe); fonte inexistente é 400 (o corpo aponta
    // para alguém que não há). Nenhuma das mensagens cita nome nem e-mail de terceiro (§A.6).
    const alvo = await this.users.findById(id);
    if (!alvo) throw new NotFoundException("Usuário não encontrado");
    const fonte = await this.users.findById(dto.deUsuarioId);
    if (!fonte) {
      throw new BadRequestException("Usuário de origem do espelhamento não encontrado");
    }

    const codigosFonte = [...(await this.menus.codigosDoUsuario(dto.deUsuarioId))];
    const areasAlvo = [...(await this.menus.areasDoUsuario(id))];
    const aplicados = await this.menus.definirMenusDoUsuario(
      id,
      codigosFonte,
      alvo.papel,
      areasAlvo,
    );
    return { ok: true, total: aplicados.length };
  }

  @Patch(":id")
  atualizar(
    @Param("id") id: string,
    @Body() dto: AtualizarUsuarioDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.users.atualizar(id, dto, user.id);
  }

  @Post(":id/reset-senha")
  resetarSenha(@Param("id") id: string) {
    return this.users.resetarSenha(id);
  }
}
