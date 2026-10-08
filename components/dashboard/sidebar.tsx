"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="5.5" height="5.5" rx="1" />
        <rect x="10.5" y="2" width="5.5" height="5.5" rx="1" />
        <rect x="2" y="10.5" width="5.5" height="5.5" rx="1" />
        <rect x="10.5" y="10.5" width="5.5" height="5.5" rx="1" />
      </svg>
    ),
  },
  {
    href: "/heatmap",
    label: "Heatmap",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 14l3-5 3 2 4-7 2 10H3z" />
      </svg>
    ),
  },
  {
    href: "/breakdown",
    label: "Breakdown",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="12" width="3" height="4" rx="0.5" />
        <rect x="7.5" y="8" width="3" height="8" rx="0.5" />
        <rect x="12" y="4" width="3" height="12" rx="0.5" />
      </svg>
    ),
  },
  {
    href: "/devices",
    label: "Devices",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="14" height="10" rx="1.5" />
        <path d="M6 16h6" />
        <path d="M9 13v3" />
      </svg>
    ),
  },
  {
    href: "/radius-groups",
    label: "Radius Groups",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="9" r="6.5" />
        <circle cx="9" cy="9" r="3" />
        <circle cx="9" cy="9" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: "/methodology",
    label: "Methodology",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 2.5h8l2 2V15.5H4z" />
        <path d="M12 2.5V5h2" />
        <path d="M6.5 8.5h5" />
        <path d="M6.5 11h5" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    if (href === "/heatmap") return pathname.startsWith("/heatmap") || pathname.startsWith("/map") || pathname.startsWith("/dashboard/list");
    return pathname.startsWith(href);
  }

  const nav = (
    <nav className="flex flex-col h-full">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 py-6">
        <span className="h-2 w-2 rounded-full bg-accent" />
        <span className="text-sm font-semibold tracking-tight text-foreground">
          Lifecycle Dashboard
        </span>
      </div>

      {/* Links */}
      <div className="flex-1 space-y-0.5 px-3">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`group flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-l-[3px] border-accent bg-accent-muted text-accent pl-[9px]"
                  : "border-l-[3px] border-transparent text-foreground/60 hover:bg-accent-muted hover:text-foreground pl-[9px]"
              }`}
            >
              <span className={active ? "text-accent" : "text-foreground/40 group-hover:text-foreground/70"}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-widest text-foreground/30">
          UA Innovate 2026
        </p>
      </div>
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 border-r border-sidebar-border bg-sidebar-bg md:block">
        {nav}
      </aside>

      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-40 border border-card-border bg-card-bg p-2 shadow-md md:hidden"
        aria-label="Open navigation"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M4 6h12M4 10h12M4 14h12" />
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-56 border-r border-sidebar-border bg-sidebar-bg shadow-2xl md:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1 text-foreground/50 hover:text-foreground"
              aria-label="Close navigation"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M4 4l10 10M14 4L4 14" />
              </svg>
            </button>
            {nav}
          </aside>
        </>
      )}
    </>
  );
}
