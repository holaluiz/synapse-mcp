/** Canonical agent identity, so 'Claude_Code' and 'claude-code' refer to the same agent. */
export function normalizeAgentName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

/** SQL expression equivalent to normalizeAgentName for a column (single separators only). */
export function normalizedAgentSql(column: string): string {
  return `replace(replace(lower(trim(${column})), '_', '-'), ' ', '-')`;
}

export function sameAgent(a: string | null | undefined, b: string | null | undefined): boolean {
  return a != null && b != null && normalizeAgentName(a) === normalizeAgentName(b);
}
