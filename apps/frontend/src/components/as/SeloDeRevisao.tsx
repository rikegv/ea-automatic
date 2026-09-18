import { Icon } from "@/components/ui/Icon";

/**
 * ─ O SELO VERMELHO DA VAGA QUE ENTROU SOZINHA ──────────────────────────────────────────────────
 *
 * O QUE ELE DIZ, e é uma coisa que a pill de status NÃO diz: esta vaga não foi aberta por ninguém
 * no EA. Ela é o espelho de uma vaga que já vive no Pandapé, trazida por uma varredura, e o cliente
 * dela é NULO porque o cliente não tem caminho na API do ATS (medido). Enquanto ninguém revisar, o
 * que a vaga afirma sobre si mesma não passou por gente.
 *
 * POR QUE ELE NÃO É A PILL DE STATUS, e por que os dois convivem na mesma célula: a pill responde
 * "em que pé está", e é um dado do catálogo que o diretor edita; o selo responde "isto aqui precisa
 * de alguém", e é um ALERTA. Juntar as duas coisas numa pill só faria o alerta desaparecer no dia em
 * que o diretor trocasse a cor da linha do catálogo.
 *
 * §A.12, O ÍCONE ACOMPANHA O ESTADO REAL, NUNCA É FIXO: o selo some no instante em que a vaga é
 * liberada (ela deixa de ser do papel `REVISAO`), e o texto muda conforme o cliente já ter sido
 * vinculado ou não, que é a única pendência que separa a vaga da liberação.
 *
 * §A.24: "Não Revisada" é TAG, então title case. A frase do `title` é texto de apoio e segue a
 * escrita normal. §A.11: sem travessão em nenhuma das duas.
 */
export function SeloDeRevisao({
  mostrar,
  clienteVinculado,
  className,
}: {
  mostrar: boolean;
  clienteVinculado: boolean;
  className?: string;
}) {
  if (!mostrar) return null;
  return (
    <span
      className={
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-[rgba(220,38,38,0.4)] bg-[rgba(220,38,38,0.12)] px-2 py-0.5 text-[11px] font-semibold text-danger " +
        (className ?? "")
      }
      title={
        clienteVinculado
          ? "A vaga entrou sozinha pela varredura do Pandapé e ainda não foi liberada. O cliente já está vinculado, falta liberar na tela de Vagas Pendentes De Revisão."
          : "A vaga entrou sozinha pela varredura do Pandapé e ainda não foi revisada. Falta vincular o cliente e liberar, na tela de Vagas Pendentes De Revisão."
      }
    >
      <Icon name="alert" className="h-3 w-3 flex-none" />
      Não Revisada
    </span>
  );
}
