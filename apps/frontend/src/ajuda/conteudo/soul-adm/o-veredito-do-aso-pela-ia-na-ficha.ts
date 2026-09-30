import type { Artigo } from "../../tipos";

/**
 * A FICHA, PEÇA 1 de 2: O VEREDITO DO ATESTADO. Lida junto da peça das correções, porque as duas
 * vivem na MESMA ficha (`components/esteira/AdmissaoDetalheModal.tsx`), e ler a janela duas vezes é
 * como duas cabeças divergem sobre o mesmo bloco.
 *
 * ┌─ O QUE ESTE ARTIGO COBRE, E A FRONTEIRA COM OS ARTIGOS IRMÃOS ────────────────────────────────┐
 * │ COBRE os quatro estados que a FICHA escreve para o atestado, letra por letra, o motivo que a     │
 * │ inteligência artificial escreve embaixo deles e o controle de abrir o arquivo para conferir.     │
 * │ NÃO cobre ANEXAR, que é artigo da fila do exame e fala dos rótulos CURTOS do botão da linha      │
 * │ (ASO, Anexado, Validado, Reprovado). NÃO cobre liberar apto sem atestado validado, que é artigo  │
 * │ próprio. Os dois estão em relacionados, e os rótulos da linha ficam declarados LÁ, não aqui:     │
 * │ mesma informação em dois artigos é a divergência do próximo ajuste.                             │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ UMA CORREÇÃO MEDIDA, E ELA MUDA O QUE O ARTIGO PODE PROMETER ────────────────────────────────┐
 * │ O bloco do veredito SÓ é desenhado quando a ficha recebe o estado do atestado, e quem o passa é  │
 * │ a fila do EXAME (`app/(app)/esteira/page.tsx`: `asoAnexado={isExame ? ... : undefined}`). Na      │
 * │ ficha aberta pelo Gerenciador o bloco do exame aparece com o AGENDAMENTO e SEM as etiquetas do    │
 * │ veredito. O artigo diz isso no primeiro passo, em vez de deixar a pessoa procurar uma etiqueta    │
 * │ que aquela tela não desenha. A peça irmã da ficha (o artigo do mapa) declarou as quatro etiquetas │
 * │ entre os controles do bloco do exame; ficam aqui com o caminho certo de chegar até elas.          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6, E VALE DOBRADO AQUI: atestado de saúde é dado sensível. Nada neste arquivo cita resultado de
 * exame, nome, CPF ou qualquer valor visto em tela, base ou registro. O que o artigo nomeia são os
 * RÓTULOS dos estados, nunca o conteúdo do documento de alguém.
 *
 * SEM IMAGEM, PENDÊNCIA CONHECIDA: a captura das telas que mostram gente está vetada pela auditoria
 * de segurança enquanto a homologação não tiver arnês sintético.
 */
