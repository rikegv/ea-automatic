/**
 * ROTEIRO DE CAPTURA: "Tema, Perfil E Sair".
 *
 * ┌─ O RECORTE NA BARRA INTEIRA FOI RETIRADO, E FOI A MEDIÇÃO QUE MANDOU ────────────────────────┐
 * │ Este roteiro recortava `aside`, e o motor o RECUSOU: a barra lateral mede 1241px de altura na     │
 * │ conta de captura e a viewband é de 1000px, então a caixa do recorte nunca cabe. Não é ajuste de    │
 * │ folga: com os menus liberados que a conta tem, ela não caberia em nenhuma tela.                    │
 * │                                                                                                    │
 * │ AS SAÍDAS QUE NÃO SERVIRAM, e valem registradas para ninguém tentar de novo: recortar só o bloco    │
 * │ do usuário (`.side-user`, 60px) ou só a linha dos botões (46px) resolve a altura e ESTRAGA a aula,  │
 * │ porque o rótulo vermelho é posicionado na viewport inteira, com folga até a borda da TELA, e não    │
 * │ dentro do recorte: num recorte de 214px por 60px, todo rótulo cai fora da imagem e o print sai com  │
 * │ uma seta apontando para nada. Recolher a barra também não resolve (ela continua com ~1200px).       │
 * │                                                                                                    │
 * │ ENTÃO A IMAGEM É A TELA, ROLADA ATÉ O PÉ DA BARRA. O `preparo` rola uma vez, ANTES de qualquer      │
 * │ alvo ser medido, e é isso que garante que as três marcações sejam medidas na MESMA posição de       │
 * │ rolagem: alvo que rola sozinho no meio da medição move os que já foram medidos.                     │
 * │                                                                                                    │
 * │ A TELA É O PAINEL INICIAL, que não lista pessoa nenhuma: é card de menu com descrição. O único nome │
 * │ na imagem é o da CONTA DE CAPTURA, declarada na allowlist do arnês, e o gate de dado pessoal segue  │
 * │ auditando a imagem inteira, que agora é maior do que era. Perder o recorte aqui não perde medida de │
 * │ privacidade, porque não havia dado de pessoa a esconder nesta tela.                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O ALVO DO TEMA CASA PELO RÓTULO ACESSÍVEL, QUE **NÃO** É O QUE A PESSOA LÊ ──────────────────┐
 * │ O botão do tema mostra "Tema escuro" ao passar o mouse e se chama "Mudar para tema escuro" para o │
 * │ leitor de tela. O artigo declara em `controles` o que a PESSOA lê; o roteiro casa pelo rótulo      │
 * │ acessível, que é o que o localizador enxerga. São textos diferentes do mesmo controle, de          │
 * │ propósito, e confundi-los é o jeito mais fácil de um alvo não resolver.                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O SEGUNDO PREPARO NÃO CLICA, SÓ ROLA: clicar em recolher deixaria a barra fechada, e a imagem do
 * controle sairia de uma barra sem nome nenhum, que é o estado que o passo 1 acabou de explicar.
 */
import type { Roteiro } from "../tipos";

export const roteiro: Roteiro = {
  slug: "tema-perfil-e-sair",
  url: "/",
  capturas: [
    {
      arquivo: "01-pe-da-barra-lateral.png",
      legenda: "Passo 1: o pé da barra lateral, com o usuário conectado, o tema e a saída.",
      preparo: [{ acao: "rolarAte", alvo: { papel: "button", nome: "Sair", texto: "" } }],
      alvos: [
        {
          seletor: ".side-user",
          texto: "1. Quem está conectado",
          forma: "retangulo",
          /*
           * "direita", e NÃO "acima": na prova visual o rótulo acima cobria o item "Menu Gerencial",
           * que é o último menu da barra e fica encostado no bloco do usuário. Rótulo que tapa um
           * controle da tela ensina uma coisa e esconde outra.
           */
          lado: "direita",
        },
        { papel: "button", nome: /^Mudar para tema/, texto: "2. Tema claro ou escuro", lado: "acima" },
        { papel: "button", nome: "Sair", texto: "4. Encerra a sessão", lado: "acima" },
      ],
    },
    {
      arquivo: "02-recolher-o-menu.png",
      legenda: "Passo 3: o controle que recolhe e fixa a barra lateral.",
      preparo: [
        {
          acao: "rolarAte",
          alvo: { papel: "button", nome: /Recolher menu|Fixar menu expandido/, texto: "" },
        },
      ],
      alvos: [
        {
          papel: "button",
          nome: /Recolher menu|Fixar menu expandido/,
          texto: "3. Recolhe e fixa a barra",
          /*
           * "abaixo", e não "direita": à direita o rótulo cobria o TÍTULO da tela, que é a âncora de
           * quem olha o print e pergunta "isto é de qual tela?". Abaixo ele encosta na frase de apoio,
           * que a legenda do print já repete.
           */
          lado: "abaixo",
        },
      ],
    },
  ],
};
