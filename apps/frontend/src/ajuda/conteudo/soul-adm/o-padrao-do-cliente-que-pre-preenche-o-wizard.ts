import type { Artigo } from "../../tipos";

/**
 * N2 DO CADASTRO: POR QUE O FORMULÁRIO JÁ CHEGA COM COISA ESCRITA.
 *
 * ┌─ O ARTIGO EXISTE PORQUE CAMPO PREENCHIDO SOZINHO GERA DESCONFIANÇA ──────────────────────────┐
 * │ Quem abre a etapa da folha e encontra escala e endereço já escritos tem duas reações ruins:     │
 * │ aceitar sem ler, achando que o sistema sabe, ou travar, achando que não pode mexer. As duas     │
 * │ custam: a primeira leva dado errado para a folha, a segunda para o chamado. O artigo diz as     │
 * │ duas coisas com todas as letras: é SUGESTÃO, e editar é o uso normal.                          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A REGRA DE SOBRESCRITA, MEDIDA E NÃO SUPOSTA ───────────────────────────────────────────────┐
 * │ `selecionarCliente` (`app/(app)/nova/page.tsx`) aplica o padrão novo só quando o campo está    │
 * │ VAZIO ou quando ele ainda é o padrão do cliente ANTERIOR. O que a pessoa digitou fica de pé na  │
 * │ troca de cliente. É o detalhe que faz a diferença entre "o sistema apagou o que eu escrevi" e   │
 * │ "o sistema trocou uma sugestão por outra", e ninguém descobre isso sozinho.                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ESTA PEÇA **NÃO** COBRE, de propósito: manter o cadastro do cliente (o padrão é lido dali e
 * a tela de cadastro da admissão não o edita) e a memória do pacote por cliente e cargo, que é outra
 * origem de sugestão e tem peça própria.
 *
 * SEM IMAGEM, PENDÊNCIA CONHECIDA: captura vetada pela auditoria de segurança enquanto a
 * homologação não tiver arnês sintético. §A.6: nenhum dado de pessoa nem de cliente real.
 */
