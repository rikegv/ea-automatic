import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { and, asc, eq, ilike, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type {
  AdmissaoSemLinkDoPortal,
  CanalDeEnvioDoLink,
  DestinatarioDoLink,
  MotivoDeRecusaDeEnvio,
  OrigemDeEnvioDoLink,
  PreviaDoEnvioEmLote,
  ResultadoDoEnvioDoLink,
  ResultadoDoEnvioEmLote,
} from "@ea/shared-types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { admissoes, asCandidatos, asCandidaturas, candidatos, cargos, clientes, portalLinks } from "../db/schema";
import { corpoDoEmailDoLink, emailEnviavel, mascararEmail } from "../domain/portal-envio";
import { PortalCorreioService } from "./portal-correio.service";
import { PortalIdentidadeService } from "./portal-identidade.service";
import { FAROIS_FORA_DO_PAINEL } from "./portal-painel.service";

/**
 * O ENVIO DO LINK DO PORTAL: o caminho AUTOMÁTICO (funil de A&S) e o MANUAL (Gerenciador).
 *
 * ┌─ A ORDEM DOS PASSOS É A REGRA, E NÃO UM DETALHE DE IMPLEMENTAÇÃO ───────────────────────────┐
 * │   1. resolve o destinatário e valida o e-mail. Vazio ou inválido: RECUSA, e NADA é emitido;  │
 * │   2. canal não configurado: RECUSA `CANAL_INDISPONIVEL`, e NADA é emitido;                   │
 * │   3. SÓ AGORA emite o link;                                                                  │
 * │   4. envia. Falhou: REVOGA o link recém-emitido e devolve `FALHA_NO_ENVIO`;                  │
 * │   5. deu certo: carimba o envio na linha e registra a trilha.                                │
 * │                                                                                              │
 * │ ELA É A MESMA LIÇÃO DA §A.5 SOBRE O CLICKSIGN, medida em produção: um envelope que era       │
 * │ ATIVADO e não NOTIFICADO ficava válido, parado e invisível, e ninguém era chamado. Aqui a    │
 * │ forma do dano é a gêmea, e é pior: emitir REVOGA os links vivos da admissão, então emitir    │
 * │ antes de saber se dá para entregar deixaria o candidato SEM o link velho (morto) e SEM o     │
 * │ novo (que ninguém recebeu), e o sistema diria que tudo correu bem.                           │
 * │                                                                                              │
 * │ É POR ISSO QUE A VALIDAÇÃO DO E-MAIL VEM ANTES DA EMISSÃO, e não depois: a regra do diretor  │
 * │ ("e-mail vazio: avisa e NÃO envia, nem para admissão") só é cumprível nessa ordem.           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ══ ESTE SERVIÇO NÃO ESCREVE EM `portal_links`, E ISSO É DESENHO ══════════════════════════════
 *
 * Toda escrita na tabela do link continua morando em `portal-identidade.service.ts`, que é o que
 * permite à auditoria enumerar as portas e afirmar que não há outra. Aqui só se ORQUESTRA: emitir,
 * carimbar e revogar são três chamadas àquele serviço. A razão é concreta: este arquivo é o único
 * do módulo que conhece o E-MAIL do candidato, e um `update` em `portal_links` ao alcance da mão
 * aqui dentro ficaria a uma linha de distância de gravar o destino junto, que é o veto S6.
 *
 * ══ §A.6, O QUE NÃO ATRAVESSA ═════════════════════════════════════════════════════════════════
 *
 * O endereço do candidato existe em memória, dentro de um método, e vai para dentro do e-mail. Ele
 * NÃO é persistido (nem em claro nem hasheado), NÃO é logado, NÃO entra na trilha e NÃO volta em
 * resposta de rota: o que volta é a máscara (`f****o@empresa.com`). A URL do link é credencial e
 * segue o mesmo regime: ela existe entre a emissão e o correio, e morre ali.
 */

/** O único canal por ora. O diretor fechou "só e-mail; WhatsApp depois". */
const CANAL: CanalDeEnvioDoLink = "EMAIL";

/**
 * TETO DA BUSCA DE ADMISSÃO SEM LINK, e ele é de §A.6 antes de ser de desempenho: a resposta é uma
 * lista NOMINAL de candidatos, então ela não pode virar um despejo da base com uma letra digitada.
 */
const TETO_DA_BUSCA_SEM_LINK = 20;

/**
 * MÍNIMO DE CARACTERES DA BUSCA. Abaixo disso a resposta é VAZIA, e não "as primeiras 20".
 *
 * A porta existe para quem JÁ SABE de quem está falando (o RH com o nome do candidato na mão), e
 * não para navegar pela base. Devolver as 20 primeiras com a caixa vazia daria um enumerador de
 * graça a qualquer sessão autenticada, que é exatamente o que o `PortalPainelController` recusa ao
 * não aceitar `?admissaoId=`.
 */
const MINIMO_DA_BUSCA = 2;

/** O destinatário resolvido, como ele vive DENTRO deste serviço e em lugar nenhum além. */
interface Destinatario {
  admissaoId: string;
  nome: string;
  /** §A.6: em claro SÓ aqui dentro, e nunca devolvido, logado nem gravado. */
  email: string | null;
}

@Injectable()
export class PortalEnvioService {
  private readonly log = new Logger(PortalEnvioService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly identidade: PortalIdentidadeService,
    private readonly correio: PortalCorreioService,
  ) {}

  /** O canal está ligado? A tela pergunta para explicar por que o botão não envia. */
  canalDisponivel(): boolean {
    return this.correio.configurado();
  }

  // ══ O ENVIO DE UMA PESSOA ═══════════════════════════════════════════════════════════════════

  /**
   * Emite e ENTREGA o link de uma admissão. É o método por onde os DOIS caminhos passam.
   *
   * `origem` NUNCA VEM DO CLIENTE, por nenhum dos dois caminhos, e isso é o que faz o dado valer
   * alguma coisa. No automático quem a carimba é o gancho de `registrarSaida`; no manual quem a
   * carimba é a ROTA, que passa `MANUAL` fixo e não recebe corpo nenhum. Houve um DTO que aceitava
   * a lista `["MANUAL"]` e ele foi apagado: allowlist de um item só ainda é uma superfície de
   * forjar a origem do registro, que é justamente o dado que o item 4 da OST existe para tornar
   * confiável.
   */
  async enviarParaAdmissao(
    admissaoId: string,
    autorId: string,
    origem: OrigemDeEnvioDoLink,
  ): Promise<ResultadoDoEnvioDoLink> {
    const destinatario = await this.destinatarioDaAdmissao(admissaoId);
    if (!destinatario) throw new NotFoundException("Admissão não encontrada");
    return this.entregar(destinatario, autorId, origem);
  }

  /**
   * O MIOLO, compartilhado pelo envio de um e pelo do lote, com o destinatário JÁ resolvido.
   *
   * Ele recebe o destinatário pronto porque o lote resolve todos de uma vez (uma consulta, não N),
   * e porque a PRÉVIA precisa resolver os mesmos destinatários sem enviar nada. Prévia e envio que
   * resolvessem o destino por caminhos diferentes mostrariam um endereço e usariam outro, e o
   * consultor estaria conferindo a coisa errada.
   */
  private async entregar(
    destinatario: Destinatario,
    autorId: string,
    origem: OrigemDeEnvioDoLink,
  ): Promise<ResultadoDoEnvioDoLink> {
    const recusado = (motivo: MotivoDeRecusaDeEnvio | null, expiraEm: string | null = null, enviadoEm: string | null = null): ResultadoDoEnvioDoLink => ({
      enviado: false,
      motivo,
      canal: CANAL,
      origem,
      destinoMascarado: mascararEmail(destinatario.email),
      enviadoEm,
      expiraEm,
    });

    // PASSO 1. O e-mail primeiro, SEMPRE, e é o passo que faz a regra do diretor ser cumprível.
    const problema = emailEnviavel(destinatario.email);
    if (problema) return recusado(problema);

    // PASSO 2. Inércia fail-closed (exigência S8): canal apagado recusa E NÃO EMITE. Perguntar
    // depois de emitir deixaria um link vivo por envio que nunca sairia, e ainda mataria o
    // anterior no caminho.
    if (!this.correio.configurado()) return recusado("CANAL_INDISPONIVEL");

    // PASSO 3. A emissão, com a abstenção da S15 ligada: link vivo JÁ ABERTO não é reemitido, sob
    // pena de derrubar a sessão de quem está enviando documento naquele instante.
    const emissao = await this.identidade.emitirLinkParaEnvio(destinatario.admissaoId, autorId);
    if (!emissao.emitido) {
      const vivo = emissao.jaAtivo;
      return recusado(
        /*
         * A ABSTENÇÃO TEM CÓDIGO PRÓPRIO, e ele precisou nascer no contrato (§A.39, dono único).
         *
         * Enquanto ele não existia, esta recusa voltava com `motivo` NULO, e um teste independente
         * mostrou o efeito: a tela caía no ramo "não sei o que houve" justamente na recusa mais
         * comum das seis. A pessoa lia "falhou" onde o certo é "não precisa, o link dela está vivo
         * e ela já entrou por ele". Abster-se é o comportamento SEGURO aqui (reemitir derrubaria a
         * sessão de quem está enviando documento naquele instante), e comportamento seguro que a
         * tela apresenta como defeito é comportamento que alguém vai querer desligar.
         *
         * AGORA SÃO DUAS ABSTENÇÕES, e QUEM ESCOLHE ENTRE ELAS É QUEM SE ABSTEVE: a decisão é
         * tomada dentro da transação da emissão, que é o único lugar que enxerga o estado real da
         * linha. Repetir a pergunta aqui fora seria a segunda régua de sempre, e ela responderia
         * sobre um instante diferente. `LINK_VIVO_EM_USO` continua sendo o padrão de leitura, que
         * é o que este campo significava antes de a janela existir.
         */
        vivo?.motivo ?? "LINK_VIVO_EM_USO",
        vivo?.expiraEm ? vivo.expiraEm.toISOString() : null,
        vivo?.enviadoEm ? vivo.enviadoEm.toISOString() : null,
      );
    }

    const { jti, link, expiraEm } = emissao.emitido;

    // PASSO 4. O envio. `email` já passou por `emailEnviavel`, então o `as string` é o que o
    // fluxo garante, e não uma suposição.
    const mensagem = corpoDoEmailDoLink({ nome: destinatario.nome, url: link, expiraEm });
    /*
     * ┌─ O `try` NÃO É REDUNDANTE, e o teste independente pegou a ausência dele ──────────────────┐
     * │ `enviarLink` PROMETE devolver falso em toda falha prevista (rede, tempo limite, token      │
     * │ recusado, resposta de erro), e a promessa é sustentada por um `catch` do outro lado. Mas   │
     * │ isso é um contrato ENTRE DOIS ARQUIVOS: um erro NÃO previsto (um `undefined` de uma        │
     * │ refatoração, um estouro antes do `catch` interno) sobe daqui, e o link recém-emitido fica  │
     * │ VIVO e ÓRFÃO por 72 horas, tendo matado o anterior no caminho.                             │
     * │                                                                                            │
     * │ E O GANCHO DO CAMINHO 1 ENGOLE EXCEÇÃO DE PROPÓSITO (a saída do funil é o fato, o envio é  │
     * │ o aviso), então esse órfão não apareceria em lugar nenhum. A compensação tem de morar AQUI,│
     * │ ao lado do que a criou, e não depender de o outro arquivo continuar cumprindo a promessa.  │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    let saiu = false;
    try {
      saiu = await this.correio.enviarLink(destinatario.email as string, mensagem);
    } catch (erro) {
      // §A.6: só o nome da classe do erro. A mensagem pode carregar endereço ou URL.
      this.log.error(`excecao inesperada do correio do portal: ${(erro as Error).name}`);
      saiu = false;
    }

    if (!saiu) {
      /*
       * NÃO DEIXE CREDENCIAL ÓRFÃ. O link acabou de nascer, ninguém o recebeu, e ele já matou o
       * anterior: mantê-lo vivo seria uma chave de acesso ao prontuário circulando sem dono, e o
       * consultor tentaria de novo, gerando uma segunda.
       *
       * REVOGA COM CÓDIGO PRÓPRIO (`ENVIO_FALHOU`), e não com `REVOGADO_MANUAL`: aqui não houve
       * decisão de ninguém, foi o sistema desfazendo o que começou. Contar isto junto com a
       * revogação deliberada inflaria o número que a Sala De Segurança lê como incidente.
       */
      await this.identidade.revogarLink(jti, autorId, "ENVIO_FALHOU");
      // §A.6: nem o destino, nem a URL, nem o nome. Só o fato e a origem, que é rótulo fixo.
      this.log.error(`envio do link do portal falhou e o link foi revogado (origem ${origem})`);
      return recusado("FALHA_NO_ENVIO");
    }

    // PASSO 5. O carimbo operacional (`portal_links`) e a trilha, nessa ordem, e a ordem repete a
    // lição da §A.5: o registro do FATO vem antes do registro do log, porque o log engole falha.
    await this.identidade.marcarEnvioDoLink(jti, { canal: CANAL, origem, autorId });

    return {
      enviado: true,
      motivo: null,
      canal: CANAL,
      origem,
      destinoMascarado: mascararEmail(destinatario.email),
      enviadoEm: new Date().toISOString(),
      expiraEm: expiraEm.toISOString(),
    };
  }

  // ══ O LOTE: A PRÉVIA E O DISPARO ════════════════════════════════════════════════════════════

  /**
   * A LISTA NOMINAL QUE O CONSULTOR VÊ ANTES DE CONFIRMAR, e ela é a condição que a auditoria pôs
   * para liberar o disparo em massa.
   *
   * Sem ela, "confirmar uma vez, enviar N" tira o humano de N entregas de credencial de acesso a
   * prontuário. Com ela, um e-mail desatualizado no cadastro salta aos olhos ANTES de o documento
   * de identidade de alguém ir parar na caixa de um terceiro (família da §A.33).
   *
   * QUEM NÃO PODE ENVIAR VEM NA MESMA LISTA, marcado, e não é omitido: o consultor precisa saber
   * que aquelas pessoas existem e por que ficaram de fora, senão ele confirma achando que mandou
   * para todo mundo.
   */
  async previaDeCandidaturas(candidaturaIds: string[]): Promise<PreviaDoEnvioEmLote> {
    const itens = await this.destinatariosDeCandidaturas(candidaturaIds);
    return {
      itens,
      enviaveis: itens.filter((i) => i.podeEnviar).length,
      recusados: itens.filter((i) => !i.podeEnviar).length,
    };
  }

  /**
   * O DISPARO DO LOTE. SEQUENCIAL, e isso é requisito de segurança e não estilo.
   *
   * O pool do banco tem `max = 10` (`db/client.ts`) e cada envio abre uma transação que toma o
   * `pg_advisory_xact_lock` da admissão. Trinta envios concorrentes é starvation de pool com locks
   * segurados, e o sintoma não seria o lote falhar: seria o backend inteiro parar. É a MESMA regra
   * já escrita nas ações em massa de `as/candidatos/candidatos.service.ts`, e pelo mesmo motivo.
   *
   * LOTE PARCIAL: quem falha volta NOMINALMENTE, para o consultor resolver um a um. Uma recusa no
   * meio não desfaz os envios que já saíram, porque e-mail entregue não tem como ser desfeito.
   */
  async enviarParaCandidaturas(
    candidaturaIds: string[],
    autorId: string,
  ): Promise<ResultadoDoEnvioEmLote> {
    const destinos = await this.destinatariosDeCandidaturas(candidaturaIds);
    const recusados: DestinatarioDoLink[] = [];
    let enviados = 0;

    for (const destino of destinos) {
      if (!destino.podeEnviar || !destino.admissaoId) {
        recusados.push(destino);
        continue;
      }

      const resultado = await this.enviarParaAdmissao(destino.admissaoId, autorId, "AUTOMATICO");
      if (resultado.enviado) enviados += 1;
      else recusados.push({ ...destino, podeEnviar: false, motivo: resultado.motivo });
    }

    return { enviados, recusados };
  }

  // ══ O DESFAZER ══════════════════════════════════════════════════════════════════════════════

  /**
   * DESFEZ O "ENVIAR PARA ADMISSÃO", O LINK MORRE JUNTO (decisão 4 do diretor nesta frente).
   *
   * A pessoa voltou para a seleção, então o prontuário dela não pode continuar aberto para coleta.
   * Sem isto, o candidato seguiria recebendo a tela de "envie seus documentos" de uma admissão que
   * não está mais acontecendo, e o próximo envio emitiria um SEGUNDO link enquanto o primeiro
   * continuaria valendo por até 72 horas.
   *
   * MÉTODO PRÓPRIO, E NÃO A REVOGAÇÃO CRUA EXPOSTA AO A&S, para que o CÓDIGO da trilha seja
   * decidido aqui e não por quem chama: `ENVIO_REVERTIDO` não é revogação manual (ninguém clicou
   * em revogar) nem substituição (nenhum link novo nasceu), e contá-la como manual inflaria o
   * número que a Sala De Segurança lê como incidente. O chamador do outro módulo não deveria nem
   * precisar conhecer esse catálogo.
   *
   * IDEMPOTENTE: só toca link ainda não revogado, então reverter duas vezes não move carimbo nem
   * grava evento repetido. Devolve quantos morreram, que é zero no caso comum.
   */
  async revogarLinksDaReversao(admissaoId: string, autorId: string): Promise<number> {
    return this.identidade.revogarLinksDaAdmissao(admissaoId, autorId, "ENVIO_REVERTIDO");
  }

  // ══ A PORTA QUE FALTAVA: QUEM AINDA NÃO TEM LINK NENHUM ═════════════════════════════════════

  /**
   * ADMISSÃO VIVA SEM NENHUM LINK, buscada por NOME. É o caminho 2 da OST.
   *
   * ┌─ POR QUE UMA BUSCA, E NÃO UM ALARGAMENTO DA LISTA DO GERENCIADOR ───────────────────────────┐
   * │ A lista do painel sai de `from(portal_links)`, ou seja, só mostra quem JÁ tem link, e a     │
   * │ emissão só é clicável a partir de uma linha dela: não havia, em tela nenhuma, por onde      │
   * │ nascer o PRIMEIRO link de uma admissão. Mudar o recorte da lista para resolver isso mexeria │
   * │ nos cinco contadores, nos filtros e na paginação, que são código validado (§A.26). Uma      │
   * │ busca em modal próprio não encosta em nada disso.                                           │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * §A.6: a busca é por NOME, NUNCA por CPF. Busca por CPF em tela operacional é o oráculo de
   * existência que a identificação do candidato fecha desde o primeiro dia, e é a mesma régua que
   * o `PortalPainelService.listar` já cumpre. O CPF aparece UMA vez, como chave de junção.
   *
   * O RECORTE EXCLUI OS MESMOS FARÓIS DO PAINEL (`FAROIS_FORA_DO_PAINEL`), e a lista é reusada em
   * vez de redigitada: declínio e rescisão não deixam trabalho ativo (§A.16), e a pré-admissão do
   * Pandapé (`AGUARDANDO_LIBERACAO`, `LIBERACAO_RECUSADA`) chega sem cliente e sem cargo, logo sem
   * régua, logo sem nada que o candidato pudesse enviar. Mandar link para elas seria chamar a
   * pessoa para uma coleta que não existe.
   */
  async admissoesSemLink(busca: string | null | undefined): Promise<AdmissaoSemLinkDoPortal[]> {
    const termo = (busca ?? "").trim();
    if (termo.length < MINIMO_DA_BUSCA) return [];

    const linhas = await this.db
      .select({
        admissaoId: admissoes.id,
        nome: candidatos.nome,
        email: candidatos.email,
        cargo: sql<string>`coalesce(${cargos.nome}, 'não informado')`,
        cliente: sql<string>`coalesce(${clientes.nomeOperacao}, 'não informado')`,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
      .leftJoin(cargos, eq(cargos.id, admissoes.cargoId))
      .leftJoin(clientes, eq(clientes.codCliente, admissoes.codCliente))
      // O `leftJoin` com `is null` é o "não existe link NENHUM": basta UMA linha em
      // `portal_links`, viva ou morta, para a admissão sair daqui. Quem já teve link e o perdeu
      // aparece no Gerenciador, que é onde a reemissão dele mora.
      .leftJoin(portalLinks, eq(portalLinks.admissaoId, admissoes.id))
      .where(
        and(
          isNull(portalLinks.id),
          notInArray(admissoes.farolGlobal, [...FAROIS_FORA_DO_PAINEL]),
          ilike(candidatos.nome, `%${termo}%`),
        ),
      )
      .orderBy(asc(candidatos.nome))
      .limit(TETO_DA_BUSCA_SEM_LINK);

    return linhas.map((linha) => {
      const motivo = emailEnviavel(linha.email);
      return {
        admissaoId: linha.admissaoId,
        nome: linha.nome,
        cargo: linha.cargo,
        cliente: linha.cliente,
        destinoMascarado: mascararEmail(linha.email),
        podeEnviar: motivo === null && this.correio.configurado(),
        motivo: motivo ?? (this.correio.configurado() ? null : "CANAL_INDISPONIVEL"),
      };
    });
  }

  // ══ A RESOLUÇÃO DO DESTINATÁRIO, EM UM LUGAR SÓ ═════════════════════════════════════════════

  /**
   * O DESTINO SAI DE `candidatos.email`, e de mais lugar nenhum.
   *
   * É o cadastro da ADMISSÃO, que é o que o wizard (F6) preenche e o que o consultor corrige
   * quando o candidato avisa que trocou de e-mail. Uma cadeia de alternativas (tentar aqui, senão
   * ali) resolveria mais casos e criaria um problema pior: a prévia mostraria um endereço e o
   * envio poderia usar outro, e o consultor estaria conferindo a coisa errada bem no passo que
   * existe para ele conferir.
   */
  private async destinatarioDaAdmissao(admissaoId: string): Promise<Destinatario | null> {
    const [linha] = await this.db
      .select({ admissaoId: admissoes.id, nome: candidatos.nome, email: candidatos.email })
      .from(admissoes)
      .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
      .where(
        and(
          eq(admissoes.id, admissaoId),
          /*
           * O MESMO RECORTE DO CAMINHO MANUAL (`admissoesSemLink`) E DA BATELADA, aplicado aqui para
           * que NENHUMA porta de emissão abra um prontuário vazio. Este método é o choke point dos
           * DOIS caminhos que emitem: o manual (a rota do Gerenciador, origem `MANUAL`) e o
           * automático (o gancho de `registrarSaida`, que chega por `enviarParaCandidaturas`).
           *
           * A pré-admissão do Pandapé/A&S (`AGUARDANDO_LIBERACAO`, `LIBERACAO_RECUSADA`) chega SEM
           * cliente, SEM cargo e SEM régua: não há o que o candidato enviar, e emitir a credencial
           * chamaria a pessoa para uma coleta que não existe. Fora do recorte, a admissão "não é
           * encontrada" e `enviarParaAdmissao` recusa (NotFound) SEM emitir link nenhum. Declínio e
           * rescisão entram pela mesma razão de sempre (§A.16): encerrado não recebe link.
           */
          notInArray(admissoes.farolGlobal, [...FAROIS_FORA_DO_PAINEL]),
        ),
      )
      .limit(1);
    return linha ?? null;
  }

  /**
   * OS DESTINATÁRIOS DE UM LOTE DE CANDIDATURAS, em UMA consulta.
   *
   * ┌─ `SEM_ADMISSAO` NÃO É ERRO, É "AINDA NÃO" ─────────────────────────────────────────────────┐
   * │ `as_candidaturas.admissao_id` é a PONTE A&S -> Esteira, e ela ainda nasce NULA: hoje nada  │
   * │ escreve nessa coluna, porque a ponte é outra frente. `portal_links.admissao_id` é NOT NULL, │
   * │ então, sem admissão, não há a que prender o link, e não há o que inventar.                  │
   * │                                                                                             │
   * │ ENTÃO O CAMINHO 1 NASCE INERTE E LIGA SOZINHO: no dia em que a ponte escrever a coluna,     │
   * │ estes mesmos métodos passam a achar a admissão e a enviar, sem uma linha a mais aqui.       │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O NOME VEM DO CANDIDATO DA ADMISSÃO quando ela existe, e do candidato do FUNIL quando não
   * existe: é o mesmo nome, mas quando não há admissão não há de onde tirá-lo senão do funil, e a
   * prévia precisa dizer DE QUEM ela está falando mesmo para os que ficam de fora.
   */
  private async destinatariosDeCandidaturas(
    candidaturaIds: string[],
  ): Promise<DestinatarioDoLink[]> {
    const ids = [...new Set(candidaturaIds.filter(Boolean))];
    if (ids.length === 0) return [];

    const linhas = await this.db
      .select({
        candidaturaId: asCandidaturas.id,
        admissaoId: asCandidaturas.admissaoId,
        nomeNoFunil: asCandidatos.nome,
        nomeNaAdmissao: candidatos.nome,
        email: candidatos.email,
        // O FAROL DA ADMISSÃO VINCULADA, para o mesmo recorte do caminho manual. `leftJoin`, então
        // é nulo quando a candidatura ainda não tem admissão (o ramo `SEM_ADMISSAO` abaixo).
        farol: admissoes.farolGlobal,
      })
      .from(asCandidaturas)
      .innerJoin(asCandidatos, eq(asCandidatos.id, asCandidaturas.candidatoId))
      .leftJoin(admissoes, eq(admissoes.id, asCandidaturas.admissaoId))
      .leftJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
      .where(inArray(asCandidaturas.id, ids));

    const canalLigado = this.correio.configurado();

    return linhas.map((linha) => {
      const nome = linha.nomeNaAdmissao ?? linha.nomeNoFunil;
      if (!linha.admissaoId) {
        return {
          candidaturaId: linha.candidaturaId,
          admissaoId: null,
          nome,
          destinoMascarado: null,
          podeEnviar: false,
          motivo: "SEM_ADMISSAO" as const,
        };
      }

      /*
       * O FURO QUE ESTA GUARDA FECHA (risco c do estudo): a batelada resolvia a admissão só pelo
       * vínculo `as_candidaturas.admissao_id` e checava APENAS o e-mail. Quando a ponte A&S -> ADM
       * passou a escrever esse vínculo apontando para uma PRÉ-ADMISSÃO (`AGUARDANDO_LIBERACAO`, sem
       * régua e sem documentos), o gancho automático emitiria credencial de um prontuário VAZIO. É
       * o MESMO recorte do caminho manual (`admissoesSemLink:364`) e da `destinatarioDaAdmissao`.
       *
       * AQUI, AO CONTRÁRIO DELAS, O ITEM NÃO SOME: ele volta MARCADO, com o motivo, porque a prévia
       * do lote existe justamente para o consultor ver quem ficou de fora e por quê, e não para a
       * pessoa desaparecer em silêncio. `farol` pode ser nulo em tese (leftJoin), mas este ramo só
       * roda com `admissaoId` presente; o `?? ""` é a defesa do tipo, não um caso real.
       */
      if ((FAROIS_FORA_DO_PAINEL as readonly string[]).includes(linha.farol ?? "")) {
        return {
          candidaturaId: linha.candidaturaId,
          admissaoId: null,
          nome,
          destinoMascarado: null,
          podeEnviar: false,
          /*
           * REUSA `SEM_ADMISSAO`, e a leitura é honesta: uma pré-admissão não liberada ainda NÃO é
           * uma admissão a que o Portal possa prender um link (sem cliente/cargo, não há prontuário
           * para coletar). O catálogo de motivos (`MOTIVOS_DE_RECUSA_DE_ENVIO`) vive em
           * `shared-types`, que é do coordenador (§A.39): um código dedicado
           * (`ADMISSAO_NAO_LIBERADA`) seria mais preciso na tela, e fica PROPOSTO na entrega, não
           * embutido aqui por conta própria.
           */
          motivo: "SEM_ADMISSAO" as const,
        };
      }

      const problema = emailEnviavel(linha.email);
      const motivo: MotivoDeRecusaDeEnvio | null =
        problema ?? (canalLigado ? null : "CANAL_INDISPONIVEL");
      return {
        candidaturaId: linha.candidaturaId,
        admissaoId: linha.admissaoId,
        nome,
        // §A.6: a máscara, nunca o endereço. É este campo que a tela imprime e que o consultor
        // copia para pedir ajuda ao time.
        destinoMascarado: mascararEmail(linha.email),
        podeEnviar: motivo === null,
        motivo,
      };
    });
  }
}
