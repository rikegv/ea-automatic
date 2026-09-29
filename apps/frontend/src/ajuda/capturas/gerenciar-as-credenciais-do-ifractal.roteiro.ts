/**
 * ROTEIRO DE CAPTURA: "Gerenciar As Credenciais Do iFractal".
 *
 * ┌─ ESTA É A ABA QUE O CAMPO DE SENHA MASCARADO DESTRAVOU PARA A CAPTURA ───────────────────────┐
 * │ Enquanto a senha era desenhada em texto claro na tabela, fotografar esta aba levaria CREDENCIAL   │
 * │ para dentro de um PNG versionado. A decisão do diretor de 28/09/2026 trocou o campo para senha    │
 * │ de verdade, e `textoAuditavel` (`ajuda/pii.ts`) pula `input[type=password]`: conserto do produto  │
 * │ e destravamento da captura são o mesmo conserto. A imagem 2 aponta exatamente esse campo.        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ ESTE ROTEIRO **NÃO** USA A BUSCA POR `999000`, E A ESCOLHA FOI MEDIDA ──────────────────────┐
 * │ Os outros roteiros da Esteira recortam a fila digitando `999000` na busca, porque os candidatos do │
 * │ arnês têm CPF da família 999 e isso deixa a tela sintética. Aqui isso ESVAZIA a aba: rodado com a  │
 * │ busca, `pnpm ajuda:conferir` recusa a captura por LISTA VAZIA, 0 linhas. O arnês cria admissão na  │
 * │ AUDITORIA, e a frente do iFractal só nasce quando Auditoria e Exame fecham, então os candidatos    │
 * │ sintéticos não chegam a esta fila.                                                                │
 * │                                                                                                   │
 * │ SEM A BUSCA, O GATE DE DADO PESSOAL APROVOU a imagem 1 da fila desta aba (medido no mesmo comando),│
 * │ e é ele a garantia, não a busca. Se um dia a fila trouxer dado que o gate reprove, o motor RECUSA  │
 * │ gravar, que é o comportamento desejado: a proteção é o gate, e ela não depende deste comentário.   │
 * │ E a senha, que é o dado mais sensível da aba, fica fora da auditoria por ser campo de senha.       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A IMAGEM 2 FALHA HOJE, E A FALHA É O DETECTOR FUNCIONANDO ──────────────────────────────────┐
 * │ O alvo `input[type="password"]` NÃO resolve na homologação, e a causa não é o roteiro: a decisão do │
 * │ diretor que mascara a senha é de 28/09/2026, e a homologação é sincronizada por cópia de arquivo,  │
 * │ então ela costuma viver commits atrás da linha principal. Enquanto aquela tela não receber a       │
 * │ mudança, o campo continua sendo texto claro ali e o alvo não existe.                              │
 * │                                                                                                   │
 * │ O ALVO FICA COMO ESTÁ, DE PROPÓSITO. Ele descreve a tela que o artigo ensina, que é a de AGORA, e  │
 * │ trocá-lo por um seletor que casasse o campo antigo faria o roteiro aprovar exatamente o estado que │
 * │ a decisão do diretor eliminou, e ainda levaria senha em claro para um PNG versionado.             │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ OS DOIS CAMPOS SÃO ALCANÇADOS SEM NOME DE PESSOA ───────────────────────────────────────────┐
 * │ Os rótulos acessíveis são "Login do iFractal de <NOME>" e "Senha do iFractal de <NOME>", então    │
 * │ casar por eles poria nome de gente neste arquivo, que é versionado. O login é alcançado pelo      │
 * │ TEXTO DE APOIO do campo (fixo, "login") e a senha pelo TIPO do campo, que é o que a decisão do    │
 * │ diretor acabou de tornar estável. O seletor de status casa só o COMEÇO do rótulo acessível, no    │
 * │ mesmo recorte do roteiro do ASO.                                                                │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE A FILA PRECISA TER: uma admissão com a frente do iFractal aberta, que nasce junto do Cadastro
 * quando a Auditoria e o Exame fecham, para todos os clientes. Sem linha nenhuma os campos não
 * existem, o alvo não resolve e o motor FALHA em vez de gravar imagem sem seta.
 *
 * NENHUM PNG É GRAVADO POR ESTE ARQUIVO. Ele descreve a captura; quem executa é o motor.
 */
import type { Roteiro } from "../tipos";

export const roteiro: Roteiro = {
  slug: "gerenciar-as-credenciais-do-ifractal",
  url: "/esteira",
  arnes: "arnes-seed-manual",
  preparo: [
    { acao: "clicar", alvo: { papel: "button", nome: "IFRACTAL", texto: "" } },
  ],
  capturas: [
    {
      arquivo: "01-aba-ifractal.png",
      legenda: "Passo 1: a aba iFractal aberta, com as colunas próprias dela.",
      alvos: [
        { papel: "button", nome: "IFRACTAL", texto: "1. Abra a aba iFractal", lado: "abaixo" },
        {
          papel: "button",
          nome: "Tipo De Marcação",
          texto: "3. Como a pessoa marca ponto",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-campos-login-e-senha.png",
      legenda: "Passo 4: os campos de login e de senha editáveis na própria linha.",
      alvos: [
        {
          seletor: 'input[placeholder="login"]',
          texto: "4. Digite o login",
          lado: "acima",
        },
        {
          seletor: 'input[type="password"]',
          texto: "5. A senha fica mascarada",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "03-seletor-de-status.png",
      legenda: "Passo 6: o seletor de status dentro da coluna Status, na linha.",
      alvos: [
        {
          papel: "button",
          nome: /^Status do iFractal de/,
          texto: "6. Mova até Finalizado",
          lado: "acima",
        },
      ],
    },
  ],
};
