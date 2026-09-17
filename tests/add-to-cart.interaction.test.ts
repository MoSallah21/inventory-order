import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Instance = {
  cleanups: Array<() => void>;
  cursor: number;
  effects: number;
  values: unknown[];
};
const hooks = vi.hoisted(() => ({
  current: "",
  instances: new Map<string, Instance>(),
}));

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useEffect: (effect: () => void | (() => void)) => {
      const instance = hooks.instances.get(hooks.current)!;
      const index = instance.effects++;
      if (!instance.cleanups[index])
        instance.cleanups[index] = effect() || (() => undefined);
    },
    useState: <T>(initial: T) => {
      const instance = hooks.instances.get(hooks.current)!;
      const index = instance.cursor++;
      if (instance.values.length <= index) instance.values[index] = initial;
      const setValue = (next: T | ((current: T) => T)) => {
        const current = instance.values[index] as T;
        instance.values[index] =
          typeof next === "function"
            ? (next as (value: T) => T)(current)
            : next;
      };
      return [instance.values[index] as T, setValue] as const;
    },
  };
});
vi.mock("next/link", () => ({
  default: ({ children, ...props }: Record<string, unknown>) => ({
    type: "a",
    props: { ...props, children },
  }),
}));

import {
  AddToCart,
  CART_KEY,
  CART_UPDATED_EVENT,
  saveCart,
} from "@/components/add-to-cart";
import { ProductPurchaseAction } from "@/components/product-presentation";

type Node = {
  props?: Record<string, unknown> & { children?: unknown };
  type?: unknown;
};
class TestWindow extends EventTarget {
  confirm() {
    return true;
  }
}
const storage = new Map<string, string>();

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
function mount(instanceId: string, productId: string, stockQuantity: number) {
  const isNew = !hooks.instances.has(instanceId);
  if (isNew)
    hooks.instances.set(instanceId, {
      cleanups: [],
      cursor: 0,
      effects: 0,
      values: [],
    });
  const instance = hooks.instances.get(instanceId)!;
  hooks.current = instanceId;
  instance.cursor = 0;
  instance.effects = 0;
  let tree = expand(AddToCart({ productId, stockQuantity }));
  if (isNew) {
    instance.cursor = 0;
    instance.effects = 0;
    tree = expand(AddToCart({ productId, stockQuantity }));
  }
  return tree;
}
function button(root: unknown, label: string) {
  const found = all(root).filter(
    (node) => node.type === "button" && text(node) === label,
  );
  expect(found).toHaveLength(1);
  return found[0];
}
function click(root: unknown, label: string) {
  (button(root, label).props?.onClick as () => void)();
}
function storageEvent(key: string | null) {
  const event = new Event("storage");
  Object.defineProperty(event, "key", { value: key });
  return event;
}

