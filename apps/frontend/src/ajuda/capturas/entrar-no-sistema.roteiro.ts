/**
 * ─ ROTEIRO: "Entrar No Sistema". UMA imagem, e ela fecha uma pendência antiga ───────────────────
 *
 * ┌─ POR QUE ESTE ARTIGO ERA O ÚNICO DOS QUATORZE SEM IMAGEM, E POR QUE DEIXOU DE SER ───────────┐
 * │ O artigo nasceu sem print porque o motor ENTRA no sistema antes de abrir qualquer roteiro, e a │
 * │ tela de entrada rebate quem já tem sessão para o painel inicial: um roteiro apontado para ela   │
 * │ fotografaria o painel de DEPOIS de entrar, e falharia ao não achar o campo de e-mail, acusando  │
 * │ artigo velho onde o artigo está certo.                                                         │
 * │                                                                                                │
 * │ O MODO SEM SESSÃO FOI CONSTRUÍDO DEPOIS (`ROTAS_PUBLICAS` e `ehRotaPublica`, em `rotas.ts`,     │
 * │ mais `abrirPaginaSemSessao`, em `tools/ajuda/src/motor.ts`), e o comentário do artigo, que      │
 * │ dizia que a falta "está reportada como pedido de um modo de captura sem sessão", ficou          │
 * │ defasado. O pedido foi atendido; faltava alguém escrever o roteiro.                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS DUAS PROIBIÇÕES DESTE ARQUIVO, E ELAS SÃO DO AUDITOR, NÃO MINHAS ────────────────────────┐
 * │ O `seguranca` liberou `/login` e impôs duas coisas que NÃO podem ser "melhoradas" depois:      │
 * │                                                                                                │
 * │   1. NENHUM GESTO DE DIGITAR. O motor executa `digitar` sobre qualquer alvo, sem guarda contra  │
 * │      campo de credencial. Hoje o formulário sai VAZIO, e é isso que torna a imagem segura.      │
 * │   2. NENHUM CLIQUE NO BOTÃO QUE MOSTRA A SENHA. Ele troca o `type` do campo de `password` para  │
 * │      `text`, e a exclusão que protege senha no gate casa POR `type`: clicar ali derrubaria as   │
 * │      duas camadas de uma vez, e o valor passaria a ser desenhado em claro num PNG versionado.   │
 * │                                                                                                │
 * │ O artigo ensina que o olho existe PELO TEXTO. Ele não precisa de imagem para isso, e a imagem   │
 * │ é justamente o que não pode existir.                                                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `/trocar-senha` FICA DE FORA, e não por dado pessoal: aquela tela NÃO RENDERIZA sem sessão (ela
 * rebate para o login), então o print sairia sendo a tela de login gravada com o nome de arquivo da
 * troca de senha. Print que ensina a tela errada passa por todos os gates sem nada falhar, que é a
 * forma mais cara de erro deste projeto. A troca de senha temporária é ensinada em texto.
 * *(Decisão do diretor, 30/09/2026, sobre o parecer do `seguranca`.)*
 *
 * ┌─ O RECORTE É A SEÇÃO, E NÃO O `<form>`, E ISSO SÓ APARECEU NA PROVA VISUAL ──────────────────┐
 * │ A primeira redação recortava exatamente o `<form>`, seguindo o parecer do auditor ao pé da      │
 * │ letra. O PNG saiu, passou por todos os gates, e estava INÚTIL: o recorte terminava na borda dos │
 * │ campos, então as três elipses vermelhas apareciam CORTADAS e os rótulos que as explicam ("1.     │
 * │ Seu e-mail do trabalho" e os outros dois), desenhados ao lado, caíram FORA do quadro. A imagem   │
 * │ mostrava círculos sem legenda nenhuma.                                                           │
 * │                                                                                                  │
 * │ O GATE NÃO TINHA COMO PEGAR ISSO, e é o registro que importa: alvo não encontrado é falha dura,  │
 * │ mas rótulo desenhado para fora da caixa recortada não é erro para o motor. Quem pega é a §A.13,  │
 * │ olhar a imagem, e foi só olhando que apareceu.                                                   │
 * │                                                                                                  │
 * │ A CORREÇÃO MANTÉM A EXIGÊNCIA DO AUDITOR e resolve o enquadramento: recorta a SEÇÃO que contém   │
 * │ o cabeçalho mais o formulário, que é o cartão de entrada inteiro. Continua fora da imagem tudo   │
 * │ o que não é o formulário, e passa a haver margem para a anotação existir.                        │
 * │                                                                                                  │
 * │ REGRA QUE FICA PARA OS PRÓXIMOS RECORTES: a caixa precisa caber o alvo MAIS o rótulo dele.       │
 * │ Recortar no contorno exato do elemento é o jeito de produzir uma imagem que passa e não ensina.  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import type { Roteiro } from "../tipos";

export const roteiro: Roteiro = {
  slug: "entrar-no-sistema",
  url: "/login",
  /*
   * SEM `preparo`, E ISSO É A METADE SEGURA DO ARQUIVO. A tela como ela chega já é a tela que o
   * artigo ensina. Qualquer gesto aqui seria digitar numa tela de credencial ou revelar a senha, que
   * são exatamente as duas coisas proibidas acima.
   */
  capturas: [
    {
      arquivo: "01-tela-de-entrada.png",
      legenda: "A tela de entrada, com o campo de e-mail, o de senha e o botão de entrar.",
      /*
       * O RECORTE É O CARTÃO INTEIRO (`<main>`), E A LARGURA É O MOTIVO.
       *
       * Recortando só a `section` do formulário, a caixa termina 70 pixels depois dos campos, e o
       * rótulo que o motor decide pôr à direita sai cortado. Tentei "acima" e "abaixo" para ele: o
       * motor recusa os dois por colisão com as elipses vizinhas e volta para a direita, porque
       * `lado` é SUGESTÃO e quem decide é ele. A causa não era o lado, era a falta de largura.
       *
       * O `<main>` é o cartão de vidro com as duas colunas, a da identidade e a do formulário. Ele
       * não acrescenta nenhum dado de pessoa (a coluna da esquerda é logo e texto de marketing) e dá
       * ao motor o espaço que ele precisa para desenhar os três rótulos dentro do quadro.
       */
      recorte: { seletor: "main", texto: "o cartão de entrada inteiro" },
      alvos: [
        {
          papel: "textbox",
          nome: /E-mail/i,
          texto: "1. Seu e-mail do trabalho",
          // ACIMA, e não à direita: o recorte termina logo depois do campo, e rótulo à direita sai
          // cortado na borda. Medido olhando o PNG, não deduzido (§A.13).
          lado: "acima",
        },
        {
          /*
           * O CAMPO DE SENHA É APONTADO POR SELETOR, E NÃO POR PAPEL, porque campo de senha NÃO TEM
           * papel acessível: `input[type=password]` fica fora da árvore de acessibilidade, então
           * `textbox` nunca casaria com ele. É a saída de emergência usada pelo motivo certo.
           *
           * Ele está VAZIO na captura, e continua vazio porque este roteiro não tem gesto nenhum.
           */
          seletor: "#input-senha",
          texto: "2. Sua senha",
          /*
           * ESQUERDA, e as outras três foram TENTADAS e medidas no PNG, uma a uma (§A.13):
           * "direita" sai cortado, porque o campo termina a 140 pixels da borda do cartão e o rótulo
           * precisa de mais; "acima" colide com a elipse do e-mail e "abaixo" com a do botão, e nos
           * dois casos o motor devolve o rótulo para a direita, porque `lado` é SUGESTÃO e quem
           * decide é ele. À esquerda existe a coluna da identidade, que é espaço vazio de sobra.
           */
          lado: "esquerda",
        },
        {
          papel: "button",
          nome: /Entrar/i,
          texto: "3. Entre no sistema",
          forma: "elipse",
          lado: "abaixo",
        },
      ],
    },
  ],
};
