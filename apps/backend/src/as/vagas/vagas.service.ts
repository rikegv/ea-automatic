import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { PapelAs, VagaContextoAs, VagaListItem } from "@ea/shared-types";
import {
  OPCAO_OUTRA,
  OPCAO_OUTROS,
  REGIAO_OUTRAS,
  contraparteDe,
  exigeTempoContrato,
  isValidCpf,
  nomeDaUf,
  normalizeCpf,
  regiaoPertenceAUf,
} from "@ea/shared-types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import {
  beneficiosCatalogo,
  cargos,
  clientes,
  escalasCatalogo,
  motivosContratacao,
  usuarios,
  vagaBeneficio,
  vagas,
} from "../../db/schema";
import {
  codigoJaUsado,
  ladosDaVaga,
  normalizarCodigoVaga,
  vagasFechadasExcedemPosicoes,
} from "../../domain/vaga";
import type { CreateVagaDto, FecharVagaDto } from "./vagas.dto";

/**
 * CENTRAL DE VAGAS (A&S): a vaga nasce pela trilha de abertura e termina pela ação de fechar.
 *
 * A LINHA É A IDENTIDADE. Cada abertura é uma vaga com `id` próprio do EA; o `codigo` é o número do
 * PROCESSO SELETIVO, digitado à mão e único no sistema.
 *
 * A TRAVA DE DUPLICIDADE vive no cadastro, e só nele: a importação da base (onda 3) não passa por
 * este caminho de propósito, porque lá o código repetido é marcado para revisão em vez de perder a
 * linha. É pelo mesmo motivo que o banco tem índice comum, e não unique, em `vagas.codigo`.
 *
 * OS DOIS LADOS DA VAGA saem do PAPEL DE A&S de quem abre (`ladosDaVaga`, no domínio): um lado é
 * carimbado da sessão, o outro é a contraparte escolhida na trilha. Nunca os dois na mão.
 *
 * §A.6: vaga não carrega dado pessoal de CANDIDATO. O nome e o CPF do SUBSTITUÍDO são de
 * funcionário, e o CPF PERSISTE por decisão do diretor (22/08): é exigência legal do cadastro do
 * ADM. Nunca vai para log e nunca sai em exportação, e a rota inteira é fechada pelo menu `as-vagas`.
 * O expurgo de 48h da ADMISSÃO (regra 10 da §A.3) não foi tocado: é outra tabela e outro gatilho.
 */
