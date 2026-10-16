/** Tailwind classes shared by the account screens (D69). */
export const screenStyles = {
  primaryButton:
    "rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-50",
  linkButton:
    "font-medium text-indigo-400 hover:text-indigo-300 hover:underline focus-visible:outline-2 focus-visible:outline-indigo-400",
  textInput:
    "rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none",
  errorMessage: "text-sm text-red-400",
  hint: "text-sm text-zinc-400",
} as const;
