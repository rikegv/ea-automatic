import { Inject, Injectable } from "@nestjs/common";
import { isValidCpf, normalizeCpf } from "@ea/shared-types";
import { sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import type { LinhaDeParaEtapaExternaCrua } from "../../domain/as-etapa-externa";
import {
  decidirPrecedencia,
  valorDeComparacao,
  type CampoDeDivergenciaDaCandidatura,
  type DivergenciaARegistrar,
} from "../../domain/as-precedencia-ingestao";
import { EtapasFunilService } from "../etapas/etapas-funil.service";
import { VagaStatusService } from "../vaga-status/vaga-status.service";
import type {
  Escrita,
  PortaBanco,
  PortaCicloDeVidaDaVaga,
  ResultadoDaEscrita,
} from "./ingestao-portas";

/**
 * ─ O LADO DO BANCO DA INGESTÃO: O ÚNICO PONTO EM QUE A VARREDURA ESCREVE ───────────────────────
 *
 * O ciclo (`ingestao-ciclo.ts`) DESCREVE a escrita; este arquivo é quem a executa. A separação é o
 * que permite auditar as regras sem Postgres e, ao mesmo tempo, manter num lugar só as três coisas
 * que só o banco sabe: o vocabulário dos catálogos, a forma condicional do `update` e as guardas.
 *
 * ┌─ POR QUE A INGESTÃO NÃO USA `CandidatosService.criar` ───────────────────────────────────────┐
 * │ Aquele método exige `AuthUser` e carimba `criado_por_id` com a SESSÃO. A ingestão não tem     │
 * │ sessão, e a saída óbvia (um "usuário de sistema") está VETADA: seria um usuário com poder de  │
 * │ escrita fora do RBAC, e faria a trilha afirmar que ALGUÉM cadastrou quem ninguém cadastrou.   │
 * │ Aqui `criado_por_id` fica NULO, que é exatamente a verdade: não houve autor humano.           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ TODO `insert` TEM LISTA NOMINAL DE COLUNAS, E NUNCA ESPALHAMENTO DO OBJETO ─────────────────┐
 * │ É o que mantém `banco_talentos` FORA DO ALCANCE da ingestão: o schema proíbe com todas as     │
 * │ letras, e a proibição só é executável enquanto a coluna não é citada em nenhum insert fora de │
 * │ `aplicarRetencao`. Um espalhamento conceder-lhe-ia retenção perpétua a 137 mil pessoas no dia │
 * │ em que alguém acrescentasse a chave ao objeto, sem nada falhar.                                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum método daqui loga qualquer coisa. Quem loga é o ciclo, e só contagem.
 */
@Injectable()
export class IngestaoRepositorio implements PortaBanco, PortaCicloDeVidaDaVaga {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly vagaStatus: VagaStatusService,
    private readonly etapas: EtapasFunilService,
  ) {}

  // ── LEITURA ──────────────────────────────────────────────────────────────────────────────────

  async identidadeExterna(
    fonte: string,
    identificador: string,
  ): Promise<{ candidatoId: string } | null> {
    const linhas = (await this.db.execute(sql`
      select candidato_id from as_identidades_externas
       where fonte = ${fonte} and identificador = ${identificador}
       limit 1
    `)) as unknown as { candidato_id: string }[];
    const achada = linhas[0];
    return achada ? { candidatoId: achada.candidato_id } : null;
  }

  /**
   * O DESEMPATE SECUNDÁRIO, e ele é FAIL-CLOSED em duas frentes.
   *
   * 1. CPF INVÁLIDO NÃO DESEMPATA. O validador é o mesmo do resto do sistema (`isValidCpf`), e o
   *    motivo de usá-lo aqui é de dedup, não de formulário: um lixo repetido no ATS
   *    (`00000000000`) casaria pessoas DIFERENTES entre si, e fusão de fichas é irreversível.
   * 2. FICHA JÁ ANONIMIZADA NÃO É ALVO. O expurgo nula o CPF, então ela não casaria de qualquer
   *    jeito; a cláusula é a segunda fechadura, e escrita para ser lida junto da guarda do `update`.
   */
  async candidatoPorCpf(cpf: string): Promise<{ id: string } | null> {
    const limpo = cpfParaBanco(cpf);
    if (limpo === null) return null;
    const linhas = (await this.db.execute(sql`
      select id from as_candidatos
       where cpf = ${limpo} and anonimizado_em is null
       limit 1
    `)) as unknown as { id: string }[];
    const achada = linhas[0];
    return achada ? { id: achada.id } : null;
  }

  /**
   * EXISTE PARA A PROIBIÇÃO SER EXEQUÍVEL, E O CICLO NUNCA A CHAMA. Ver o bloco da porta, em
   * `ingestao-portas.ts`: nome é chave fraca, e casar por ele funde homônimos sem volta.
   */
  async candidatoPorNome(nome: string): Promise<{ id: string } | null> {
    const linhas = (await this.db.execute(sql`
      select id from as_candidatos where nome = ${nome} limit 1
    `)) as unknown as { id: string }[];
    const achada = linhas[0];
    return achada ? { id: achada.id } : null;
  }

  /**
   * A VAGA DA VARREDURA, E A FRONTEIRA É A MESMA DAS OUTRAS TRÊS: a MATRÍCULA.
   *
   * QUEM CHAMA ISTO É O JOB DE PÁGINA em produção (`ingestao-varredura.service.ts`), e é ele que
   * decide em QUAL vaga as candidaturas daquela página serão penduradas. Lido por
   * `vagas.id_vacancy_pandape`, que é DIGITADO por gente e sem índice unique, um `limit 1` podia
   * devolver a vaga que um consultor cadastrou à mão com o número do ATS dentro, e a varredura
   * escreveria candidatura dentro dela. Sem matrícula, devolve NULO, e o consumidor já trata isso
   * como "a vaga não está lá": a página é descartada e nada é escrito na vaga de outro dono.
   */
  async vagaPorIdPandape(idVacancy: number): Promise<{ id: string } | null> {
    const linhas = (await this.db.execute(sql`
      select v.id
        from as_varredura_vagas m
        join vagas v on v.id = m.vaga_id
       where m.id_vacancy_pandape = ${String(idVacancy)}
       limit 1
    `)) as unknown as { id: string }[];
    const achada = linhas[0];
    return achada ? { id: achada.id } : null;
  }

  /** Mesma razão do nome: o `reference` REPETE, e casar por ele junta vagas diferentes. */
  async vagaPorCodigo(codigo: string): Promise<{ id: string } | null> {
    const linhas = (await this.db.execute(sql`
      select id from vagas where codigo = ${codigo} limit 1
    `)) as unknown as { id: string }[];
    const achada = linhas[0];
    return achada ? { id: achada.id } : null;
  }

  /**
   * O DE/PARA, já filtrado por fonte e por `ativo`.
   *
   * Desligar uma linha é o gesto que o diretor tem para dizer "pare de confiar nesta tradução", e
   * uma leitura que ignorasse o flag transformaria esse gesto em nada. O resolvedor
   * (`lerLinhaDePara`) confere de novo, e as duas fechaduras são de propósito.
   */
  async deParaEtapa(chave: string): Promise<LinhaDeParaEtapaExternaCrua | null> {
    const linhas = (await this.db.execute(sql`
      select etapa_codigo, situacao, motivo_padrao, ativo
        from as_depara_etapa_externa
       where fonte = 'PANDAPE' and chave_externa = ${chave} and ativo = true
       limit 1
    `)) as unknown as {
      etapa_codigo: string | null;
      situacao: string | null;
      motivo_padrao: string | null;
      ativo: boolean;
    }[];
    const l = linhas[0];
    if (!l) return null;
    return {
      etapaCodigo: l.etapa_codigo,
      situacao: (l.situacao ?? null) as LinhaDeParaEtapaExternaCrua["situacao"],
      motivoPadrao: l.motivo_padrao,
      ativo: l.ativo,
    };
  }

  /**
   * NÃO EXISTE CAMINHO DE API PARA O CLIENTE DA VAGA, e isto foi MEDIDO, não deduzido:
   * `GET /v2/clients/requests?idVacancy=` devolveu HTTP 200 com ZERO itens em 5 de 5 vagas ativas, e
   * `idCompanyExternal` tem um único valor distinto nas 587 vagas (é o id da Soulan, não o do
   * cliente final). Devolver null é o comportamento CERTO: a vaga entra com `cod_cliente` nulo,
   * marcada para vínculo manual, e inventar continua proibido (§A.5). O de/para é insumo do diretor.
   */
  async clientePorVaga(): Promise<string | null> {
    return null;
  }

  async marcaDaVaga(idVacancy: number): Promise<string | null> {
    const linhas = (await this.db.execute(sql`
      select ultimo_insert_date from as_varredura_vagas
       where id_vacancy_pandape = ${String(idVacancy)} limit 1
    `)) as unknown as { ultimo_insert_date: string | null }[];
    return linhas[0]?.ultimo_insert_date ?? null;
  }

  // ── ESCRITA ──────────────────────────────────────────────────────────────────────────────────

  /**
   * O DESPACHO É FAIL-CLOSED: tabela fora desta lista não é escrita. Uma frente futura que precise de
   * uma OITAVA tabela tem de vir aqui, que é o ponto em que alguém lê o que passa a ser escrito por
   * um processo sem autor humano.
   *
   * ┌─ A SÉTIMA ENTROU EM 30/09/2026, E ELA É A FILA DE DIVERGENCIAS ─────────────────────────────┐
   * │ `as_ingestao_divergencias` é onde a trava de precedência deposita o que ela NÃO sobrescreveu. │
   * │ Ela é escrita por DENTRO (`escreverCandidatura` e `escreverVaga` chamam                       │
   * │ `registrarDivergencia` direto, porque é lá que os valores atuais do EA estão na mão) e também │
   * │ aparece aqui, no despacho, para o caso avulso continuar possível e, sobretudo, para que quem  │
   * │ lê esta lista para saber "o que a ingestão escreve" enxergue a tabela. Lista fail-closed que  │
   * │ omite um escritor real é pior que lista nenhuma: ela convence de que a busca terminou.        │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ 02/10/2026: ESTA VOLTOU A SER A ÚNICA PORTA DA INGESTÃO PARA O BANCO ─────────────────────┐
   * │ Entre 30/09 e 02/10 houve uma segunda porta: a PONTE PARA A ADMISSÃO (`ingestao-ponte-       │
   * │ admissao.ts`) falava com o banco por conta própria, para ler a candidatura e gravar          │
   * │ `admissao_id`, e criava a pré-admissão pelo módulo de Admissões. ELA FOI REMOVIDA: o único   │
   * │ gatilho que envia para admissão é o da esteira, e não o das ATS. A varredura escreve só o    │
   * │ funil, e esta lista de SETE tabelas volta a ser a lista COMPLETA.                            │
   * │                                                                                             │
   * │ A LIÇÃO DE 30/09 FICA REGISTRADA porque é ela que mantém esta lista confiável: quem apontou  │
   * │ que a frase antiga tinha deixado de ser verdade foi o `seguranca`, e este é exatamente o     │
   * │ comentário que um auditor futuro lê para decidir ONDE OLHAR. Documentação de trava que       │
   * │ descreve um mundo que acabou é pior que documentação nenhuma, porque convence de que a busca  │
   * │ terminou. Quem acrescentar um segundo escritor, corrige esta lista no mesmo commit.          │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async escrever(e: Escrita): Promise<ResultadoDaEscrita> {
    switch (e.tabela) {
      case "as_candidatos":
        return this.escreverCandidato(e);
      case "as_identidades_externas":
        return this.escreverIdentidade(e);
      case "as_candidaturas":
        return this.escreverCandidatura(e);
      case "vagas":
        return this.escreverVaga(e);
      case "as_varredura_vagas":
        return this.escreverMarca(e);
      case "as_ingestao_conflitos":
        return this.escreverConflito(e);
      case "as_ingestao_divergencias":
        return this.escreverDivergenciaAvulsa(e);
      default:
        throw new Error(`A ingestão não escreve na tabela solicitada: ${e.tabela}`);
    }
  }

  /**
   * A PESSOA. `insert` com lista NOMINAL, `update` CONDICIONAL e com a guarda da anonimização.
   *
   * ┌─ `origem` É ESCRITA AQUI, E NÃO NO CICLO, e a distinção é a razão de ela existir ───────────┐
   * │ Ela não é dado que veio no item: é a ASSINATURA DE QUEM ESTÁ ESCREVENDO, e quem sabe isso é  │
   * │ o adaptador, que é a própria ingestão do Pandapé. O ciclo é o mesmo código para qualquer      │
   * │ fonte, e pedir que ele declare a origem seria pedir que ele soubesse por qual porta está      │
   * │ ligado. Sem esta linha, 137 mil cadastros jurariam ter sido feitos à mão (`MANUAL` é o        │
   * │ default da coluna), e a pergunta "de onde veio esta pessoa" passaria a ter resposta errada    │
   * │ para a maioria da base.                                                                       │
   * │                                                                                               │
   * │ NA ATUALIZAÇÃO ELA NÃO ENTRA: quem foi cadastrado à mão e depois apareceu no ATS continua     │
   * │ sendo um cadastro manual, e reescrever a origem apagaria o fato.                              │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ A GUARDA `anonimizado_em is null`, E O QUE ELA IMPEDE ──────────────────────────────────────┐
   * │ Sem ela, o desempate por CPF RE-IDENTIFICARIA de 30 em 30 minutos, para sempre, quem o        │
   * │ expurgo acabou de anonimizar, e a varredura de retenção NUNCA MAIS volta a uma linha          │
   * │ carimbada para consertar. A conferência de LINHAS AFETADAS é a outra metade, e é o molde do   │
   * │ `CandidatosService.editar`: zero linha com a pessoa anonimizada não é "nada mudou", é RECUSA, │
   * │ e seguir daqui penduraria uma candidatura nova numa ficha expurgada.                          │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  private async escreverCandidato(e: Escrita): Promise<{ linhasAfetadas: number; id: string }> {
    const nome = String(e.valores.nome ?? "").trim();
    const cpf = cpfParaBanco(e.valores.cpf);
    const email = textoOuNulo(e.valores.email);
    const telefone = textoOuNulo(e.valores.telefone);
    const nascimento = dataParaBanco(e.valores.data_nascimento);

    if (e.acao === "insert") {
      const linhas = (await this.db.execute(sql`
        insert into as_candidatos (nome, cpf, email, telefone, data_nascimento, origem)
        values (${nome}, ${cpf}, ${email}, ${telefone}, ${nascimento}, 'PANDAPE')
        returning id
      `)) as unknown as { id: string }[];
      const criada = linhas[0];
      if (!criada) throw new Error("O cadastro do candidato não devolveu linha.");
      return { linhasAfetadas: 1, id: criada.id };
    }

    const id = String(e.onde?.id ?? "");
    if (id === "") throw new Error("Atualização de candidato sem linha alvo.");
    const linhas = (await this.db.execute(sql`
      update as_candidatos
         set nome = ${nome},
             cpf = ${cpf},
             email = ${email},
             telefone = ${telefone},
             data_nascimento = ${nascimento}
       where id = ${id}::uuid
         and anonimizado_em is null
         and (nome, cpf, email, telefone, data_nascimento)
             is distinct from (${nome}, ${cpf}, ${email}, ${telefone}, ${nascimento}::date)
      returning id
    `)) as unknown as { id: string }[];
    if (linhas.length > 0) return { linhasAfetadas: 1, id };

    // ZERO LINHA TEM DUAS CAUSAS, E ELAS NÃO SÃO A MESMA COISA: reentrega idêntica (o normal, e o
    // que a trava do DIARIO exige) ou ficha anonimizada (recusa). Distinguir custa uma leitura e é
    // o que impede a segunda de passar por sucesso.
    const anonimizada = (await this.db.execute(sql`
      select 1 as marca from as_candidatos where id = ${id}::uuid and anonimizado_em is not null
    `)) as unknown as { marca: number }[];
    if (anonimizada.length > 0) {
      throw new Error("Cadastro anonimizado pela retenção: a ingestão não regrava dado pessoal.");
    }
    return { linhasAfetadas: 0, id };
  }

  /** A identidade é IMUTÁVEL: existindo o par (fonte, identificador), nada é reescrito. */
  private async escreverIdentidade(e: Escrita): Promise<{ linhasAfetadas: number; id: string }> {
    const fonte = String(e.valores.fonte);
    const identificador = String(e.valores.identificador);
    const candidatoId = String(e.valores.candidato_id);
    const coletadoEm = String(e.valores.coletado_em ?? new Date().toISOString());
    const linhas = (await this.db.execute(sql`
      insert into as_identidades_externas (candidato_id, fonte, identificador, coletado_em)
      values (${candidatoId}::uuid, ${fonte}, ${identificador}, ${coletadoEm}::timestamptz)
      on conflict (fonte, identificador) do nothing
      returning id
    `)) as unknown as { id: string }[];
    const criada = linhas[0];
    if (criada) return { linhasAfetadas: 1, id: criada.id };
    const existente = (await this.db.execute(sql`
      select id from as_identidades_externas
       where fonte = ${fonte} and identificador = ${identificador} limit 1
    `)) as unknown as { id: string }[];
    return { linhasAfetadas: 0, id: existente[0]?.id ?? "" };
  }

  /**
   * A CANDIDATURA, E AQUI O `on conflict` DO BANCO NÃO SERVE.
   *
   * ┌─ POR QUE A BUSCA É EXPLÍCITA, E NÃO UM `on conflict (candidato_id, vaga_id)` ───────────────┐
   * │ O unique daquele par é PARCIAL, restrito às situações VIVAS (`uq_as_candidaturas_viva`). Uma │
   * │ candidatura já DESCARTADA fica FORA do índice, então o `on conflict` não a enxergaria e a    │
   * │ ingestão inseriria uma linha nova a cada volta: 48 linhas por dia por pessoa descartada, sem │
   * │ nada falhar, porque cada uma delas é legítima para o banco. A busca por (candidato, vaga)    │
   * │ alcança as duas populações, e a corrida entre duas voltas não existe porque a fila tem       │
   * │ concorrência 1.                                                                               │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ A TRAVA DE PRECEDENCIA: O ATS NAO ESCREVE MAIS EM CANDIDATURA QUE JA EXISTE (30/09/2026) ──┐
   * │ ESTE MÉTODO TINHA UM `update` E ELE FOI REMOVIDO INTEIRO, não afrouxado. O que havia era      │
   * │   `set etapa = ..., situacao = ..., motivo_descarte = ...`                                    │
   * │   `where id = ... and (atuais) is distinct from (novos)`                                      │
   * │ e aquele `is distinct from` NÃO ERA PROTEÇÃO, ERA O GATILHO: existia só para não empurrar     │
   * │ `atualizado_em` numa reentrega idêntica, e comparava VALOR com VALOR, nunca AUTOR com AUTOR.  │
   * │ Não há coluna de autor nem carimbo de procedência em `as_candidaturas`. O time avançava a     │
   * │ pessoa três etapas, ninguém tocava no ATS, e em até 30 minutos ela VOLTAVA, em loop, em 24    │
   * │ das 27 pastas do de/para. E SEM NADA FALHAR: a ingestão não escreve em                        │
   * │ `as_candidatura_etapas`, então a trilha continuava dizendo "foi para Entrevista Cliente"      │
   * │ enquanto a coluna dizia CAPTACAO, e nenhuma tela comparava as duas.                           │
   * │                                                                                              │
   * │ OS TRÊS CAMPOS SÃO PROTEGIDOS, E `motivo_descarte` ENTRA JUNTO DE PROPÓSITO: ele é a MESMA    │
   * │ decisão de descarte que `situacao`, e o que o ATS traz é a frase GENÉRICA do de/para          │
   * │ (`motivo_padrao`, uma linha de configuração igual para todo mundo daquela pasta). Escrevê-la  │
   * │ apagaria o motivo de CATÁLOGO que o time escolheu para aquela pessoa (`motivos_descarte`,     │
   * │ migration 0129), trocando informação específica por rótulo de lote. Proteger `situacao` e     │
   * │ deixar o motivo passar produziria o pior dos dois: a pessoa descartada pelo motivo certo, com │
   * │ a justificativa reescrita pela frase do ATS.                                                  │
   * │                                                                                              │
   * │ CONSEQUÊNCIA QUE IMPORTA E NÃO É ÓBVIA: a ingestão deixa de empurrar                          │
   * │ `as_candidaturas.atualizado_em` em linha existente, que é o relógio do expurgo                │
   * │ (`retencao-candidatos.service.ts`). A direção é a SEGURA e é a que o DIARIO já pedia: a trava │
   * │ antiga existia para o relógio não ser empurrado 48 vezes por dia, e agora ele não é empurrado │
   * │ NENHUMA. Ninguém deixa de expirar por causa da varredura.                                     │
   * │                                                                                              │
   * │ O NASCIMENTO CONTINUA ESCREVENDO NORMALMENTE: no insert não existe trabalho manual a          │
   * │ proteger, e é o ATS quem está trazendo a pessoa.                                              │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A ETAPA INICIAL ENTRA SÓ NO NASCIMENTO. Duas linhas semeadas do de/para resolvem apenas o
   * DESFECHO (`Descartados`, `RETORNO NEGATIVO`) e `as_candidaturas.etapa` é NOT NULL: a linha nova
   * precisa nascer em algum caneco, e quem responde é o catálogo, nunca um literal.
   */
  private async escreverCandidatura(e: Escrita): Promise<ResultadoDaEscrita> {
    const candidatoId = String(e.valores.candidato_id);
    const vagaId = String(e.valores.vaga_id);
    const temEtapa = "etapa" in e.valores;
    const temSituacao = "situacao" in e.valores;
    const temMotivo = "motivo_descarte" in e.valores;
    const etapa = temEtapa ? String(e.valores.etapa) : null;
    const situacao = temSituacao ? String(e.valores.situacao) : null;
    const motivo = temMotivo ? textoOuNulo(e.valores.motivo_descarte) : null;

    /*
     * A LEITURA TRAZ OS VALORES ATUAIS, e não só o id, e é isso que permite comparar os dois lados
     * AQUI. O ciclo só conhece o lado do ATS: pedir a ele que decidisse a precedência exigiria uma
     * leitura a mais por inscrição, e a decisão ficaria longe do ponto que escreve.
     *
     * `admissao_id` SAIU DESTE SELECT EM 02/10/2026, e é a única coluna que saiu: ela vinha na mesma
     * ida só para alimentar a retentativa da ponte da varredura para a admissão. A varredura deixou
     * de criar admissão (o gatilho é o da esteira, e não o das ATS), a ponte foi removida, e ler uma
     * coluna que ninguém mais consulta é o convite para o próximo leitor achar que falta um uso.
     * As quatro que ficam são os valores que a TRAVA DE PRECEDÊNCIA compara, e essa trava não mudou.
     */
    const existentes = (await this.db.execute(sql`
      select id, etapa, situacao, motivo_descarte
        from as_candidaturas
       where candidato_id = ${candidatoId}::uuid and vaga_id = ${vagaId}::uuid
       order by criado_em desc
       limit 1
    `)) as unknown as {
      id: string;
      etapa: string | null;
      situacao: string | null;
      motivo_descarte: string | null;
    }[];
    const existente = existentes[0];

    if (!existente) {
      /*
       * ┌─ A DUPLICATA POR TRANSFERENCIA, E ELA É RESOLVIDA SEM RESSUSCITAR NENHUMA COLUNA ───────┐
       * │ O time TROCA a pessoa de vaga (`trocarVaga`, na Central de Candidatos). O ATS continua   │
       * │ com ela na vaga ANTIGA, então a volta seguinte não encontra candidatura em (candidato,   │
       * │ vaga antiga) e INSERE uma nova: a pessoa passa a estar nas duas vagas, consumindo duas   │
       * │ posições, e a transferência é desfeita por acréscimo em vez de por sobrescrita.          │
       * │                                                                                          │
       * │ `as_candidaturas.id_match_pandape` NAO É RESSUSCITADO. A migration 0112 o derrubou por    │
       * │ motivo de LGPD registrado: identidade externa tem UM dono no módulo A&S,                  │
       * │ `as_identidades_externas`, que já nasce dentro do alcance do expurgo, e uma segunda       │
       * │ gaveta de identificador de terceiro ficava fora dele. Reviver a coluna reabre o furo.     │
       * │                                                                                          │
       * │ O JEITO QUE USA DADO QUE JA EXISTE: `trocarVaga` grava `vaga_de` e `vaga_para` na trilha  │
       * │ `as_candidatura_etapas`. Havendo evento com `vaga_de = <esta vaga>` para uma candidatura  │
       * │ DESTA pessoa, ela foi tirada dali DE PROPÓSITO, por gente, com autor e data. O EA vence:  │
       * │ não insere, e registra divergência.                                                       │
       * │                                                                                          │
       * │ ISTO É LEITURA DA TRILHA, e não escrita: a lista fail-closed do despacho governa ESCRITA, │
       * │ e `as_candidatura_etapas` continua fora dela.                                             │
       * └─────────────────────────────────────────────────────────────────────────────────────────┘
       */
      const transferida = await this.transferenciaParaFora(candidatoId, vagaId);
      if (transferida) {
        await this.registrarDivergencia({
          escopo: "CANDIDATURA",
          campo: "vaga_do_candidato",
          candidaturaId: transferida.candidaturaId,
          vagaId,
          valorEa: transferida.rotuloDaVagaAtual,
          valorAts: transferida.rotuloDaVagaDoAts,
        });
        return {
          linhasAfetadas: 0,
          /*
           * O ID DEVOLVIDO É O DA CANDIDATURA QUE EXISTE, na vaga para onde a pessoa foi. Ela é a
           * candidatura DESTA pessoa, só não é a desta vaga. `criada: false` é o que importa: nada
           * NASCEU nesta escrita, e nada se afirma sobre a situação de uma linha que não é a desta
           * escrita.
           */
          id: transferida.candidaturaId,
          criada: false,
          divergencias: 1,
        };
      }

      const inicial = etapa ?? (await this.etapas.etapaInicial()).codigo;
      const linhas = (await this.db.execute(sql`
        insert into as_candidaturas (candidato_id, vaga_id, etapa, situacao, motivo_descarte)
        values (
          ${candidatoId}::uuid,
          ${vagaId}::uuid,
          ${inicial},
          coalesce(${situacao}::candidatura_situacao, 'ATIVO'::candidatura_situacao),
          ${motivo}
        )
        returning id
      `)) as unknown as { id: string }[];
      const criada = linhas[0];
      if (!criada) throw new Error("A candidatura não devolveu linha.");
      /*
       * `criada: true` É O ÚNICO PONTO DO SISTEMA QUE AFIRMA O NASCIMENTO DESTA LINHA, e ele NÃO é
       * dedutível de `linhasAfetadas`, que vale 1 aqui e também valia 1 no `update` que mudou algo.
       *
       * DESDE 02/10/2026 ELE NÃO TEM LEITOR: quem o lia era a ponte da varredura para a admissão,
       * removida porque o gatilho que envia para admissão é o da esteira, e não o das ATS. Ficou
       * porque é a resposta honesta do repositório sobre a própria escrita e tem cobertura própria;
       * removê-lo é decisão do coordenador, e não efeito colateral de outra frente.
       */
      return { linhasAfetadas: 1, id: criada.id, criada: true, divergencias: 0 };
    }

    /*
     * ─ A LINHA JA EXISTE: NADA É ESCRITO, E A DIFERENÇA VIRA FILA ───────────────────────────────
     *
     * `protegido: true` nos três campos, sem exceção e sem condição. A comparação vem ANTES da
     * proteção dentro de `decidirPrecedencia`, e é isso que impede a fila de virar log: o ATS
     * concordando com o EA (a maioria das voltas) devolve `NADA` e não abre linha nenhuma.
     *
     * CAMPO QUE O DE/PARA NÃO TRAZ NÃO DIVERGE. Pasta mapeada só para desfecho não fala de etapa, e
     * "o ATS não disse nada" não é discordância: seria uma linha de revisão por ausência, em toda
     * volta, para toda pasta de desfecho.
     */
    let divergencias = 0;
    if (temEtapa) {
      divergencias += await this.divergenciaDeCandidatura(existente, vagaId, "etapa", etapa);
    }
    if (temSituacao) {
      divergencias += await this.divergenciaDeCandidatura(existente, vagaId, "situacao", situacao);
    }
    /*
     * ┌─ `motivo_descarte` E PROTEGIDO E **NAO** VIRA LINHA DE FILA (veto do `seguranca`, 30/09) ──┐
     * │ A TRAVA DELE ESTA ACIMA, e é a mais forte das três: ele simplesmente NÃO ENTRA em `update`   │
     * │ nenhum, porque este método já não emite `update` de candidatura existente. `temMotivo` é     │
     * │ lido e descartado de propósito: o valor do ATS chega, é comparado por ninguém e morre aqui.  │
     * │                                                                                             │
     * │ O QUE NAO ACONTECE É A LINHA DE FILA, e a razão é §A.6: a fila guarda `valor_ea`/`valor_ats` │
     * │ EM CLARO, e aquele campo é PROSA no `ENVIADO_PARA_ADMISSAO` (`candidatos.dto.ts`, teto de 500│
     * │ caracteres). O expurgo NULA a coluna na candidatura                                          │
     * │ (`retencao-candidatos.service.ts`, na mesma CTE do resumo de contato), mas ele ANONIMIZA sem │
     * │ DELETAR a candidatura, então o `on delete cascade` da tabela da fila NUNCA dispararia: a     │
     * │ frase ficaria lá, em claro, para sempre. "Vem por JOIN" não cobriria: seria COPIA.           │
     * │                                                                                             │
     * │ CONSEQUENCIA ACEITA, e ela fica escrita para ninguém "consertar" isto depois: a divergência  │
     * │ de motivo é SILENCIOSA. O EA vence e o time não é avisado. O preço de avisar seria publicar  │
     * │ prosa numa superfície sem expurgo, e o veto foi por aí. Para o valor voltar à tela, a coluna │
     * │ precisa primeiro entrar na rotina de expurgo, e isso é decisão do diretor (§A.31).           │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    void temMotivo;
    void motivo;

    /*
     * `linhasAfetadas: 0` É A VERDADE, e o ciclo a lê como "nada foi criado" (ele soma
     * `candidaturasCriadas` por este número).
     *
     * `situacaoNoEa` E `jaTemAdmissao` SAÍRAM DAQUI EM 02/10/2026. Eles eram o insumo da retentativa
     * da ponte da varredura para a admissão, e só dela: devolver a situação atual e "já tem
     * admissão?" existia para decidir se abria pré-admissão nesta volta. A varredura não cria mais
     * admissão (o gatilho é o da esteira, e não o das ATS), então os dois ficaram sem leitor, e
     * sinal morto que aponta para a borda da criação de admissão é a armadilha que esta frente
     * inteira existe para fechar.
     */
    return {
      linhasAfetadas: 0,
      id: existente.id,
      criada: false,
      divergencias,
    };
  }

  /**
   * UM CAMPO DA CANDIDATURA EXISTENTE, COMPARADO PELA RÉGUA DO DOMÍNIO. Devolve 1 quando abriu (ou
   * incrementou) linha de revisão, e 0 quando os dois lados concordam.
   *
   * A RÉGUA NÃO É UM `if` AQUI: `decidirPrecedencia` é a MESMA função que o lado da VAGA consulta, e
   * é ela que normaliza os dois lados antes de comparar (número contra texto, nulo contra vazio).
   * Duas comparações escritas à mão divergiriam na primeira correção de uma só delas.
   */
  private async divergenciaDeCandidatura(
    existente: { id: string; etapa: string | null; situacao: string | null },
    vagaId: string,
    /*
     * DOIS CAMPOS, E NAO TRES: `motivo_descarte` é PROTEGIDO mas NÃO é `CampoDeDivergencia` (veto do
     * `seguranca`, ver `escreverCandidatura`). O tipo vem do domínio, e não de uma união escrita aqui,
     * para que acrescentar o terceiro exija passar pela lista que carrega o motivo do veto.
     */
    campo: CampoDeDivergenciaDaCandidatura,
    valorAts: string | null,
  ): Promise<number> {
    const valorEa = campo === "etapa" ? existente.etapa : existente.situacao;
    if (decidirPrecedencia({ protegido: true, valorEa, valorAts }) !== "DIVERGIR") return 0;
    await this.registrarDivergencia({
      escopo: "CANDIDATURA",
      campo,
      candidaturaId: existente.id,
      vagaId,
      valorEa: valorDeComparacao(valorEa),
      valorAts: valorDeComparacao(valorAts),
    });
    return 1;
  }

  /**
   * A PESSOA FOI TRANSFERIDA PARA FORA DESTA VAGA, POR GENTE? A pergunta é feita à TRILHA.
   *
   * O evento de troca (`trocarVaga`) grava `vaga_de` e `vaga_para` em `as_candidatura_etapas`, e o
   * `vaga_de` é o registro de que alguém tirou a pessoa DAQUELA vaga. A busca é por candidatura DESTA
   * pessoa (o join), e não por candidatura desta vaga: a linha da vaga antiga já não existe, porque
   * a troca MOVE a candidatura em vez de duplicá-la.
   *
   * §A.6: o rótulo devolvido é o CÓDIGO da vaga, com o id como último recurso. `nome_divulgacao`
   * NÃO é usado: é texto livre digitado no ATS, e a casa já mediu que campo assim chega com nome de
   * gente dentro (ver a narrativa da reabertura, neste mesmo arquivo).
   */
  private async transferenciaParaFora(
    candidatoId: string,
    vagaId: string,
  ): Promise<{
    candidaturaId: string;
    rotuloDaVagaAtual: string | null;
    rotuloDaVagaDoAts: string | null;
  } | null> {
    const linhas = (await this.db.execute(sql`
      select c.id as candidatura_id,
             coalesce(atual.codigo, atual.id::text) as rotulo_atual,
             coalesce(origem.codigo, origem.id::text) as rotulo_origem
        from as_candidatura_etapas ev
        join as_candidaturas c on c.id = ev.candidatura_id
        left join vagas atual on atual.id = c.vaga_id
        left join vagas origem on origem.id = ev.vaga_de
       where c.candidato_id = ${candidatoId}::uuid
         and ev.vaga_de = ${vagaId}::uuid
       order by ev.criado_em desc
       limit 1
    `)) as unknown as {
      candidatura_id: string;
      rotulo_atual: string | null;
      rotulo_origem: string | null;
    }[];
    const achada = linhas[0];
    if (!achada) return null;
    return {
      candidaturaId: achada.candidatura_id,
      rotuloDaVagaAtual: achada.rotulo_atual,
      rotuloDaVagaDoAts: achada.rotulo_origem,
    };
  }

  /**
   * A VAGA ESPELHADA: nasce no papel REVISAO (a FILA de quem chegou sem cliente), casa pela MATRÍCULA
   * da varredura, e REABRE só o que a própria varredura encerrou, sem pular a fila.
   *
   * ┌─ A FRONTEIRA DE PROPRIEDADE, E ELA É A MESMA NOS QUATRO PONTOS ──────────────────────────────┐
   * │ Busca, reabertura, matrícula e encerramento leem a MESMA régua: a linha de `as_varredura_vagas`│
   * │ que aponta para AQUELA vaga (`m.vaga_id = v.id`). O motivo é que `vagas.id_vacancy_pandape` é  │
   * │ coluna DIGITADA por gente na trilha da vaga, com índice NÃO unique (o schema registra a        │
   * │ decisão): casar por ela é adotar, em silêncio, vaga que a varredura não criou. Medido: a vaga  │
   * │ fechada por um humano, com candidatura viva dentro, voltava a ABERTA com `encerrada_em = null` │
   * │ a cada 30 minutos, e o `codigo` e o `nome_divulgacao` digitados eram sobrescritos pelo ATS.    │
   * │ Com o carimbo limpo, a cláusula `... or v.encerrada_em is null` do expurgo protege TODO MUNDO  │
   * │ dentro dela para sempre, que é o furo 1 renascendo por uma quarta porta.                       │
   * │                                                                                                │
   * │ A MATRÍCULA ACONTECE SÓ NO NASCIMENTO, e é isso que faz o `exists` do encerramento separar     │
   * │ alguma coisa: matricular toda vaga VARRIDA (o que a marca de água fazia) adotava a vaga        │
   * │ digitada por gente na primeira passada, e a encerrava com `encerrada_em = now()` assim que ela │
   * │ saísse das ativas do ATS, ligando relógio de exclusão irreversível sobre gente de outro dono.  │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ O NÚMERO DO ATS DIGITADO POR GENTE É CONFLITO, NUNCA ADOÇÃO ────────────────────────────────┐
   * │ Existindo vaga com aquele `IdVacancy` SEM matrícula, a ingestão RECUSA a vaga inteira e LANÇA. │
   * │ Quem chama conta o erro e registra o número da vaga no log (nenhum dado pessoal), e a volta    │
   * │ segue nas outras. As duas saídas automáticas eram piores: adotar mexe no que o consultor       │
   * │ digitou, e criar uma segunda linha com o mesmo número duplica a vaga e parte as candidaturas   │
   * │ entre as duas. Quem decide é gente.                                                            │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ O `status` QUE CHEGA É UM PAPEL, E A TRADUÇÃO ACONTECE AQUI ────────────────────────────────┐
   * │ O código é editável pelo diretor e o papel é do sistema: é a régua que `vagas.service` já     │
   * │ segue (`ehDoPapel`, `codigoDoPapel`). Um literal `'RASCUNHO'` gravado direto pararia de valer │
   * │ no dia em que o catálogo fosse renomeado, e o FK RESTRICT derrubaria a ingestão inteira.      │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ A REABERTURA SÓ DESFAZ O QUE A PRÓPRIA VARREDURA ESCREVEU ──────────────────────────────────┐
   * │ Não basta o papel ser FECHAMENTO: o carimbo `vagas.encerrada_em` tem de ser EXATAMENTE o      │
   * │ instante que a varredura gravou em `as_varredura_vagas.encerrada_pela_varredura_em`. FECHADA  │
   * │ por humano é o caso comum, e antes desta guarda não estava protegido: a vaga que alguém       │
   * │ acabou de fechar voltava a ABERTA na volta seguinte. Cancelamento e entrega também ficam onde │
   * │ estão, e a comparação por instante cobre até o caso de um humano fechar de novo o que a       │
   * │ varredura já tinha fechado antes: o carimbo passa a ser o dele, e a varredura não mexe.       │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  private async escreverVaga(e: Escrita): Promise<ResultadoDaEscrita> {
    const idVacancy = String(e.valores.id_vacancy_pandape);
    const codigo = textoOuNulo(e.valores.codigo);
    const nomeDivulgacao = textoOuNulo(e.valores.nome_divulgacao);
    const cidadeId = await this.cidadePorTexto(e.valores.cidade_id);
    // O CHECK do banco é `posicoes_oficiais > 0`, e a coluna é NULÁVEL: zero e negativo viram
    // AUSÊNCIA, que é a verdade ("a vaga não disse quantas"), em vez de derrubar a linha inteira.
    const posicoes = inteiroPositivo(e.valores.posicoes_oficiais);
    const regua = await this.vagaStatus.regua();
    /*
     * ┌─ O ESPELHO NASCE NA FILA DE REVISÃO, E O CÓDIGO VEM DO PAPEL ───────────────────────────────┐
     * │ Antes ele nascia no papel RASCUNHO, e ali ficava indistinguível da vaga que um consultor     │
     * │ começou a digitar: ninguém sabia que faltava vincular o cliente, e o espelho inteiro ficava  │
     * │ parado sem nenhuma tela acusar. O papel REVISAO existe para essa distinção, e a pergunta ao  │
     * │ catálogo é a mesma de sempre: o CÓDIGO é editável pelo diretor, o PAPEL é do sistema.        │
     * │                                                                                              │
     * │ ELE LANÇA QUANDO FALTA, E SÓ É PERGUNTADO POR QUEM VAI ESCREVÊ-LO. Sem a linha no catálogo   │
     * │ (banco sem a migration 0115), o caminho que precisa dela PARA com uma frase, em vez de       │
     * │ empurrar um código que a FK RESTRICT recusaria no meio de uma varredura de 137 mil           │
     * │ inscrições, onde o chamador engole o erro e soma um contador. Catálogo incompleto é problema │
     * │ de INSTALAÇÃO. A pergunta é PREGUIÇOSA de propósito: a volta que só atualiza título e cidade │
     * │ não escreve status nenhum, e fazê-la depender de uma linha que ela não usa transformaria uma │
     * │ lacuna de catálogo em queda de escrita rotineira.                                            │
     * └──────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const codigoDaFila = () => regua.codigoDoPapel("REVISAO");

    /*
     * UMA CONSULTA RESPONDE AS DUAS PERGUNTAS: existe vaga com este número, e ela é DA VARREDURA.
     * O `order by` prefere a matriculada, para o caso em que as duas linhas coexistam (a digitada
     * por gente veio antes, a varredura criou a sua depois de o conflito ser resolvido à mão).
     */
    const existentes = (await this.db.execute(sql`
      select v.id,
             v.status,
             -- OS QUATRO CAMPOS ATUAIS, e eles entraram em 30/09/2026 com a TRAVA DE PRECEDENCIA:
             -- vaga JA LIBERADA nao e mais sobrescrita pelo ATS, e comparar os dois lados exige
             -- saber o que esta gravado. Vem na MESMA ida, porque uma segunda consulta por vaga
             -- pagaria uma viagem a mais em toda volta da varredura.
             v.codigo,
             v.nome_divulgacao,
             v.cidade_id,
             v.posicoes_oficiais,
             -- O DESTINO DA REABERTURA É O ESTADO DE ANTES DO FECHAMENTO, e é esta coluna que o
             -- guarda, escrita pelo encerramento automatico na mesma instrucao que fecha a vaga. A
             -- pergunta que estava aqui antes era "tem cliente?", e ela ERRAVA no único caminho em
             -- que a vaga está na fila COM cliente: o Master devolveu a vaga para a fila sem trocar
             -- o cliente. Aquela vaga voltava PUBLICADA, com o vínculo que ele pôs em dúvida.
             m.status_antes_do_encerramento as status_antes,
             (m.vaga_id is not null) as da_varredura,
             (m.encerrada_pela_varredura_em is not null
              and v.encerrada_em is not distinct from m.encerrada_pela_varredura_em) as encerrou
        from vagas v
        left join as_varredura_vagas m on m.vaga_id = v.id
       where v.id_vacancy_pandape = ${idVacancy}
       order by (m.vaga_id is not null) desc
       limit 1
    `)) as unknown as {
      id: string;
      status: string;
      codigo: string | null;
      nome_divulgacao: string | null;
      cidade_id: number | null;
      posicoes_oficiais: number | null;
      status_antes: string | null;
      da_varredura: boolean;
      encerrou: boolean;
    }[];
    const existente = existentes[0];

    if (!existente) {
      /*
       * ┌─ O CARGO É RESOLVIDO SÓ AQUI, NO NASCIMENTO, E NUNCA NA VOLTA SEGUINTE ─────────────────┐
       * │ Escrever o cargo no `update` sobrescreveria, de 30 em 30 minutos, o cargo que uma PESSOA │
       * │ escolheu na liberação da vaga: quem conferiu o cliente e ajustou o cargo veria o ATS      │
       * │ desfazer a escolha sem autor, sem data e sem trilha. Pela mesma razão `cargo_id` NÃO      │
       * │ entra no `comparaAntes` do ciclo: incluir a coluna faria a comparação "algo mudou?" dar   │
       * │ verdadeiro em toda volta da vaga já liberada, e cada volta empurraria `atualizado_em`,    │
       * │ que é o relógio do expurgo de quem está dentro dela.                                      │
       * │                                                                                          │
       * │ NÃO CASOU, FICA NULO, como a cidade e como o cliente: a vaga continua nascendo em         │
       * │ `PENDENTE_REVISAO` e o ganho é de PREENCHIMENTO, não de fila. Ninguém sai da revisão por  │
       * │ ter cargo.                                                                                │
       * └──────────────────────────────────────────────────────────────────────────────────────────┘
       */
      const cargoId = await this.cargoPorTexto(e.valores.nome_divulgacao);
      const linhas = (await this.db.execute(sql`
        insert into vagas (
          id_vacancy_pandape, codigo, nome_divulgacao, cidade_id,
          posicoes_oficiais, cod_cliente, cargo_id, status
        )
        values (
          ${idVacancy}, ${codigo}, ${nomeDivulgacao}, ${cidadeId},
          ${posicoes}, null, ${cargoId}::uuid, ${codigoDaFila()}
        )
        returning id
      `)) as unknown as { id: string }[];
      const criada = linhas[0];
      if (!criada) throw new Error("A vaga espelhada não devolveu linha.");
      /*
       * A MATRÍCULA NASCE JUNTO COM A VAGA, E SÓ AQUI. É ela o registro de propriedade, e é dela
       * que os outros três pontos (busca, reabertura, encerramento) leem a fronteira.
       *
       * O `do update` cobre o caso da vaga APAGADA: o `cascade` levou a matrícula junto, e a
       * linha do número pode ter sobrevivido apontando para nada. Reapontar é o certo, e os dois
       * carimbos voltam a zero porque a vaga é outra: a marca de água de uma vaga que não existe
       * mais faria a varredura pular inscrições da vaga nova, e o carimbo de encerramento herdado
       * autorizaria uma reabertura que ninguém pediu.
       */
      await this.db.execute(sql`
        insert into as_varredura_vagas (id_vacancy_pandape, vaga_id)
        values (${idVacancy}, ${criada.id}::uuid)
        on conflict (id_vacancy_pandape) do update
           set vaga_id = excluded.vaga_id,
               ultimo_insert_date = null,
               encerrada_pela_varredura_em = null,
               atualizado_em = now()
      `);
      return { linhasAfetadas: 1, id: criada.id };
    }

    // VAGA DE OUTRO DONO: recusa declarada, e nunca adoção silenciosa. §A.6: só o número do ATS.
    if (!existente.da_varredura) {
      throw new Error(
        `A vaga ${idVacancy} já existe no EA sem ser da varredura: conflito para revisão humana.`,
      );
    }

    const reabrir = existente.encerrou && regua.ehDoPapel(existente.status, "FECHAMENTO");
    /*
     * ┌─ A REABERTURA NÃO CONTORNA A FILA ──────────────────────────────────────────────────────────┐
     * │ Mandar TUDO para ABERTURA abria a porta mais fácil de acionar de todas: bastava a vaga sair  │
     * │ das ativas do ATS e voltar, e a revisão inteira era pulada em silêncio, de 30 em 30 minutos. │
     * │ Quem liberou pela tela, conferindo o cliente, não mandava aqui: o ATS mandava.                │
     * │                                                                                              │
     * │ O DESTINO É O ESTADO ANTERIOR AO FECHAMENTO, guardado por quem fechou                        │
     * │ (`as_varredura_vagas.status_antes_do_encerramento`), e NUNCA um estado deduzido de um campo. │
     * │ A pergunta "tem cliente?", que estava aqui, ERRAVA no único caminho em que a vaga está na    │
     * │ fila COM cliente: o Master a devolveu para a fila sem trocar o cliente ("este vínculo está   │
     * │ errado, alguém confira"). Saindo das ativas e voltando, ela ressuscitava PUBLICADA com o     │
     * │ mesmo vínculo posto em dúvida, sem autor, sem data e sem trilha: o ATS desfazendo sozinho a  │
     * │ decisão explícita de uma pessoa, pela porta mais fácil de acionar que existe.                 │
     * └──────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    /*
     * O DESTINO SÓ É RESOLVIDO QUANDO HÁ REABERTURA: resolver o catálogo na volta que não reabre
     * nada faria uma escrita rotineira depender de uma linha que ela não usa, e o fail-closed do
     * catálogo passaria a derrubar o que nem mexe em status.
     *
     * ┌─ O GUARDADO É CONFERIDO CONTRA O CATÁLOGO, E O FALLBACK É A FILA ──────────────────────────┐
     * │ O código guardado não tem FK (ver o schema): o diretor pode ter apagado aquela linha do     │
     * │ catálogo no meio do caminho, e gravá-la de volta cairia na FK RESTRICT de `vagas.status`,   │
     * │ derrubando a volta inteira. Status que ENCERRA também não serve de destino: reabrir para um │
     * │ estado de fechamento deixaria a vaga viva afirmando que acabou. Nos dois casos o destino é  │
     * │ a FILA, que é o fail-closed certo: revisar de novo custa um clique, e publicar sem revisão  │
     * │ custa o furo inteiro.                                                                        │
     * └──────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const guardado = (existente.status_antes ?? "").trim();
    const destino = !reabrir
      ? null
      : guardado !== "" && regua.existe(guardado) && !regua.linha(guardado).encerra
        ? guardado
        : codigoDaFila();
    const reabertura = destino ? sql`status = ${destino}, encerrada_em = null, ` : sql``;
    /*
     * A REABERTURA ESCREVE MESMO SEM MUDANÇA DE CAMPO, e é por isso que ela entra no `where` como
     * um OU: a vaga pode voltar às ativas com o mesmo título e a mesma cidade, e nesse caso a
     * comparação campo a campo diria "nada mudou" e o `encerrada_em` ficaria carimbado numa vaga
     * viva. O relógio de retenção de quem está dentro dela continuaria correndo.
     *
     * O CARIMBO DA MATRÍCULA NÃO PRECISA SER LIMPO: com `vagas.encerrada_em` nulo, a comparação
     * `is not distinct from` já devolve falso na volta seguinte, e o instante guardado continua
     * sendo o registro de que foi a varredura quem encerrou daquela vez.
     */
    /*
     * ┌─ A TRAVA DE PRECEDENCIA DA VAGA: VAGA JA LIBERADA NAO E SOBRESCRITA (30/09/2026) ──────────┐
     * │ Os quatro campos do ATS (`codigo`, `nome_divulgacao`, `cidade_id`, `posicoes_oficiais`) só  │
     * │ são escritos ENQUANTO A VAGA AINDA ESTA EM REVISAO. Na fila, ninguém conferiu nada ali e o  │
     * │ espelho do ATS é a melhor informação que existe; depois da LIBERAÇÃO, cada um daqueles       │
     * │ campos foi olhado por gente, e reescrevê-los de 30 em 30 minutos desfaz a conferência sem   │
     * │ autor, sem data e sem trilha. É a MESMA razão pela qual `cargo_id` já era escrito só no     │
     * │ nascimento (ver o bloco do insert, acima): a trava nova estende ao resto o que ele provou.  │
     * │                                                                                            │
     * │ "JA LIBERADA" É PERGUNTADO PELO PAPEL, NUNCA POR LITERAL, e a régua é a mesma que este      │
     * │ método já usa para tudo (`regua.ehDoPapel` / `codigoDoPapel`): o CÓDIGO é editável pelo     │
     * │ diretor, o PAPEL é do sistema. Um `status !== 'PENDENTE_REVISAO'` escrito aqui pararia de   │
     * │ valer no dia em que a linha do catálogo fosse recadastrada com outro código, e a trava      │
     * │ falharia para o lado ERRADO: voltaria a sobrescrever vaga liberada, em silêncio.            │
     * │                                                                                            │
     * │ A REABERTURA CONTINUA INTEIRA, e ela é outra coisa: `status` e `encerrada_em` NÃO são campos │
     * │ do ATS, são o ciclo de vida do espelho, e a vaga que voltou às ativas do ATS tem de deixar  │
     * │ de estar encerrada mesmo estando liberada (senão o relógio do expurgo de quem está dentro   │
     * │ dela fica carimbado numa vaga viva). O que a trava tira do `set` são os quatro campos, e    │
     * │ nada além deles.                                                                            │
     * └───────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const emRevisao = regua.ehDoPapel(existente.status, "REVISAO");
    const divergenciasDaVaga = emRevisao
      ? 0
      : await this.divergenciasDaVaga(existente, {
          codigo,
          nome_divulgacao: nomeDivulgacao,
          cidade_id: cidadeId,
          posicoes_oficiais: posicoes,
        });
    const camposDoAts = emRevisao
      ? sql`codigo = ${codigo},
             nome_divulgacao = ${nomeDivulgacao},
             cidade_id = ${cidadeId},
             posicoes_oficiais = ${posicoes},
             `
      : sql``;
    const houveMudanca = sql`(codigo, nome_divulgacao, cidade_id, posicoes_oficiais)
              is distinct from (${codigo}, ${nomeDivulgacao}, ${cidadeId}::integer, ${posicoes}::integer)`;
    /*
     * ┌─ A VOLTA QUE NAO TEM O QUE ESCREVER NAO MANDA `update` NENHUM ─────────────────────────────┐
     * │ Vaga LIBERADA e sem reabertura: os quatro campos estão travados e o status não muda, então  │
     * │ o único efeito de emitir a instrução seria empurrar `atualizado_em`, que é o relógio do     │
     * │ expurgo de quem está dentro da vaga. Um `set atualizado_em = now()` sozinho, 48 vezes por   │
     * │ dia, é exatamente o defeito que a trava do DIARIO existe para impedir, com outro nome.      │
     * └───────────────────────────────────────────────────────────────────────────────────────────┘
     */
    if (!emRevisao && destino === null) {
      return { linhasAfetadas: 0, id: existente.id, divergencias: divergenciasDaVaga };
    }
    const movimento = sql`
      update vagas
         set ${camposDoAts}${reabertura}atualizado_em = now()
       where id = ${existente.id}::uuid
         and ${reabrir ? sql`true` : houveMudanca}
      returning id`;
    /*
     * ┌─ A REABERTURA DEIXA TRILHA, E ELA VAI NA MESMA INSTRUÇÃO DO MOVIMENTO ────────────────────┐
     * │ Antes o movimento era MUDO: a vaga trocava de status por decisão do ATS e a linha do tempo │
     * │ dela não registrava nada, então ninguém tinha como saber que aquele status não foi posto   │
     * │ por gente. Em CTE, e não em duas chamadas, porque o repositório escreve fora de transação: │
     * │ separadas, a segunda podendo falhar, existiria vaga movida sem o registro do movimento.    │
     * │                                                                                            │
     * │ `por_id` É NULO, e isso é a verdade: não houve autor humano. Inventar um usuário de sistema │
     * │ já está VETADO nesta frente, e faria a trilha afirmar que ALGUÉM moveu o que ninguém moveu. │
     * │                                                                                            │
     * │ §A.6: a narrativa tem dois CÓDIGOS DE STATUS e mais nada. Nenhum texto vindo do ATS entra   │
     * │ aqui: título de vaga é digitado lá fora e já chegou com nome de gente dentro.               │
     * └──────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const instrucao =
      destino === null
        ? movimento
        : sql`
          with movida as (${movimento})
          insert into as_vaga_status_eventos (vaga_id, de, para, por_id, observacao)
          select id, ${existente.status}, ${destino}, null, ${narrativaDaReabertura(existente.status, destino)}
            from movida
          returning vaga_id as id`;
    const linhas = (await this.db.execute(instrucao)) as unknown as { id: string }[];
    return {
      linhasAfetadas: linhas.length > 0 ? 1 : 0,
      id: existente.id,
      divergencias: divergenciasDaVaga,
    };
  }

  /**
   * OS QUATRO CAMPOS DA VAGA JA LIBERADA, COMPARADOS PELA RÉGUA DO DOMÍNIO. Devolve quantas linhas de
   * revisão foram abertas (ou incrementadas).
   *
   * O NOME DO CAMPO NA FILA NÃO É O NOME DA COLUNA, e a diferença é do contrato: a coluna é
   * `cidade_id` e o campo da fila é `vaga_cidade`, porque a tela mostra "Cidade Da Vaga" e o
   * vocabulário compartilhado (`CAMPOS_DE_DIVERGENCIA`) precisa distinguir campo de vaga de campo de
   * candidatura sem prefixo ambíguo. O mapa vive AQUI, num lugar só.
   *
   * §A.6: os quatro valores são código, rótulo de vaga, id de cidade e número. `nome_divulgacao` é
   * texto digitado no ATS, e a casa já mediu que ele chega com nome de gente dentro (a narrativa da
   * reabertura, neste arquivo). ELE ENTRA AINDA ASSIM, e a decisão é declarada: é o campo que a vaga
   * PUBLICA, o time já o lê na tela da vaga, e sem ele a divergência mais comum ("o ATS quer renomear
   * a vaga") seria invisível. O que não entra em lugar nenhum é dado de CANDIDATO.
   */
  private async divergenciasDaVaga(
    existente: {
      id: string;
      codigo: string | null;
      nome_divulgacao: string | null;
      cidade_id: number | null;
      posicoes_oficiais: number | null;
    },
    doAts: {
      codigo: string | null;
      nome_divulgacao: string | null;
      cidade_id: number | null;
      posicoes_oficiais: number | null;
    },
  ): Promise<number> {
    const pares = [
      { campo: "vaga_codigo" as const, ea: existente.codigo, ats: doAts.codigo },
      {
        campo: "vaga_nome_divulgacao" as const,
        ea: existente.nome_divulgacao,
        ats: doAts.nome_divulgacao,
      },
      { campo: "vaga_cidade" as const, ea: existente.cidade_id, ats: doAts.cidade_id },
      {
        campo: "vaga_posicoes_oficiais" as const,
        ea: existente.posicoes_oficiais,
        ats: doAts.posicoes_oficiais,
      },
    ];
    let quantas = 0;
    for (const par of pares) {
      if (decidirPrecedencia({ protegido: true, valorEa: par.ea, valorAts: par.ats }) !== "DIVERGIR") {
        continue;
      }
      await this.registrarDivergencia({
        escopo: "VAGA",
        campo: par.campo,
        candidaturaId: null,
        vagaId: existente.id,
        valorEa: valorDeComparacao(par.ea),
        valorAts: valorDeComparacao(par.ats),
      });
      quantas += 1;
    }
    return quantas;
  }

  /**
   * A marca de água. Escrita só quando ANDA, e quem confere isso é o ciclo.
   *
   * ELA É UM `update`, E NUNCA MAIS UM `insert`, e a diferença é a fronteira de propriedade inteira.
   * Enquanto esta escrita matriculava qualquer vaga VARRIDA, o `exists` do encerramento não separava
   * nada: a vaga digitada por gente entrava na matrícula na primeira passada e era encerrada pela
   * varredura assim que saísse das ativas do ATS. A matrícula nasce no `insert` da vaga espelhada, e
   * só lá. Sem linha matriculada, não há marca a guardar, e zero linha afetada é a resposta certa.
   */
  private async escreverMarca(e: Escrita): Promise<{ linhasAfetadas: number; id: string }> {
    const idVacancy = String(e.valores.id_vacancy_pandape);
    const marca = textoOuNulo(e.valores.ultimo_insert_date);
    const linhas = (await this.db.execute(sql`
      update as_varredura_vagas
         set ultimo_insert_date = ${marca},
             atualizado_em = now()
       where id_vacancy_pandape = ${idVacancy}
         and ultimo_insert_date is distinct from ${marca}
      returning id_vacancy_pandape
    `)) as unknown as { id_vacancy_pandape: string }[];
    return { linhasAfetadas: linhas.length > 0 ? 1 : 0, id: idVacancy };
  }

  /** O conflito de identidade. Uma linha por caso, sem CPF e sem nome (ver o schema da tabela). */
  private async escreverConflito(e: Escrita): Promise<{ linhasAfetadas: number; id: string }> {
    const candidatoId = String(e.valores.candidato_id);
    const fonte = String(e.valores.fonte);
    const identificador = String(e.valores.identificador);
    const linhas = (await this.db.execute(sql`
      insert into as_ingestao_conflitos (candidato_id, fonte, identificador)
      values (${candidatoId}::uuid, ${fonte}, ${identificador})
      on conflict (fonte, identificador) do nothing
      returning id
    `)) as unknown as { id: string }[];
    return { linhasAfetadas: linhas.length > 0 ? 1 : 0, id: linhas[0]?.id ?? "" };
  }

  /**
   * ─ A LINHA DA FILA DE DIVERGENCIAS, E ELA É IDEMPOTENTE POR CONSTRUÇÃO ─────────────────────────
   *
   * ┌─ A REINCIDENCIA INCREMENTA, E NUNCA CRIA LINHA NOVA ────────────────────────────────────────┐
   * │ A varredura roda de 30 em 30 minutos, ou seja até 48 VOLTAS POR DIA, e a mesma discordância   │
   * │ volta em todas elas enquanto ninguém a resolver. Sem esta trava, UMA divergência viraria 48   │
   * │ linhas por dia, e a fila de trabalho viraria log: ninguém resolve uma lista que cresce        │
   * │ sozinha. `ocorrencias` é o número que substitui as 48 linhas, e ele é o que diz ao time quão  │
   * │ persistente é o caso.                                                                         │
   * │                                                                                              │
   * │ A GARANTIA É DO BANCO, e não deste método: os dois índices únicos PARCIAIS da migration 0136  │
   * │ (`uq_..._candidatura_aberta` e `uq_..._vaga_aberta`) é que tornam o `on conflict` possível.   │
   * │ Um `select` seguido de `insert` perderia a corrida entre duas voltas; o `on conflict` não.    │
   * │                                                                                              │
   * │ SAO DOIS `on conflict` PORQUE SAO DOIS INDICES, e a razão é o NULO: em Postgres, nulo não     │
   * │ colide com nulo num índice único, então um índice só sobre `candidatura_id` nunca conflitaria │
   * │ nas linhas de escopo VAGA, e a reincidência abriria linha nova em toda volta. O `where` de    │
   * │ cada `on conflict` REPETE o predicado do índice porque é assim que o Postgres infere qual      │
   * │ índice parcial é o árbitro.                                                                   │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ O QUE O `do update` NAO TOCA, E CADA AUSENCIA É DELIBERADA ────────────────────────────────┐
   * │ `primeira_em` fica onde está: é o "desde quando isto acontece", que é a informação mais útil  │
   * │ da fila e a única que o incremento poderia destruir. `valor_ea` e `valor_ats` SÃO atualizados: │
   * │ a linha tem de mostrar o estado de AGORA, senão o time decidiria sobre um retrato velho e     │
   * │ `ADOTADO_ATS` aplicaria um valor que o ATS já trocou.                                          │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * §A.6: os dois valores são código, rótulo de vaga ou número, garantido pela lista FECHADA
   * `CAMPOS_DE_DIVERGENCIA` e pelo CHECK do banco. Nenhum dado de candidato entra aqui, e este método
   * NÃO loga nada: quem loga é o ciclo, e só a contagem.
   */
  private async registrarDivergencia(d: DivergenciaARegistrar): Promise<{ id: string }> {
    const conflito =
      d.candidaturaId === null
        ? sql`(escopo, vaga_id, campo) where resolvido_em is null and candidatura_id is null`
        : sql`(escopo, candidatura_id, vaga_id, campo)
              where resolvido_em is null and candidatura_id is not null`;
    const linhas = (await this.db.execute(sql`
      insert into as_ingestao_divergencias
        (escopo, campo, candidatura_id, vaga_id, valor_ea, valor_ats)
      values (
        ${d.escopo},
        ${d.campo},
        ${d.candidaturaId}::uuid,
        ${d.vagaId}::uuid,
        ${d.valorEa},
        ${d.valorAts}
      )
      on conflict ${conflito}
      do update set ocorrencias = as_ingestao_divergencias.ocorrencias + 1,
                    ultima_em = now(),
                    valor_ea = excluded.valor_ea,
                    valor_ats = excluded.valor_ats,
                    atualizado_em = now()
      returning id
    `)) as unknown as { id: string }[];
    return { id: linhas[0]?.id ?? "" };
  }

  /**
   * A DIVERGENCIA PEDIDA PELO DESPACHO, para o caso avulso.
   *
   * ELA NÃO TEM CHAMADOR HOJE, e a ausência é a mesma de `candidatoPorNome`: o despacho é a lista que
   * alguém lê para saber o que a ingestão escreve, e tabela escrita por dentro sem aparecer nele
   * tornaria aquela lista mentirosa. Quem registra divergência hoje é `escreverCandidatura` e
   * `escreverVaga`, que chamam `registrarDivergencia` direto porque é lá que os valores ATUAIS do EA
   * estão na mão.
   *
   * O ESCOPO E O CAMPO SÃO VALIDADOS PELO BANCO (os CHECKs da 0136), e não por um `if` aqui: um
   * segundo validador em TypeScript concordaria com o CHECK até a primeira vez que alguém corrigisse
   * um só dos dois.
   */
  private async escreverDivergenciaAvulsa(e: Escrita): Promise<{ linhasAfetadas: number; id: string }> {
    const candidaturaId = textoOuNulo(e.valores.candidatura_id);
    const r = await this.registrarDivergencia({
      escopo: String(e.valores.escopo) as DivergenciaARegistrar["escopo"],
      campo: String(e.valores.campo) as DivergenciaARegistrar["campo"],
      candidaturaId,
      vagaId: textoOuNulo(e.valores.vaga_id),
      valorEa: valorDeComparacao(e.valores.valor_ea),
      valorAts: valorDeComparacao(e.valores.valor_ats),
    });
    return { linhasAfetadas: r.id === "" ? 0 : 1, id: r.id };
  }

  // ── O CICLO DE VIDA DA VAGA ESPELHADA ────────────────────────────────────────────────────────

  /**
   * ─ O ENCERRAMENTO AUTOMÁTICO, QUE É O ACHADO 8 DO `seguranca` ────────────────────────────────
   *
   * A vaga espelhada que SAIU da lista de ativas encerrou no ATS, e o espelho acompanha. Sem isso, a
   * cláusula de proteção do expurgo (`s.encerra = false or s.papel = 'ENTREGA' or v.encerrada_em is
   * null`) deixaria toda pessoa viva dentro dela protegida PARA SEMPRE, com CPF, e-mail, telefone e
   * nascimento retidos, sem nada falhar e sem tela nenhuma acusar.
   *
   * O ALVO É O PAPEL FECHAMENTO, e não ENTREGA: `encerra` é verdadeiro nos dois, mas o expurgo
   * POUPA de propósito quem estava em vaga de ENTREGA (é quem foi contratado, e o CPF dele continua
   * na admissão, com retenção própria). Encerrar como ENTREGA faria a vaga espelhada herdar aquela
   * exceção e o furo continuaria aberto com outro nome.
   *
   * `encerrada_em` É CARIMBO DE SERVIDOR (`now()`), NUNCA DATA DO PANDAPÉ. O expurgo já recusou
   * `data_fechamento` como relógio pelo mesmo motivo: data vinda do corpo, sem piso, seria gatilho
   * REMOTO de exclusão irreversível.
   *
   * O ALCANCE É SÓ O DA VARREDURA, e a fronteira é a MATRÍCULA (`as_varredura_vagas.vaga_id`, linha
   * a linha), a MESMA dos outros três pontos, pela razão escrita em `escreverVaga`:
   * `vagas.id_vacancy_pandape` também é digitado por gente, e o índice dela não é unique.
   */
  async encerrarAusentes(idsAtivos: number[]): Promise<number> {
    // A LISTA VAZIA NÃO ENCERRA NINGUÉM. O ciclo já não chama neste caso, e esta é a segunda
    // fechadura: um `not in ()` vazio encerraria TODA vaga espelhada de uma vez.
    if (idsAtivos.length === 0) return 0;
    const codigoFechamento = await this.vagaStatus.codigoDoPapel("FECHAMENTO");
    /*
     * ┌─ A LISTA VIRA `array[$1, $2, ...]`, UM PARÂMETRO POR ID, E NÃO UM PARÂMETRO SÓ ───────────┐
     * │ `${ativos}::text[]` NÃO FUNCIONA, e a falha é MUDA para quem lê o código: drizzle sobre    │
     * │ postgres-js não liga um array de JS a um array de Postgres. Medido contra Postgres, nas    │
     * │ duas cardinalidades, em `docs/PROVA-BIND-ARRAY-ENCERRAR-AUSENTES.md`:                      │
     * │   . com 1 id, o valor chega como TEXTO   -> `malformed array literal: "101"`  (22P02)      │
     * │   . com 2 ou mais, chega como RECORD     -> `cannot cast type record to text[]` (42846)    │
     * │                                                                                            │
     * │ E a instrução que não executa é PIOR do que a instrução ausente: o chamador                │
     * │ (`ingestao-ciclo.ts`) engole a exceção, soma `resumo.erros` e segue. A vaga espelhada nunca │
     * │ encerraria, `encerrada_em` ficaria nulo para sempre, e a cláusula `v.encerrada_em is null`  │
     * │ do expurgo manteria toda pessoa viva dentro dela retida indefinidamente, com CPF, e-mail,  │
     * │ telefone e nascimento. O achado 8 continuaria aberto COM CARIMBO DE CORRIGIDO.             │
     * │                                                                                            │
     * │ POR QUE `sql.join` E NÃO UM LITERAL `'{101,102}'` MONTADO À MÃO: aqui NENHUM valor entra   │
     * │ no texto da instrução. Cada id é um PARÂMETRO, então não há escape a acertar e não há      │
     * │ injeção possível por construção, hoje com `number[]` e no dia em que a assinatura mudar.   │
     * │ O literal exigiria escapar vírgula, aspas e chaves, e erraria calado na primeira mudança.  │
     * │                                                                                            │
     * │ A CONTA DE ESCALA ESTÁ FEITA: produção tem 621 vagas ativas, logo 621 parâmetros, contra o │
     * │ teto de 65.535 do protocolo. A cardinalidade de produção está PROVADA, não deduzida.       │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const ativos = sql.join(
      idsAtivos.map((n) => sql`${String(n)}`),
      sql`, `,
    );
    const linhas = (await this.db.execute(sql`
      with
      -- O RETRATO DE ANTES, E ELE EXISTE PORQUE O "RETURNING" DE UM UPDATE DEVOLVE O VALOR NOVO.
      -- Sem este retrato nao ha como carregar para a CTE seguinte o status de ONDE a vaga foi
      -- fechada, que e a unica pergunta que a reabertura pode fazer sem desfazer decisao de gente.
      -- Ele NAO e o filtro: as condicoes continuam inteiras no "where" do update, entao uma linha
      -- que mude entre o retrato e a escrita continua sendo avaliada pela regra, e nao pela foto.
      antes as (
        select v.id, v.status from vagas v
      ),
      fechadas as (
      update vagas v
         set status = ${codigoFechamento},
             encerrada_em = now(),
             atualizado_em = now()
        from antes a
       where a.id = v.id
         and v.id_vacancy_pandape is not null
         and v.id_vacancy_pandape <> all(array[${ativos}]::text[])
         -- SO AS VAGAS DA VARREDURA, E A FRONTEIRA E A MATRICULA, LINHA A LINHA (m.vaga_id = v.id).
         -- A coluna id_vacancy_pandape de "vagas" tambem e DIGITADA por gente na trilha da vaga, e o
         -- indice dela nao e unique: casar a matricula pelo NUMERO adotaria a vaga que um consultor
         -- cadastrou a mao com o numero do ATS dentro, e a encerraria de 30 em 30 minutos.
         and exists (
               select 1 from as_varredura_vagas m
                where m.vaga_id = v.id)
         -- VAGA JA ENCERRADA NAO E RE-CARIMBADA, e a direcao importa: reescrever encerrada_em
         -- adiaria o prazo de retencao de quem esta dentro dela a cada volta, que e o furo 1 pela
         -- terceira porta. Cancelamento e entrega feitos por humano tambem ficam onde estao.
         and exists (
               select 1 from as_vaga_status s
                where s.codigo = v.status and s.encerra = false)
      returning v.id, a.status as status_antes
      ),
      -- O CARIMBO DE QUEM ENCERROU, e e ele que a REABERTURA le. "now()" e o mesmo instante nas duas
      -- escritas (e o relogio da TRANSACAO, nao o da linha), entao a comparacao "encerrada_em is not
      -- distinct from encerrada_pela_varredura_em" da verdadeira so enquanto o encerramento em pe for
      -- ESTE. Fechado por humano depois disso, o carimbo passa a ser o dele e a varredura nao reabre.
      -- CTE que escreve roda SEMPRE, referenciada ou nao, e na MESMA instrucao: nao ha janela em que
      -- a vaga esteja encerrada sem o registro de quem a encerrou.
      -- O "DE ONDE" VIAJA JUNTO COM O "QUANDO", e os dois sao o mesmo fato: a reabertura devolve a
      -- vaga ao status guardado aqui, em vez de deduzi-lo de um campo da vaga. Deduzir pelo cliente
      -- ressuscitava PUBLICADA a vaga que um Master tinha devolvido para a fila sem trocar o
      -- cliente, ou seja, o ATS desfazia sozinho e em silencio a decisao explicita de uma pessoa.
      marcadas as (
        update as_varredura_vagas m
           set encerrada_pela_varredura_em = now(),
               status_antes_do_encerramento = f.status_antes,
               atualizado_em = now()
          from fechadas f
         where m.vaga_id = f.id
      )
      select id from fechadas
    `)) as unknown as { id: string }[];
    return linhas.length;
  }

  /** A cidade do EA a partir do texto "Cidade - UF" que a vaga do Pandapé traz. */
  private async cidadePorTexto(valor: unknown): Promise<number | null> {
    const texto = textoOuNulo(valor);
    if (texto === null) return null;
    const partes = texto.split("-");
    if (partes.length < 2) return null;
    const uf = (partes.pop() ?? "").trim().toUpperCase();
    const nome = partes.join("-").trim();
    if (uf.length !== 2 || nome === "") return null;
    /*
     * A COMPARAÇÃO É SEM ACENTO E SEM CAIXA, e é o mesmo problema da chave de etapa: o nome vem
     * digitado por quem abriu a vaga no ATS. Não casando, a coluna fica NULA, e a vaga espelhada
     * entra marcada para vínculo manual, como a sem cliente. Inventar cidade seria pior do que não
     * ter: ela alimenta filtro e contagem regional.
     */
    const linhas = (await this.db.execute(sql`
      select id from as_cidades
       where uf = ${uf}
         and translate(lower(nome), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
             = ${semAcento(nome)}
       limit 1
    `)) as unknown as { id: number }[];
    return linhas[0]?.id ?? null;
  }

  /**
   * O CARGO DO EA a partir do TÍTULO que a vaga do Pandapé divulga (`job`, gravado em
   * `vagas.nome_divulgacao`). Irmão de `cidadePorTexto`, com a mesma forma e o mesmo fail-closed.
   *
   * ┌─ A COMPARAÇÃO É SEM ACENTO E SEM CAIXA, E O CATÁLOGO ATIVO É O ÚNICO UNIVERSO ──────────────┐
   * │ O título é texto livre digitado por quem abriu a vaga no ATS, então casar por igualdade crua │
   * │ funcionaria numa vaga e falharia na vaga do lado. `ativo` é filtrado porque inativar um cargo│
   * │ é o gesto que a administração tem para dizer "pare de usar este", e uma resolução que        │
   * │ ignorasse o flag transformaria esse gesto em nada.                                           │
   * │                                                                                             │
   * │ NÃO CASANDO, DEVOLVE NULO. Não existe "o cargo parecido": cargo errado atravessa a régua     │
   * │ documental por (cliente + cargo), a pré-admissão e a folha, e sai mais caro do que o campo   │
   * │ vazio que alguém preenche na liberação.                                                     │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O `order by nome` EXISTE PELO ÚNICO EMPATE MEDIDO: o catálogo tem 379 cargos ativos e 378
   * chaves distintas normalizando caixa e acento, ou seja UM par colide. Sem ordem, o `limit 1`
   * escolheria um dos dois conforme o plano de execução do dia, e a mesma vaga nasceria com cargo
   * diferente em duas instalações. Com ordem, a escolha é estável e conferível.
   *
   * §A.6: o TÍTULO NÃO É LOGADO aqui nem em quem chama. É texto livre do ATS, e a casa já mediu que
   * campo assim chega com nome de gente dentro (a narrativa da reabertura, neste mesmo arquivo).
   * Não casou, o registro é a coluna NULA, visível na tela de revisão sem publicar o texto.
   */
  private async cargoPorTexto(valor: unknown): Promise<string | null> {
    const texto = textoOuNulo(valor);
    if (texto === null) return null;
    const linhas = (await this.db.execute(sql`
      select id from cargos
       where ativo = true
         and translate(lower(nome), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
             = ${semAcento(texto)}
       order by nome
       limit 1
    `)) as unknown as { id: string }[];
    return linhas[0]?.id ?? null;
  }
}

/**
 * A FRASE QUE FICA NA TRILHA DA REABERTURA AUTOMÁTICA.
 *
 * Ela diz QUEM moveu (a varredura, não uma pessoa) e DE ONDE PARA ONDE, que é o que a linha do
 * tempo da vaga precisa responder. §A.6: só códigos de status, nada de texto vindo do ATS.
 * §A.11: sem travessão.
 */
function narrativaDaReabertura(de: string, para: string): string {
  return `A varredura do Pandapé reabriu a vaga, que voltou às ativas do ATS: de ${de} para ${para}.`;
}

/** O CPF pronto para o banco, ou NULO. Inválido é tratado como ausente (ver `candidatoPorCpf`). */
function cpfParaBanco(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = normalizeCpf(valor);
  return isValidCpf(limpo) ? limpo : null;
}

/**
 * A DATA DE NASCIMENTO EM `YYYY-MM-DD`. O ATS entrega datetime completo
 * ("1990-01-15T00:00:00", precedente registrado em `pandape-api.service.ts`), e a coluna é `date`.
 *
 * ┌─ A DATA É VALIDADA AQUI, E A RAZÃO É §A.6, NÃO ASSEIO ───────────────────────────────────────┐
 * │ A forma sozinha (`\d{4}-\d{2}-\d{2}`) aceita "1990-13-45", e o Postgres responde a isso com   │
 * │ `date/time field value out of range: "1990-13-45"`: o VALOR viaja na MENSAGEM, e não só no    │
 * │ `detail`. O funil `mensagemDoErro` deixa passar a mensagem de propósito (é ela que diz o que  │
 * │ houve), então a data de nascimento de uma pessoa acabaria no log do ciclo e no `failedReason` │
 * │ do Redis, que é depósito sem TTL e fora do alcance do expurgo. Nascimento é dado pessoal, e a │
 * │ correção é não deixar o valor inválido chegar ao banco.                                        │
 * │                                                                                                │
 * │ INVÁLIDA É TRATADA COMO AUSENTE, que é o mesmo caminho do CPF inválido logo acima e a direção  │
 * │ certa: a coluna é NULÁVEL, a pessoa entra sem a data, e ninguém perde a inscrição por causa de │
 * │ um campo mal digitado no ATS.                                                                  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
function dataParaBanco(valor: unknown): string | null {
  const texto = textoOuNulo(valor);
  if (texto === null) return null;
  const casou = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (!casou) return null;
  const ano = Number(casou[1]);
  const mes = Number(casou[2]);
  const dia = Number(casou[3]);
  if (ano < 1 || mes < 1 || mes > 12 || dia < 1) return null;
  // O DIA É CONFERIDO CONTRA O MÊS, BISSEXTO INCLUSO. A conta é escrita à mão de propósito:
  // `Date.UTC` remapeia ano de dois dígitos para 1900+, e a regra do bissexto do ano remapeado não
  // é a do ano que veio no campo.
  if (dia > diasDoMes(ano, mes)) return null;
  return casou[0];
}

/** Quantos dias tem o mês, com a regra do bissexto por extenso (4, 100, 400). */
function diasDoMes(ano: number, mes: number): number {
  if (mes === 2) return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0 ? 29 : 28;
  return mes === 4 || mes === 6 || mes === 9 || mes === 11 ? 30 : 31;
}

/** Minúsculas e sem acento, do mesmo jeito que `CandidatosService` faz, e pelo mesmo motivo: a
 * extensão `unaccent` NÃO está instalada no banco, e instalar extensão é escopo que ninguém pediu. */
function semAcento(v: string): string {
  return v
    .toLowerCase()
    .replace(/[áàâãä]/g, "a")
    .replace(/[éèêë]/g, "e")
    .replace(/[íìîï]/g, "i")
    .replace(/[óòôõö]/g, "o")
    .replace(/[úùûü]/g, "u")
    .replace(/ç/g, "c")
    .replace(/ñ/g, "n");
}

function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const t = valor.trim();
  return t === "" ? null : t;
}

function inteiroPositivo(valor: unknown): number | null {
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}
