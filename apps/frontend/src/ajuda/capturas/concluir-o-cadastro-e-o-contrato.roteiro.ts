/**
 * ROTEIRO DE CAPTURA: "Concluir O Cadastro E O Contrato".
 *
 * ┌─ ESTE ROTEIRO **NÃO** USA A BUSCA POR `999000`, E A ESCOLHA FOI MEDIDA ──────────────────────┐
 * │ Os outros roteiros da Esteira recortam a fila digitando `999000` na busca, porque os candidatos do │
 * │ arnês têm CPF da família 999 e isso deixa a tela sintética. Aqui isso ESVAZIA a aba: rodado com a  │
 * │ busca, `pnpm ajuda:conferir` recusa a captura por LISTA VAZIA, 0 linhas. O arnês cria admissão na  │
 * │ AUDITORIA, e a frente de Cadastro só nasce quando Auditoria e Exame fecham, então os candidatos    │
 * │ sintéticos não chegam a esta fila.                                                                │
 * │                                                                                                   │
 * │ SEM A BUSCA, O GATE DE DADO PESSOAL APROVOU as três imagens (medido no mesmo comando), e é ele a   │
 * │ garantia, não a busca. Se um dia a fila trouxer dado que o gate reprove, o motor RECUSA gravar, que │
 * │ é o comportamento desejado: a proteção é o gate, e ela não depende deste comentário.              │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O PASSO 2 DO ARTIGO FICA **SEM** IMAGEM, E ISSO É DELIBERADO ───────────────────────────────┐
 * │ Ele ensina a ler a frente AINDA FECHADA (coluna Status dizendo "Aguardando" e, no lugar do        │
 * │ seletor, o aviso "Pausado: aguarda Auditoria + Exame"). Esse estado existe só quando a Auditoria  │
 * │ ou o Exame da MESMA admissão ainda não concluíram, e o arnês não garante uma linha assim: ele     │
 * │ garante gente NA fila, não gente no estado exato do gate fechado.                                │
 * │                                                                                                  │
 * │ FOTOGRAFAR UM ESTADO NÃO GARANTIDO SERIA PIOR QUE NÃO FOTOGRAFAR, porque a imagem passaria a      │
 * │ falhar de forma intermitente, e falha intermitente é justamente a que ninguém trata: ela vira     │
 * │ ruído e o motor deixa de ser detector de artigo velho. O texto do passo é autossuficiente, os     │
 * │ dois rótulos estão declarados nos `controles` (então a busca e o índice "Nesta Tela" os acham) e o │
 * │ passo segue ensinável sem print.                                                                  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O SELETOR DE STATUS É ALCANÇADO SEM NOME DE PESSOA ─────────────────────────────────────────┐
 * │ O rótulo acessível dele é "Mudar status de <NOME>", então o localizador casa só o COMEÇO, pelo    │
 * │ mesmo recorte do roteiro do ASO: nenhum nome entra neste arquivo, nem no alvo nem na etiqueta.    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NENHUM PNG É GRAVADO POR ESTE ARQUIVO. Ele descreve a captura; quem executa é o motor.
 */
import type { Roteiro } from "../tipos";

export const roteiro: Roteiro = {
  slug: "concluir-o-cadastro-e-o-contrato",
  url: "/esteira",
  arnes: "arnes-seed-manual",
  preparo: [
    { acao: "clicar", alvo: { papel: "button", nome: "CADASTRO", texto: "" } },
  ],
  capturas: [
    {
      arquivo: "01-aba-cadastro.png",
      legenda: "Passo 1: a aba Cadastro aberta, com a fila da frente na tela.",
      alvos: [
        { papel: "button", nome: "CADASTRO", texto: "1. Abra a aba Cadastro", lado: "abaixo" },
        // Coluna que existe SÓ nesta aba, e é a que o passo 4 ensina a ler.
        { papel: "button", nome: "Matrícula", texto: "4. A matrícula da folha", lado: "abaixo" },
      ],
    },
    {
      arquivo: "02-importar-matriculas.png",
      legenda: "Passo 5: o ícone de planilha que abre a importação de matrículas.",
      alvos: [
        {
          papel: "button",
          nome: "Importar matrículas de uma planilha",
          texto: "5. Importe a planilha",
          forma: "elipse",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "03-seletor-de-status.png",
      legenda: "Passo 6: o seletor de status da frente na coluna de avanço.",
      alvos: [
        {
          papel: "button",
          nome: /^Mudar status de/,
          texto: "6. Marque como Cadastrado",
          lado: "acima",
        },
        /*
         * A ETIQUETA DE PENDÊNCIAS É ALCANÇADA PELO AVISO DO MOUSE, e não por papel mais nome: o
         * rótulo acessível dela é o texto da própria etiqueta ("Completo", "Parcial"), que muda
         * conforme a admissão, então casar por ele amarraria a imagem ao estado do arnês. O aviso
         * do mouse é fixo.
         */
        {
          seletor: 'button[title="Ver pendências obrigatórias"]',
          texto: "O que falta preencher",
          lado: "abaixo",
        },
      ],
    },
  ],
};
