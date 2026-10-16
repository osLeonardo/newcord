/** Tailwind classes shared by the account screens (D69). */
export const screenStyles = {
  primaryButton:
    "rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-50",
  dangerButton:
    "rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:cursor-not-allowed disabled:opacity-50",
  secondaryButton:
    "rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-50",
  linkButton:
    "font-medium text-indigo-400 hover:text-indigo-300 hover:underline focus-visible:outline-2 focus-visible:outline-indigo-400",
  textInput:
    "rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none",
  smallPrimaryButton:
    "rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-50",
  smallSecondaryButton:
    "rounded border border-zinc-700 px-2 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-50",
  listItemButton:
    "w-full truncate rounded px-2 py-1 text-left text-sm text-zinc-200 hover:bg-zinc-800 aria-[current=true]:bg-zinc-800 aria-[current=true]:font-medium focus-visible:outline-2 focus-visible:outline-indigo-400",
  sectionHeading: "text-xs font-semibold tracking-wide text-zinc-500 uppercase",
  errorMessage: "text-sm text-red-400",
  hint: "text-sm text-zinc-400",
} as const;
