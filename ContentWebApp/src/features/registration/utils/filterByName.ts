export function filterByName<T extends { name: string }>(rows: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => row.name.toLowerCase().includes(needle));
}
