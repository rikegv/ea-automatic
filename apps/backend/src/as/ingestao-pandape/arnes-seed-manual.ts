import "dotenv/config";
import { createDb } from "../../db/client";
import { conferirDatabase } from "./arnes-lote-fabricado";

/**
 * ─ ARNÊS DO MANUAL: A POPULAÇÃO SINTÉTICA QUE OS ROTEIROS DE CAPTURA PRECISAM ────────────────────
 *
 * ┌─ POR QUE ELE EXISTE, E QUAL PROBLEMA ELE RESOLVE ────────────────────────────────────────────┐
 * │ Cinco roteiros do manual declaram `arnes: "arnes-seed-manual"`, e nenhum deles pode ser         │
 * │ capturado sem linha na tela: "Ler A Linha Da Tabela" ensina a LEITURA DA LINHA, "Anexar O ASO"   │
 * │ precisa da fila do Exame nos TRÊS estados do atestado, e "Abrir O Prontuário No Drive" precisa   │
 * │ da linha cuja pasta já nasceu. A base da homologação é quase toda finalizada (1.432 concluídas   │
 * │ mais 724 declínios), então as filas vivem praticamente vazias, e print de fila vazia PASSA no    │
 * │ gate de dado pessoal por construção (lista sem linha não tem PII). Ou seja: sem este arnês, ou   │
 * │ o motor falha por alvo perdido, ou grava um print que ensina uma tela onde não há nada.          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ §A.6: A FORMA DE CADA CAMPO DIZ SOZINHA QUE ELE É SINTÉTICO ─────────────────────────────────┐
 * │ NOME:      `SIMULADO <PALAVRA DO ALFABETO FONÉTICO>`, caixa alta. NENHUMA das palavras é prenome │
 * │            ou sobrenome brasileiro, e isso NÃO é estética: a asserção de população do lote audita │
 * │            o nome do arnês com a allowlist PROVISÓRIA (antes de os candidatos do banco entrarem   │
 * │            nela), então nome com forma de pessoa reprovaria a base e BLOQUEARIA O LOTE INTEIRO.   │
 * │ CPF:       família `999`, dígito verificador VÁLIDO, sequência `000001..` de propósito, para o    │
 * │            CPF conter `999000`, que é o termo que os roteiros digitam na busca. Cada CPF criado   │
 * │            está DECLARADO, um a um, em `tools/ajuda/allowlist-arnes.json` (exigência do           │
 * │            `seguranca`: inventário completo e revogável de todo CPF que pode aparecer num print). │
 * │ EMAIL:     domínio `.invalid` (RFC 2606), inentregável.                                          │
 * │ TELEFONE, NASCIMENTO, ENDEREÇO, MATRÍCULA: ficam NULOS. Os cinco só passam pelo gate se o arnês   │
 * │            os DECLARAR, e Gerenciador e Esteira os desenham ao lado do rótulo sensível. O único    │
 * │            dos cinco que precisa existir é o SALÁRIO (sem ele a admissão nunca fica sem           │
 * │            pendência), e ele está declarado na allowlist.                                         │
 * │ FAROL:     `EM_ADMISSAO`, nunca `DECLINOU` nem `RESCISAO` (§A.16): declínio é excluído das filas  │
 * │            EM CÓDIGO, então a admissão nasceria fora da fila que o roteiro precisa fotografar.    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ELE **NÃO** ESCREVE, E ESTA É A TRAVA MAIS FINA (exigência do `seguranca`) ─────────────┐
 * │ NENHUM dos dez pares (tabela, coluna) que o gate consome como VOCABULÁRIO DISPENSÁVEL: clientes, │
 * │ lojas, cargos, cidades, segmentos, grupos, entidades, escalas, projetos e clínicas. Arnês que    │
 * │ inventa cliente INJETA vocabulário naquilo em que o gate confia para dispensar nome, e quem       │
 * │ captura passaria a escolher o que o gate dispensa. Cargo e cliente são RESOLVIDOS EM RUNTIME do  │
 * │ catálogo que já existe, e o seed ABORTA se o catálogo estiver vazio.                             │
 * │                                                                                                  │
 * │ Também não escreve em `as_comerciais` (é denylist, não vocabulário) nem em tipo de documento: o   │
 * │ tipo `ASO` é lido do catálogo, e sua ausência aborta.                                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS TRAVAS (as mesmas do arnês) ──────────────────────────────────────────────────────────────┐
 * │ 1. FAIL-CLOSED POR NOME DE DATABASE (`conferirDatabase`): produção é recusada por allowlist.     │
 * │ 2. IDEMPOTENTE E TRANSACIONAL: ids fixos, `ON CONFLICT DO NOTHING`, um `BEGIN` só. Rodar 2x não  │
 * │    duplica nada.                                                                                 │
 * │ 3. NÃO RODA SOZINHO: não é módulo, não é rota, não é importado; `main()` só via                  │
 * │    `require.main === module`, e o nome não casa com o padrão do vitest.                          │
 * │ 4. COLISÃO COM O TIME É FALHA DURA: antes de escrever, confere se algum nome sintético colide com │
 * │    nome de usuário da homologação. A asserção de população NÃO aplica a denylist às linhas da     │
 * │    base, então a colisão passaria ali e depois recusaria TODA tela de lista (exigência (b) do     │
 * │    `seguranca`).                                                                                 │
 * │ 5. RECONHECÍVEL PELA LIMPEZA QUE JÁ EXISTE (`arnes-limpeza-homolog.ts`), pelas marcas `999%` e    │
 * │    `SIMULADO%`. Arnês que o expurgo não alcança é dado de teste permanente.                       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * COMO SE RODA (da raiz do repositório), QUANDO AUTORIZADO:
 *   DATABASE_URL='postgres://ea:...@127.0.0.1:5433/ea_automatic_homolog' \
 *     apps/backend/node_modules/.bin/tsx apps/backend/src/as/ingestao-pandape/arnes-seed-manual.ts
 */

