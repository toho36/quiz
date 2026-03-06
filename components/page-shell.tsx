export function PageShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.3em] text-sky-300">{eyebrow}</p>
        <h1 className="text-3xl font-semibold text-white">{title}</h1>
        <p className="max-w-3xl text-base text-slate-300">{description}</p>
      </div>
      {children}
    </section>
  );
}