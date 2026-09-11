// "Addison (Blue)" -> "Addison" — drop once the line is already stated elsewhere.
export function stationDisplayName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '');
}
