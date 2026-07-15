type NamedRecord = {
  name: string;
};

export function sortByNameCaseInsensitive<T extends NamedRecord>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const primary = a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
      numeric: true,
    });
    if (primary !== 0) return primary;

    return a.name.localeCompare(b.name, undefined, {
      sensitivity: "variant",
      numeric: true,
    });
  });
}
