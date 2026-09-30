import type { Artigo } from "../../tipos";

/**
 * A FICHA, PEÇA 2 de 2: AS CORREÇÕES DE IDENTIDADE. Lida junto da peça do veredito do atestado,
 * porque as duas vivem na MESMA ficha e ler a janela uma vez só é o que impede as duas de divergirem.
 *
 * ┌─ O QUE ESTE ARTIGO COBRE, E O QUE JÁ É ARTIGO DE OUTRO ───────────────────────────────────────┐
 * │ COBRE as três correções que a ficha permite e que o formulário de edição NÃO faz: trocar o par   │
 * │ cliente e cargo, corrigir o CPF, e o aceite que o sistema cobra quando o dado já saiu do EA.     │
 * │ NÃO cobre editar os demais campos, que é artigo do lápis, nem a leitura dos blocos da ficha, que │
 * │ é o artigo do mapa. A fronteira é a mesma que a tela desenha: o lápis escreve DADO, esta faixa   │
 * │ escreve IDENTIDADE.                                                                             │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ UMA PRECISÃO QUE O TEXTO DO PEDIDO NÃO TINHA, E ELA MUDA O PASSO A PASSO ────────────────────┐
 * │ O aceite de dupla correção NÃO é cobrado no ato de corrigir o CPF nem no de trocar o cliente:    │
 * │ quem o cobra é o REENVIO POR CORREÇÃO do contrato (`clicksign-sync.service.reenviarCorrecao`),   │
 * │ e só quando a admissão veio do ATS. Faz sentido operacional, e é assim que o artigo escreve:     │
 * │ corrigir aqui é o primeiro passo, e o aceite aparece no momento em que o documento que levava o  │
 * │ dado errado tem de ser refeito. Prometer o aceite no clique da correção mandaria a pessoa        │
 * │ procurar uma janela que aquele botão não abre.                                                   │
 * │ O termo é registrado com autor, data e o texto do termo, em trilha permanente.                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6, DOBRADO: este artigo fala de CPF e de correção de identidade. NENHUM CPF, nome, telefone,
 * e-mail, endereço ou data de nascimento visto em tela, base, registro ou amostra aparece aqui, nem
 * como exemplo. O que o artigo nomeia são os RÓTULOS dos campos e o formato em branco que a própria
 * tela desenha como dica. A mensagem de CPF já cadastrado traz, em tela, o NOME de quem o tem, então
 * só a parte ESTÁVEL dela está declarada: rótulo com nome de pessoa dentro não entra em artigo.
 *
 * SEM IMAGEM, PENDÊNCIA CONHECIDA: a captura das telas que mostram gente está vetada pela auditoria
 * de segurança enquanto a homologação não tiver arnês sintético.
 */
