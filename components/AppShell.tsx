"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { UserButton } from "@clerk/nextjs";
import { Inbox, LayoutGrid, Package, Send, ShieldCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Loading, Logo, TrustedBadge } from "@/components/ui";

const NAV = [
  { href: "/app", label: "Browse", icon: LayoutGrid },
  { href: "/app/listings", label: "My listings", icon: Package },
  { href: "/app/requests", label: "My requests", icon: Send },
  { href: "/app/incoming", label: "Incoming", icon: Inbox },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const store = useMutation(api.users.store);
  const [stored, setStored] = useState(false);
  const me = useQuery(api.users.me, stored ? {} : "skip");
  const incoming = useQuery(api.loans.incoming, stored ? {} : "skip");
  const pendingIncoming = incoming?.filter((l) => l.status === "pending").length ?? 0;

  // Create or refresh the Convex user record once the Clerk token is accepted.
  useEffect(() => {
    if (!isAuthenticated) return;
    store().then(() => setStored(true));
  }, [isAuthenticated, store]);

  const nav = me?.role === "admin" ? [...NAV, { href: "/app/admin", label: "Admin", icon: ShieldCheck }] : NAV;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-stone-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/"><Logo className="text-lg text-stone-900" /></Link>
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((n) => {
              const active = pathname === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`relative inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    active ? "bg-emerald-50 text-emerald-800" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                  }`}
                >
                  <n.icon className="h-4 w-4" />
                  {n.label}
                  {n.href === "/app/incoming" && pendingIncoming > 0 && (
                    <span className="ml-0.5 rounded-full bg-emerald-600 px-1.5 text-[11px] font-semibold text-white">{pendingIncoming}</span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3">
            {me?.trustedLender && <span className="hidden sm:inline"><TrustedBadge /></span>}
            {me && (
              <span className="hidden text-right text-sm leading-tight sm:block">
                <span className="block font-medium text-stone-800">{me.name}</span>
                {me.role === "admin" && <span className="block text-xs text-stone-500">Admin</span>}
              </span>
            )}
            <UserButton />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-stone-100 px-3 py-2 md:hidden">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                pathname === n.href ? "bg-emerald-50 text-emerald-800" : "text-stone-600"
              }`}
            >
              <n.icon className="h-3.5 w-3.5" />
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        {isLoading || !stored ? <Loading label="Signing you in" /> : children}
      </main>
    </div>
  );
}
