import type { Artigo } from "../../tipos";

/**
 * N1 DO GERENCIADOR: A JANELA DE PENDÊNCIAS, POR DENTRO.
 *
 * ┌─ A FRONTEIRA COM O ARTIGO DO FAROL, QUE JÁ EXISTE E JÁ CITA ESTA JANELA ──────────────────────┐
 * │ O artigo do farol responde O QUE a régua cobra e o que zera cada item, e cita a janela de        │
 * │ passagem. Este responde a janela POR DENTRO: o que ela mostra enquanto carrega, o que ela mostra │
 * │ quando não há nada, e, principalmente, QUAIS dos itens listados o botão de preencher realmente   │
 * │ abre. Ele NÃO recita a lista de campos da régua nem ensina a preencher campo por campo: aquilo   │
 * │ é do artigo do farol e do artigo do lápis, e recitar de novo é criar a segunda lista que diverge.│
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A PARTE QUE SÓ ESTE ARTIGO SABE, E ELA FOI LIDA DO CÓDIGO ───────────────────────────────────┐
 * │ "Preencher pendências" abre o formulário reduzido aos campos que ele SABE abrir, e o mapa é      │
 * │ fechado (`PendenciasModal.CAMPO_KEY`): Salário, Tipo de contrato, Data de admissão, Pacote de    │
 * │ benefícios, Escala, Centro de custo e Gestor / BP. Ficam FORA, e por isso a janela pode listar um │
 * │ item que o botão não abre: Cliente, Cargo, Setor, Uniforme e Termo de Banco. O botão inteiro só   │
 * │ aparece quando ao menos um item da lista está no mapa. Sem esta linha escrita, a pessoa clica,    │
 * │ não acha a caixa e conclui que a tela está quebrada.                                             │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A COINCIDÊNCIA COM O SINALIZADOR FOI CONFERIDA, NÃO SUPOSTA: a lista da janela sai de
 * `pendenciasObrigatorias` no detalhe da admissão, e a etiqueta da coluna sai da MESMA função em
 * lote (`regua/pendencias-lote`), as duas com a configuração do mesmo cliente. Não são duas contas
 * que concordam por sorte: é uma conta lida de dois lugares.
 *
 * §A.6: a janela mostra o nome da pessoa no topo, e nenhum nome aparece neste arquivo. O rótulo
 * declarado é a parte ESTÁVEL, nunca o rótulo que carrega nome dentro.
 *
 * SEM IMAGEM, PENDÊNCIA CONHECIDA: a captura está vetada pela auditoria de segurança enquanto a
 * homologação não tiver arnês sintético, e esta janela escreve o nome de uma pessoa no cabeçalho.
 */
