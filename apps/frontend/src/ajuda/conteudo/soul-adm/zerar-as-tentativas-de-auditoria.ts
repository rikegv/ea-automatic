import type { Artigo } from "../../tipos";

/**
 * N2 DA ABA AUDITORIA: a exceção de quem administra, e a decisão que ela pede.
 *
 * ┌─ O RECORTE: ESTE ARTIGO É SOBRE A DECISÃO, NÃO SOBRE A JANELA ───────────────────────────────┐
 * │ Ele responde três perguntas e para: o que zerar devolve, quando é o caminho certo e quem pode. │
 * │ Abrir a janela de documentos, ler veredito, reauditar e reabrir a pendência de um documento     │
 * │ são artigos irmãos, apontados em `relacionados`. Repetir a mecânica aqui criaria duas          │
 * │ explicações da mesma regra, e é a divergência entre elas que fica caro depois.                 │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ OS NÚMEROS SÃO MEDIDOS NO CÓDIGO, NÃO ARREDONDADOS ────────────────────────────────────────┐
 * │ Teto de reprovações por pendência: 3. Solicitar reenvio, que é do time, devolve 1 envio e pode │
 * │ ser usado no máximo 3 vezes na mesma pendência. Zerar tentativas devolve o teto inteiro, ou     │
 * │ seja, 3 envios. As duas ações só valem depois que a pendência CAIU na fila do time, e quem      │
 * │ decide quem pode zerar é a regra de papel da própria rota, não a tela.                         │
 * │ (`domain/portal-tentativas.ts`, `portal/portal-pendencias.service.ts`,                        │
 * │ `portal/portal-pendencias.controller.ts`.)                                                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A CONSEQUÊNCIA QUE MAIS GERA CHAMADO, E ELA É DELIBERADA ──────────────────────────────────┐
 * │ Logo depois de um reenvio solicitado pelo time, a contagem que vale volta a ficar UMA abaixo do │
 * │ teto, então o destravamento é recusado naquele instante. Não é defeito: é a regra de só valer   │
 * │ depois da queda, e o artigo diz isso antes de a pessoa tentar.                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * IMAGEM: pendência conhecida, não esquecimento. A janela mostra nome de pessoa e a captura foi
 * vetada enquanto a homologação não tiver base sintética. O texto funciona sem imagem.
 */
