import Link from "next/link";

const CARDS = [
  { href: "/admin/clientes", title: "Clientes", desc: "Código, CNPJ, razão social e operação." },
  { href: "/admin/cargos", title: "Cargos", desc: "Catálogo de cargos da admissão." },
  {
    href: "/admin/regua",
    title: "Régua documental",
    desc: "Exigência de cada documento por (cliente + cargo).",
  },
];

export default function AdminHome() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cadastros-base</h1>
        <p className="text-sm text-slate-500">
          Estrutura pronta para receber dados (a carga das bases é a próxima etapa).
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-lg border border-slate-200 bg-white p-5 transition hover:border-slate-400"
          >
            <h2 className="font-semibold">{c.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{c.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
