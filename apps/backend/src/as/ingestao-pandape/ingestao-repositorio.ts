import { Inject, Injectable } from "@nestjs/common";
import { isValidCpf, normalizeCpf } from "@ea/shared-types";
import { sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import type { LinhaDeParaEtapaExternaCrua } from "../../domain/as-etapa-externa";
import { EtapasFunilService } from "../etapas/etapas-funil.service";
import { VagaStatusService } from "../vaga-status/vaga-status.service";
import type { Escrita, PortaBanco, PortaCicloDeVidaDaVaga } from "./ingestao-portas";

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
   * O DESPACHO É FAIL-CLOSED: tabela fora desta lista não é escrita, e a ingestão não tem outra
   * porta para o banco. Uma frente futura que precise de uma sétima tabela tem de vir aqui, que é o
   * ponto em que alguém lê o que passa a ser escrito por um processo sem autor humano.
   */
  async escrever(e: Escrita): Promise<{ linhasAfetadas: number; id: string }> {
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
   * A ETAPA INICIAL ENTRA SÓ NO NASCIMENTO. Duas linhas semeadas do de/para resolvem apenas o
   * DESFECHO (`Descartados`, `RETORNO NEGATIVO`) e `as_candidaturas.etapa` é NOT NULL: a linha nova
   * precisa nascer em algum caneco, e quem responde é o catálogo, nunca um literal. A candidatura
   * que JÁ EXISTE não é movida.
   */
  private async escreverCandidatura(e: Escrita): Promise<{ linhasAfetadas: number; id: string }> {
    const candidatoId = String(e.valores.candidato_id);
    const vagaId = String(e.valores.vaga_id);
    const temEtapa = "etapa" in e.valores;
    const temSituacao = "situacao" in e.valores;
    const temMotivo = "motivo_descarte" in e.valores;
    const etapa = temEtapa ? String(e.valores.etapa) : null;
    const situacao = temSituacao ? String(e.valores.situacao) : null;
    const motivo = temMotivo ? textoOuNulo(e.valores.motivo_descarte) : null;

    const existentes = (await this.db.execute(sql`
      select id from as_candidaturas
       where candidato_id = ${candidatoId}::uuid and vaga_id = ${vagaId}::uuid
       order by criado_em desc
       limit 1
    `)) as unknown as { id: string }[];
    const existente = existentes[0];

    if (!existente) {
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
      return { linhasAfetadas: 1, id: criada.id };
    }

    /*
     * A ESCRITA CONDICIONAL É O RAMO PRINCIPAL DO RELÓGIO DO EXPURGO. `as_candidaturas.atualizado_em`
     * é insumo do `max(greatest(...))` da retenção, e ele É escrito de propósito quando a etapa ou a
     * situação mudam. O que não pode acontecer é a reentrega IDÊNTICA escrever: 48 voltas por dia
     * empurrariam o relógio de todo mundo que a ingestão tocar, e ninguém expiraria mais. A
     * comparação vive no SQL, e não num `if` do TypeScript, porque o `if` resolve o caso comum e
     * perde a corrida entre dois ciclos.
     */
    const pares: ReturnType<typeof sql>[] = [];
    const atuais: ReturnType<typeof sql>[] = [];
    const novos: ReturnType<typeof sql>[] = [];
    if (temEtapa) {
      pares.push(sql`etapa = ${etapa}`);
      atuais.push(sql`etapa`);
      novos.push(sql`${etapa}`);
    }
    if (temSituacao) {
      pares.push(sql`situacao = ${situacao}::candidatura_situacao`);
      atuais.push(sql`situacao`);
      novos.push(sql`${situacao}::candidatura_situacao`);
    }
    if (temMotivo) {
      pares.push(sql`motivo_descarte = ${motivo}`);
      atuais.push(sql`motivo_descarte`);
      novos.push(sql`${motivo}`);
    }
    // NADA A ESCREVER É UM DESFECHO LEGÍTIMO: o de/para que não resolve etapa, situação nem motivo
    // não tem o que dizer sobre esta candidatura, e uma escrita vazia só empurraria o relógio.
    if (pares.length === 0) return { linhasAfetadas: 0, id: existente.id };

    const linhas = (await this.db.execute(sql`
      update as_candidaturas
         set ${sql.join(pares, sql`, `)},
             atualizado_em = now()
       where id = ${existente.id}::uuid
         and (${sql.join(atuais, sql`, `)}) is distinct from (${sql.join(novos, sql`, `)})
      returning id
    `)) as unknown as { id: string }[];
    return { linhasAfetadas: linhas.length > 0 ? 1 : 0, id: existente.id };
  }

  /**
   * A VAGA ESPELHADA: nasce no papel RASCUNHO, casa pela MATRÍCULA da varredura, e REABRE só o que a
   * própria varredura encerrou.
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
  private async escreverVaga(e: Escrita): Promise<{ linhasAfetadas: number; id: string }> {
    const idVacancy = String(e.valores.id_vacancy_pandape);
    const codigo = textoOuNulo(e.valores.codigo);
    const nomeDivulgacao = textoOuNulo(e.valores.nome_divulgacao);
    const cidadeId = await this.cidadePorTexto(e.valores.cidade_id);
    // O CHECK do banco é `posicoes_oficiais > 0`, e a coluna é NULÁVEL: zero e negativo viram
    // AUSÊNCIA, que é a verdade ("a vaga não disse quantas"), em vez de derrubar a linha inteira.
    const posicoes = inteiroPositivo(e.valores.posicoes_oficiais);
    const regua = await this.vagaStatus.regua();
    const codigoRascunho = regua.codigoDoPapel("RASCUNHO");

    /*
     * UMA CONSULTA RESPONDE AS DUAS PERGUNTAS: existe vaga com este número, e ela é DA VARREDURA.
     * O `order by` prefere a matriculada, para o caso em que as duas linhas coexistam (a digitada
     * por gente veio antes, a varredura criou a sua depois de o conflito ser resolvido à mão).
     */
    const existentes = (await this.db.execute(sql`
      select v.id,
             v.status,
             (m.vaga_id is not null) as da_varredura,
             (m.encerrada_pela_varredura_em is not null
              and v.encerrada_em is not distinct from m.encerrada_pela_varredura_em) as encerrou
        from vagas v
        left join as_varredura_vagas m on m.vaga_id = v.id
       where v.id_vacancy_pandape = ${idVacancy}
       order by (m.vaga_id is not null) desc
       limit 1
    `)) as unknown as { id: string; status: string; da_varredura: boolean; encerrou: boolean }[];
    const existente = existentes[0];

    if (!existente) {
      const linhas = (await this.db.execute(sql`
        insert into vagas (
          id_vacancy_pandape, codigo, nome_divulgacao, cidade_id,
          posicoes_oficiais, cod_cliente, cargo_id, status
        )
        values (
          ${idVacancy}, ${codigo}, ${nomeDivulgacao}, ${cidadeId},
          ${posicoes}, null, null, ${codigoRascunho}
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
    const reabertura = reabrir
      ? sql`status = ${regua.codigoDoPapel("ABERTURA")}, encerrada_em = null, `
      : sql``;
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
    const houveMudanca = sql`(codigo, nome_divulgacao, cidade_id, posicoes_oficiais)
              is distinct from (${codigo}, ${nomeDivulgacao}, ${cidadeId}::integer, ${posicoes}::integer)`;
    const linhas = (await this.db.execute(sql`
      update vagas
         set codigo = ${codigo},
             nome_divulgacao = ${nomeDivulgacao},
             cidade_id = ${cidadeId},
             posicoes_oficiais = ${posicoes},
             ${reabertura}atualizado_em = now()
       where id = ${existente.id}::uuid
         and ${reabrir ? sql`true` : houveMudanca}
      returning id
    `)) as unknown as { id: string }[];
    return { linhasAfetadas: linhas.length > 0 ? 1 : 0, id: existente.id };
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
      with fechadas as (
      update vagas v
         set status = ${codigoFechamento},
             encerrada_em = now(),
             atualizado_em = now()
       where v.id_vacancy_pandape is not null
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
      returning v.id
      ),
      -- O CARIMBO DE QUEM ENCERROU, e e ele que a REABERTURA le. "now()" e o mesmo instante nas duas
      -- escritas (e o relogio da TRANSACAO, nao o da linha), entao a comparacao "encerrada_em is not
      -- distinct from encerrada_pela_varredura_em" da verdadeira so enquanto o encerramento em pe for
      -- ESTE. Fechado por humano depois disso, o carimbo passa a ser o dele e a varredura nao reabre.
      -- CTE que escreve roda SEMPRE, referenciada ou nao, e na MESMA instrucao: nao ha janela em que
      -- a vaga esteja encerrada sem o registro de quem a encerrou.
      marcadas as (
        update as_varredura_vagas m
           set encerrada_pela_varredura_em = now(),
               atualizado_em = now()
         where m.vaga_id in (select id from fechadas)
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