beforeEach(() => {
  storage.clear();
  hooks.instances.clear();
  vi.stubGlobal("window", new TestWindow());
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("mounted AddToCart interactions", () => {
  it("initializes from storage and updates exact quantities through real clicks", () => {
    let tree = mount("one", "product", 4);
    expect(text(tree)).toBe("Add to cart");
    click(tree, "Add to cart");
    tree = mount("one", "product", 4);
    expect(text(tree)).toContain("In cart: 1");
    click(tree, "Add another");
    click(mount("one", "product", 4), "Add another");
    expect(text(mount("one", "product", 4))).toContain("In cart: 3");

    storage.set(CART_KEY, JSON.stringify({ product: 2 }));
    expect(text(mount("persisted", "product", 4))).toContain("In cart: 2");
  });

  it("synchronizes same-product controls while keeping products independent", () => {
    const first = mount("first", "same", 5);
    mount("second", "same", 5);
    mount("other", "other", 5);
    click(first, "Add to cart");
    expect(text(mount("first", "same", 5))).toContain("In cart: 1");
    expect(text(mount("second", "same", 5))).toContain("In cart: 1");
    expect(text(mount("other", "other", 5))).toBe("Add to cart");
  });

  it("responds to same-tab, storage, pageshow, removal, and clearing", () => {
    mount("one", "product", 8);
    saveCart({ product: 3 });
    expect(text(mount("one", "product", 8))).toContain("In cart: 3");
    storage.set(CART_KEY, JSON.stringify({ product: 4 }));
    window.dispatchEvent(storageEvent(CART_KEY));
    expect(text(mount("one", "product", 8))).toContain("In cart: 4");
    storage.set(CART_KEY, JSON.stringify({ product: 5 }));
    window.dispatchEvent(new Event("storage"));
    expect(text(mount("one", "product", 8))).toContain("In cart: 4");
    window.dispatchEvent(new Event("pageshow"));
    expect(text(mount("one", "product", 8))).toContain("In cart: 5");
    saveCart({});
    expect(text(mount("one", "product", 8))).toBe("Add to cart");
    saveCart({ other: 1 });
    expect(text(mount("one", "product", 8))).toBe("Add to cart");
  });

  it("renders exact maximum, above-stock, and unavailable states", () => {
    storage.set(
      CART_KEY,
      JSON.stringify({ equal: 3, above: 5, unavailable: 2 }),
    );
    expect(text(mount("equal", "equal", 3))).toContain(
      "In cart: 3 · Maximum available",
    );
    expect(
      all(mount("equal", "equal", 3)).some(
        (node) => text(node) === "Add another",
      ),
    ).toBe(false);
    const above = mount("above", "above", 3);
    expect(text(above)).toContain("In cart: 5 · Only 3 currently available");
    expect(text(above)).toContain(
      "Review your cart and reduce the quantity before checkout.",
    );
    expect(all(above).some((node) => node.props?.role === "alert")).toBe(true);
    expect(text(above)).not.toContain("Add another");
    const unavailable = mount("unavailable", "unavailable", 0);
    expect(text(unavailable)).toContain("In cart: 2 · Currently unavailable");
    expect(text(unavailable)).toContain("existing quantity before checkout");
    expect(text(unavailable)).toContain("View cart");
    expect(text(unavailable)).not.toContain("Add another");
  });

  it("never exceeds stock or 10,000 under rapid repeated clicks", () => {
    let tree = mount("stock", "stock", 3);
    for (let index = 0; index < 20; index += 1) {
      const add = all(tree).find((node) => node.type === "button");
      if (add) (add.props?.onClick as () => void)();
      tree = mount("stock", "stock", 3);
    }
    expect(JSON.parse(storage.get(CART_KEY)!)).toEqual({ stock: 3 });
    storage.set(CART_KEY, JSON.stringify({ cap: 9_999 }));
    tree = mount("cap", "cap", 50_000);
    click(tree, "Add another");
    expect(JSON.parse(storage.get(CART_KEY)!)).toEqual({ cap: 10_000 });
    expect(text(mount("cap", "cap", 50_000))).toContain("Maximum available");
  });

  it("removes every event listener on unmount", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    mount("one", "product", 3);
    for (const cleanup of hooks.instances.get("one")!.cleanups) cleanup();
    expect(remove).toHaveBeenCalledWith(
      CART_UPDATED_EVENT,
      expect.any(Function),
    );
    expect(remove).toHaveBeenCalledWith("storage", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("pageshow", expect.any(Function));
  });

  it("keeps purchasing controls customer-only", () => {
    for (const capability of ["unavailable", "anonymous"] as const) {
      hooks.current = `role-${capability}`;
      hooks.instances.set(hooks.current, {
        cleanups: [],
        cursor: 0,
        effects: 0,
        values: [],
      });
      const tree = expand(
        ProductPurchaseAction({ capability, productId: "p", stockQuantity: 2 }),
      );
      expect(text(tree)).not.toContain("Add to cart");
    }
    expect(text(mount("customer", "p", 2))).toContain("Add to cart");
  });
});
