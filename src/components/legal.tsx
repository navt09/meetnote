/**
 * Shared shell for the privacy policy and terms. These are public pages: they
 * must render for signed-out visitors, and Google's OAuth reviewers fetch them
 * directly, so nothing here may sit behind auth.
 */

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-6 pt-16 pb-24">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-xs text-faint">Last updated {updated}</p>
      </header>
      <div className="flex flex-col gap-7 text-sm leading-relaxed text-muted">{children}</div>
    </article>
  );
}

export function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-fg">{heading}</h2>
      {children}
    </section>
  );
}

export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5 marker:text-faint">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** A clause that carries real obligation, lifted so it cannot be skimmed past. */
export function Callout({ children }: { children: React.ReactNode }) {
  return <div className="glass border-warn/40 p-4 text-sm text-fg">{children}</div>;
}
