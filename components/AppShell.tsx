"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { UserButton } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import { TrustedBadge } from "@/components/ui";

const NAV = [
  { href: "/app", label: "All tools" },
  { href: "/app/listings", label: "My listings" },
  { href: "/app/requests", label: "My requests" },
  { href: "/app/incoming", label: "Incoming requests" },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const store = useMutation(api.users.store);
  const [stored, setStored] = useState(false);
  const me = useQuery(api.users.me, stored ? {} : "skip");

  // Create or refresh the Convex user record once the Clerk token is accepted.
  useEffect(() => {
    if (!isAuthenticated) return;
    store().then(() => setStored(true));
  }, [isAuthenticated, store]);

  const nav = me?.role === "admin" ? [...NAV, { href: "/app/admin", label: "Admin" }] : NAV;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="text-xl font-bold">LendLoop</Link>
        <div className="flex items-center gap-3">
          {me?.trustedLender && <TrustedBadge />}
          {me && <span className="text-sm text-zinc-600">{me.name}{me.role === "admin" ? " · admin" : ""}</span>}
          <UserButton />
        </div>
      </header>
      <nav className="mb-6 flex flex-wrap gap-2">
        {nav.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`rounded-lg px-3 py-1.5 text-sm ${pathname === n.href ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-200"}`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
      {isLoading || !stored ? <p className="text-sm text-zinc-500">Loading…</p> : children}
    </div>
  );
}
