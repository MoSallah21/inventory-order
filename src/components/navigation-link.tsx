"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";

export function activeNavigationHref(
  pathname: string,
  hrefs: readonly string[],
) {
  return (
    [...hrefs]
      .filter((href) =>
        href === "/"
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`),
      )
      .sort((left, right) => right.length - left.length)[0] ?? null
  );
}

type Props = {
  activeHrefs: readonly string[];
  announceCurrent?: boolean;
  children?: ReactNode;
  className?: string;
  href: string;
} & Omit<ComponentProps<typeof Link>, "aria-current" | "children" | "href">;

export function NavigationLink({
  activeHrefs,
  announceCurrent = true,
  children,
  className = "",
  href,
  ...props
}: Props) {
  const pathname = usePathname();
  const active = activeNavigationHref(pathname, activeHrefs) === href;
  const classes = [
    className,
    "nav-touch-target",
    active ? "nav-link-active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Link
      {...props}
      aria-current={active && announceCurrent ? "page" : undefined}
      className={classes}
      href={href}
    >
      {children}
    </Link>
  );
}
