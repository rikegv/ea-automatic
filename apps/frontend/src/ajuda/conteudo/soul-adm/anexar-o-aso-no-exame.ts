import type { Artigo } from "../../tipos";

/**
 * ARTIGO PILOTO 1 (Fase 0), o da Esteira Admissional.
 *
 * Ele existe para o diretor validar o FORMATO antes de existirem 84: o texto é de EXECUÇÃO, no
 * imperativo e começando por verbo, sem nome de rota, sem nome de tabela e sem sigla de fábrica.
 * Quem lê está com a mão no mouse e a tela aberta.
 *
 * Os `print` apontam para arquivos que o motor de captura ainda vai gerar. O PNG não nasce aqui, e
 * a captura em lote está travada até a auditoria do gate de dado pessoal.
 *
 * O ARTIGO DIZ QUAL IMAGEM E O QUE ELA MOSTRA. ONDE AS SETAS VÃO é assunto do roteiro irmão, em
 * `capturas/<slug>.roteiro.ts`, e não se repete aqui: as duas cópias seriam iguais hoje e divergiriam
 * na centésima imagem, com o texto descrevendo uma seta e o print mostrando outra, sem nada falhar.
 *
 * ┌─ O `controles` ENTROU DEPOIS, E POR ISSO ESTE ARTIGO MEDIA 0% ────────────────────────────────┐
 * │ Ele é piloto: nasceu antes de o campo existir, então o detector de cobertura o classificava como │
 * │ N1 MUDO (artigo que existe e não nomeia nada, o que faz a tela dele medir zero). Os rótulos       │
 * │ abaixo foram lidos do componente, letra por letra, inclusive a caixa: as abas da Esteira são       │
 * │ escritas em maiúscula no código (`EXAME`), e o botão do ASO troca de palavra conforme o veredito   │
 * │ da leitura (`ASO` → `Anexado` / `Validado` / `Reprovado`), então os quatro estados são quatro      │
 * │ rótulos do MESMO controle e todos precisam estar declarados.                                      │
 * │                                                                                                   │
 * │ O ÚLTIMO PASSO FICA SEM `controles` DE PROPÓSITO, e isto não é esquecimento. O seletor de status   │
 * │ da linha se chama "Mudar status de <nome da pessoa>" para o leitor de tela, e as opções dele vêm   │
 * │ do catálogo vigente do exame. Nenhum dos dois é rótulo FIXO: declarar o nome de uma pessoa seria   │
 * │ dado pessoal em artigo (§A.6) e declarar o valor do catálogo envelheceria no primeiro renome.      │
 * │ Rótulo inventado é pior que campo vazio, porque MENTE para o detector.                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const artigo: Artigo = {
  slug: "anexar-o-aso-no-exame",
  titulo: "Anexar O ASO Na Aba Exame",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  /*
   * N1: caminho principal. Quem ler só os N1 do módulo consegue trabalhar. O N2 é o recurso
   * secundário, e os três pilotos são N1 de propósito: eles existem para validar o FORMATO.
   */
  nivel: "N1",
  resumo:
    "Como enviar o atestado do exame admissional na fila do Exame, entender o veredito da inteligência artificial e marcar a pessoa como apta.",
  termos: [
    "aso",
    "atestado",
    "atestado de saude ocupacional",
    "exame medico",
    "exame admissional",
    "medico",
    "clinica",
    "apto",
    "inapto",
    "anexar exame",
    "subir aso",
    "aso reprovado",
  ],
  preRequisitos: [
    "Ter o menu Esteira Admissional liberado para o seu usuário.",
    "A admissão já precisa estar na esteira, com a frente de Exame aberta.",
    "Ter em mãos o arquivo do atestado, em PDF ou em foto legível.",
  ],
  passos: [
    {
      gesto: "Abra a Esteira Admissional pelo menu da lateral esquerda.",
      controles: ["Esteira Admissional"],
      print: {
        arquivo: "01-esteira-abas.png",
        legenda: "Passo 1: a Esteira Admissional aberta, com as cinco abas no topo.",
      },
    },
    {
      gesto: "Clique na aba Exame.",
      detalhe:
        "Cada aba é uma fila independente. Quem está no Exame não sai de lá porque a auditoria andou.",
      controles: ["EXAME"],
      print: {
        arquivo: "02-aba-exame.png",
        legenda: "Passo 2: a aba Exame selecionada e a fila do exame na tela.",
      },
    },
    {
      gesto: "Digite o nome, o CPF ou o cliente na busca do topo para achar a pessoa.",
      detalhe: "A busca filtra a fila enquanto você digita, não precisa apertar nada.",
      controles: ["Buscar por nome, CPF ou cliente"],
    },
    {
      gesto: "Clique no botão ASO na linha da pessoa e escolha o arquivo do atestado.",
      detalhe:
        "Vale PDF, JPG ou PNG. Assim que o arquivo sobe, a inteligência artificial lê o documento e devolve o veredito sozinha: não existe botão de validar à mão.",
      controles: ["ASO / Avanço", "ASO"],
      print: {
        arquivo: "03-botao-aso.png",
        legenda: "Passo 4: o botão ASO na coluna de avanço da linha.",
      },
    },
    {
      gesto: "Confira o que o botão passou a dizer depois do envio.",
      detalhe:
        "Validado em verde é atestado aceito e pessoa apta. Anexado em amarelo é arquivo recebido com a leitura ainda pendente. Reprovado em vermelho é atestado recusado, e o motivo aparece ao passar o mouse sobre o botão.",
      controles: ["Validado", "Anexado", "Reprovado"],
      print: {
        arquivo: "04-veredito-do-aso.png",
        legenda: "Passo 5: o botão mostrando o veredito da leitura, em verde, amarelo ou vermelho.",
      },
    },
    {
      gesto: "Clique no olho ao lado do botão para abrir o atestado que você enviou.",
      detalhe: "Serve para conferir se o arquivo certo subiu antes de discutir a recusa.",
      controles: ["Visualizar o ASO anexado"],
      print: {
        arquivo: "05-ver-o-aso.png",
        legenda: "Passo 6: o botão de visualizar o atestado anexado.",
      },
    },
    {
      gesto:
        "Com o atestado validado, abra o seletor de status da linha e escolha a situação de apto.",
      detalhe:
        "É esse gesto que fecha a frente de Exame. As opções que aparecem são as do catálogo vigente do exame.",
      print: {
        arquivo: "06-status-apto.png",
        legenda: "Passo 7: o seletor de status da frente, na linha da pessoa.",
      },
    },
  ],
  seDerErrado: [
    {
      sintoma: "O botão ficou vermelho, escrito Reprovado.",
      acao: "Passe o mouse sobre o botão para ler o motivo da recusa. Peça o documento correto à clínica e anexe de novo: o novo envio substitui o veredito anterior.",
    },
    {
      sintoma: "O botão ficou amarelo, escrito Anexado, e não virou Validado.",
      acao: "A leitura não concluiu. Anexe o mesmo arquivo de novo para pedir uma nova avaliação.",
    },
    {
      sintoma: "O sistema não deixa marcar a pessoa como apta.",
      acao: "O atestado precisa estar validado antes. Enquanto não estiver, só o Super Admin consegue liberar, e ele assume o aceite dessa passagem, que fica registrado.",
    },
    {
      sintoma: "A pessoa não aparece na fila do Exame.",
      acao: "Limpe a busca e os filtros. Quem já concluiu o exame ou declinou sai da fila, e nesse caso a admissão é encontrada pelo Gerenciador.",
    },
    {
      sintoma: "Anexei o arquivo errado.",
      acao: "Anexe o correto pelo mesmo botão. Vale sempre o último arquivo enviado.",
    },
  ],
  regras: [
    "Quem valida o atestado é a inteligência artificial, na leitura do documento. Não existe validação manual pela tela.",
    "Auditoria e Exame correm em paralelo, e uma não depende da outra para andar.",
    "O Cadastro só abre depois que a Auditoria e o Exame fecham.",
    "Anexar de novo substitui o veredito anterior, inclusive uma recusa.",
    "O arquivo do atestado é temporário no sistema: o que fica guardado é a situação do documento, não uma cópia permanente na tela.",
  ],
  relacionados: [],
  fontes: [
    "apps/frontend/src/app/(app)/esteira/page.tsx",
    "apps/backend/src/esteira/esteira.service.ts",
  ],
  revisadoEm: "2026-09-27",
};
