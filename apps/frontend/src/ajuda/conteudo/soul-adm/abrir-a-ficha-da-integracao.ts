import type { Artigo } from "../../tipos";

/**
 * N1 DA ABA INTEGRAÇÃO: a ficha do olho, que é de LEITURA e não edita nada.
 *
 * ┌─ O QUE O ARTIGO IRMÃO JÁ COBRE, E POR ISSO SAI DAQUI ───────────────────────────────────────┐
 * │ O artigo de acompanhar a integração menciona o olho num passo, e para ali. Este abre a ficha:   │
 * │ quais blocos ela tem, quais linhas cada bloco mostra, por que uma linha vem vazia, de onde os   │
 * │ benefícios saem e o que fazer quando a tela diz que a ficha está indisponível.                 │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE O RECORTE DELA É CURTO, E ISSO É DESENHO ──────────────────────────────────────────┐
 * │ É a tela que o consultor mostra ao candidato no dia da integração, então ela tem o que foi       │
 * │ contratado e o que a pessoa recebe, e nada da trilha, das pausas, dos documentos e do histórico  │
 * │ da admissão. E não edita NADA de propósito: campo editável ali convidaria a alterar contrato na  │
 * │ frente do candidato. A ficha completa da admissão é outra tela, com artigo próprio.             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O EFEITO DA CONCLUSÃO DA INTEGRAÇÃO NO FAROL, MEDIDO NO CÓDIGO ───────────────────────────┐
 * │ Medido em `esteira.service.mudarStatus`, e não deduzido, porque é exatamente aqui que o alcance │
 * │ desta aba já quebrou contagem de outras telas uma vez. O que o código faz, na MESMA transação   │
 * │ da mudança de status da frente de Integração:                                                   │
 * │   . realizada, ou concluída sem integração: farol vai para admissão concluída;                  │
 * │   . declínio e rescisão naquela frente: farol vai para declínio e rescisão, na hora;            │
 * │   . o carimbo de concluída ESPERA quando o Exame está no status de liberado sem o atestado, e    │
 * │     é escrito depois, no instante em que o Exame de fato fecha;                                 │
 * │   . para o cliente que NÃO exige integração, o mesmo carimbo acontece na conclusão do Cadastro.  │
 * │ O que NÃO foi possível confirmar lendo o código está reportado ao coordenador, e nada aqui foi   │
 * │ completado por suposição.                                                                       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: a ficha mostra nome, cargo, salário e matrícula de gente de verdade. Nenhum valor foi
 * copiado para este texto: o que se descreve é a LINHA, nunca o conteúdo dela.
 *
 * IMAGEM: pendência conhecida, não esquecimento. A ficha mostra pessoa e a captura foi vetada
 * enquanto a homologação não tiver base sintética. O texto funciona sem imagem.
 */
