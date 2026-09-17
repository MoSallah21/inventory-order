import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const runtime = vi.hoisted(() => ({
  pending: false,
  refCursor: 0,
  refs: [] as Array<{ current: unknown }>,
  stateCursor: 0,
  states: [] as unknown[],
}));
const actions = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useEffect: (effect: () => void) => effect(),
    useRef: <T>(initial: T) => {
      const index = runtime.refCursor++;
      if (!runtime.refs[index]) runtime.refs[index] = { current: initial };
      return runtime.refs[index];
    },
    useState: <T>(initial: T) => {
      const index = runtime.stateCursor++;
      if (runtime.states.length <= index) runtime.states[index] = initial;
      const setValue = (next: T | ((current: T) => T)) => {
        const current = runtime.states[index] as T;
        runtime.states[index] =
          typeof next === "function"
            ? (next as (value: T) => T)(current)
            : next;
      };
      return [runtime.states[index] as T, setValue] as const;
    },
  };
});
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus: () => ({ pending: runtime.pending }),
}));
vi.mock("@/app/admin/categories/actions", () => ({
  createCategoryAction: actions.create,
}));

import { CreateCategory } from "@/components/create-category";

type Node = {
  props?: Record<string, unknown> & { children?: unknown };
  type?: unknown;
};

function expand(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(expand);
  if (!value || typeof value !== "object") return value;
  const node = value as Node;
  if (typeof node.type === "function")
    return expand(node.type(node.props ?? {}));
  return {
    ...node,
    props: node.props
      ? { ...node.props, children: expand(node.props.children) }
      : node.props,
  };
}

function render(error?: string) {
  runtime.refCursor = 0;
  runtime.stateCursor = 0;
  return expand(CreateCategory({ error }));
}

function all(root: unknown): Node[] {
  if (Array.isArray(root)) return root.flatMap(all);
  if (!root || typeof root !== "object") return [];
  const node = root as Node;
  return [node, ...all(node.props?.children)];
}

function text(root: unknown): string {
  if (Array.isArray(root)) return root.map(text).join("");
  if (root === null || root === undefined || typeof root === "boolean")
    return "";
  if (typeof root !== "object") return String(root);
  return text((root as Node).props?.children);
}

function one(root: unknown, predicate: (node: Node) => boolean) {
  const found = all(root).filter(predicate);
  expect(found).toHaveLength(1);
  return found[0];
}

function button(root: unknown, label: string) {
  return one(root, (node) => node.type === "button" && text(node) === label);
}

function click(node: Node) {
  (node.props?.onClick as (() => void) | undefined)?.();
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(runtime, {
    pending: false,
    refCursor: 0,
    refs: [],
    stateCursor: 0,
    states: [],
  });
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    callback();
    return 1;
  });
});

describe("rendered CreateCategory interactions", () => {
  it("starts collapsed and opens exactly one accessible Server Action form", () => {
    let tree = render();
    const trigger = button(tree, "Add category");
    expect(trigger.props?.["aria-expanded"]).toBe(false);
    expect(trigger.props?.["aria-controls"]).toBe("create-category-panel");
    expect(all(tree).filter((node) => node.type === "form")).toHaveLength(0);

    click(trigger);
    tree = render();
    expect(button(tree, "Close form").props?.["aria-expanded"]).toBe(true);
    const form = one(tree, (node) => node.props?.action === actions.create);
    expect(form.props?.method).toBeUndefined();
    expect(form.props?.encType).toBeUndefined();
    expect(
      all(form)
        .filter((node) => typeof node.props?.name === "string")
        .map((node) => node.props?.name),
    ).toEqual(["name", "slug", "description"]);
  });

  it("uses matched single-line field structures and a separate description row", () => {
    click(button(render(), "Add category"));
    const tree = render();
    const form = one(tree, (node) => node.props?.action === actions.create);
    const field = (name: string) =>
      one(
        form,
        (node) => node.type === "label" && node.props?.htmlFor === name,
      );
    const name = field("category-name");
    const slug = field("category-slug");
    const description = field("category-description");

    for (const [wrapper, inputName, hintId] of [
      [name, "name", "category-name-hint"],
      [slug, "slug", "category-slug-hint"],
    ] as const) {
      expect(wrapper.props?.className).toBe("create-category-field");
      const input = one(
        wrapper,
        (node) => node.type === "input" && node.props?.name === inputName,
      );
      expect(input.props?.className).toBe("standard-control");
      expect(input.props?.["aria-describedby"]).toBe(hintId);
      expect(all(wrapper).filter((node) => node.type === "textarea")).toEqual(
        [],
      );
      expect(
        one(
          wrapper,
          (node) => node.type === "small" && node.props?.id === hintId,
        ).props?.className,
      ).toBe("field-hint");
    }

    expect(description.props?.className).toBe("full");
    expect(
      one(
        description,
        (node) =>
          node.type === "textarea" && node.props?.name === "description",
      ),
    ).toBeTruthy();
    expect(all(description).filter((node) => node.type === "input")).toEqual(
      [],
    );
  });

  it("keeps the category fields start-aligned and one-column on mobile", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain(
      ".create-category-form {\n  gap: 0.95rem 1.25rem;\n  align-items: start;",
    );
    expect(css).toContain(
      ".create-category-field .standard-control {\n  height: var(--control-height);\n  min-height: var(--control-height);",
    );
    expect(css).toMatch(
      /@media \(max-width: 40rem\)[\s\S]*?\.catalog-grid,\n  \.form-grid,\n  \.filter-form \{\n    grid-template-columns: minmax\(0, 1fr\);/,
    );
  });

  it("focuses Name, and Cancel clears values, closes, and restores trigger focus", () => {
    click(button(render(), "Add category"));
    let tree = render();
    const focusName = vi.fn();
    const focusTrigger = vi.fn();
    const reset = vi.fn();
    runtime.refs[0].current = { focus: focusTrigger };
    runtime.refs[1].current = { focus: focusName };
    runtime.refs[2].current = { reset };

    tree = render();
    expect(focusName).toHaveBeenCalled();
    click(button(tree, "Cancel"));
    expect(reset).toHaveBeenCalledOnce();
    expect(focusTrigger).toHaveBeenCalledOnce();
    tree = render();
    expect(all(tree).filter((node) => node.type === "form")).toHaveLength(0);

    click(button(tree, "Add category"));
    expect(all(render()).filter((node) => node.type === "form")).toHaveLength(
      1,
    );
    expect(reset).toHaveBeenCalledOnce();
  });

  it("locks both actions during submission and exposes a readable pending state", () => {
    click(button(render(), "Add category"));
    runtime.pending = true;
    const tree = render();
    expect(button(tree, "Creating category…").props?.disabled).toBe(true);
    expect(button(tree, "Cancel").props?.disabled).toBe(true);
  });

  it("opens on a safe creation error and renders it beside the form", () => {
    const tree = render("A category with that slug already exists.");
    expect(button(tree, "Close form").props?.["aria-expanded"]).toBe(true);
    expect(text(tree)).toContain("A category with that slug already exists.");
    expect(one(tree, (node) => node.props?.role === "alert")).toBeTruthy();
  });
});
