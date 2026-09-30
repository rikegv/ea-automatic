import type { Artigo } from "../../tipos";

/**
 * OS DOIS USOS DO PADRÃO, e eles são diferentes o bastante para confundir quem usa só um.
 *
 *   (a) NO PAR ABERTO: marca os documentos padrão como obrigatórios no FORMULÁRIO, em memória. Nada
 *       vai ao banco, e o salvar continua sendo o mesmo de sempre. Não apaga o que foi marcado à mão.
 *   (b) EM MASSA, nos pendentes: um cartão que só aparece quando existem pares de cliente e cargo já
 *       usados por admissões e sem NENHUMA régua. Aplica em todos eles de uma vez.
 *
 * O FATO QUE MAIS GERA DÚVIDA, e por isso está em regra e em erro comum: régua que já existe NUNCA é
 * sobrescrita. O alvo do uso em massa exclui todo par que tenha qualquer régua, e a gravação ainda
 * ignora o que já estiver lá.
 *
 * NENHUM documento é citado pelo nome: a lista do padrão muda por dado.
 */
export const artigo: Artigo = {
  slug: "aplicar-os-documentos-padrao",
  titulo: "Aplicar Os Documentos Padrão",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/regua"],
  menus: ["regua"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "regua-e-documentos",
  resumo:
    "Os dois jeitos de usar o conjunto padrão de documentos: preencher a régua do par que você está editando, e resolver de uma vez os pares que estão em uso sem régua nenhuma.",
  termos: [
    "documentos padrao",
    "aplicar padrao",
    "regua padrao",
    "pares pendentes",
    "admissao sem checklist",
    "preencher regua rapido",
    "padrao nao sobrescreve",
  ],
  preRequisitos: [
    "Para o uso no par aberto, ter cliente e cargo escolhidos nos seletores.",
  ],
  passos: [
    {
      gesto:
        "Para preencher o par que você está editando, escolha cliente e cargo e clique em Aplicar documentos padrão.",
      detalhe:
        "O botão marca os documentos do conjunto padrão como obrigatórios no formulário. O que você marcou à mão não é apagado nem rebaixado.",
      controles: ["Selecione o cliente…", "Selecione o cargo…", "Aplicar documentos padrão"],
    },
    {
      gesto: "Confira a lista e clique em Salvar régua.",
      detalhe:
        "Enquanto você não salvar, nada foi gravado: o padrão preencheu a tela, não o cadastro.",
      controles: ["Salvar régua"],
    },
    {
      gesto:
        "Para resolver os pares em uso sem régua, procure o cartão que aparece logo abaixo dos seletores.",
      detalhe:
        "Ele só existe quando há par de cliente e cargo já usado por alguma admissão e sem régua nenhuma, e diz quantos pares são.",
      controles: ["Aplicar padrão nos pendentes"],
    },
    {
      gesto: "Leia a confirmação, que lista exatamente quais pares serão alcançados, e confirme.",
      controles: ["Aplicar Documentos Padrão Nos Pendentes", "Aplicar padrão", "Cancelar"],
    },
    {
      gesto: "Confira o relatório que aparece em seguida e feche-o.",
      detalhe:
        "Ele diz em quantos pares o padrão entrou, quantas linhas de régua foram criadas e quantos documentos por par, além de listar os pares um a um.",
      controles: ["Fechar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O cartão de aplicar nos pendentes não aparece.",
      acao: "Ele só existe quando há par de cliente e cargo em uso sem régua nenhuma. Sem pendentes, não há o que aplicar.",
    },
    {
      sintoma: "Apliquei o padrão no par aberto e nada foi gravado.",
      acao: "É o comportamento certo: ali o padrão só preenche o formulário. Clique em Salvar régua para gravar.",
    },
    {
      sintoma: "Quero desfazer o padrão que apliquei num par.",
      acao: "Ajuste a exigência documento a documento na lista e salve de novo. Não existe um desfazer do padrão.",
    },
    {
      sintoma: "Apliquei duas vezes e não sei se duplicou alguma coisa.",
      acao: "Não duplica. Aplicar de novo não muda o que a primeira aplicação fez nem cria linha repetida.",
    },
  ],
  regras: [
    "No par aberto, o padrão marca os documentos como obrigatórios só no formulário: o salvar continua sendo o de sempre.",
    "O padrão nunca apaga nem rebaixa o que já foi marcado à mão no par aberto.",
    "A aplicação em massa alcança só os pares que já são usados por alguma admissão e estão sem régua nenhuma.",
    "Régua que já existe nunca é sobrescrita nem apagada pela aplicação em massa.",
    "Aplicar duas vezes não duplica nada.",
  ],
  relacionados: [
    "cadastrar-a-regua-de-um-cliente-e-cargo",
    "definir-a-exigencia-de-cada-documento",
    "inativar-a-regua-de-um-cliente",
    "o-catalogo-de-documentos-da-regua",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/regua/page.tsx",
    "apps/backend/src/admin/regua/regua.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
