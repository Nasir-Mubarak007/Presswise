"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { signOutAction } from "@/app/auth/actions";

type Page = "overview" | "orders" | "catalog" | "storefront" | "team" | "payouts" | "settings";

interface PrinterDashboardShellProps {
  children: React.ReactNode;
  activePage: Page;
  isOwner: boolean;
  isPlatformAdmin: boolean;
}

const DESKTOP_PAGES: { key: Page; label: string; href: string }[] = [
  { key: "overview", label: "Overview", href: "/printer" },
  { key: "orders", label: "Orders", href: "/printer/orders" },
  { key: "catalog", label: "Catalog", href: "/printer/catalog" },
  { key: "storefront", label: "Storefront", href: "/printer/storefront" },
  { key: "team", label: "Team", href: "/printer/team" },
  { key: "payouts", label: "Payouts", href: "/printer/payouts" },
  { key: "settings", label: "Settings", href: "/printer/settings" },
];

const MOBILE_PAGES: { key: Page; label: string; href: string }[] = [
  { key: "overview", label: "Overview", href: "/printer" },
  { key: "orders", label: "Orders", href: "/printer/orders" },
  { key: "catalog", label: "Catalog", href: "/printer/catalog" },
];

const MORE_PAGES: { key: Page; label: string; href: string }[] = [
  { key: "storefront", label: "Storefront", href: "/printer/storefront" },
  { key: "team", label: "Team", href: "/printer/team" },
  { key: "payouts", label: "Payouts", href: "/printer/payouts" },
  { key: "settings", label: "Settings", href: "/printer/settings" },
];

const SIDEBAR_STORAGE_KEY = "printer.dashboard.sidebar";
const SIDEBAR_CHANGE_EVENT = "printer-dashboard-sidebar-change";

function subscribeToSidebarPreference(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(SIDEBAR_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SIDEBAR_CHANGE_EVENT, onChange);
  };
}

function getSidebarPreference(): boolean {
  return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "collapsed";
}

function setSidebarPreference(collapsed: boolean): void {
  localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "collapsed" : "expanded");
  window.dispatchEvent(new Event(SIDEBAR_CHANGE_EVENT));
}

export default function PrinterDashboardShell({
  children,
  activePage,
  isOwner,
  isPlatformAdmin,
}: PrinterDashboardShellProps) {
  const collapsed = useSyncExternalStore(
    subscribeToSidebarPreference,
    getSidebarPreference,
    () => false,
  );
  const [moreOpen, setMoreOpen] = useState<boolean>(false);

  const ownerOnly = isOwner || isPlatformAdmin;
  const visibleDesktopPages = DESKTOP_PAGES.filter(
    (p) => p.key !== "team" && p.key !== "payouts" && p.key !== "settings" || ownerOnly,
  );
  const visibleMorePages = MORE_PAGES.filter(
    (p) => p.key !== "team" && p.key !== "payouts" && p.key !== "settings" || ownerOnly,
  );

  return (
    <div className="min-h-dvh bg-surface text-ink">
      <aside
        className={`fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-ink/10 bg-surface/95 backdrop-blur transition-transform duration-300 md:flex md:flex-col ${
          collapsed ? "-translate-x-full" : "translate-x-0"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-4 py-4">
            <Link href="/printer" className="font-semibold tracking-tight text-ink hover:text-brand">
              Presswise
            </Link>
            <button
              onClick={() => setSidebarPreference(!collapsed)}
              aria-label="Collapse desktop navigation"
              className="rounded-lg p-2 text-ink/60 hover:bg-ink/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <span aria-hidden="true">←</span>
            </button>
          </div>
          <nav aria-label="Printer dashboard" className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
            {visibleDesktopPages.map((page) => {
              const active = activePage === page.key;
              return (
                <Link
                  key={page.key}
                  href={page.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                    active
                      ? "bg-brand text-surface"
                      : "text-ink/70 hover:bg-ink/5 hover:text-brand"
                  }`}
                >
                  {page.label}
                </Link>
              );
            })}
          </nav>
          <div className="space-y-3 border-t border-ink/10 px-4 py-4">
            <p className="text-xs text-ink/50">Printer dashboard</p>
            <form action={signOutAction}>
              <button
                type="submit"
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink/70 hover:bg-ink/5 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main
        className={`min-h-dvh transition-[margin] duration-300 ${collapsed ? "md:ml-0" : "md:ml-64"}`}
      >
        <div className="flex h-14 items-center border-b border-ink/10 px-4 md:hidden">
          <Link href="/printer" className="font-semibold tracking-tight text-ink hover:text-brand">
            Presswise
          </Link>
        </div>
        {collapsed && (
          <div className="fixed left-0 top-0 z-30 hidden pt-4 pl-4 md:block">
            <button
              onClick={() => setSidebarPreference(false)}
              aria-label="Expand desktop navigation"
              className="rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm font-medium text-ink shadow-sm hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Show menu
            </button>
          </div>
        )}
        <div className={`px-4 py-6 pb-24 sm:px-6 md:px-8 md:py-8 md:pb-8 ${collapsed ? "md:pt-20" : ""}`}>
          {children}
        </div>
      </main>

      <nav
        aria-label="Mobile printer dashboard"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-ink/10 bg-surface/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 shadow-[0_-8px_24px_rgba(11,27,20,0.08)] backdrop-blur md:hidden"
      >
        {MOBILE_PAGES.map((page) => {
          const active = activePage === page.key;
          return (
            <Link
              key={page.key}
              href={page.href}
              onClick={() => setMoreOpen(false)}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-12 items-center justify-center rounded-lg px-2 py-2 text-center text-xs font-medium ${
                active ? "bg-brand text-surface" : "text-ink/60 hover:bg-ink/5"
              }`}
            >
              {page.label}
            </Link>
          );
        })}
        <div
          className="relative flex justify-center"
          onKeyDown={(event) => {
            if (event.key === "Escape") setMoreOpen(false);
          }}
        >
          {moreOpen && (
            <div
              id="printer-more-menu"
              className="absolute bottom-14 right-0 z-40 w-56 rounded-xl border border-ink/10 bg-surface p-2 shadow-xl"
            >
              <nav aria-label="More printer pages" className="space-y-1">
                {visibleMorePages.map((page) => (
                  <Link
                    key={page.key}
                    href={page.href}
                    onClick={() => setMoreOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm text-ink/75 hover:bg-ink/5 hover:text-brand"
                  >
                    {page.label}
                  </Link>
                ))}
              </nav>
              <form action={signOutAction} className="mt-1 border-t border-ink/10 pt-1">
                <button
                  type="submit"
                  className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-ink/75 hover:bg-ink/5 hover:text-brand"
                >
                  Log out
                </button>
              </form>
            </div>
          )}
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-controls="printer-more-menu"
            onClick={() => setMoreOpen((open) => !open)}
            className={`min-h-12 w-full rounded-lg px-2 py-2 text-xs font-medium ${
              moreOpen || visibleMorePages.some((page) => page.key === activePage)
                ? "bg-brand text-surface"
                : "text-ink/60 hover:bg-ink/5"
            }`}
          >
            More
          </button>
        </div>
      </nav>
    </div>
  );
}
