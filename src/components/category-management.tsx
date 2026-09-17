"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  archiveCategoryAction,
  restoreCategoryAction,
  updateCategoryAction,
} from "@/app/admin/categories/actions";

export type ManagedCategory = {
  archived: boolean;
  description: string;
  id: string;
  name: string;
  slug: string;
};

export const ARCHIVE_CATEGORY_CONFIRMATION =
  "Archive this category? It will be hidden from the active catalog, while existing historical data will be preserved.";

export function filterCategories(
  categories: readonly ManagedCategory[],
  rawSearch: string,
) {
  const search = rawSearch.trim().toLocaleLowerCase();
  if (!search) return categories;
  return categories.filter((category) =>
    category.name.toLocaleLowerCase().includes(search),
  );
}

function PendingButton({
  ariaLabel,
  children,
  className,
  pendingLabel,
}: {
  ariaLabel?: string;
  children: string;
  className?: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      aria-label={ariaLabel}
      className={className}
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

export function CategoryManagement({
  categories,
}: {
  categories: readonly ManagedCategory[];
}) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const filtered = useMemo(
    () => filterCategories(categories, search),
    [categories, search],
  );

  if (!categories.length) {
    return (
      <section
        className="panel empty-state"
        aria-labelledby="categories-heading"
      >
        <h2 id="categories-heading">Existing categories</h2>
        <p>No categories have been created yet.</p>
      </section>
    );
  }

  return (
    <section
      className="panel category-management"
      aria-labelledby="categories-heading"
    >
      <div className="page-heading category-management-heading">
        <div>
          <p className="eyebrow">Catalog organization</p>
          <h2 id="categories-heading">Existing categories</h2>
        </div>
        <div className="category-search">
          <label htmlFor="category-search">Search by category name</label>
          <div className="category-search-controls">
            <input
              id="category-search"
              onChange={(event) => setSearch(event.currentTarget.value)}
              type="search"
              value={search}
            />
            {search ? (
              <button
                className="secondary"
                onClick={() => setSearch("")}
                type="button"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div
        aria-label="Category management table"
        className="table-scroll"
        role="region"
        tabIndex={0}
      >
        <table className="data-table category-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Slug</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((category) =>
              editingId === category.id ? (
                <tr key={category.id}>
                  <td colSpan={4}>
                    <form
                      action={updateCategoryAction}
                      className="category-edit-form"
                    >
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
                          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                          required
                        />
                      </label>
                      <label className="category-edit-description">
                        Description
                        <textarea
                          defaultValue={category.description}
                          maxLength={500}
                          name="description"
                        />
                      </label>
                      <div className="action-row category-edit-actions">
                        <PendingButton pendingLabel="Saving…">
                          Save changes
                        </PendingButton>
                        <button
                          className="secondary"
                          onClick={() => setEditingId(null)}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={category.id}>
                  <td>
                    <strong>{category.name}</strong>
                    {category.description ? (
                      <small>{category.description}</small>
                    ) : null}
                  </td>
                  <td>
                    <code>{category.slug}</code>
                  </td>
                  <td>
                    <span
                      className={`badge ${category.archived ? "badge-archived" : "badge-active"}`}
                    >
                      {category.archived ? "Archived" : "Active"}
                    </span>
                  </td>
                  <td>
                    <div className="category-row-actions">
                      <button
                        aria-label={`Edit ${category.name}`}
                        className="secondary"
                        onClick={() => setEditingId(category.id)}
                        type="button"
                      >
                        Edit
                      </button>
                      {category.archived ? (
                        <form action={restoreCategoryAction}>
                          <input name="id" type="hidden" value={category.id} />
                          <PendingButton
                            ariaLabel={`Restore ${category.name}`}
                            className="success-action"
                            pendingLabel="Restoring…"
                          >
                            Restore
                          </PendingButton>
                        </form>
                      ) : (
                        <form
                          action={archiveCategoryAction}
                          onSubmit={(event) => {
                            if (
                              !window.confirm(ARCHIVE_CATEGORY_CONFIRMATION)
                            ) {
                              event.preventDefault();
                            }
                          }}
                        >
                          <input name="id" type="hidden" value={category.id} />
                          <PendingButton
                            ariaLabel={`Archive ${category.name}`}
                            className="warning-action"
                            pendingLabel="Archiving…"
                          >
                            Archive
                          </PendingButton>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ),
            )}
            {!filtered.length ? (
              <tr>
                <td colSpan={4}>
                  <div className="category-filter-empty">
                    <p>No categories match “{search.trim()}”.</p>
                    <button
                      className="secondary"
                      onClick={() => setSearch("")}
                      type="button"
                    >
                      Clear search
                    </button>
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
