import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  cursor: 0,
  pending: false,
  values: [] as unknown[],
}));
const actions = vi.hoisted(() => ({
  archive: vi.fn(),
  restore: vi.fn(),
  update: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useMemo: <T>(factory: () => T) => factory(),
    useState: <T>(initial: T) => {
      const index = runtime.cursor++;
      if (runtime.values.length <= index) runtime.values[index] = initial;
      const setValue = (next: T | ((current: T) => T)) => {
        const current = runtime.values[index] as T;
        runtime.values[index] =
          typeof next === "function"
            ? (next as (value: T) => T)(current)
            : next;
      };
      return [runtime.values[index] as T, setValue] as const;
    },
  };
});
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus: () => ({ pending: runtime.pending }),
}));
vi.mock("@/app/admin/categories/actions", () => ({
  archiveCategoryAction: actions.archive,
  restoreCategoryAction: actions.restore,
  updateCategoryAction: actions.update,
}));

import {
  ARCHIVE_CATEGORY_CONFIRMATION,
  CategoryManagement,
  type ManagedCategory,
} from "@/components/category-management";
import { categoryResetKey } from "@/modules/catalog/category-presentation";

type Node = {
  props?: Record<string, unknown> & { children?: unknown };
  type?: unknown;
};
const categories: ManagedCategory[] = [
  {
    archived: false,
    description: "Active office products",
    id: "active",
    name: "Office Supplies",
    slug: "office-supplies",
  },
  {
    archived: true,
    description: "Archived office equipment",
    id: "archived",
    name: "Legacy Office Equipment",
    slug: "legacy-office-equipment",
  },
  {
    archived: false,
    description: "Warehouse products",
    id: "warehouse",
    name: "Warehouse",
    slug: "warehouse",
  },
];

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
function render(props = categories) {
  runtime.cursor = 0;
  return expand(CategoryManagement({ categories: props }));
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
function buttons(root: unknown, label: string) {
  return all(root).filter(
    (node) => node.type === "button" && text(node) === label,
  );
}
function button(root: unknown, label: string) {
  const found = buttons(root, label);
  expect(found.length).toBeGreaterThan(0);
  return found[0];
}
function change(node: Node, value: string) {
  (node.props?.onChange as (event: unknown) => void)({
    currentTarget: { value },
  });
}
function click(node: Node) {
  (node.props?.onClick as (() => void) | undefined)?.();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { confirm: vi.fn() });
  Object.assign(runtime, { cursor: 0, pending: false, values: [] });
});
afterEach(() => vi.unstubAllGlobals());

