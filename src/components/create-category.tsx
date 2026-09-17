"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { createCategoryAction } from "@/app/admin/categories/actions";

const PANEL_ID = "create-category-panel";

function CreateCategoryActions({ onCancel }: { onCancel: () => void }) {
  const { pending } = useFormStatus();

  return (
    <div className="action-row create-category-actions">
      <button disabled={pending} type="submit">
        {pending ? "Creating category…" : "Create category"}
      </button>
      <button
        className="secondary"
        disabled={pending}
        onClick={onCancel}
        type="button"
      >
        Cancel
      </button>
    </div>
  );
}

export function CreateCategory({ error }: { error?: string }) {
  const [open, setOpen] = useState(Boolean(error));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (open) nameRef.current?.focus();
  }, [open]);

  function close() {
    formRef.current?.reset();
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <>
      <div className="page-heading categories-page-heading">
        <div>
          <p className="eyebrow">Admin catalog</p>
          <h1>Categories</h1>
          <p className="lede">
            Organize the categories available to suppliers and the active
            catalog.
          </p>
        </div>
        <button
          aria-controls={PANEL_ID}
          aria-expanded={open}
          className="category-create-trigger"
          onClick={() => (open ? close() : setOpen(true))}
          ref={triggerRef}
          type="button"
        >
          {open ? "Close form" : "Add category"}
        </button>
      </div>

      {open ? (
        <section
          aria-labelledby="create-category-heading"
          className="create-category-panel"
          id={PANEL_ID}
        >
          <div className="create-category-intro">
            <p className="eyebrow">New category</p>
            <h2 id="create-category-heading">Create category</h2>
            <p>Add a category for organizing active supplier products.</p>
          </div>

          {error ? (
            <p className="notice error create-category-error" role="alert">
              {error}
            </p>
          ) : null}

          <form
            action={createCategoryAction}
            className="form-grid create-category-form"
            ref={formRef}
          >
            <label className="create-category-field" htmlFor="category-name">
              <span>
                Name <span className="required-marker">Required</span>
              </span>
              <input
                autoComplete="off"
                aria-describedby="category-name-hint"
                className="standard-control"
                id="category-name"
                maxLength={80}
                name="name"
                ref={nameRef}
                required
              />
              <small className="field-hint" id="category-name-hint">
                Displayed throughout the catalog and management views.
              </small>
            </label>
            <label className="create-category-field" htmlFor="category-slug">
              <span>
                Slug <span className="required-marker">Required</span>
              </span>
              <input
                aria-describedby="category-slug-hint"
                autoComplete="off"
                className="standard-control"
                id="category-slug"
                maxLength={80}
                name="slug"
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                placeholder="office-supplies"
                required
              />
              <small className="field-hint" id="category-slug-hint">
                Used in catalog URLs and internal category references.
              </small>
            </label>
            <label className="full" htmlFor="category-description">
              <span>
                Description <span className="optional-marker">Optional</span>
              </span>
              <textarea
                aria-describedby="category-description-hint"
                id="category-description"
                maxLength={500}
                name="description"
                rows={3}
              />
              <small className="field-hint" id="category-description-hint">
                Helps Admins and Suppliers understand the category.
              </small>
            </label>
            <CreateCategoryActions onCancel={close} />
          </form>
        </section>
      ) : null}
    </>
  );
}
