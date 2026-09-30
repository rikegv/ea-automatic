import type { Artigo } from "../../tipos";

/**
 * N1 DO GERADOR DE KIT, 3 de 4: FECHAR O QUE FALTOU.
 *
 * ┌─ O QUE ESTA PEÇA COBRE, E ONDE ELA PARA ────────────────────────────────────────────────────┐
 * │ Ela cobre o conserto sobre um resultado que JÁ está na tela: ler o bloco do que não foi         │
 * │ reconhecido, entender a etiqueta Completo e a contagem do que falta, subir o arquivo que        │
 * │ faltava para UMA pessoa, e o que fazer quando aquele arquivo não traz nada de novo.             │
 * │                                                                                                 │
 * │ O que ela deliberadamente NÃO cobre:                                                            │
 * │   . processar do ZERO, que é a peça "Processar O Kit A Partir Dos PDFs Da Folha". Reimportar    │
 * │     não recomeça o lote: ele soma ao resultado que está na tela, pessoa por pessoa;             │
 * │   . o DOWNLOAD, que é a peça "Baixar O Kit De Um Funcionário";                                  │
 * │   . o ENVIO para assinatura, que é a peça "Enviar O Kit Para Assinatura";                       │
 * │   . o cadastro de QUAIS documentos cada tipo de vínculo exige, que é outra tela e outro menu.   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A DISTINÇÃO QUE MAIS GERA CHAMADO AQUI ───────────────────────────────────────────────────┐
 * │ "Não reconhecidos" e "Faltam" NÃO são a mesma coisa, e confundi-las faz o time subir o          │
 * │ arquivo certo na pessoa errada. Não reconhecido é PÁGINA sem dono: o sistema leu e não soube    │
 * │ de quem é. Faltando é PESSOA sem documento: o sistema sabe de quem é o kit e não achou aquele   │
 * │ título. O botão de reimportar nasce na linha de quem está FALTANDO, e é por ali que se resolve  │
 * │ os dois casos.                                                                                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SEM IMAGEM, PENDÊNCIA CONHECIDA E NÃO ESQUECIMENTO: a captura das telas que mostram pessoa está
 * vetada enquanto a homologação não tiver arnês de dado sintético, e esta lista traz nome e CPF
 * mascarado. O texto foi escrito para funcionar lido.
 *
 * §A.6: nada de nome, CPF ou valor de tela aqui. §A.11: nenhum travessão. §A.24: title case em
 * título e etiqueta.
 */
