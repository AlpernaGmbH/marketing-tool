import { cn } from "cn";

type Props = {
  title: string;
  children: React.ReactNode;
  /** Knöpfe unter dem Ergebnis (Kopieren, Download). */
  actions?: React.ReactNode;
  className?: string;
};

/** Rahmen für ein Ergebnis. Das Ergebnis steht immer sofort am Bildschirm. */
export function ResultCard({ title, children, actions, className }: Props) {
  return (
    <section aria-label={title} className={cn("rounded-xl border border-ink bg-paper p-5 md:p-8", className)}>
      <h3>{title}</h3>
      <div className="mt-4 grid gap-4">{children}</div>
      {actions && <div className="mt-6 flex flex-wrap items-center gap-3">{actions}</div>}
    </section>
  );
}
