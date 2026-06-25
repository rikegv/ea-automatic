/** Cabeçalho de página: eyebrow (accent) + título (Manrope) + subtítulo. */
export function PageHead({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-[26px]">
      <div className="eyebrow">{eyebrow}</div>
      <h1 className="text-[26px] font-extrabold">{title}</h1>
      {subtitle && <p className="mt-[5px] text-sm text-dim">{subtitle}</p>}
    </div>
  );
}