describe("rendered CategoryManagement interactions", () => {
  it("filters mixed-case, trimmed active and archived matches and Clear restores rows", () => {
    let tree = render();
    change(
      one(tree, (node) => node.props?.type === "search"),
      "  oFfIcE  ",
    );
    tree = render();
    expect(text(tree)).toContain("Office Supplies");
    expect(text(tree)).toContain("Legacy Office Equipment");
    expect(text(tree)).not.toContain("Warehouse");
    click(button(tree, "Clear"));
    tree = render();
    expect(text(tree)).toContain("Warehouse");
    change(
      one(tree, (node) => node.props?.type === "search"),
      " no match ",
    );
    tree = render();
    expect(text(tree)).toContain("No categories match “no match”.");
    click(button(tree, "Clear search"));
    expect(text(render())).toContain("Office Supplies");
  });

  it("edits one row, cancels unsaved values, and switches editing rows", () => {
    let tree = render();
    click(buttons(tree, "Edit")[0]);
    tree = render();
    expect(
      all(tree).filter((node) => node.props?.name === "name"),
    ).toHaveLength(1);
    expect(text(tree)).toContain("Legacy Office Equipment");
    click(button(tree, "Cancel"));
    tree = render();
    expect(
      all(tree).filter((node) => node.props?.name === "name"),
    ).toHaveLength(0);
    expect(text(tree)).not.toContain("Unsaved value");
    click(buttons(tree, "Edit")[1]);
    tree = render();
    const editForm = one(tree, (node) => node.props?.action === actions.update);
    expect(
      one(editForm, (node) => node.props?.name === "id").props?.value,
    ).toBe("archived");
    expect(text(tree)).toContain("Office Supplies");
  });

  it("submits the exact Save contract and exposes a duplicate-safe pending state", async () => {
    let tree = render();
    click(buttons(tree, "Edit")[0]);
    tree = render();
    const form = one(tree, (node) => node.props?.action === actions.update);
    expect(
      all(form)
        .filter((node) => typeof node.props?.name === "string")
        .map((node) => node.props?.name),
    ).toEqual(["id", "name", "slug", "description"]);
    const data = new FormData();
    for (const [name, value] of [
      ["id", "active"],
      ["name", "Office"],
      ["slug", "office"],
      ["description", "Updated"],
    ])
      data.set(name, value);
    await (form.props?.action as (value: FormData) => Promise<void>)(data);
    expect(actions.update).toHaveBeenCalledOnce();
    expect([...data.keys()]).toEqual(["id", "name", "slug", "description"]);
    runtime.pending = true;
    expect(button(render(), "Saving…").props?.disabled).toBe(true);
  });

  it("uses trusted refreshed data keys to reset search and editing on repeated actions", () => {
    const first = [
      {
        ...categories[0],
        archivedAt: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const second = [
      {
        ...first[0],
        name: "Office updated",
        updatedAt: "2026-01-01T00:00:01.000Z",
      },
    ];
    const third = [{ ...second[0], updatedAt: "2026-01-01T00:00:02.000Z" }];
    expect(categoryResetKey(first)).not.toBe(categoryResetKey(second));
    expect(categoryResetKey(second)).not.toBe(categoryResetKey(third));
    let tree = render();
    change(
      one(tree, (node) => node.props?.type === "search"),
      "office",
    );
    click(button(render(), "Edit"));
    expect(runtime.values).toEqual(["office", "active"]);
    runtime.values = [];
    tree = render(second);
    expect(
      one(tree, (node) => node.props?.type === "search").props?.value,
    ).toBe("");
    expect(
      all(tree).filter((node) => node.props?.name === "name"),
    ).toHaveLength(0);
    runtime.values = [];
    expect(
      one(render(third), (node) => node.props?.type === "search").props?.value,
    ).toBe("");
  });

  it("cancels and accepts the real Archive form confirmation", async () => {
    const confirm = vi.mocked(window.confirm);
    let tree = render();
    const form = all(tree).find(
      (node) => node.props?.action === actions.archive,
    )!;
    const preventDefault = vi.fn();
    confirm.mockReturnValueOnce(false);
    (form.props?.onSubmit as (event: unknown) => void)({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(actions.archive).not.toHaveBeenCalled();
    confirm.mockReturnValueOnce(true);
    preventDefault.mockClear();
    (form.props?.onSubmit as (event: unknown) => void)({ preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    const data = new FormData();
    data.set(
      "id",
      String(one(form, (node) => node.props?.name === "id").props?.value),
    );
    await (form.props?.action as (value: FormData) => Promise<void>)(data);
    expect(actions.archive).toHaveBeenCalledOnce();
    expect(data.get("id")).toBe("active");
    expect(ARCHIVE_CATEGORY_CONFIRMATION).toContain(
      "hidden from the active catalog",
    );
    expect(ARCHIVE_CATEGORY_CONFIRMATION).toContain(
      "historical data will be preserved",
    );
    runtime.pending = true;
    tree = render();
    expect(button(tree, "Archiving…").props?.disabled).toBe(true);
  });

  it("submits Restore for the clicked category and disables while pending", async () => {
    let tree = render();
    const form = one(tree, (node) => node.props?.action === actions.restore);
    const data = new FormData();
    data.set(
      "id",
      String(one(form, (node) => node.props?.name === "id").props?.value),
    );
    await (form.props?.action as (value: FormData) => Promise<void>)(data);
    expect(actions.restore).toHaveBeenCalledOnce();
    expect(data.get("id")).toBe("archived");
    runtime.pending = true;
    tree = render();
    expect(button(tree, "Restoring…").props?.disabled).toBe(true);
  });
});
