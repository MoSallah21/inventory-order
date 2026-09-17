export type CategoryResetSource = {
  archived: boolean;
  archivedAt: string | null;
  description: string;
  id: string;
  name: string;
  slug: string;
  updatedAt: string;
};

export function categoryResetKey(
  categories: readonly CategoryResetSource[],
): string {
  return JSON.stringify(
    categories.map((category) => [
      category.id,
      category.name,
      category.slug,
      category.description,
      category.updatedAt,
      category.archived,
      category.archivedAt,
    ]),
  );
}
