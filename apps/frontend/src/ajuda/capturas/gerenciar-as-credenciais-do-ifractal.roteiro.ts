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
 * │ ESTE BLOCO DIZIA O CONTRÁRIO, e a inversão está registrada porque ela é a lição. Ele explicava    │
 * │ que o alvo `input[type="password"]` não resolvia na homologação por atraso de sincronização, e    │
 * │ mandava NÃO trocá-lo, porque trocar faria o roteiro aprovar o estado que a decisão do diretor     │
 * │ tinha eliminado.                                                                                  │
 * │                                                                                                   │
 * │ EM 30/09/2026 A DECISÃO FOI REVERTIDA: o mascaramento quebrou a operação (o time cadastra a senha │
 * │ e precisa LÊ-LA para repassar ao candidato) e o campo voltou a texto claro, agora como regra       │
 * │ permanente. O alvo antigo deixou de existir de vez, e o detector o pegou na primeira conferência,  │
 * │ que é exatamente para isso que ele serve.                                                          │
 * │                                                                                                   │
 * │ O ALVO NOVO CASA PELO TEXTO DE APOIO DO CAMPO, igual ao do login, e não pelo tipo: tipo de campo   │
 * │ é justamente o que mudou duas vezes em três dias, e o texto de apoio ficou igual nas duas.        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ OS DOIS CAMPOS SÃO ALCANÇADOS SEM NOME DE PESSOA ───────────────────────────────────────────┐
 * │ Os rótulos acessíveis são "Login do iFractal de <NOME>" e "Senha do iFractal de <NOME>", então    │
 * │ casar por eles poria nome de gente neste arquivo, que é versionado. O login é alcançado pelo      │
 * │ TEXTO DE APOIO de cada um, que é fixo nos dois ("login" e "senha") e sobreviveu às duas trocas de │
 * │ decisão. O seletor de status casa só o COMEÇO do rótulo acessível, no mesmo recorte do roteiro do │
 * │ ASO.                                                                                             │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE A FILA PRECISA TER: uma admissão com a frente do iFractal aberta, que nasce junto do Cadastro
 * quando a Auditoria e o Exame fecham, para todos os clientes. Sem linha nenhuma os campos não
 * existem, o alvo não resolve e o motor FALHA em vez de gravar imagem sem seta.
 *
 * NENHUM PNG É GRAVADO POR ESTE ARQUIVO. Ele descreve a captura; quem executa é o motor.
 */
/**
 * ─ A ETIQUETA MUDOU, E O CAMPO DA IMAGEM CONTINUA VAZIO DE PROPÓSITO ───────────────────────────
 *
 * A etiqueta 5 dizia "A senha fica mascarada". Ficou FALSA em 30/09/2026, quando o diretor reverteu o
 * mascaramento: a senha voltou a ficar visível na linha, porque ela é provisória e quem cadastra
 * precisa lê-la para repassar ao candidato.
 *
 * ┌─ O CAMPO APARECE VAZIO NA IMAGEM, E ISSO NÃO É LIMITAÇÃO, É A REGRA ────────────────────────┐
 * │ Senha visível na TELA é decisão tomada. Senha em PRINT continua proibida, e o motivo é que o   │
 * │ público e o prazo são outros: na tela é o time com termo assinado, enquanto a sessão dura; no  │
 * │ repositório é qualquer um que clone, para sempre. Então a imagem mostra ONDE o campo fica, e   │
 * │ quem ensina que o valor é legível é o TEXTO do artigo, não a figura.                            │
 * │                                                                                                │
 * │ CONSEQUÊNCIA PARA QUEM MEXER AQUI: o filtro de dado pessoal só ignorava aquele campo enquanto  │
 * │ ele era do tipo senha. Agora ele LÊ o valor, e recusa a imagem se houver senha no quadro. Isso  │
 * │ é o comportamento certo. Havendo recusa, as saídas são recorte que tire a coluna do quadro ou  │
 * │ arnês sem credencial gravada. Afrouxar o filtro não é saída.                                    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
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
          /*
           * PELO TEXTO DE APOIO, NUNCA PELO TIPO. O tipo do campo mudou duas vezes em três dias
           * (texto claro, depois senha, depois texto claro de novo), e cada troca derrubou o alvo.
           * O texto de apoio ficou igual nos três estados. O rótulo acessível resolveria também, e
           * está descartado por outro motivo: ele carrega o NOME DA PESSOA, e este arquivo é
           * versionado.
           */
          seletor: 'input[placeholder="senha"]',
          texto: "5. Digite a senha",
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
