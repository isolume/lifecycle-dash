"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface NavItem {
  href: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/heatmap", label: "Heatmap" },
  { href: "/breakdown", label: "Breakdown" },
  { href: "/devices", label: "Devices" },
  { href: "/radius-groups", label: "Radius Groups" },
];

export function TopNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    if (href === "/heatmap")
      return (
        pathname.startsWith("/heatmap") ||
        pathname.startsWith("/map") ||
        pathname.startsWith("/dashboard/list")
      );
    return pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-[1200] border-b border-header-border bg-header-bg text-header-text">
      <div className="mx-auto flex h-[72px] max-w-[1500px] items-center justify-between px-4 sm:px-8 lg:px-10">
        {/* Brand */}
        <Link href="/" className="flex h-full items-center" aria-label="Southern Company">
          <Image
            src="/southern-company-logo.svg"
            alt="Southern Company"
            width={263}
            height={37}
            priority
            className="block h-[26px] w-auto sm:h-[30px] lg:h-[32px]"
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden h-full items-stretch gap-0 md:flex">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex h-full items-center px-5 text-sm font-medium uppercase tracking-wide transition-colors ${
                  active
                    ? "text-foreground"
                    : "text-foreground/60 hover:text-accent-red"
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-accent-red" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 text-foreground/70 hover:text-accent-red md:hidden"
          aria-label="Toggle navigation"
        >
          {mobileOpen ? (
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 5l12 12M17 5L5 17" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h14M4 11h14M4 16h14" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <nav className="border-t border-header-border px-4 pb-3 md:hidden">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`block px-4 py-2.5 text-sm font-medium uppercase tracking-wide transition-colors ${
                  active
                    ? "text-accent-red"
                    : "text-foreground/60 hover:text-accent-red"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
