export function SectionCard({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-border bg-panel p-6 shadow-2xl shadow-slate-950/20">
      <p className="text-xs font-medium uppercase tracking-[0.3em] text-slate-500">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}