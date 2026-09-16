import { AuthenticatedNavigation } from "@/components/authenticated-navigation";
import { Role } from "@/generated/prisma/enums";
import { requireProtectedPage } from "@/modules/auth/page-authorization";
import { listCategories } from "@/modules/catalog/service";

import {
  archiveCategoryAction,
  createCategoryAction,
  updateCategoryAction,
} from "./actions";

type Props = { searchParams: Promise<{ error?: string; saved?: string }> };

export default async function CategoriesPage({ searchParams }: Props) {
  const actor = await requireProtectedPage(Role.ADMIN);
  const [categories, query] = await Promise.all([
    listCategories(actor),
    searchParams,
  ]);

  return (
    <main className="page-shell">
      <AuthenticatedNavigation actor={actor} />
      <p className="eyebrow">Admin catalog</p>
      <h1>Categories</h1>
      <p className="lede">
        Create, edit, and archive the categories suppliers can use.
      </p>
      {query.error ? <p className="notice error">{query.error}</p> : null}
      {query.saved ? (
        <p className="notice success">Category changes saved.</p>
      ) : null}

      <section className="panel">
        <h2>Create category</h2>
        <form action={createCategoryAction} className="form-grid">
          <label>
            Name
            <input maxLength={80} name="name" required />
          </label>
          <label>
            Slug
            <input
              maxLength={80}
              name="slug"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              required
            />
          </label>
          <label className="full">
            Description
            <textarea maxLength={500} name="description" />
          </label>
          <button type="submit">Create category</button>
        </form>
      </section>

      <section className="stack" aria-label="Existing categories">
        {categories.map((category) => (
          <article className="panel" key={category.id}>
            <div className="row">
              <h2>{category.name}</h2>
              <span className="badge">
                {category.archivedAt ? "Archived" : "Active"}
              </span>
            </div>
            <form action={updateCategoryAction} className="form-grid">
              <input name="id" type="hidden" value={category.id} />
              <label>
                Name
                <input
                  defaultValue={category.name}
                  maxLength={80}
                  name="name"
                  required
                />
              </label>
              <label>
                Slug
                <input
                  defaultValue={category.slug}
                  maxLength={80}
                  name="slug"
                  required
                />
              </label>
              <label className="full">
                Description
                <textarea
                  defaultValue={category.description ?? ""}
                  maxLength={500}
                  name="description"
                />
              </label>
              <button type="submit">Save changes</button>
            </form>
            {!category.archivedAt ? (
              <form action={archiveCategoryAction} className="danger-form">
                <input name="id" type="hidden" value={category.id} />
                <button className="secondary" type="submit">
                  Archive category
                </button>
              </form>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}