// ══ CPF SINTÉTICO VÁLIDO ═══════════════════════════════════════════════════════════════════════
// Reimplementado localmente, pelo mesmo motivo de `arnes-seed-tres-vagas.ts`: o do arnês não é
// exportado, e editar código validado para exportá-lo dispara a §A.26. Função pura.
function digitosVerificadores(base9: string): string {
  const calcular = (digitos: string, pesoInicial: number): number => {
    let soma = 0;
    for (let i = 0; i < digitos.length; i += 1) soma += Number(digitos[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = calcular(base9, 10);
  const d2 = calcular(`${base9}${d1}`, 11);
  return `${d1}${d2}`;
}

/**
 * A SEQUÊNCIA COMEÇA EM 1 PARA O CPF CONTER `999000`, e isso é requisito de ROTEIRO, não estética:
 * quatro dos cinco roteiros digitam `999000` na busca para deixar a lista só com as linhas do arnês.
 * O `seguranca` conferiu o efeito colateral do truque: seis dígitos não casam `RE_CPF`, então o termo
 * digitado não vira achado de CPF no print da própria busca.
 */
function cpfSintetico(sequencia: number): string {
  const base = `999${String(sequencia).padStart(6, "0")}`;
  return `${base}${digitosVerificadores(base)}`;
}

// ══ AS CINCO LINHAS, E O QUE CADA UMA EXISTE PARA ENSINAR ═════════════════════════════════════
type EstadoDoAso = "SEM_ASO" | "ANEXADO_SEM_VEREDITO" | "VALIDADO";

interface LinhaDoArnes {
  admissaoId: string;
  sequencia: number;
  apelido: string;
  /** Preenchida por inteiro (sem pendência obrigatória) ou não. */
  completa: boolean;
  /** A pasta do prontuário já nasceu: é o que desenha o logo do Drive na linha. */
  comPastaNoDrive: boolean;
  statusAuditoria: string;
  auditoriaConcluida: boolean;
  statusExame: string;
  /**
   * O EXAME FECHA? Só a linha da Integração fecha, e isso é requisito de fila, não capricho: a frente
   * de Integração só é legítima depois de Auditoria e Exame concluídas (§A.3, regra 3). As outras
   * quatro linhas PRECISAM do Exame aberto, senão somem da aba que elas existem para ensinar
   * (`itensWhere` filtra `concluida = false`).
   */
  exameConcluido?: boolean;
  aso: EstadoDoAso;
  /**
   * AS FRENTES ALÉM DAS DUAS QUE NASCEM JUNTAS (§A.3, regra 1). Hoje só a linha da Integração as usa:
   * o Cadastro entra CONCLUÍDO (é o gate que abriu a Integração) e a Integração entra ABERTA, que é
   * o estado que a aba fotografa.
   */
  frentesExtras?: Array<{ tipo: string; status: string; concluida: boolean }>;
}

const LINHAS: LinhaDoArnes[] = [
  {
    // "Ler A Linha Da Tabela" e "Abrir O Prontuário No Drive": linha COMPLETA (pill de completo) e
    // com a pasta do Drive nascida, que é a única em que o logo aparece.
    admissaoId: "5f4b7a10-3c21-4a8e-9b6d-0c1e2f3a4b51",
    sequencia: 1,
    apelido: "ALFA",
    completa: true,
    comPastaNoDrive: true,
    statusAuditoria: "ANALISE_OK",
    auditoriaConcluida: true,
    statusExame: "AGENDADO",
    aso: "SEM_ASO",
  },
  {
    // "Filtrar Pelo Card De Indicador" e a badge de pendências de "Ler A Linha Da Tabela": esta é a
    // linha COM pendência obrigatória, e sem ela o card e a badge não têm o que apontar.
    admissaoId: "5f4b7a10-3c21-4a8e-9b6d-0c1e2f3a4b52",
    sequencia: 2,
    apelido: "BRAVO",
    completa: false,
    comPastaNoDrive: false,
    statusAuditoria: "ANALISE_PENDENTE",
    auditoriaConcluida: false,
    statusExame: "A_AGENDAR",
    aso: "SEM_ASO",
  },
  {
    // "Anexar O ASO No Exame", imagens 4 e 5: atestado ANEXADO e ainda sem veredito da I.A.
    admissaoId: "5f4b7a10-3c21-4a8e-9b6d-0c1e2f3a4b53",
    sequencia: 3,
    apelido: "CHARLIE",
    completa: true,
    comPastaNoDrive: false,
    statusAuditoria: "ANALISE_PENDENTE",
    auditoriaConcluida: false,
    statusExame: "AGENDADO",
    aso: "ANEXADO_SEM_VEREDITO",
  },
  {
    // "Anexar O ASO No Exame", imagem 6: atestado VALIDADO, exame AINDA NÃO concluído. É exatamente o
    // estado que o passo ensina (a I.A validou, o consultor marca apto), e por isso a frente NÃO pode
    // nascer concluída: concluída, a linha sai da fila e o seletor de status não existe.
    admissaoId: "5f4b7a10-3c21-4a8e-9b6d-0c1e2f3a4b54",
    sequencia: 4,
    apelido: "DELTA",
    completa: true,
    comPastaNoDrive: false,
    statusAuditoria: "ANALISE_PENDENTE",
    auditoriaConcluida: false,
    statusExame: "AGENDADO",
    aso: "VALIDADO",
  },
  {
    /**
     * "Acompanhar A Integração": a ÚNICA linha que chega à quarta frente.
     *
     * ┌─ POR QUE ELA PRECISOU EXISTIR ────────────────────────────────────────────────────────────┐
     * │ A aba Integração só lista quem TEM a frente `INTEGRACAO` aberta, e essa frente nasce depois │
     * │ de Auditoria e Exame fecharem (§A.3, regra 3). As outras quatro linhas do arnês param na     │
     * │ Auditoria de propósito, então a busca `999000` esvaziava a aba e a captura era recusada por  │
     * │ LISTA VAZIA (medido em 28/09/2026: 1 lista, 0 linhas). As duas saídas fáceis estavam          │
     * │ fechadas: sem a busca o gate de dado pessoal reprovava a fila real com 3 achados, e declarar  │
     * │ a lista como podendo ser vazia seria mentir, porque o artigo não ensina o estado vazio.       │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * ELA NÃO APARECE NAS FILAS DAS OUTRAS ABAS, e isso é o alcance conferido antes de escrever
     * (§A.26): a lista de itens de cada aba filtra `concluida = false`, então Auditoria, Exame e
     * Cadastro fechados a deixam de fora das três filas que os outros roteiros fotografam.
     */
    admissaoId: "5f4b7a10-3c21-4a8e-9b6d-0c1e2f3a4b55",
    sequencia: 5,
    apelido: "ECHO",
    completa: true,
    comPastaNoDrive: false,
    statusAuditoria: "ANALISE_OK",
    auditoriaConcluida: true,
    statusExame: "APTO",
    exameConcluido: true,
    aso: "VALIDADO",
    frentesExtras: [
      { tipo: "CADASTRO_CONTRATO", status: "CADASTRADO", concluida: true },
      { tipo: "INTEGRACAO", status: "A_AGENDAR", concluida: false },
    ],
  },
];

/**
 * ─ A SEXTA LINHA: A PRÉ-ADMISSÃO **RECUSADA PELA CONTA DE CAPTURA** ─────────────────────────────
 *
 * ┌─ O ACHADO QUE OBRIGOU ESTA LINHA, MEDIDO (28/09/2026) ───────────────────────────────────────┐
 * │ O roteiro da Liberação acusou `NOME_DE_USUARIO: usuario 04 homolog` (6 variações) na aba           │
 * │ Recusadas, e o achado é VERDADEIRO: a coluna "Recusado por" imprime o nome de usuários REAIS,      │
 * │ porque quem recusou as pré-admissões existentes foi o time. O diretor liberou o dado do            │
 * │ CANDIDATO, NÃO o do colega, então a denylist está CERTA e não se mexe nela.                        │
 * │                                                                                                  │
 * │ O CONSERTO É DE DADO, não de gate: existe uma recusa feita pela PRÓPRIA CONTA DE CAPTURA           │
 * │ (`manual.captura@homolog.local`, já declarada na allowlist), e o roteiro busca por ela em vez de   │
 * │ fotografar a recusa de um colega.                                                                │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE ELA É UM BLOCO SEPARADO, e não um sexto item de `LINHAS` ──────────────────────────┐
 * │ Pré-admissão é OUTRA COISA: farol `LIBERACAO_RECUSADA`, cliente e cargo NULOS (o de/para           │
 * │ vaga→cliente é manual, §A.9), NENHUMA frente e NENHUM documento. Enfiá-la em `LinhaDoArnes`        │
 * │ exigiria três flags novas que só ela usaria, e cada flag nova é uma condição a mais no laço que    │
 * │ escreve as cinco linhas JÁ VALIDADAS (§A.26).                                                     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ELA NÃO APARECE EM FILA NENHUMA DAS OUTRAS ABAS, e isso é o alcance conferido antes de escrever:
 * `esteira.service` exclui `AGUARDANDO_LIBERACAO` e `LIBERACAO_RECUSADA` junto de `DECLINOU`/`RESCISAO`,
 * e o Gerenciador trata pré-admissão como não-ativa. Ela existe SÓ para a aba Recusadas da Liberação.
 */
const LINHA_RECUSADA = {
  admissaoId: "5f4b7a10-3c21-4a8e-9b6d-0c1e2f3a4b56",
  sequencia: 6,
  apelido: "FOXTROT",
};

const PREFIXO_SIMULADO = "SIMULADO";
const nomeDaLinha = (l: { apelido: string }) => `${PREFIXO_SIMULADO} ${l.apelido}`;

/**
 * O SALÁRIO É O ÚNICO DOS CINCO CAMPOS DE RÓTULO SENSÍVEL QUE O ARNÊS ESCREVE, e ele está DECLARADO
 * na allowlist (`salarios`). Sem salário nenhuma linha fica sem pendência obrigatória, e sem uma linha
 * sem pendência o pill de "completo" nunca aparece, que é metade do que "Ler A Linha Da Tabela"
 * ensina. Valor redondo e declarado, nunca o de alguém.
 */
const SALARIO_SINTETICO = "2000.00";

async function main(): Promise<void> {
  const nomeDoBanco = conferirDatabase(process.env.DATABASE_URL);
  console.log(`[arnes-manual] database: ${nomeDoBanco} (allowlist conferida)`);
  const { sql } = createDb(process.env.DATABASE_URL as string, 1);
  try {
    /**
     * ─ TRAVA 4: COLISÃO DE NOME COM O TIME É FALHA DURA, ANTES DE QUALQUER ESCRITA ───────────────
     *
     * A asserção de arranque do lote NÃO aplica a denylist às linhas da base, então um nome sintético
     * que contivesse o nome de um usuário passaria por ela e depois recusaria TODA tela de lista, com
     * a mensagem apontando para o lugar errado. A comparação é sem acento e sem caixa, nos dois
     * sentidos (contém e está contido), porque a denylist procura por VARIANTES.
     */
    const usuarios = (await sql.unsafe(`select nome from usuarios where nome is not null`)) as
      unknown as Array<{ nome: string }>;
    const achatar = (t: string) =>
      t
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    const colisoes = [...LINHAS, LINHA_RECUSADA].filter((l) => {
      const nome = achatar(nomeDaLinha(l));
      return usuarios.some((u) => {
        const doTime = achatar(u.nome);
        return !!doTime && (doTime.includes(nome) || nome.includes(doTime));
      });
    });
    if (colisoes.length > 0) {
      throw new Error(
        `Aborta: ${colisoes.length} nome(s) sintético(s) colidem com nome de usuário da ` +
          `homologação. A colisão passaria pela asserção de população e depois recusaria toda tela ` +
          `de lista. Renomeie o apelido do arnês (valores omitidos, §A.6).`,
      );
    }

    // CARGO, CLIENTE e TIPO `ASO`: resolvidos do catálogo que JÁ EXISTE, nunca criados aqui. Arnês
    // que inventa catálogo injeta vocabulário no que o gate confia para dispensar nome.
    const cargo = (await sql.unsafe(`select id from cargos order by nome limit 1`))[0] as unknown as
      | { id: string }
      | undefined;
    const cliente = (
      await sql.unsafe(`select cod_cliente from clientes where ativo order by cod_cliente limit 1`)
    )[0] as unknown as { cod_cliente: string } | undefined;
    const tipoAso = (
      await sql.unsafe(`select id from tipos_documento where codigo = 'ASO' limit 1`)
    )[0] as unknown as { id: string } | undefined;
    if (!cargo || !cliente) {
      throw new Error(
        "Aborta: catálogo de cargo/cliente vazio na homologação. O arnês NÃO cria catálogo (ele é " +
          "vocabulário do gate): carregue as bases antes.",
      );
    }
    if (!tipoAso) {
      throw new Error(
        "Aborta: tipo de documento `ASO` ausente. O arnês não cria tipo de documento (é catálogo " +
          "vivo, com CRUD próprio): rode o seed da régua antes.",
      );
    }

    await sql.begin(async (tx) => {
      for (const l of LINHAS) {
        const cpf = cpfSintetico(l.sequencia);
        const nome = nomeDaLinha(l);
        const email = `arnes.manual.${l.apelido.toLowerCase()}@exemplo.invalid`;

        // 1) CANDIDATO. Telefone, nascimento e os dados bancários ficam NULOS (§A.6, exigência (f)).
        await tx.unsafe(
          `insert into candidatos (cpf, nome, email, telefone, data_nascimento, criado_em, atualizado_em)
           values ($1, $2, $3, null, null, now(), now())
           on conflict (cpf) do nothing`,
          [cpf, nome, email],
        );

        // 2) ADMISSÃO. Farol EM_ADMISSAO sempre (§A.16). Matrícula e endereço nulos. A linha
        //    incompleta nasce SEM tipo de contrato e SEM data de admissão: são elas as pendências
        //    obrigatórias que o card e a badge precisam ter o que contar.
        await tx.unsafe(
          `insert into admissoes
             (id, candidato_cpf, cod_cliente, cargo_id, tipo_contrato, matricula, data_admissao,
              farol_global, is_banco, sinalizador_preenchimento, origem, drive_pasta_url,
              aso_validado, criado_em, atualizado_em)
           values
             ($1, $2, $3, $4, $5, null, $6,
              'EM_ADMISSAO', false, $7, 'MANUAL', $8,
              $9, now(), now())
           on conflict (id) do nothing`,
          [
            l.admissaoId,
            cpf,
            cliente.cod_cliente,
            cargo.id,
            l.completa ? "Temporário" : null,
            l.completa ? "2026-10-01" : null,
            l.completa ? "OK" : "PENDENTE",
            l.comPastaNoDrive ? `https://drive.google.com/drive/folders/ARNES-MANUAL-${l.apelido}` : null,
            l.aso === "VALIDADO",
          ],
        );

        // 3) DADOS DA VAGA/FOLHA, só na linha COMPLETA: é o que zera a pendência obrigatória. Salário
        //    declarado na allowlist; endereço NULO de propósito.
        if (l.completa) {
          await tx.unsafe(
            `insert into dados_vaga_folha
               (admissao_id, salario, beneficios, escala, centro_custo, setor, gestor_bp, endereco,
                possui_uniforme)
             values
               ($1, $2, 'VT, VR', '12x36', 'CC-SIMULADO', 'OPERACAO', 'GESTOR SIMULADO', null,
                false)
             on conflict (admissao_id) do nothing`,
            [l.admissaoId, SALARIO_SINTETICO],
          );
        }

        // 4) AS DUAS FRENTES QUE NASCEM JUNTAS (§A.3, regra 1).
        for (const frente of [
          { tipo: "AUDITORIA", status: l.statusAuditoria, concluida: l.auditoriaConcluida },
          { tipo: "EXAME", status: l.statusExame, concluida: l.exameConcluido ?? false },
          ...(l.frentesExtras ?? []),
        ]) {
          await tx.unsafe(
            `insert into frentes_admissao
               (admissao_id, tipo, status, data_inicio, data_conclusao, concluida, criado_em, atualizado_em)
             values ($1, $2::frente_tipo, $3, now(), $4, $5, now(), now())
             on conflict (admissao_id, tipo) do nothing`,
            [
              l.admissaoId,
              frente.tipo,
              frente.status,
              frente.concluida ? new Date().toISOString() : null,
              frente.concluida,
            ],
          );
        }

        // 5) O DOCUMENTO `ASO`, que é o que a aba Exame desenha como "ASO", "Anexado" ou "Validado".
        //    `PENDENTE` sem observação é a linha que a régua cria ao nascer (nada anexado);
        //    `AGUARDANDO_AUDITORIA` COM observação é atestado anexado esperando veredito;
        //    `ENTREGUE` com observação é o validado. Ver `domain/aso-documento.ts`.
        const estadoDoc =
          l.aso === "VALIDADO"
            ? "ENTREGUE"
            : l.aso === "ANEXADO_SEM_VEREDITO"
              ? "AGUARDANDO_AUDITORIA"
              : "PENDENTE";
        const obsDoc =
          l.aso === "VALIDADO" ? "Apto." : l.aso === "ANEXADO_SEM_VEREDITO" ? "ASO anexado." : null;
        await tx.unsafe(
          `insert into documentos_admissao
             (admissao_id, tipo_documento_id, estado, observacao, atualizado_em)
           values ($1, $2, $3::estado_documento, $4, now())
           on conflict (admissao_id, tipo_documento_id) do nothing`,
          [l.admissaoId, tipoAso.id, estadoDoc, obsDoc],
        );
      }

      /**
       * ─ A SEXTA LINHA (ver `LINHA_RECUSADA`) ────────────────────────────────────────────────────
       *
       * A CONTA DE CAPTURA É EXIGÊNCIA, NÃO PREFERÊNCIA: é o nome dela que a aba Recusadas imprime na
       * coluna "Recusado por", e ele é o único nome de usuário que a allowlist declara. Se a conta não
       * existir na homologação, o seed ABORTA em vez de cair num usuário qualquer: escolher outro
       * usuário aqui seria carimbar um COLEGA como autor de uma recusa que ele não fez, e ainda
       * recusaria o print pela denylist, que é o defeito que esta linha existe para fechar.
       */
      const contaDeCaptura = (
        await tx.unsafe(`select id from usuarios where email = $1 limit 1`, [
          "manual.captura@homolog.local",
        ])
      )[0] as unknown as { id: string } | undefined;
      if (!contaDeCaptura) {
        throw new Error(
          "Aborta: a conta de captura `manual.captura@homolog.local` não existe na homologação. A " +
            "recusa sintética TEM de ser autoria dela: qualquer outro usuário é um colega real, e " +
            "carimbá-lo como autor de uma recusa que ele não fez é falsear trilha (§A.6).",
        );
      }

      const cpfRecusada = cpfSintetico(LINHA_RECUSADA.sequencia);
      await tx.unsafe(
        `insert into candidatos (cpf, nome, email, telefone, data_nascimento, criado_em, atualizado_em)
         values ($1, $2, $3, null, null, now(), now())
         on conflict (cpf) do nothing`,
        [
          cpfRecusada,
          nomeDaLinha(LINHA_RECUSADA),
          `arnes.manual.${LINHA_RECUSADA.apelido.toLowerCase()}@exemplo.invalid`,
        ],
      );
      /**
       * CLIENTE E CARGO NULOS, tipo de contrato e data NULOS: é o estado real de uma pré-admissão (o
       * de/para vaga→cliente é manual, §A.9, e a liberação é justamente o ato que os preenche). Sem
       * `dados_vaga_folha` e sem frente nenhuma, pelo mesmo motivo.
       */
      await tx.unsafe(
        `insert into admissoes
           (id, candidato_cpf, cod_cliente, cargo_id, tipo_contrato, matricula, data_admissao,
            farol_global, is_banco, sinalizador_preenchimento, origem, recusado_por_id, recusado_em,
            criado_em, atualizado_em)
         values
           ($1, $2, null, null, null, null, null,
            'LIBERACAO_RECUSADA', false, 'PENDENTE', 'MANUAL', $3, now(),
            now(), now())
         on conflict (id) do nothing`,
        [LINHA_RECUSADA.admissaoId, cpfRecusada, contaDeCaptura.id],
      );
    });

    console.log("");
    console.log("ARNÊS DO MANUAL PLANTADO (idempotente)");
    console.log("=".repeat(72));
    for (const l of LINHAS) {
      console.log(
        `  ${nomeDaLinha(l).padEnd(18)} cpf=${cpfSintetico(l.sequencia)} ` +
          `auditoria=${l.statusAuditoria}${l.auditoriaConcluida ? " (concluída)" : ""} ` +
          `exame=${l.statusExame}${l.exameConcluido ? " (concluído)" : ""} ` +
          `aso=${l.aso}${l.comPastaNoDrive ? " drive=sim" : ""}` +
          `${l.frentesExtras?.length ? ` extras=${l.frentesExtras.map((f) => f.tipo).join("+")}` : ""}` +
          `${l.completa ? " completa" : " COM pendência obrigatória"}`,
      );
    }
    console.log(
      `  ${nomeDaLinha(LINHA_RECUSADA).padEnd(18)} cpf=${cpfSintetico(LINHA_RECUSADA.sequencia)} ` +
        `pré-admissão RECUSADA pela conta de captura (farol LIBERACAO_RECUSADA, sem cliente/cargo, ` +
        `sem frente)`,
    );
    console.log("");
    console.log(
      "Predicado único: select count(*) from candidatos where nome like 'SIMULADO %' and cpf like '999000%';  -- deve dar 6",
    );
    console.log(
      "Expurgo: o mesmo `arnes-limpeza-homolog.ts` alcança estas linhas pelas marcas `999%` e `SIMULADO%`.",
    );
  } finally {
    await sql.end();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(`[arnes-manual] falhou: ${err instanceof Error ? err.message : "erro sem mensagem"}`);
    process.exit(1);
  });
}