export const artigo: Artigo = {
  slug: "corrigir-o-cpf-o-cliente-e-o-cargo-pela-ficha",
  titulo: "Corrigir O CPF, O Cliente E O Cargo",
  modulo: "SOUL_ADM",
  rotas: ["/esteira", "/gerenciador"],
  menus: ["gerenciador"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "gerenciador",
  resumo:
    "As correções de identidade que só a ficha faz, quem tem permissão para elas, o que é preciso revisar depois de trocar o par cliente e cargo, e o aceite que o sistema cobra quando o dado errado já saiu daqui.",
  termos: [
    "corrigir cpf",
    "cpf errado",
    "cpf digitado errado",
    "trocar cliente",
    "cliente errado",
    "trocar cargo",
    "cargo errado",
    "mudar cliente da admissao",
    "dupla correcao",
    "corrigir nos dois sistemas",
    "corrigir no gi",
    "reenviar por correcao",
    "revisado",
    "cpf duplicado",
    "mesma pessoa",
  ],
  preRequisitos: [
    "Ser Master ou Super Admin para trocar o cliente e o cargo e para corrigir o CPF. Sem o papel, os dois botões não aparecem na ficha.",
    "Ter o dado certo conferido no documento da pessoa, ou no pedido do cliente. A ficha grava o que você informar.",
  ],
  passos: [
    {
      gesto: "Abra a ficha da pessoa pelo olho, na coluna Ações.",
      detalhe:
        "As correções ficam numa faixa própria, chamada Correções, antes dos blocos de dados. A ficha aberta em modo de leitura não mostra a faixa.",
      controles: ["Ações", "Ver ficha", "Correções"],
    },
    {
      gesto: "Para trocar o par, clique em Trocar cliente e cargo.",
      detalhe:
        "A janela abre escrita Trocar Cliente E Cargo e mostra o par atual. Os dois trocam juntos porque o checklist de documentos e o padrão de preenchimento resolvem pelo par: trocar só um lado deixaria a admissão sem checklist.",
      controles: ["Trocar cliente e cargo", "Trocar Cliente E Cargo", "Correção De Master"],
    },
    {
      gesto: "Escolha Cliente novo e Cargo novo e clique em Trocar.",
      detalhe:
        "Os dois seletores têm busca. O sistema recusa um par que não tenha checklist de documentos cadastrado, e recusa a troca de uma admissão que já concluiu as três etapas.",
      controles: ["Cliente novo", "Cargo novo", "Cancelar", "Trocar"],
    },
    {
      gesto: "Depois da troca, leia o aviso vermelho Troca De Cliente Ou Cargo, no topo da ficha.",
      detalhe:
        "O sistema reaponta sozinho o que é estrutural, e não sabe julgar se os documentos já coletados servem para o par novo. A loja da admissão é limpa na troca, porque a loja pertencia ao cliente anterior, e é escolhida de novo pelo lápis.",
      controles: ["Troca De Cliente Ou Cargo", "Loja / Unidade"],
    },
    {
      gesto: "Conferidos os documentos, clique em Revisado e confirme.",
      detalhe:
        "A pergunta de confirmação diz o que vai acontecer: o aviso sai da ficha e a confirmação fica no histórico com o seu nome e a data. Quem consulta em modo de leitura continua vendo o aviso, e só não vê o botão.",
      controles: ["Revisado", "Confirmar Revisão Da Troca", "Sim, revisei", "Cancelar"],
    },
    {
      gesto: "Para acertar o CPF, clique em Corrigir CPF.",
      detalhe:
        "A janela mostra o CPF atual e pede o certo no campo CPF correto, no formato com ponto e traço que a própria caixa sugere. Corrigir CPF é acertar o campo para bater com o documento: não reprocessa auditoria, não renomeia arquivo e não refaz nada.",
      controles: ["Corrigir CPF", "CPF correto", "Cancelar", "Corrigir"],
    },
    {
      gesto: "Se o CPF já pertencer a alguém, leia o aviso e decida.",
      detalhe:
        "O sistema não bloqueia: ele mostra de quem é o CPF e quantas admissões aquela pessoa tem. Sendo a mesma pessoa, o botão passa a ler É a mesma pessoa, corrigir, e a admissão passa a apontar para o cadastro que já existe.",
      controles: ["É a mesma pessoa, corrigir"],
    },
    {
      gesto: "Corrija também no outro sistema em que o dado já entrou.",
      detalhe:
        "Corrigir aqui não basta. O dado que já foi enviado para a folha precisa ser corrigido diretamente lá, e nunca pelo sistema de origem da candidatura: aquele envio é único e não volta atrás.",
    },
    {
      gesto: "Se o contrato já tinha sido enviado, clique em Reenviar Por Correção e aceite o termo.",
      detalhe:
        "O sistema cancela o envelope errado e gera outro com o dado corrigido. Antes disso ele exibe a janela Confirmar Dupla Correção e exige que você declare ter corrigido nos dois lugares. O aceite fica registrado com o seu nome, a data e o texto do termo.",
      controles: [
        "Reenviar Por Correção",
        "Confirmar Dupla Correção",
        "Estou ciente, reenviar",
        "Cancelar",
      ],
    },
    {
      gesto: "Confira o resultado no bloco Histórico de alterações, no fim da ficha.",
      detalhe:
        "Cada correção entra ali com o valor antigo, o novo, quem fez e quando. O registro é trilha de auditoria e não se apaga pela tela.",
      controles: ["Histórico de alterações"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Não vejo os botões Trocar cliente e cargo nem Corrigir CPF na faixa Correções.",
      acao: "Eles aparecem só para Master e Super Admin, porque mexem na identidade da admissão. Peça a correção a quem tem o papel.",
    },
    {
      sintoma:
        "Aparece que o par escolhido não tem régua documental cadastrada, e que a admissão ficaria sem nenhum documento exigido.",
      acao: "A mensagem diz qual cliente e qual cargo ficaram sem checklist. Peça o cadastro do checklist desse par antes de trocar: sem ele a auditoria não cobraria documento nenhum, e ninguém notaria.",
    },
    {
      sintoma:
        "Aparece Esta admissão já concluiu as três frentes. A troca de cliente só vale antes da conclusão.",
      acao: "Admissão concluída não troca de cliente. Trate o caso com a administração: o que já foi cadastrado e assinado saiu com o par antigo.",
    },
    {
      sintoma: "Aparece O cliente e o cargo informados já são os da admissão.",
      acao: "Nada a corrigir: você escolheu o par que já está lá. Feche pelo Cancelar.",
    },
    {
      sintoma:
        "Aparece CPF inválido: o dígito verificador não fecha. Confira o CPF no documento e informe os 11 dígitos.",
      acao: "O número digitado não é um CPF válido. Confira no documento da pessoa e informe os onze dígitos, com ou sem ponto e traço.",
    },
    {
      sintoma: "Aparece O CPF informado já é o desta admissão.",
      acao: "Você digitou o CPF que já está gravado. Confira o número no documento antes de repetir.",
    },
    {
      sintoma: "Aparece que este CPF já está cadastrado para outra pessoa.",
      acao: "O sistema avisa e não bloqueia: leia de quem é o CPF. Sendo a mesma pessoa, confirme pelo botão É a mesma pessoa, corrigir. Não sendo, cancele e confira o documento, porque corrigir ali juntaria duas pessoas no mesmo cadastro.",
    },
    {
      sintoma:
        "Aparece Já existe uma admissão viva desse CPF para a MESMA vaga do Pandapé. Trate a duplicata antes de corrigir o CPF.",
      acao: "Existem duas admissões abertas para a mesma vaga e a mesma pessoa. Encerre a duplicada antes de corrigir o CPF desta.",
    },
    {
      sintoma: "O botão Reenviar Por Correção não aparece na ficha.",
      acao: "Ele existe só quando há envelope de assinatura que possa ser reenviado. Sem contrato enviado, não há o que refazer: basta a correção que você acabou de fazer.",
    },
    {
      sintoma: "Recusei o termo da dupla correção por engano e agora quero reenviar.",
      acao: "Nada foi feito: cancelar o termo não cancela o envelope. Clique de novo em Reenviar Por Correção e aceite, depois de ter corrigido nos dois lugares.",
    },
  ],
  regras: [
    "CPF, cliente e cargo não se editam pelo formulário comum: são a identidade da admissão, e a correção deles vive na ficha.",
    "Trocar o cliente e o cargo é ação de Master ou Super Admin. Corrigir o CPF também.",
    "Cliente e cargo trocam juntos, porque o checklist de documentos e o padrão de preenchimento resolvem pelo par.",
    "A troca exige que o par novo já tenha checklist cadastrado, e não vale para admissão que já concluiu as três etapas.",
    "Depois da troca, revisar os documentos já coletados é trabalho de gente: o sistema avisa em vermelho e o aviso sai só quando alguém clica em Revisado.",
    "A loja da admissão é limpa na troca de cliente, porque ela pertencia ao cliente anterior.",
    "Corrigir o CPF é acertar o campo para bater com o documento. Não reprocessa auditoria, não renomeia arquivo e não reagrupa nada.",
    "CPF que já pertence a alguém gera aviso, não bloqueio: o sistema mostra de quem é e a decisão é de quem tem o papel.",
    "Corrigir aqui não basta quando o dado já saiu: é preciso corrigir também diretamente no sistema da folha, e nunca pelo sistema de origem da candidatura, porque aquele envio é único e não volta.",
    "O aceite da dupla correção registra autor, data e o termo de ciência, em trilha permanente e consultável.",
    "Toda correção entra no histórico de alterações da admissão, com valor anterior, valor novo, autor e data.",
  ],
  relacionados: [
    "editar-os-dados-de-uma-admissao",
    "ler-a-ficha-da-admissao",
    "o-veredito-do-aso-pela-ia-na-ficha",
    "reaproveitar-um-candidato-pelo-cpf",
    "ler-a-regua-obrigatoria-da-admissao",
    "achar-uma-admissao-no-gerenciador",
    "abrir-e-fechar-uma-janela-do-sistema",
  ],
  fontes: [
    "apps/frontend/src/components/esteira/AdmissaoDetalheModal.tsx",
    "apps/frontend/src/components/ui/ConfirmDialog.tsx",
    "apps/backend/src/admissoes/admissoes.service.ts",
    "apps/backend/src/admissoes/admissoes.controller.ts",
    "apps/backend/src/clicksign/clicksign-sync.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
