import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inventory & Order Management System",
  description: "A role-based inventory and order management platform.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-slate-50 text-slate-950">
        {children}
      </body>
    </html>
  );
}
