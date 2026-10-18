import type { ReactNode } from "react";
import { AppMark } from "./AppMark";

interface ScreenCardProps {
  readonly title: string;
  readonly children: ReactNode;
}

/** The centred card every account screen is drawn in. */
export function ScreenCard({
  title,
  children,
}: ScreenCardProps): React.JSX.Element {
  return (
    <section className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-lg">
      <div className="mb-4">
        <AppMark />
      </div>
      <h1 className="mb-5 text-xl font-semibold">{title}</h1>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}