export const artigo: Artigo = {
  slug: "reimportar-os-documentos-que-faltam",
  titulo: "Reimportar Os Documentos Que Faltam",
  modulo: "SOUL_ADM",
  rotas: ["/gerador-kit"],
  menus: ["gerador-kit"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "gerador-kit",
  resumo:
    "Como completar o kit de quem ficou com documento faltando: ler o bloco do que não foi reconhecido, subir o arquivo que faltava na linha daquela pessoa e conferir que a etiqueta virou Completo.",
  termos: [
    "reimportar",
    "documento faltando no kit",
    "nao reconhecido",
    "pagina sem dono",
    "kit incompleto",
    "faltam documentos",
    "subir de novo",
    "completar o kit",
    "corrigir o kit",
  ],
  preRequisitos: [
    "Já ter um resultado na tela: a reimportação soma ao lote que foi processado, ela não recomeça nada.",
    "Ter em mãos, em PDF, o documento que faltou para aquela pessoa.",
  ],
  passos: [
    {
      gesto: "Leia o bloco Não reconhecidos, no topo do resultado.",
      detalhe:
        "Ele lista o arquivo, as páginas e o motivo de cada pedaço que o sistema leu e não soube de quem era. O bloco só aparece quando há algo nessa situação, e o indicador de mesmo nome traz o total.",
      controles: ["Não reconhecidos"],
    },
    {
      gesto: "Confira na lista quem está Completo e quem tem contagem de faltando.",
      detalhe:
        "A etiqueta verde Completo quer dizer que todos os documentos que aquele kit espera foram encontrados. A etiqueta amarela traz quantos ainda faltam, e ao lado do nome aparece a contagem de documentos encontrados em relação ao total esperado.",
      controles: ["Completo", "Kits por funcionário"],
    },
    {
      gesto: "Clique na linha da pessoa para ver item por item o que falta.",
      detalhe:
        "O visto verde é o que foi encontrado, o X vermelho com o título riscado é o que falta. A etiqueta Padrão marca o documento que é instrução geral, igual para todos, e ele entra no kit de todo mundo sem ser cobrado por nome.",
      controles: ["Padrão"],
    },
    {
      gesto: "Clique em Reimportar, na linha daquela pessoa.",
      detalhe:
        "O botão só existe em quem tem documento faltando. Ele abre a seleção de arquivos do seu computador, e o que você escolher ali vale só para aquela pessoa.",
      controles: ["Reimportar", "Reimportar os documentos que faltam deste funcionário"],
    },
    {
      gesto: "Selecione o PDF que traz o documento que faltou.",
      detalhe:
        "Pode selecionar mais de um. Só PDF é aceito, e o sistema aproveita apenas as páginas que reconhecer como documento daquela pessoa.",
    },
    {
      gesto: "Confira o resultado depois da reimportação.",
      detalhe:
        "A lista, os indicadores do topo e o bloco do que não foi reconhecido são recalculados na hora. Quando o último item fecha, a etiqueta da pessoa vira Completo e o botão de reimportar desaparece daquela linha.",
      controles: ["Completo"],
    },
    {
      gesto: "Repita pessoa por pessoa até não sobrar contagem de faltando na lista.",
      detalhe:
        "A reimportação é sempre de uma pessoa por vez, e é isso que evita anexar o documento de alguém no kit de outro.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "O sistema responde Selecione ao menos um PDF para reimportar.",
      acao: "A seleção de arquivos foi fechada sem escolher nada, ou o que foi escolhido não é PDF. Clique em Reimportar de novo e escolha o arquivo.",
    },
    {
      sintoma: "A tela mostra Falha ao reimportar os documentos.",
      acao: "Nada foi anexado, e o resultado que estava na tela continua como estava. Confira se o arquivo abre no seu computador e tente de novo. Se o resultado já tiver expirado, processe o lote outra vez.",
    },
    {
      sintoma: "O sistema responde Índice de funcionário inválido.",
      acao: "A tela e o resultado do servidor saíram de sincronia, normalmente porque o resultado expirou enquanto a tela ficou aberta. Recarregue a página e processe o lote de novo.",
    },
    {
      sintoma: "O documento aparece em Não reconhecidos e ninguém está faltando nada.",
      acao: "Aquela página não pertence a nenhum kit deste lote: costuma ser documento de pessoa que não entrou no processamento, ou página de um tipo de vínculo diferente. Confira o motivo escrito ao lado e, se for o caso, processe aquele arquivo no kit certo.",
    },
    {
      sintoma: "O botão Reimportar não aparece na linha da pessoa.",
      acao: "Ele só nasce em quem tem documento faltando. Se a etiqueta já diz Completo, não há o que reimportar.",
    },
  ],
  regras: [
    "Reimportar soma ao resultado que está na tela: não recomeça o lote e não descarta o que já foi reconhecido.",
    "A reimportação é sempre de uma pessoa por vez, e vale só para a linha em que você clicou.",
    "Não reconhecido é página sem dono; faltando é pessoa sem documento. São situações diferentes e a segunda é a que tem botão.",
    "O documento marcado como padrão é instrução geral: entra no kit de todos e não é cobrado por nome.",
    "A etiqueta Completo quer dizer que todos os documentos esperados por aquele tipo de vínculo foram encontrados.",
  ],
  relacionados: [
    "processar-o-kit-a-partir-dos-pdfs-da-folha",
    "baixar-o-kit-de-um-funcionario",
    "enviar-o-kit-para-assinatura",
    "ler-a-linha-da-tabela",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/gerador-kit/page.tsx",
    "apps/backend/src/kit/kit.controller.ts",
    "apps/backend/src/kit/kit.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
