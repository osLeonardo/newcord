/**
 * The Safety number as the screen shows it: 12 blocks of 5 digits (D45).
 * @example safetyNumberBlocks("0123456789…") // ["01234", "56789", …]
 */
export function safetyNumberBlocks(safetyNumber: string): string[] {
  return safetyNumber.match(/\d{5}/g) ?? [];
}