export const artigo: Artigo = {
  slug: "o-padrao-do-cliente-que-pre-preenche-o-wizard",
  titulo: "O Padrão Do Cliente Que Pré-Preenche",
  modulo: "SOUL_ADM",
  rotas: ["/nova"],
  menus: ["nova"],
  publico: "AMBOS",
  nivel: "N2",
  familia: "nova-admissao",
  resumo:
    "Escala, endereço e benefícios chegam preenchidos a partir do cadastro do cliente. São sugestões para poupar digitação, podem ser editadas sem medo, e trocar o cliente não apaga o que você digitou.",
  termos: [
    "ja veio preenchido",
    "de onde vem esse beneficio",
    "por que a escala veio preenchida",
    "padrao do cliente",
    "endereco ja preenchido",
    "campo preenchido sozinho",
    "sugestao",
    "pode editar",
    "posso mudar",
    "pre preenchimento",
    "autopreenchimento",
  ],
  preRequisitos: [
    "Estar na etapa Vaga / Cargo do cadastro, com o cliente já escolhido. É a escolha do cliente que traz as sugestões.",
  ],
  passos: [
    {
      gesto: "Escolha o cliente na primeira etapa e siga para a etapa Vaga / Cargo.",
      detalhe:
        "As sugestões chegam junto com o cliente. Antes de escolher um, os campos da folha ficam vazios.",
      controles: ["Cliente", "Vaga / Cargo"],
    },
    {
      gesto: "Olhe a linha de apoio abaixo da Escala.",
      detalhe:
        "Quando o cliente tem escala padrão cadastrada, a escala já vem escolhida e a linha abaixo do seletor diz que aquilo é padrão do cliente e que é editável. Sem padrão cadastrado, o seletor nasce vazio, e isso não é falha.",
      controles: ["Escala *", "Padrão do cliente (pré-selecionado, editável):"],
    },
    {
      gesto: "Confira o Endereço, que segue a mesma régua da escala.",
      detalhe:
        "Ele chega com o endereço padrão do cliente e aceita ser trocado por cima. É o endereço do posto de trabalho, então confira quando a pessoa for trabalhar em outro lugar.",
      controles: ["Endereço"],
    },
    {
      gesto: "Leia as linhas de apoio abaixo dos Benefícios.",
      detalhe:
        "Há duas origens de sugestão aqui, e a tela diz qual é qual: padrão do cliente é o que está no cadastro dele, e pacote sugerido pela última admissão é a memória daquele cliente com aquele cargo, que tem artigo próprio.",
      controles: ["Benefícios *", "Padrão do cliente:", "Pacote sugerido pela última admissão deste cliente/cargo (editável):"],
    },
    {
      gesto: "Confira o campo de valor dos benefícios que pedem valor.",
      detalhe:
        "Tendo o cliente valor padrão guardado para aquele benefício, o campo chega com ele e a linha de apoio avisa que é padrão salvo do cliente e editável. Digitar por cima passa a valer só para esta admissão.",
      controles: ["Valor de", "Padrão salvo deste cliente (editável)."],
    },
    {
      gesto: "Edite o que não servir, sem medo.",
      detalhe:
        "A sugestão poupa digitação, ela não decide por você. O que você deixar na tela é o que vai para a admissão, e o cadastro do cliente continua como estava.",
    },
    {
      gesto: "Trocando o cliente, confira as sugestões outra vez.",
      detalhe:
        "O sistema substitui apenas o campo que está vazio ou que ainda era a sugestão do cliente anterior. O que você digitou à mão continua na tela, então vale reler antes de seguir.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "A escala chegou preenchida e não é a escala desta vaga.",
      acao: "Troque no seletor. A sugestão é do cliente e vale para a maioria das vagas dele, não para todas. O que ficar na tela é o que vai para a admissão.",
    },
    {
      sintoma: "Troquei o cliente e a escala que eu havia escolhido à mão continuou lá.",
      acao: "É de propósito, para o sistema não apagar o seu trabalho. Ele só substitui o campo vazio ou o que ainda era a sugestão do cliente anterior. Reveja a escala e o endereço depois de trocar o cliente.",
    },
    {
      sintoma: "Escolhi o cliente e nada veio preenchido.",
      acao: "Aquele cadastro não tem padrão de escala, endereço ou benefícios. Preencha à mão: não é erro, é cadastro sem padrão informado.",
    },
    {
      sintoma: "O endereço sugerido é o da sede e a pessoa vai trabalhar em outra unidade.",
      acao: "Escreva o endereço do posto de trabalho por cima. Quando o cliente tem lojas cadastradas, escolha também a loja no campo próprio, que é outro dado.",
    },
    {
      sintoma: "Mudei o benefício aqui e quero saber se isso alterou o cadastro do cliente.",
      acao: "Não alterou. A edição vale só para esta admissão. Mudar o padrão do cliente é assunto do cadastro dele, mantido pela administração.",
    },
  ],
  regras: [
    "O padrão do cliente é sugestão, nunca regra: tudo o que chega preenchido pode ser editado.",
    "As sugestões vêm do cadastro do cliente e não são editadas na tela de cadastro da admissão.",
    "O que você edita vale só para aquela admissão e não muda o cadastro do cliente.",
    "Trocar o cliente substitui apenas o campo vazio ou o que ainda era a sugestão do cliente anterior. O que foi digitado à mão fica.",
    "Benefícios têm duas origens de sugestão: o padrão do cliente e o último pacote usado naquele cliente com aquele cargo.",
    "Cliente sem padrão cadastrado deixa os campos vazios, e isso é estado normal.",
  ],
  relacionados: [
    "definir-cargo-folha-e-beneficios-na-nova-admissao",
    "escolher-o-cliente-na-nova-admissao",
    "a-memoria-do-pacote-por-cliente-e-cargo",
    "cadastrar-uma-admissao-nova",
    "salvar-com-campo-obrigatorio-vazio",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/nova/page.tsx",
    "apps/backend/src/admin/catalogos/catalogos.service.ts",
    "apps/frontend/src/app/(app)/admin/clientes/page.tsx",
  ],
  revisadoEm: "2026-09-30",
};