export const artigo: Artigo = {
  slug: "zerar-as-tentativas-de-auditoria",
  titulo: "Zerar As Tentativas De Auditoria",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N2",
  familia: "esteira",
  resumo:
    "O que o destravamento de tentativas devolve ao candidato, quando ele é o caminho certo e por que ele existe: a régua da inteligência artificial pode reprovar um documento bom.",
  termos: [
    "zerar tentativas",
    "destravar",
    "destravar tentativas",
    "liberar tentativas",
    "candidato travado",
    "candidato bloqueado",
    "esgotou as tentativas",
    "acabaram as tentativas",
    "nao consigo mais enviar",
    "documento bom reprovado",
    "ia reprovou errado",
    "na fila do time",
    "reabrir pendencia",
    "master",
  ],
  preRequisitos: [
    "Ter perfil de administração: o destravamento é de Master e de Super Admin, e o consultor não o enxerga.",
    "A pendência daquele documento já precisa ter caído na fila do time, o que acontece na terceira reprovação.",
    "Ter olhado o documento e concluído que ele está bom: é esta conclusão que justifica desmentir a régua.",
  ],
  passos: [
    {
      gesto: "Abra a Esteira Admissional, fique na aba Auditoria e ache a pessoa pela busca.",
      controles: ["Esteira Admissional", "AUDITORIA", "Buscar por nome, CPF ou cliente"],
    },
    {
      gesto: "Clique em Auditar na linha dela e procure a tarja de alerta na linha do documento.",
      detalhe:
        "Ela aparece só quando aquele documento caiu na fila do time, com a etiqueta Na Fila Do Time e a contagem de envios que o candidato usou.",
      controles: ["Auditar", "Na Fila Do Time"],
    },
    {
      gesto: "Leia, na própria tarja, quanto cada uma das duas ações devolve antes de clicar.",
      detalhe:
        "A tela escreve o número dos dois caminhos: o reenvio solicitado pelo time devolve um envio, e o destravamento devolve o teto inteiro. Quem administra decide com o número na frente, não depois de causar o efeito.",
      controles: ["Solicitar reenvio", "Zerar tentativas"],
    },
    {
      gesto: "Abra o documento e confira se ele está bom antes de decidir.",
      detalhe:
        "O destravamento existe para o caso em que a régua errou, e quem afirma isso é você. Se o documento está mesmo errado, o caminho é falar com o candidato e pedir o arquivo certo.",
    },
    {
      gesto: "Clique em Zerar tentativas.",
      detalhe:
        "Este é o único botão da tarja com moldura de alerta, e ele aparece só para quem administra. O consultor vê a tarja e o reenvio, nunca este.",
      controles: ["Zerar tentativas"],
    },
    {
      gesto: "Leia a confirmação verde na mesma linha do documento.",
      detalhe:
        "Ela diz quantos envios o candidato recebeu e que ele já pode mandar o documento de novo. Não é preciso recarregar a tela.",
    },
    {
      gesto: "Avise o candidato que ele pode reenviar.",
      detalhe:
        "O destravamento devolve o envio, não manda mensagem: nenhuma das duas ações conversa com a pessoa.",
    },
  ],
  seDerErrado: [
    {
      sintoma:
        "A tela diz que esta pendência não tem nenhuma reprovação, então não há tentativa a zerar.",
      acao: "O texto completo é: \"Esta pendência não tem nenhuma reprovação, então não há tentativa a zerar. O destravamento vale a partir da 3ª reprovação, quando a pendência cai na fila do time.\" Não há o que destravar: o candidato nunca foi reprovado naquele documento e continua podendo enviar sozinho.",
    },
    {
      sintoma: "A tela recusa dizendo quantas reprovações a pendência tem hoje.",
      acao: "A frase segue com: \"O destravamento vale a partir da 3ª, quando o candidato para de enviar sozinho e a pendência cai na fila do time. Até lá ele ainda pode mandar o documento por conta própria, e o reenvio pode ser solicitado assim que a pendência cair.\" Espere a queda ou trabalhe com o candidato pelo caminho normal.",
    },
    {
      sintoma: "Acabei de solicitar o reenvio e agora o destravamento é recusado.",
      acao: "É a mesma regra: o reenvio devolveu um envio, a contagem voltou a ficar abaixo do teto e a pendência saiu da fila do time. O destravamento volta a valer se o candidato reprovar de novo e cair outra vez.",
    },
    {
      sintoma: "Não encontro o botão de zerar tentativas.",
      acao: "Ele é de Master e de Super Admin. O consultor vê a tarja e o botão de solicitar reenvio, e a recusa também vale no servidor: esconder o botão não seria trava. Peça a quem administra.",
    },
    {
      sintoma:
        "A tela avisa que o time já reabriu esta pendência o número máximo de vezes.",
      acao: "O aviso é: \"O time já reabriu esta pendência o número máximo de vezes. Daqui para frente, só um Master destrava as tentativas.\" O consultor esgotou as três reaberturas dele naquele documento, e daí em diante o caminho é o destravamento.",
    },
    {
      sintoma:
        "O sistema respondeu que o Portal do candidato está indisponível porque a trilha de auditoria não está configurada.",
      acao: "Nada foi reaberto, de propósito: a ação não acontece sem deixar rastro. Avise a TI, e não repita o clique, porque a recusa não vai mudar sozinha.",
    },
  ],
  regras: [
    "São duas portas diferentes para o mesmo problema: o reenvio solicitado pelo time devolve um envio, e o destravamento devolve o teto inteiro de três.",
    "O reenvio do time é fluxo normal, de qualquer consultor. O destravamento é exceção, de Master e de Super Admin.",
    "As duas só valem depois que a pendência cai na fila do time, o que acontece na terceira reprovação daquele documento.",
    "O time pode reabrir a mesma pendência no máximo três vezes. Depois disso, só o destravamento resolve.",
    "O destravamento existe porque a régua da inteligência artificial ainda não foi validada pelo time de recursos humanos: uma regra errada reprova documento bom.",
    "Nada é apagado. As duas ações gravam a data da reabertura e a contagem passa a valer daquele momento em diante, com autor e horário registrados.",
    "Destravar não muda o veredito do documento nem reanalisa nada: só devolve ao candidato o direito de enviar outra vez.",
    "A contagem é por documento e por admissão. Três reprovações no comprovante de residência não tiram do candidato o direito de enviar os outros documentos.",
  ],
  relacionados: [
    "solicitar-o-reenvio-dos-documentos",
    "reabrir-a-pendencia-de-um-documento",
    "reauditar-um-documento",
    "assumir-um-documento-como-valido",
    "visualizar-um-documento-da-admissao",
    "auditar-os-documentos-da-admissao",
    "acompanhar-a-conferencia-do-portal",
  ],
  fontes: [
    "apps/frontend/src/components/esteira/AuditoriaDocsModal.tsx",
    "apps/backend/src/domain/portal-tentativas.ts",
    "apps/backend/src/portal/portal-pendencias.service.ts",
    "apps/backend/src/portal/portal-pendencias.controller.ts",
  ],
  revisadoEm: "2026-09-30",
};
