import type { Artigo } from "../../tipos";

/**
 * N1 DO GERADOR DE KIT, 2 de 4: O DOWNLOAD.
 *
 * ┌─ O QUE ESTA PEÇA COBRE, E ONDE ELA PARA ────────────────────────────────────────────────────┐
 * │ Ela cobre o que existe DEPOIS do resultado na tela: achar a pessoa na lista, baixar um kit,     │
 * │ baixar tudo de uma vez, a confirmação de identidade que o sistema pede quando não tem como      │
 * │ distinguir duas pessoas de mesmo nome, e o aviso de que o arquivo é temporário.                 │
 * │                                                                                                 │
 * │ O que ela deliberadamente NÃO cobre:                                                            │
 * │   . como CHEGAR ao resultado, que é a peça "Processar O Kit A Partir Dos PDFs Da Folha";        │
 * │   . o que fazer com o que FALTOU, que é a peça "Reimportar Os Documentos Que Faltam";           │
 * │   . o ENVIO para assinatura, que é a peça "Enviar O Kit Para Assinatura". Baixar e enviar são   │
 * │     coisas diferentes: baixar traz o arquivo para o seu computador e não mexe na admissão.      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A CONFIRMAÇÃO DE IDENTIDADE É METADE DESTE ARTIGO ────────────────────────────────────────┐
 * │ Ela aparece só quando há nome repetido sem como diferenciar, e é justamente o momento em que    │
 * │ um kit vai para a pessoa errada. Por isso a janela lista os títulos dos documentos e cobra o    │
 * │ olho humano antes de liberar o arquivo, em vez de avisar depois.                               │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SEM IMAGEM, PENDÊNCIA CONHECIDA E NÃO ESQUECIMENTO: a lista de resultado mostra nome e CPF
 * mascarado, e a captura das telas com pessoa está vetada enquanto a homologação não tiver arnês de
 * dado sintético. O texto foi escrito para funcionar lido.
 *
 * §A.6: nenhum nome nem CPF de tela, base ou registro entra aqui; descreve-se o campo. §A.11:
 * nenhum travessão. §A.24: title case em título e etiqueta.
 */
export const artigo: Artigo = {
  slug: "baixar-o-kit-de-um-funcionario",
  titulo: "Baixar O Kit De Um Funcionário",
  modulo: "SOUL_ADM",
  rotas: ["/gerador-kit"],
  menus: ["gerador-kit"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "gerador-kit",
  resumo:
    "Como baixar o kit de uma pessoa ou de todo o lote depois de processar, o que o sistema pergunta antes de liberar o arquivo de quem tem nome repetido, e por que não dá para deixar o download para depois.",
  termos: [
    "baixar kit",
    "baixar contrato",
    "download do kit",
    "salvar o kit",
    "baixar todos",
    "zip do kit",
    "imprimir contrato",
    "achar funcionario no kit",
    "nome repetido",
    "kit da pessoa errada",
  ],
  preRequisitos: [
    "Já ter processado os arquivos nesta tela: o download só existe sobre um resultado que está na tela.",
  ],
  passos: [
    {
      gesto: "Localize a pessoa no campo de busca, acima da lista.",
      detalhe:
        "A busca é por nome e ignora acento e maiúscula. Ela só filtra a lista, não muda o que foi processado.",
      controles: ["Buscar funcionário por nome"],
    },
    {
      gesto: "Clique na linha da pessoa para abrir a lista de documentos dela.",
      detalhe:
        "Cada item aparece com o número da ordem, o visto verde de encontrado ou o X vermelho de faltando, e as páginas de onde ele saiu. Confira antes de baixar.",
      controles: ["Completo"],
    },
    {
      gesto: "Clique em Baixar, na linha daquela pessoa.",
      detalhe: "O arquivo sai com o nome da pessoa e traz só os documentos dela.",
      controles: ["Baixar", "Baixar o kit"],
    },
    {
      gesto: "Na primeira vez que baixar algo, leia o aviso e confirme.",
      detalhe:
        "A janela Baixe Agora: Os Arquivos São Temporários avisa que o resultado não fica guardado para download depois. Confirmado uma vez, o aviso não reaparece no resto da sua sessão.",
      controles: ["Baixe Agora: Os Arquivos São Temporários", "Entendi, baixar"],
    },
    {
      gesto: "Se a janela de confirmar identidade abrir, confira os documentos listados antes de seguir.",
      detalhe:
        "Ela aparece quando há nome repetido sem como diferenciar as pessoas. A janela lista os títulos dos documentos que estão naquele kit: confirme que todos são da mesma pessoa e só então libere o download.",
      controles: ["Confirmar Identidade Antes De Baixar", "Confirmar e baixar", "Cancelar"],
    },
    {
      gesto: "Para levar o lote inteiro, clique em Baixar todos (ZIP).",
      detalhe:
        "Sai um arquivo compactado com um kit por pessoa. Havendo nome repetido no lote, o sistema pede a mesma confirmação de identidade uma vez, para o lote todo, e diz quantas pessoas estão nessa situação.",
      controles: ["Baixar todos (ZIP)"],
    },
    {
      gesto: "Guarde o arquivo baixado onde ele precisa ficar, ainda na mesma sessão de trabalho.",
      detalhe:
        "O que vale é o arquivo que você salvou. O resultado desta tela expira, e depois disso o mesmo download deixa de existir.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "A lista mostra Nenhum funcionário encontrado para a busca.",
      acao: "O nome digitado não bate com ninguém do lote. Apague a busca para ver a lista inteira e confira se aquela pessoa foi realmente reconhecida, ou se o documento dela está em Não reconhecidos.",
    },
    {
      sintoma: "A tela mostra Falha ao baixar o kit do funcionário.",
      acao: "O arquivo não saiu, e nada mudou na admissão. Tente de novo na mesma tela. Se o resultado já tiver expirado, processe os arquivos outra vez e baixe na hora.",
    },
    {
      sintoma: "A tela mostra Falha ao baixar os kits.",
      acao: "É a mesma coisa para o download do lote inteiro. Tente de novo, e se o lote for grande, baixe pessoa por pessoa para descobrir qual delas está travando.",
    },
    {
      sintoma: "O botão de baixar fica desligado.",
      acao: "Há outro download ou uma reimportação em andamento naquela tela. Espere terminar: os botões voltam sozinhos.",
    },
    {
      sintoma: "Baixei o kit e nele falta documento.",
      acao: "O download entrega exatamente o que foi reconhecido. Abra a linha da pessoa e veja os itens com X vermelho: eles precisam ser reimportados antes de o kit ficar completo.",
    },
  ],
  regras: [
    "Baixar não mexe na admissão: o download só traz o arquivo para o seu computador.",
    "O aviso de arquivo temporário aparece uma vez por sessão, na primeira vez que você baixa algo.",
    "Nome repetido sem como diferenciar exige confirmação humana antes do download, uma por pessoa ou uma para o lote inteiro.",
    "O arquivo do kit sai com o nome da pessoa, e o download do lote sai compactado, com um kit por pessoa.",
    "O download entrega o que foi reconhecido naquele momento, mesmo que falte documento.",
  ],
  relacionados: [
    "processar-o-kit-a-partir-dos-pdfs-da-folha",
    "reimportar-os-documentos-que-faltam",
    "enviar-o-kit-para-assinatura",
    "buscar-dentro-da-tela",
    "abrir-e-fechar-uma-janela-do-sistema",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/gerador-kit/page.tsx",
    "apps/backend/src/kit/kit.controller.ts",
    "apps/backend/src/kit/kit.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
