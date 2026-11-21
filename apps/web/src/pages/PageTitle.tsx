/** Shared placeholder heading used by the #3 shell pages. */
export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div>
      <h1 className="m-0 font-heading text-3xl font-normal text-ink md:text-[40px]">{title}</h1>
      {sub && <p className="mt-2 text-muted">{sub}</p>}
    </div>
  );
}