export const artigo: Artigo = {
  slug: "abrir-a-ficha-da-integracao",
  titulo: "Abrir A Ficha Da Integração",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "esteira",
  resumo:
    "A tela de leitura que o consultor usa no dia da integração: o que foi contratado, os benefícios daquela admissão e o que fazer quando a ficha não carrega.",
  termos: [
    "ficha da integracao",
    "ficha de apresentacao",
    "olhinho da integracao",
    "mostrar para o candidato",
    "o que foi contratado",
    "apresentar a proposta",
    "conferir salario",
    "conferir beneficios",
    "beneficios do candidato",
    "ficha indisponivel",
    "ficha nao abre",
    "somente leitura",
  ],
  preRequisitos: [
    "A pessoa já precisa estar na fila da aba Integração: a ficha é aberta a partir da linha dela.",
  ],
  passos: [
    {
      gesto: "Abra a Esteira Admissional, clique na aba Integração e ache a pessoa pela busca.",
      controles: ["Esteira Admissional", "INTEGRAÇÃO", "Buscar por nome, CPF ou cliente"],
    },
    {
      gesto: "Clique no olho da coluna Ações.",
      detalhe:
        "Nesta aba o olho abre a ficha da integração, que é mais curta que a ficha completa da admissão das outras abas.",
      controles: ["Ações", "Ver ficha (somente leitura)"],
    },
    {
      gesto: "Confira o nome no alto da janela antes de mostrar a tela a alguém.",
      detalhe: "Ele fica abaixo do título e é a garantia de que a ficha é da pessoa certa.",
      controles: ["Ficha Da Integração"],
    },
    {
      gesto: "Leia o bloco Contrato De Trabalho de cima para baixo.",
      detalhe:
        "São doze linhas, na ordem: cliente, cargo, tipo e tempo de contrato, data de admissão, salário, escala, local de trabalho, centro de custo, departamento, gestor e matrícula. A data aparece no formato do dia a dia e o salário já vem com o símbolo da moeda.",
      controles: [
        "Contrato De Trabalho",
        "Cliente",
        "Cargo",
        "Tipo de contrato",
        "Tempo de contrato",
        "Data de admissão",
        "Salário",
        "Escala",
        "Local de trabalho",
        "Centro de custo",
        "Departamento",
        "Gestor BP",
        "Matrícula",
      ],
    },
    {
      gesto: "Leia o bloco Benefícios.",
      detalhe:
        "Cada benefício é uma linha. Quando aquele benefício tem valor, o valor aparece; quando ele não tem valor a informar, a linha diz que foi concedido. Em admissão antiga, trazida da planilha, o bloco mostra o pacote em um texto só, porque foi assim que ele chegou.",
      controles: ["Benefícios", "Concedido", "Nenhum benefício cadastrado."],
    },
    {
      gesto: "Trate linha vazia como informação que falta, não como defeito da tela.",
      detalhe:
        "Onde não há dado, a ficha desenha um traço discreto. Se aquele campo é obrigatório, ele aparece nas pendências obrigatórias da admissão, e é lá que se resolve.",
    },
    {
      gesto: "Para mudar qualquer coisa, saia da ficha e edite no Gerenciador.",
      detalhe:
        "O rodapé da janela avisa isso, em uma linha: a visualização é apenas visualização, e as alterações de contrato e de benefícios são feitas no Gerenciador.",
      controles: ["Gerenciador"],
    },
    {
      gesto: "Feche a janela pelo X do canto quando terminar.",
      detalhe: "A tecla de escape também fecha. Clicar fora não fecha, porque ninguém fecha uma janela sem querer.",
      controles: ["Fechar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A janela mostra que está carregando e não sai disso.",
      acao: "A ficha busca os dados na hora em que abre. Feche e abra de novo; continuando assim, é rede ou serviço fora, e o caso é de TI.",
    },
    {
      sintoma: "A janela diz que a ficha está indisponível.",
      acao: "O texto exato é \"Ficha indisponível.\" Os dados do contrato não vieram. Confira a admissão no Gerenciador: quem foi excluído ou trocado de registro não tem ficha a montar.",
    },
    {
      sintoma: "A janela diz que a admissão não foi encontrada.",
      acao: "A mensagem é \"Admissão não encontrada\". A linha da fila está velha, na tela de quem não recarregou. Recarregue a aba e abra a ficha pela linha nova.",
    },
    {
      sintoma: "O bloco de benefícios diz que nenhum benefício está cadastrado.",
      acao: "A frase é \"Nenhum benefício cadastrado.\" e é informação, não erro: aquela admissão não tem pacote montado nem texto de pacote antigo. O caminho é montar o pacote na tela de benefícios antes da conversa.",
    },
    {
      sintoma: "Várias linhas do contrato estão vazias.",
      acao: "Os dados da folha, como salário, escala, local, centro de custo, departamento e gestor, vêm do anexo da vaga daquela admissão, e a admissão nasce sem eles. Preencha pelo lápis da linha ou pelo Gerenciador, que a ficha passa a mostrar na próxima abertura.",
    },
    {
      sintoma: "A matrícula está vazia e a pessoa já foi cadastrada na folha.",
      acao: "A ficha mostra o que está gravado na admissão. Lance a matrícula pelo lápis da linha na aba Cadastro, ou pela importação da planilha, e abra a ficha de novo.",
    },
  ],
  regras: [
    "A ficha é só de leitura: nada nela é editável, e o rodapé diz onde a alteração é feita.",
    "O recorte é curto de propósito: contrato e benefícios, sem trilha, sem documentos e sem histórico. A ficha completa da admissão é outra tela.",
    "Os benefícios vêm de duas origens: o pacote montado no sistema e, nas admissões trazidas da planilha, o texto do pacote antigo. A ficha mostra o que existir.",
    "Linha vazia é dado que falta na admissão, não defeito da ficha.",
    "Concluir a integração como realizada carimba a admissão como concluída, na mesma hora, e a linha sai da fila.",
    "Concluir a admissão sem passar pela integração leva ao mesmo carimbo de concluída: o que distingue os dois casos é o status da frente.",
    "Declínio e rescisão marcados nessa frente vão direto para o farol correspondente da admissão.",
    "Quando o exame foi liberado sem o atestado, o carimbo de concluída espera: ele é escrito no momento em que o exame de fato fecha.",
    "Para o cliente que não exige integração, o carimbo de concluída acontece na conclusão do Cadastro, e a pessoa nunca passa por esta aba.",
  ],
  relacionados: [
    "acompanhar-a-integracao",
    "agendar-a-integracao-de-uma-turma",
    "ler-a-ficha-da-admissao",
    "montar-o-pacote-de-beneficios",
    "editar-os-dados-de-uma-admissao",
    "entender-o-farol-e-as-pendencias-obrigatorias",
  ],
  fontes: [
    "apps/frontend/src/components/esteira/ApresentacaoIntegracaoModal.tsx",
    "apps/frontend/src/app/(app)/esteira/page.tsx",
    "apps/backend/src/esteira/esteira.service.ts",
    "apps/backend/src/domain/admissao.ts",
  ],
  revisadoEm: "2026-09-30",
};
