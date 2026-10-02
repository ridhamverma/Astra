type PlaceholderPageProps = {
  title: string;
  description: string;
};

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <section className="mx-auto my-12 max-w-5xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-indigo-600">Astra foundation</p>
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-4 max-w-2xl leading-7 text-slate-600">{description}</p>
    </section>
  );
}
