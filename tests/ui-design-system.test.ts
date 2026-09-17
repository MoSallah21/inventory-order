import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));

describe("shared UI design system", () => {
  it("centralizes product and semantic colors as CSS tokens", async () => {
    const css = await readFile(`${root}/src/app/globals.css`, "utf8");

    for (const token of [
      "--primary:",
      "--secondary:",
      "--success:",
      "--warning:",
      "--danger:",
      "--surface:",
      "--border:",
    ]) {
      expect(css).toContain(token);
    }
  });

  it("keeps the three-column catalog bounded and responsive", async () => {
    const css = await readFile(`${root}/src/app/globals.css`, "utf8");

    expect(css).toMatch(
      /\.catalog-grid\s*{[^}]*repeat\(3, minmax\(0, 1fr\)\)/s,
    );
    expect(css).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*\.catalog-grid\s*{[^}]*repeat\(2,/,
    );
    expect(css).toMatch(
      /@media \(max-width: 40rem\)[\s\S]*\.catalog-grid,[\s\S]*minmax\(0, 1fr\)/,
    );
  });

  it("provides reduced-motion behavior", async () => {
    const css = await readFile(`${root}/src/app/globals.css`, "utf8");

    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation-duration: 0.01ms !important");
    expect(css).toContain("transition-duration: 0.01ms !important");
  });

  it("defines the responsive operations shell and shared visual primitives", async () => {
    const [css, navigation, icon, header] = await Promise.all([
      readFile(`${root}/src/app/globals.css`, "utf8"),
      readFile(`${root}/src/components/authenticated-navigation.tsx`, "utf8"),
      readFile(`${root}/src/components/app-icon.tsx`, "utf8"),
      readFile(`${root}/src/components/page-header.tsx`, "utf8"),
    ]);

    expect(css).toContain(".workspace-sidebar");
    expect(css).toContain(".mobile-workspace-header");
    expect(navigation).toContain('href="#workspace-content"');
    expect(navigation).toContain("announceCurrent={announceCurrent}");
    expect(icon).toContain('aria-hidden="true"');
    expect(header).toContain('className="page-header"');
  });
});
