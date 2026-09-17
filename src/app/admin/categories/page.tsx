import { AuthenticatedNavigation } from "@/components/authenticated-navigation";
import { CategoryManagement } from "@/components/category-management";
import { CreateCategory } from "@/components/create-category";
import { Role } from "@/generated/prisma/enums";
import { requireProtectedPage } from "@/modules/auth/page-authorization";
import { categoryResetKey } from "@/modules/catalog/category-presentation";
import { listCategories } from "@/modules/catalog/service";
import Link from "next/link";

type Props = {
  searchParams: Promise<{
    create?: string;
    error?: string;
    saved?: string;
  }>;
};

export default async function CategoriesPage({ searchParams }: Props) {
  const actor = await requireProtectedPage(Role.ADMIN);
  const [categories, query] = await Promise.all([
    listCategories(actor),
    searchParams,
  ]);
  const resetKey = categoryResetKey(
    categories.map((category) => ({
      ...category,
      archived: Boolean(category.archivedAt),
      archivedAt: category.archivedAt?.toISOString() ?? null,
      description: category.description ?? "",
      updatedAt: category.updatedAt.toISOString(),
    })),
  );

  return (
    <main className="page-shell">
      <AuthenticatedNavigation actor={actor} />
      <Link className="back-link" href="/admin">
        ← Back to dashboard
      </Link>
      <CreateCategory
        error={query.create === "1" ? query.error : undefined}
        key={`${resetKey}:${query.create === "1" ? query.error : ""}`}
      />
      {query.error && query.create !== "1" ? (
        <p className="notice error" role="alert">
          {query.error}
        </p>
      ) : null}
      {query.saved ? (
        <p className="notice success" role="status">
          Category changes saved.
        </p>
      ) : null}

      <CategoryManagement
        key={resetKey}
        categories={categories.map((category) => ({
          archived: Boolean(category.archivedAt),
          description: category.description ?? "",
          id: category.id,
          name: category.name,
          slug: category.slug,
        }))}
      />
    </main>
  );
}
