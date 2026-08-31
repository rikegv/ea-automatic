"use client";

/**
 * A TELA INICIAL, REFORMADA (decisão do diretor).
 *
 * ┌─ O QUE ELA É AGORA ─────────────────────────────────────────────────────────────────────────┐
 * │ Saudação por horário + UM CARD PARA CADA DESTINO QUE A PESSOA TEM LIBERADO. É o espelho da   │
 * │ barra lateral em forma de painel: mesmos grupos, mesma ordem, mesma régua de permissão.      │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O RADAR DA ESTEIRA SAIU DAQUI. Era 100% mock: os três insights eram texto chumbado no componente
 * ("cliente Testetestando", "14 clientes / 59 admissões", "pico 16/07"), nunca leram o banco, e a
 * geração real estava adiada para a Fase 6. Nunca foi usado e não há previsão de uso.
 *
 * ┌─ POR QUE OS CARDS VÊM DE `lib/navegacao`, e não de uma lista escrita aqui ───────────────────┐
 * │ Uma lista própria nesta tela seria a SEGUNDA lista de navegação do sistema, e duas listas    │
 * │ divergem no primeiro menu novo: a barra mostraria a tela e a home não, ou o contrário. Como  │
 * │ as duas leem `gruposDeNavegacao`, "se a barra mostra X, a home mostra o card de X" é         │
 * │ verdade POR CONSTRUÇÃO, não por alguém lembrar de atualizar os dois lugares.                 │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.23: NADA AQUI CONCEDE ACESSO. A tela só desenha o que `temMenu` já autoriza; quem libera menu
 * é o diretor. E esta rota (`/`) segue sendo a ÚNICA não governada por menu (ver `menu-rotas.ts`),
 * que é o que a mantém segura como porto seguro de quem é barrado em outra tela: ela nunca bloqueia
 * ninguém, então redirecionar para cá não pode virar laço.
 */

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Icon } from "@/components/ui/Icon";
import { gruposDeNavegacao } from "@/lib/navegacao";

/** Saudação por horário: leve, sem dependência de dados reais nesta fase. */
function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function primeiroNome(email: string): string {
  const local = email.split("@")[0] ?? email;
  const first = local.split(/[._-]+/)[0] ?? local;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export default function HomePage() {
  const { user, temMenu, isAdmin } = useAuth();
  const nome = user ? primeiroNome(user.email) : "";

  // `incluirInicio: false`: um card "Início" aqui seria um link para a página em que a pessoa já
  // está. Na barra lateral o Início continua aparecendo normalmente.
  const grupos = gruposDeNavegacao(temMenu, isAdmin, { incluirInicio: false });

  return (
    <>
      <PageHead
        eyebrow="Painel inicial"
        title={`${saudacao()}, ${nome}`}
        subtitle="Suas telas liberadas, em um lugar só."
      />

      {grupos.map((g) => (
        <section key={g.titulo} className="mb-7 last:mb-0">
          {/* O TÍTULO DO GRUPO REPETE O DA BARRA (Operação, Atração e Seleção, Administração):
              quem trabalha nas duas frentes reconhece o mesmo recorte nos dois lugares. Quem só tem
              uma delas nem vê o cabeçalho da outra, porque o grupo vazio não é montado. */}
          <h2 className="mb-3 px-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
            {g.titulo}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {g.itens.map((n) => (
              <GlassCard key={n.href} as={Link} href={n.href} className="qcard block">
                <div className="q-ico">
                  <Icon name={n.icon} />
                </div>
                <span className="arr">
                  <Icon name="arr" width={18} height={18} />
                </span>
                <h3>{n.label}</h3>
                <p>{n.descricao}</p>
              </GlassCard>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
