# Functional UX route audit

## Verified route inventory

| URL                            | Access and role                                                  | Shell / return path                                               | Primary action and states                                                      | Audit outcome                                                                               |
| ------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `/`                            | Public                                                           | Public header                                                     | Browse products / sign in                                                      | Removed stale “Foundation phase” copy.                                                      |
| `/products`                    | Public                                                           | Public header; authenticated users get a workspace/account return | Open product; add available product; explicit empty recovery                   | Removed mixed anonymous/auth links and made out-of-stock behavior explicit.                 |
| `/products/[productId]`        | Public                                                           | Back to `/products`; contextual workspace return                  | Add to cart or explicit out-of-stock state                                     | Added the previously missing add-to-cart action.                                            |
| `/sign-in`                     | Public; redirects enabled authenticated users to their role home | Standalone auth page                                              | Sign in; safe inline error                                                     | Existing replacement navigation prevents returning to a usable signed-in form.              |
| `/auth/redirect`               | Protected; all roles                                             | Redirect-only                                                     | Deterministic role-home redirect                                               | Intentionally has no UI because it cannot complete without redirecting.                     |
| `/account`                     | Customer                                                         | Customer account shell                                            | Browse, cart, orders                                                           | Clear customer identity and links only.                                                     |
| `/cart`                        | Customer                                                         | Customer account shell; continue shopping to `/products`          | Quantity, remove, place order; useful empty/error states                       | Was public and shell-less; now protected and redirects successful checkout to orders.       |
| `/orders`                      | Admin, Supplier, Customer                                        | Role-aware shell                                                  | View order; role-specific empty recovery                                       | Added readable status, date, counterpart names, total, and visible view action.             |
| `/orders/[orderId]`            | Scoped Admin, Supplier, Customer                                 | Back to `/orders`                                                 | Policy-derived actions beside status; safe success/error; terminal explanation | Actions were below all items, raw enum status was exposed, and terminal states were silent. |
| `/supplier`                    | Supplier                                                         | Supplier workspace shell                                          | Products, orders, public catalog                                               | Navigation label standardized to Overview.                                                  |
| `/supplier/products`           | Supplier                                                         | Supplier workspace shell                                          | Add, edit, archive; empty recovery                                             | Added images and a usable add-product empty state.                                          |
| `/supplier/products/new`       | Supplier                                                         | Back to `/supplier/products`                                      | Create / cancel; safe error                                                    | Form is grouped into understandable sections.                                               |
| `/supplier/products/[id]/edit` | Owning Supplier                                                  | Back to `/supplier/products`                                      | Save / cancel; keep, replace, or remove image                                  | Image choices are now explicit without exposing storage keys.                               |
| `/admin`                       | Admin                                                            | Admin workspace shell                                             | Dashboard navigation                                                           | Revenue empty state already explained delivered-revenue semantics.                          |
| `/admin/categories`            | Admin                                                            | Back to `/admin`                                                  | Create, update, archive; success/error                                         | Added deterministic return path and accessible message semantics.                           |

There are no separate supplier/admin order route files: `/orders` and `/orders/[orderId]` are verified shared route implementations whose database query scope, shell, labels, counterpart fields, actions, and empty recovery vary by the server-authorized actor. No link points to a nonexistent role-specific order URL.

## Root causes found

- Shared order URLs rendered little role context and no explicit return link, so history was the only perceived way out of a detail page.
- The cart omitted `requireProtectedPage` and the authenticated shell, mixing public and customer contexts.
- Public headers were hard-coded and could keep showing Sign in and cross into protected order/cart links regardless of session role.
- Raw order enums and policy targets were displayed directly; action discovery required scrolling past every line item.
- Several empty states were plain text without a recovery action.
- The product detail route omitted add-to-cart even though the list exposed it.
- The root route retained phase-placeholder language.

No production code used `router.back()`. The dead-end behavior came from missing structural return links and inconsistent shells rather than an incorrect Back API call.

## Order status and action map

| Status    | Admin / Supplier                                   | Customer                 |
| --------- | -------------------------------------------------- | ------------------------ |
| Pending   | Confirm order; Cancel order                        | Cancel order             |
| Confirmed | Mark as shipped; Cancel order                      | Informational state only |
| Shipped   | Mark as delivered                                  | Informational state only |
| Delivered | “This order has been delivered.”                   | Same                     |
| Cancelled | “This order was cancelled and stock was restored.” | Same                     |

The existing server policy remains authoritative; presentation consumes its `allowedTargets` result.

## Manual evaluator journey

On 2026-09-17 the real local browser completed Customer, owning Supplier, Admin, and anonymous journeys. Checkout,
quantity editing, cancellation, all supplier forward transitions, image-preserving product edit, dashboard/categories,
explicit returns, sign-out, and protected-route redirect all behaved as described above. No blank or dead-end page was
observed. This was manual verification; no browser E2E framework was added.

Intentionally deferred cosmetic work is limited to richer visual branding, animation, denser dashboard presentation,
and card-to-table refinements. Pagination, notification, export, and other new business capabilities remain outside
this stabilization phase.