export const artigo: Artigo = {
  slug: "o-veredito-do-aso-pela-ia-na-ficha",
  titulo: "O Veredito Do ASO Pela I.A",
  modulo: "SOUL_ADM",
  rotas: ["/esteira", "/gerenciador"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "gerenciador",
  resumo:
    "Os quatro estados que a ficha escreve para o atestado do exame, o que cada um quer dizer, onde aparece a razão de uma recusa e como abrir o arquivo para conferir.",
  termos: [
    "aso",
    "atestado",
    "atestado de saude",
    "exame admissional",
    "veredito",
    "validado pela ia",
    "reprovado",
    "reprovado pela ia",
    "aguardando validacao",
    "aso nao anexado",
    "ver aso",
    "abrir o atestado",
    "por que recusou",
    "inteligencia artificial",
    "quem aprova o aso",
  ],
  preRequisitos: [
    "Abrir a ficha pelo olho da fila do exame. A ficha aberta pelo Gerenciador mostra o agendamento do exame, e não as etiquetas do veredito.",
  ],
  passos: [
    {
      gesto: "Na fila do exame, clique no olho da linha da pessoa para abrir a ficha.",
      detalhe:
        "É por esse caminho que a ficha recebe o estado do atestado. A ficha aberta a partir do Gerenciador traz o bloco do exame com data, horário, clínica e previsão, sem as etiquetas desta leitura.",
      controles: ["Ver ficha"],
    },
    {
      gesto: "Desça até o bloco Exame admissional e leia a linha que começa com ASO (I.A).",
      detalhe:
        "Ela fica logo abaixo dos dados do agendamento, separada por um traço. Previsão do ASO é a data prometida pela clínica, e não tem relação com o veredito.",
      controles: ["Exame admissional", "ASO (I.A):", "Previsão do ASO"],
    },
    {
      gesto: "Leia a etiqueta, que é uma destas quatro, escrita exatamente assim.",
      detalhe:
        "ASO Não Anexado é atestado que ainda não chegou. ASO Anexado, Aguardando Validação Da I.A é arquivo recebido com a leitura ainda em curso. ASO Validado Pela I.A é atestado aceito. ASO Reprovado Pela I.A é atestado recusado, e recusado não vira aceito com o tempo: é preciso um documento novo.",
      controles: [
        "ASO Não Anexado",
        "ASO Anexado, Aguardando Validação Da I.A",
        "ASO Validado Pela I.A",
        "ASO Reprovado Pela I.A",
      ],
    },
    {
      gesto: "Leia a frase abaixo da etiqueta, quando ela existir.",
      detalhe:
        "É a razão escrita pela própria inteligência artificial, e ela é o que resolve uma recusa: diz o que faltou ou o que não fechou no documento. Em vermelho acompanha a recusa, em verde a aprovação e em amarelo a leitura pendente. Sem frase, não houve observação nenhuma.",
    },
    {
      gesto: "Clique em Ver ASO para abrir o arquivo e conferir com os seus olhos.",
      detalhe:
        "O botão aparece só quando existe atestado anexado. Enquanto abre, ele lê Abrindo. O arquivo abre em uma aba nova do navegador.",
      controles: ["Ver ASO", "Abrindo…"],
    },
    {
      gesto: "Feche a ficha pelo Fechar, no canto, ou pela tecla Esc.",
      detalhe:
        "A ficha é de leitura: nada do que você leu aqui muda o veredito. Quem decide é a leitura do documento, não a tela.",
      controles: ["Fechar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Abri a ficha e não achei nenhuma etiqueta de veredito no bloco do exame.",
      acao: "Você abriu a ficha por outra tela. Abra pelo olho da fila do exame: é esse caminho que traz a leitura do atestado para a ficha.",
    },
    {
      sintoma: "A etiqueta lê ASO Anexado, Aguardando Validação Da I.A e não muda.",
      acao: "A leitura não concluiu. Não existe botão de validar à mão: quem pede uma nova leitura é o reenvio do arquivo, pela fila do exame.",
    },
    {
      sintoma: "A etiqueta lê ASO Reprovado Pela I.A e eu não sei por quê.",
      acao: "A razão está escrita logo abaixo da etiqueta, em vermelho. Se ela estiver vazia, abra o arquivo pelo Ver ASO e confira o documento antes de pedir outro à clínica.",
    },
    {
      sintoma:
        "Cliquei em Ver ASO e apareceu Documento não está mais disponível para visualização. Verifique no Pandapé.",
      acao: "O arquivo é temporário: o sistema guarda a situação do documento, não uma cópia permanente. Para conferir o atestado depois disso, abra o prontuário no Google Drive.",
    },
    {
      sintoma: "Cliquei em Ver ASO e apareceu Falha ao abrir o ASO.",
      acao: "A abertura não foi aceita. Feche a ficha, recarregue a página e tente de novo. Se repetir, avise a administração.",
    },
    {
      sintoma: "O botão Ver ASO não aparece.",
      acao: "Ele existe só quando há atestado anexado. Com a etiqueta em ASO Não Anexado não há arquivo para abrir.",
    },
    {
      sintoma: "O atestado está reprovado e a pessoa precisa seguir para o cadastro hoje.",
      acao: "Existe um caminho próprio para liberar o avanço sem o atestado validado, e ele é restrito e registrado. Não force o veredito: procure o artigo de liberar apto sem ASO validado.",
    },
  ],
  regras: [
    "Quem decide se o atestado está válido é a inteligência artificial, na leitura do documento. A ficha mostra o veredito, ela não o altera.",
    "Os quatro estados são excludentes: não anexado, anexado com leitura pendente, validado e reprovado.",
    "Reprovado é estado próprio, e não uma espera: ele não vira validado sozinho.",
    "A razão da recusa é escrita pela própria leitura e aparece abaixo da etiqueta. Ela é a informação que resolve o caso.",
    "O arquivo do atestado é temporário no sistema. Depois do prazo, a conferência é feita no prontuário do Google Drive.",
    "Previsão do ASO é a data prometida pela clínica, não um estado do documento.",
    "O bloco do veredito aparece na ficha aberta pela fila do exame. Pela lista geral, a ficha traz o agendamento do exame sem as etiquetas.",
  ],
  relacionados: [
    "anexar-o-aso-no-exame",
    "liberar-apto-sem-aso-validado",
    "ler-a-ficha-da-admissao",
    "visualizar-um-documento-da-admissao",
    "abrir-o-prontuario-no-drive",
    "corrigir-o-cpf-o-cliente-e-o-cargo-pela-ficha",
    "o-mapa-das-frentes-da-admissao",
  ],
  fontes: [
    "apps/frontend/src/components/esteira/AdmissaoDetalheModal.tsx",
    "apps/frontend/src/app/(app)/esteira/page.tsx",
    "apps/backend/src/reauditoria/documento-arquivo.service.ts",
    "apps/backend/src/esteira/esteira.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