export const artigo: Artigo = {
  slug: "ler-o-modal-de-pendencias-obrigatorias",
  titulo: "Ler A Janela De Pendências Obrigatórias",
  modulo: "SOUL_ADM",
  rotas: ["/gerenciador"],
  menus: ["gerenciador"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "gerenciador",
  resumo:
    "Como abrir a janela que lista o que falta numa admissão, o que cada estado dela quer dizer e quais itens o botão de preencher abre direto para você.",
  termos: [
    "pendencias obrigatorias",
    "o que falta",
    "falta preencher",
    "clicar na etiqueta",
    "parcial",
    "completo",
    "ver pendencias",
    "preencher pendencias",
    "lista do que falta",
    "campo obrigatorio vazio",
    "abriu sem nada",
    "nao acho o campo",
  ],
  preRequisitos: [
    "Estar com a lista do Gerenciador aberta. A etiqueta fica na coluna Pendências Obrig., perto do fim da linha.",
  ],
  passos: [
    {
      gesto: "Clique na etiqueta da coluna Pendências Obrig., na linha da pessoa.",
      detalhe:
        "Ela é um botão, e não só um rótulo: a borda tracejada é a pista. Passando o mouse, a dica lê Ver pendências obrigatórias.",
      controles: ["Pendências Obrig.", "Ver pendências obrigatórias"],
    },
    {
      gesto: "Leia o cabeçalho da janela Pendências obrigatórias.",
      detalhe:
        "Abaixo do título vem o nome da pessoa, em caixa alta, para você confirmar que abriu a linha certa antes de mexer em qualquer coisa.",
      controles: ["Pendências obrigatórias"],
    },
    {
      gesto: "Leia a lista: um item por linha, cada um um campo obrigatório em branco.",
      detalhe:
        "É a mesma régua que decide a etiqueta da coluna e o resumo de pendências da ficha, então as duas leituras não se contradizem. A régua também respeita o que cada cliente exige: item desligado para um cliente não aparece na lista dele.",
    },
    {
      gesto: "Clique em Preencher pendências para corrigir sem caçar campo.",
      detalhe:
        "O formulário de edição abre reduzido aos itens que este botão sabe abrir: salário, tipo de contrato, data de admissão, pacote de benefícios, escala, centro de custo e gestor. Nada mais aparece na janela, e é por isso que ela é rápida.",
      controles: ["Preencher pendências", "Salvar alterações"],
    },
    {
      gesto: "Para os itens que o botão não abre, use o caminho próprio de cada um.",
      detalhe:
        "Cliente e cargo são identidade da admissão e se corrigem pela ficha, com papel de Master. O uniforme é respondido na ficha. O setor é preenchido na liberação. O termo de banco sobe no formulário de edição, no bloco de situação.",
      controles: ["Editar uniforme", "Termo de Banco"],
    },
    {
      gesto: "Feche pelo Fechar e confira a etiqueta da linha.",
      detalhe:
        "Zerada a lista, a etiqueta passa a ler Completo sozinha, sem ninguém marcar nada. A janela não fecha por clique fora: saia pelo Fechar ou pela tecla Esc.",
      controles: ["Fechar", "Completo"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A janela mostra Falha ao carregar pendências.",
      acao: "A consulta não voltou e a lista não é confiável. Feche pelo Esc, recarregue a página e abra de novo pela etiqueta.",
    },
    {
      sintoma: "A janela ficou escrita Carregando… e não saiu disso.",
      acao: "A resposta não chegou. Feche, recarregue a página e tente outra vez.",
    },
    {
      sintoma: "A janela mostra Nenhuma pendência obrigatória.",
      acao: "Não falta nada nessa admissão. Se a etiqueta da linha ainda lê Parcial, a sua tela está velha: recarregue a página, porque as duas leituras saem da mesma régua.",
    },
    {
      sintoma: "O botão Preencher pendências não aparece.",
      acao: "Ele existe só quando ao menos um item da lista é preenchível por ali. Lista feita apenas de cliente, cargo, setor, uniforme ou termo de banco não tem botão, e cada um desses tem caminho próprio.",
    },
    {
      sintoma: "Cliquei em Preencher pendências e um dos itens listados não tem caixa no formulário.",
      acao: "O formulário reduzido abre só os itens que ele sabe abrir. Cliente e cargo se corrigem pela ficha, com papel de Master. Uniforme é respondido na ficha, setor na liberação, e termo de banco no bloco de situação do formulário de edição.",
    },
    {
      sintoma: "A etiqueta da linha lê Declínio e clicar nela abre uma lista vazia.",
      acao: "É coerente: admissão encerrada não tem pendência de processo vivo. O que existia continua visível na ficha, pelo olho.",
    },
    {
      sintoma: "Preenchi o campo e a lista continua mostrando o item.",
      acao: "A janela carregou antes do seu salvamento. Feche e abra de novo pela etiqueta: cada campo sai da lista no instante em que ganha valor.",
    },
  ],
  regras: [
    "A lista da janela e a etiqueta da coluna saem da mesma régua, lida em dois lugares. As duas nunca discordam depois de a tela recarregar.",
    "A régua respeita a exigência de cada cliente: item que aquele cliente não exige não aparece na lista dele.",
    "A etiqueta é calculada, nunca marcada à mão: zero pendência lê Completo por si só.",
    "O botão Preencher pendências abre o formulário reduzido a salário, tipo de contrato, data de admissão, pacote de benefícios, escala, centro de custo e gestor.",
    "Cliente, cargo, setor, uniforme e termo de banco aparecem na lista e não abrem por aquele botão: cada um tem o seu caminho.",
    "Em admissão de banco, a data de admissão sai da lista e entra o termo de banco.",
    "Admissão encerrada por declínio ou rescisão não tem pendência de processo vivo, e a coluna dela lê Declínio.",
    "A janela é de leitura e não bloqueia nada: pendência sinaliza, ela não impede a admissão de andar.",
  ],
  relacionados: [
    "entender-o-farol-e-as-pendencias-obrigatorias",
    "editar-os-dados-de-uma-admissao",
    "salvar-com-campo-obrigatorio-vazio",
    "aceitar-o-avanco-com-pendencias",
    "marcar-uma-admissao-como-banco",
    "ler-a-ficha-da-admissao",
    "ler-a-linha-da-tabela",
    "abrir-e-fechar-uma-janela-do-sistema",
  ],
  fontes: [
    "apps/frontend/src/components/gerenciador/PendenciasModal.tsx",
    "apps/frontend/src/components/ui/PendenciasBadge.tsx",
    "apps/frontend/src/lib/pendencias-pill.ts",
    "apps/frontend/src/app/(app)/gerenciador/page.tsx",
    "apps/backend/src/domain/admissao.ts",
    "apps/backend/src/regua/pendencias-lote.ts",
  ],
  revisadoEm: "2026-09-30",
};