@Injectable()
export class VagasService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Lista as vagas com cargo, cliente, autor e os dois lados JÁ RESOLVIDOS em nome.
   *
   * LEFT JOIN em cliente, autor, consultor e recruiter porque todos são nuláveis por desenho: INNER
   * JOIN sumiria em silêncio com a vaga sem cliente vinculado, que é justamente a que precisa
   * aparecer para alguém vincular.
   */
  async list(): Promise<VagaListItem[]> {
    const consultor = alias(usuarios, "consultor");
    const recruiter = alias(usuarios, "recruiter");
    const autor = alias(usuarios, "autor");

    const linhas = await this.db
      .select({
        v: vagas,
        cargoNome: cargos.nome,
        clienteRazao: clientes.razaoSocial,
        clienteOperacao: clientes.nomeOperacao,
        abertoPorNome: autor.nome,
        consultorNome: consultor.nome,
        recruiterNome: recruiter.nome,
      })
      .from(vagas)
      .innerJoin(cargos, eq(cargos.id, vagas.cargoId))
      .leftJoin(clientes, eq(clientes.codCliente, vagas.codCliente))
      .leftJoin(autor, eq(autor.id, vagas.abertoPorId))
      .leftJoin(consultor, eq(consultor.id, vagas.consultorId))
      .leftJoin(recruiter, eq(recruiter.id, vagas.recruiterId))
      .orderBy(desc(vagas.criadoEm));

    const porVaga = await this.beneficiosPorVaga(linhas.map((l) => l.v.id));

    return linhas.map(({ v, ...l }) => ({
      id: v.id,
      codigo: v.codigo,
      nomeDivulgacao: v.nomeDivulgacao,
      cargoId: v.cargoId,
      cargoNome: l.cargoNome,
      codCliente: v.codCliente,
      // O rótulo do cliente no sistema é sempre "código - nome de operação" (padrão do wizard); sem
      // nome de operação cadastrado, cai na razão social, que é o que existe.
      clienteNome: v.codCliente ? (l.clienteOperacao ?? l.clienteRazao ?? null) : null,
      natureza: v.natureza,
      vinculo: v.vinculo,
      status: v.status,
      sazonalidade: v.sazonalidade,
      posicoes: v.posicoes,
      escolaridade: v.escolaridade,
      salarioAbertura: v.salarioAbertura,
      salarioFechamento: v.salarioFechamento,
      beneficios: porVaga.get(v.id) ?? [],
      dataAbertura: v.dataAbertura,
      dataLimite: v.dataLimite,
      abertoPorNome: l.abertoPorNome,
      criadoEm: v.criadoEm.toISOString(),

      solicitanteNome: v.solicitanteNome,
      solicitanteTelefone: v.solicitanteTelefone,
      solicitanteEmail: v.solicitanteEmail,
      dataSolicitacao: v.dataSolicitacao,
      dataAlinhamento: v.dataAlinhamento,
      envioShortlist: v.envioShortlist,
      consultorNome: l.consultorNome,
      recruiterNome: l.recruiterNome,
      tempoContrato: v.tempoContrato,
      motivo: v.motivo,
      justificativaMotivo: v.justificativaMotivo,
      tipoSubstituicao: v.tipoSubstituicao,
      substituidoNome: v.substituidoNome,
      substituidoCpf: v.substituidoCpf,
      localTrabalho: v.localTrabalho,
      regiaoEstado: v.regiaoEstado,
      regioes: v.regioes ?? [],
      regioesOutras: v.regioesOutras,
      horarioEscala: v.horarioEscala,
      modeloTrabalho: v.modeloTrabalho,
      detalheHibrido: v.detalheHibrido,
      confidencial: v.confidencial,
      divulgarEmpresa: v.divulgarEmpresa,

      faixaEtaria: v.faixaEtaria,
      genero: v.genero,
      idiomas: v.idiomas ?? [],
      idiomasOutros: v.idiomasOutros,
      cursosConhecimentos: v.cursosConhecimentos,
      testes: v.testes ?? [],
      testesOutro: v.testesOutro,
      experiencia: v.experiencia,
      atribuicoes: v.atribuicoes,
      perfilComportamental: v.perfilComportamental,
      ambiente: v.ambiente,
      etapasPs: v.etapasPs ?? [],
      etapasPsOutra: v.etapasPsOutra,
      observacoes: v.observacoes,

      dataFechamento: v.dataFechamento,
      vagasFechadas: v.vagasFechadas,
      dataPrevistaInicio: v.dataPrevistaInicio,
      enviarParaAdmissao: v.enviarParaAdmissao,
    }));
  }

  /**
   * OPÇÕES DOS SELETORES SERVIDAS PELO PRÓPRIO MÓDULO DE A&S.
   *
   * POR QUE NÃO REUSAR `/catalogos`, que já devolve cargos, clientes, benefícios e motivos:
   * `CatalogosController` está carimbado como área **ADM** em `AREA_POR_CONTROLLER`. Um Master de
   * A&S chamando aquela rota seria barrado pelo teto de área, e a trilha abriria com os seletores
   * vazios, sem erro visível. Hoje isso não aparece porque quem valida é SUPER_ADMIN, que fica acima
   * da segmentação; apareceria no dia em que o diretor liberasse o menu para o time de A&S.
   *
   * A ALTERNATIVA seria marcar aquela controller também como AS, e ela foi DESCARTADA: é código de
   * autorização já validado, e alargar a área de uma controller da Admissão para resolver um seletor
   * de A&S é mexer no teto de acesso de outra frente (§A.26).
   *
   * §A.6: só id, código e nome de catálogo. Nenhum dado pessoal de candidato.
   */
  async opcoes(): Promise<{
    cargos: { id: string; nome: string }[];
    clientes: {
      codCliente: string;
      rotulo: string;
      enderecoPadrao: string | null;
      escalaPadrao: string | null;
      /**
       * O SOLICITANTE HERDADO (item 1 da OST de 22/08): quem pediu a ÚLTIMA vaga deste cliente.
       * Cliente sem vaga anterior vem com os três nulos, e o passo 2 nasce em branco.
       */
      solicitanteNome: string | null;
      solicitanteTelefone: string | null;
      solicitanteEmail: string | null;
    }[];
    beneficios: { id: string; nome: string; exigeValor: boolean }[];
    motivos: string[];
    /**
     * AS ESCALAS DO CADASTRO DO MENU GERENCIAL (item 5 da OST de 22/08).
     *
     * É O MESMO `escalas_catalogo` da tela `/admin/escalas` e da Liberação Admissional, lido sem
     * tocar em nada dele, exatamente como o diretor pediu.
     *
     * POR QUE SERVIDO DAQUI, e não pelo `/catalogos/escalas` que já existe: aquela controller está
     * carimbada como área ADM em `AREA_POR_CONTROLLER`, e um Master de A&S chamando-a seria barrado
     * pelo teto de área, abrindo a trilha com o seletor de escala vazio e SEM erro visível. Hoje
     * ninguém veria, porque quem valida é SUPER_ADMIN; apareceria no dia em que o menu fosse
     * liberado para o time de A&S. É a mesma decisão, e pelo mesmo motivo, já tomada para cargos,
     * clientes, benefícios e motivos logo acima. Alargar a área daquela controller para resolver um
     * seletor de A&S seria mexer no teto de acesso de outra frente (§A.26).
     *
     * SÓ AS ATIVAS: inativar no catálogo é exclusão lógica, e o inativo não se oferece em cadastro
     * novo. O catálogo está sujo (duplicatas de caixa, placeholders), e limpá-lo é frente futura do
     * diretor: esta frente não deduplica nada, só oferece o que está lá.
     */
    escalas: string[];
  }> {
    const [
      listaCargos,
      listaClientes,
      listaBeneficios,
      listaMotivos,
      ultimoSolicitante,
      listaEscalas,
    ] = await Promise.all([
      this.db
        .select({ id: cargos.id, nome: cargos.nome })
        .from(cargos)
        .where(eq(cargos.ativo, true))
        .orderBy(asc(cargos.nome)),
      // Os padrões do cliente vêm JUNTO das opções porque é a trilha que pré-preenche local de
      // trabalho e escala (§A.3, F1): buscá-los numa segunda chamada faria o passo 4 piscar.
      this.db
        .select({
          codCliente: clientes.codCliente,
          razaoSocial: clientes.razaoSocial,
          nomeOperacao: clientes.nomeOperacao,
          enderecoPadrao: clientes.enderecoPadrao,
          escalaPadrao: clientes.escalaPadrao,
        })
        .from(clientes)
        .where(eq(clientes.ativo, true))
        .orderBy(asc(clientes.razaoSocial)),
      // O CADASTRO DE BENEFÍCIOS QUE JÁ EXISTE: a mesma tabela que alimenta a tela de Benefícios e a
      // ficha da admissão. `exigeValor` é o que diz se o campo de valor acende ao lado. Só os
      // ATIVOS: inativar no catálogo é exclusão lógica, e o inativo não se oferece em cadastro novo.
      this.db
        .select({
          id: beneficiosCatalogo.id,
          nome: beneficiosCatalogo.nome,
          exigeValor: beneficiosCatalogo.exigeValor,
        })
        .from(beneficiosCatalogo)
        .where(eq(beneficiosCatalogo.ativo, true))
        .orderBy(asc(beneficiosCatalogo.nome)),
      // O catálogo de motivos que a Nova Admissão já usa. A vaga guarda o NOME escolhido, como
      // `dados_vaga_folha.motivo` faz, e não uma FK: motivo inativado depois não trava vaga antiga.
      this.db
        .select({ nome: motivosContratacao.nome })
        .from(motivosContratacao)
        .where(eq(motivosContratacao.ativo, true))
        .orderBy(asc(motivosContratacao.nome)),
      /**
       * O CONTATO FOCAL DA ÚLTIMA VAGA DE CADA CLIENTE (item 1).
       *
       * `DISTINCT ON (cod_cliente)` com `ORDER BY cod_cliente, criado_em DESC` devolve UMA linha por
       * cliente, a mais recente. É a forma de o Postgres responder "o último de cada grupo" em uma
       * varredura só, sem subconsulta por cliente e sem trazer a tabela inteira para a memória do
       * Node só para descartar quase tudo.
       *
       * VEM JUNTO DAS OPÇÕES, e não numa rota "buscar solicitante do cliente X": o passo 1 e o passo
       * 2 são cliques seguidos, e uma chamada por troca de cliente faria o formulário piscar. É a
       * mesma decisão que já trouxe `enderecoPadrao` e `escalaPadrao` para cá.
       *
       * §A.6: nome, telefone e e-mail são de CONTATO DO CLIENTE (a pessoa que pediu a vaga), não de
       * candidato. É o mesmo dado que a vaga já mostra na listagem.
       */
      this.db
        .selectDistinctOn([vagas.codCliente], {
          codCliente: vagas.codCliente,
          solicitanteNome: vagas.solicitanteNome,
          solicitanteTelefone: vagas.solicitanteTelefone,
          solicitanteEmail: vagas.solicitanteEmail,
        })
        .from(vagas)
        .where(isNotNull(vagas.codCliente))
        .orderBy(asc(vagas.codCliente), desc(vagas.criadoEm)),
      this.db
        .select({ nome: escalasCatalogo.nome })
        .from(escalasCatalogo)
        .where(eq(escalasCatalogo.ativo, true))
        .orderBy(asc(escalasCatalogo.nome)),
    ]);

    const solicitantePorCliente = new Map(
      ultimoSolicitante
        .filter((u) => u.codCliente !== null)
        .map((u) => [u.codCliente as string, u]),
    );

    return {
      cargos: listaCargos,
      clientes: listaClientes.map((c) => {
        const ultimo = solicitantePorCliente.get(c.codCliente);
        return {
          codCliente: c.codCliente,
          rotulo: `${c.codCliente} - ${c.nomeOperacao ?? c.razaoSocial}`,
          enderecoPadrao: c.enderecoPadrao,
          escalaPadrao: c.escalaPadrao,
          solicitanteNome: ultimo?.solicitanteNome ?? null,
          solicitanteTelefone: ultimo?.solicitanteTelefone ?? null,
          solicitanteEmail: ultimo?.solicitanteEmail ?? null,
        };
      }),
      beneficios: listaBeneficios,
      motivos: listaMotivos.map((m) => m.nome),
      escalas: listaEscalas.map((e) => e.nome),
    };
  }

  /**
   * O CONTEXTO DE A&S DE QUEM ABRE (frente 2).
   *
   * Duas respostas numa: qual lado a pessoa ocupa, e quem são as pessoas do lado oposto. A tela usa
   * a primeira para dizer "você entra como Recruiter" e a segunda para desenhar UM seletor só.
   *
   * O PAPEL É LIDO DO BANCO, não do token, e isso é deliberado: o JWT de produção não tem este campo
   * e não vai ganhar um por causa desta frente. Quem trocou de lado hoje de manhã abre a vaga da
   * tarde já do lado certo, sem precisar sair e entrar de novo.
   */
  async contextoAs(usuarioId: string): Promise<VagaContextoAs> {
    const eu = await this.db.query.usuarios.findFirst({ where: eq(usuarios.id, usuarioId) });
    const papelAs = (eu?.papelAs ?? null) as PapelAs | null;
    if (!papelAs) return { papelAs: null, nome: eu?.nome ?? "", contraparte: [] };

    const ladoOposto = contraparteDe(papelAs);
    const pessoas = await this.db
      .select({ id: usuarios.id, nome: usuarios.nome })
      .from(usuarios)
      .where(and(eq(usuarios.ativo, true), eq(usuarios.papelAs, ladoOposto)))
      .orderBy(asc(usuarios.nome));

    return { papelAs, nome: eu?.nome ?? "", contraparte: pessoas };
  }

  async create(dto: CreateVagaDto, abertoPorId: string): Promise<VagaListItem> {
    const codigo = normalizarCodigoVaga(dto.codigo);
    if (!codigo) throw new BadRequestException("O código da vaga é obrigatório.");

    // A DATA LIMITE não depende mais da sazonalidade (correção de 21/08): vale em qualquer vaga e
    // segue opcional. Só a data de ABERTURA é obrigatória, e quem exige é o DTO.
    const dataLimite = dto.dataLimite?.trim() || null;

    await this.travaDuplicidadeDeCodigo(codigo);
    const beneficios = await this.validaBeneficios(dto.beneficios ?? []);
    const regiao = this.validaRegioes(dto.regiaoEstado, dto.regioes, dto.regioesOutras);
    const substituidoCpf = this.validaCpfSubstituido(dto.substituidoCpf);

    // OS DOIS LADOS DA VAGA, pela régua do domínio. Quem não tem papel de A&S não abre vaga: sem
    // isso a vaga nasceria sem lado nenhum e ninguém saberia de quem ela é.
    const eu = await this.db.query.usuarios.findFirst({ where: eq(usuarios.id, abertoPorId) });
    if (!eu?.papelAs) {
      throw new BadRequestException(
        "Seu usuário ainda não tem papel de A&S (Consultor ou Recruiter). Peça ao administrador para definir o papel antes de abrir uma vaga.",
      );
    }
    const lados = ladosDaVaga(eu.papelAs, abertoPorId, dto.contraparteId);

    // TRANSAÇÃO porque são duas escritas: a vaga e os benefícios dela. Sem ela, uma falha no segundo
    // insert deixaria a vaga gravada sem os benefícios que o consultor marcou, em silêncio.
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(vagas)
        .values({
          codigo,
          cargoId: dto.cargoId,
          nomeDivulgacao: dto.nomeDivulgacao.trim(),
          codCliente: dto.codCliente?.trim() || null,
          natureza: dto.natureza,
          vinculo: dto.vinculo ?? null,
          status: dto.status ?? "ABERTA",
          sazonalidade: dto.sazonalidade ?? "OPERACAO_PADRAO",
          posicoes: dto.posicoes ?? 1,
          escolaridade: dto.escolaridade ?? null,
          salarioAbertura: dto.salarioAbertura ?? null,
          dataAbertura: dto.dataAbertura,
          dataLimite,
          abertoPorId,

          solicitanteNome: texto(dto.solicitanteNome),
          solicitanteTelefone: texto(dto.solicitanteTelefone),
          solicitanteEmail: texto(dto.solicitanteEmail),
          dataSolicitacao: data(dto.dataSolicitacao),
          dataAlinhamento: data(dto.dataAlinhamento),
          envioShortlist: data(dto.envioShortlist),

          consultorId: lados.consultorId,
          recruiterId: lados.recruiterId,
          /**
           * TEMPO DE CONTRATO SÓ EM VÍNCULO COM PRAZO (item 2). A tela esconde o campo fora dos três
           * vínculos, mas quem GRAVA é aqui: sem esta linha, trocar o vínculo depois de escolher o
           * tempo deixaria um prazo órfão gravado numa vaga efetiva, invisível na tela e presente no
           * banco. Mesma decisão já tomada para `detalheHibrido` fora do modelo híbrido.
           */
          tempoContrato: exigeTempoContrato(dto.vinculo) ? texto(dto.tempoContrato) : null,
          motivo: texto(dto.motivo),
          justificativaMotivo: texto(dto.justificativaMotivo),
          tipoSubstituicao: dto.tipoSubstituicao ?? null,
          substituidoNome: texto(dto.substituidoNome),
          substituidoCpf,

          localTrabalho: texto(dto.localTrabalho),
          regiaoEstado: regiao.uf,
          regioes: regiao.regioes,
          regioesOutras: regiao.outras,
          horarioEscala: texto(dto.horarioEscala),
          modeloTrabalho: dto.modeloTrabalho ?? null,
          // O detalhe do híbrido só existe no híbrido: guardá-lo depois de a pessoa trocar o modelo
          // deixaria na vaga uma frase que a tela nem mostra mais.
          detalheHibrido: dto.modeloTrabalho === "HIBRIDO" ? texto(dto.detalheHibrido) : null,
          confidencial: dto.confidencial ?? false,
          divulgarEmpresa: dto.divulgarEmpresa ?? true,

          faixaEtaria: texto(dto.faixaEtaria),
          genero: dto.genero ?? "INDIFERENTE",
          idiomas: dto.idiomas?.length ? dto.idiomas : null,
          // O escape só sobrevive se "Outros" estiver marcado: guardar o texto de um escape que a
          // pessoa desmarcou deixaria na vaga um idioma que a tela não mostra mais.
          idiomasOutros: dto.idiomas?.includes(OPCAO_OUTROS) ? texto(dto.idiomasOutros) : null,
          cursosConhecimentos: texto(dto.cursosConhecimentos),
          testes: dto.testes?.length ? dto.testes : null,
          testesOutro: texto(dto.testesOutro),
          experiencia: texto(dto.experiencia),
          atribuicoes: texto(dto.atribuicoes),
          perfilComportamental: texto(dto.perfilComportamental),
          ambiente: texto(dto.ambiente),
          etapasPs: dto.etapasPs?.length ? dto.etapasPs : null,
          etapasPsOutra: dto.etapasPs?.includes(OPCAO_OUTRA) ? texto(dto.etapasPsOutra) : null,
          observacoes: texto(dto.observacoes),
        })
        .returning({ id: vagas.id });

      if (beneficios.length > 0) {
        await tx
          .insert(vagaBeneficio)
          .values(
            beneficios.map((b) => ({ vagaId: row.id, beneficioId: b.beneficioId, valor: b.valor })),
          );
      }
      return row.id;
    });

    const criada = (await this.list()).find((v) => v.id === id);
    if (!criada) throw new BadRequestException("Vaga criada, mas não encontrada na listagem.");
    return criada;
  }

  /**
   * FECHAR A VAGA (frente 4): o outro momento do processo, e por isso caminho próprio.
   *
   * O STATUS que sai daqui é ENTREGUE quando alguma posição foi preenchida e FECHADA quando nenhuma
   * foi, porque é a distinção que a operação faz e que o vocabulário de status preserva de propósito.
   *
   * `enviarParaAdmissao` REGISTRA A INTENÇÃO e não liga nada: a ponte com a esteira é frente
   * separada. Nenhuma admissão, frente ou documento nasce daqui.
   */
  async fechar(id: string, dto: FecharVagaDto): Promise<VagaListItem> {
    const vaga = await this.db.query.vagas.findFirst({ where: eq(vagas.id, id) });
    if (!vaga) throw new BadRequestException("Vaga não encontrada.");
    if (vaga.status !== "ABERTA") {
      throw new ConflictException("Esta vaga já foi fechada. Recarregue a página.");
    }
    if (vagasFechadasExcedemPosicoes(dto.vagasFechadas, vaga.posicoes)) {
      throw new BadRequestException(
        `A vaga tem ${vaga.posicoes} ${vaga.posicoes === 1 ? "posição" : "posições"}: o número de vagas fechadas não pode ser maior que isso.`,
      );
    }

    await this.db
      .update(vagas)
      .set({
        dataFechamento: dto.dataFechamento,
        vagasFechadas: dto.vagasFechadas ?? null,
        salarioFechamento: dto.salarioFechamento ?? null,
        dataPrevistaInicio: data(dto.dataPrevistaInicio),
        enviarParaAdmissao: dto.enviarParaAdmissao ?? false,
        status: (dto.vagasFechadas ?? 0) > 0 ? "ENTREGUE" : "FECHADA",
        atualizadoEm: new Date(),
      })
      .where(eq(vagas.id, id));

    const fechada = (await this.list()).find((v) => v.id === id);
    if (!fechada) throw new BadRequestException("Vaga fechada, mas não encontrada na listagem.");
    return fechada;
  }

  /**
   * A TRAVA DE DUPLICIDADE, no único lugar em que ela existe.
   *
   * Lê só os códigos iguais ao digitado, não a tabela inteira: é a informação mínima que a régua
   * precisa, e mantém a checagem barata mesmo com a base importada dentro.
   */
  private async travaDuplicidadeDeCodigo(codigo: string): Promise<void> {
    const existentes = await this.db
      .select({ codigo: vagas.codigo })
      .from(vagas)
      .where(eq(vagas.codigo, codigo));

    if (
      !codigoJaUsado(
        codigo,
        existentes.map((e) => e.codigo),
      )
    ) {
      return;
    }

    throw new ConflictException(
      `O código ${codigo} já está em uso por outra vaga. Cada processo seletivo tem um código ` +
        `próprio: confira o número no Pandapé.`,
    );
  }

  /**
   * A RÉGUA DA REGIÃO (item 7): a região marcada tem de pertencer ao ESTADO escolhido.
   *
   * POR QUE NO SERVICE, e não só no DTO: a lista de regiões válidas MUDA conforme a UF, e um `@IsIn`
   * só sabe conferir contra uma lista fixa. Com a união dos 27 estados, "Zona Leste" passaria numa
   * vaga do Ceará. Aqui a UF é lida primeiro e a conferência é feita contra as regiões dela.
   *
   * SEM UF, NÃO HÁ REGIÃO. A tela encadeia (a segunda lista nasce fechada), e o backend fecha a
   * mesma porta: região marcada sem estado escolhido é corpo montado fora da tela, e é barrado em
   * vez de gravar uma lista de regiões que ninguém sabe de onde são.
   */
  private validaRegioes(
    uf: string | null | undefined,
    regioes: string[] | null | undefined,
    outras: string | null | undefined,
  ): { uf: string | null; regioes: string[] | null; outras: string | null } {
    const estado = uf?.trim() || null;
    const marcadas = (regioes ?? []).map((r) => r.trim()).filter(Boolean);

    if (!estado) {
      if (marcadas.length > 0) {
        throw new BadRequestException(
          "Escolha o estado antes de marcar as regiões de abordagem.",
        );
      }
      return { uf: null, regioes: null, outras: null };
    }

    const forasteira = marcadas.find((r) => !regiaoPertenceAUf(estado, r));
    if (forasteira) {
      throw new BadRequestException(
        `A região "${forasteira}" não pertence a ${nomeDaUf(estado)}. Recarregue a página e escolha de novo.`,
      );
    }

    return {
      uf: estado,
      regioes: marcadas.length > 0 ? marcadas : null,
      // O escape só sobrevive com "Outras" marcada, pela mesma razão de idiomas e etapas: texto de
      // um escape desmarcado é região que a tela não mostra mais e o banco continua guardando.
      outras: marcadas.includes(REGIAO_OUTRAS) ? texto(outras) : null,
    };
  }

  /**
   * O CPF DO SUBSTITUÍDO (item 3): existe, é validado e PERSISTE.
   *
   * VALIDAR O DÍGITO é o que separa "o time do ADM tem o número" de "o time do ADM tem onze dígitos
   * quaisquer". Um CPF errado só aparece no dia do eSocial, tarde demais para corrigir na origem.
   *
   * §A.6: a mensagem de erro NÃO REPETE O NÚMERO. Ela diz que o CPF não confere e para por aí, senão
   * o dado pessoal viajaria na resposta de erro e, dali, para qualquer log de cliente HTTP.
   */
  private validaCpfSubstituido(bruto: string | null | undefined): string | null {
    const digitos = bruto ? normalizeCpf(bruto) : "";
    if (!digitos) return null;
    if (!isValidCpf(digitos)) {
      throw new BadRequestException(
        "O CPF do substituído não confere. Confira os dígitos e informe de novo.",
      );
    }
    return digitos;
  }

  /**
   * Confere que todo benefício marcado existe e está ATIVO no catálogo, antes de gravar.
   *
   * A FK já garantiria a existência, mas o erro dela chega como violação de constraint, que a tela
   * não sabe explicar. Aqui a resposta é 400 com o motivo, e o benefício inativo (que a FK aceitaria)
   * também é barrado.
   */
  private async validaBeneficios(
    itens: { beneficioId: string; valor?: string }[],
  ): Promise<{ beneficioId: string; valor: string | null }[]> {
    const porId = new Map<string, string | null>();
    for (const i of itens) porId.set(i.beneficioId, i.valor ?? null);
    if (porId.size === 0) return [];

    const ids = [...porId.keys()];
    const achados = await this.db
      .select({ id: beneficiosCatalogo.id })
      .from(beneficiosCatalogo)
      .where(and(inArray(beneficiosCatalogo.id, ids), eq(beneficiosCatalogo.ativo, true)));

    if (achados.length !== ids.length) {
      throw new BadRequestException(
        "Benefício não encontrado no cadastro de benefícios. Recarregue a página e tente de novo.",
      );
    }
    return ids.map((beneficioId) => ({ beneficioId, valor: porId.get(beneficioId) ?? null }));
  }

  /**
   * Benefícios das vagas listadas, em UMA consulta só (nada de uma consulta por linha).
   *
   * INNER JOIN no catálogo porque o nome do benefício mora lá: a vaga guarda o vínculo e o valor, e é
   * o catálogo que responde como ele se chama hoje.
   */
  private async beneficiosPorVaga(
    vagaIds: string[],
  ): Promise<Map<string, { id: string; nome: string; valor: string | null }[]>> {
    const mapa = new Map<string, { id: string; nome: string; valor: string | null }[]>();
    if (vagaIds.length === 0) return mapa;

    const linhas = await this.db
      .select({
        vagaId: vagaBeneficio.vagaId,
        id: beneficiosCatalogo.id,
        nome: beneficiosCatalogo.nome,
        valor: vagaBeneficio.valor,
      })
      .from(vagaBeneficio)
      .innerJoin(beneficiosCatalogo, eq(beneficiosCatalogo.id, vagaBeneficio.beneficioId))
      .where(inArray(vagaBeneficio.vagaId, vagaIds))
      .orderBy(asc(beneficiosCatalogo.nome));

    for (const l of linhas) {
      const atual = mapa.get(l.vagaId) ?? [];
      atual.push({ id: l.id, nome: l.nome, valor: l.valor });
      mapa.set(l.vagaId, atual);
    }
    return mapa;
  }
}

/** Texto opcional: em branco é ausência, não string vazia gravada no banco. */
function texto(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/** Data opcional: mesma régua do texto, para o `date` não receber string vazia. */
function data(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}
