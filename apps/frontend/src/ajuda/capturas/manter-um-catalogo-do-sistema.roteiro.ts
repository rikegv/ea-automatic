/**
 * ROTEIRO DE CAPTURA: "Manter Um Catálogo Do Sistema" (o artigo modelo de catálogo).
 *
 * ┌─ O PREPARO É UM CLIQUE, E É ELE QUE FAZ AS CINCO IMAGENS CABEREM NUM ESTADO SÓ ──────────────┐
 * │ `Roteiro` tem UM `preparo` para todas as `capturas`, então o desenho aqui foi escolher o estado │
 * │ em que TUDO o que o artigo ensina está na tela ao mesmo tempo. Com o filtro em "todos", a lista │
 * │ mostra item ativo e item inativo juntos, e por isso o atalho de INATIVAR e o de REATIVAR        │
 * │ aparecem na mesma captura, cada um na sua linha. No filtro padrão, "ativos", o de reativar não  │
 * │ existiria, e a quinta imagem falharia por falta de alvo.                                       │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE A TELA PRECISA TER: UM ITEM ATIVO E UM INATIVO, E QUEM GARANTE É O ARNÊS ─────────────┐
 * │ Sem um item inativo no catálogo, o atalho de reativar não é desenhado e o motor FALHA em vez de │
 * │ gravar imagem sem seta, que é o comportamento certo. E ele falhava: medido em 27/09/2026, os 26 │
 * │ motivos de declínio da homologação estavam TODOS ativos.                                       │
 * │                                                                                                │
 * │ A primeira redação desta caixa mandava "inative um item de teste antes de rodar", e isso estava │
 * │ ERRADO por dois motivos. Primeiro, instrução em comentário não é preparação: ela depende de     │
 * │ alguém ler e lembrar, e o que acontece é a falha chegar como "alvo não encontrado", que é a     │
 * │ mensagem do detector de ARTIGO VELHO, mandando procurar defeito no artigo, que está certo.     │
 * │ Segundo, inativar um item DE VERDADE tira um motivo de circulação de quem opera a homologação,  │
 * │ e ninguém religa o que foi desligado para tirar uma foto.                                      │
 * │                                                                                                │
 * │ Quem garante o estado é `tools/ajuda/src/arnes-catalogo.ts`, chamado pelos dois comandos antes  │
 * │ do primeiro roteiro: ele mantém UM item que é só dele, inativo, idempotente, e não toca em      │
 * │ nenhum item real.                                                                              │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: catálogo é vocabulário do processo, não pessoa. Esta é a tela mais segura dos três pilotos,
 * e mesmo assim a régua é a mesma: a captura roda só na homologação.
 *
 * O ARTIGO É MODELO, então este roteiro também é: os outros quinze catálogos são a mesma tela com
 * outro título, e a ficha curta de cada um reaproveita esta sequência trocando a `url`.
 *
 * NENHUM PNG É GRAVADO POR ESTE ARQUIVO. A execução está vetada até o gate de dado pessoal estar
 * pronto e travado em teste.
 */
import type { Roteiro } from "../tipos";

export const roteiro: Roteiro = {
  slug: "manter-um-catalogo-do-sistema",
  url: "/admin/motivos-declinio",
  preparo: [
    {
      acao: "clicar",
      // O rótulo do filtro traz o contador junto ("todos (12)"), então o localizador casa o começo.
      alvo: { papel: "button", nome: /todos/, texto: "Filtro todos" },
    },
  ],
  capturas: [
    {
      arquivo: "01-tela-do-catalogo.png",
      legenda: "Passo 1: a tela do catálogo, com o campo de cadastro em cima e a lista embaixo.",
      alvos: [
        {
          papel: "heading",
          nome: /Motivos De Declínio/i,
          texto: "1. Você está no catálogo",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-adicionar-item.png",
      legenda: "Passo 2: o campo de nome e o botão de adicionar.",
      alvos: [
        // O campo de cadastro não tem rótulo visível, só texto de apoio dentro dele: sem papel com
        // nome acessível, o localizador vai pelo texto de apoio, que é o que a tela mostra.
        {
          seletor: 'input[placeholder="Novo motivo *"]',
          texto: "2. Escreva o nome",
          lado: "abaixo",
        },
        { papel: "button", nome: "Adicionar", texto: "3. Cria o item", forma: "elipse" },
      ],
    },
    {
      arquivo: "03-editar-item.png",
      legenda: "Passo 3: o atalho de editar, na ponta direita da linha.",
      alvos: [{ papel: "button", nome: "editar", texto: "4. Renomeia", lado: "acima" }],
    },
    {
      arquivo: "04-inativar-item.png",
      legenda: "Passo 4: o atalho de inativar, na linha do item.",
      alvos: [
        { papel: "button", nome: "inativar", texto: "5. Tira de circulação", lado: "acima" },
      ],
    },
    {
      arquivo: "05-reativar-item.png",
      legenda: "Passo 5: o filtro da lista e o atalho de reativar.",
      alvos: [
        { papel: "button", nome: /todos/, texto: "6. Mostra tudo", lado: "acima" },
        { papel: "button", nome: "reativar", texto: "7. Volta a circular", lado: "abaixo" },
      ],
    },
  ],
};
