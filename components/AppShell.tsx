"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { UserButton, useUser } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import { Loading } from "@/components/ui";

const NAV = [
  { href: "/app", label: "The board" },
  { href: "/app/listings", label: "My tools" },
  { href: "/app/requests", label: "My requests" },
  { href: "/app/incoming", label: "Incoming" },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const store = useMutation(api.users.store);
  const [stored, setStored] = useState(false);
  const me = useQuery(api.users.me, stored ? {} : "skip");
  const incoming = useQuery(api.loans.incoming, stored ? {} : "skip");
  const waiting = incoming?.filter((l) => l.status === "pending").length ?? 0;

  // Create or refresh the Convex user record once the Clerk token is accepted.
  useEffect(() => {
    if (!isAuthenticated) return;
    store().then(() => setStored(true));
  }, [isAuthenticated, store]);

  // A name changed in the Clerk profile reaches Convex inside the next session token,
  // which can take up to a minute. Re-sync for a short while until it lands.
  const { user } = useUser();
  const profileName = user?.fullName?.trim() || user?.username || null;
  const outOfSync = stored && me !== undefined && me !== null && profileName !== null && me.name !== profileName;
  useEffect(() => {
    if (!outOfSync) return;
    let tries = 0;
    const id = setInterval(() => {
      if (++tries > 8) clearInterval(id);
      else void store();
    }, 15_000);
    void store();
    return () => clearInterval(id);
  }, [outOfSync, store]);

  const nav = me?.role === "admin" ? [...NAV, { href: "/app/admin", label: "Admin" }] : NAV;
  const links = nav.map((n) => (
    <li key={n.href}>
      <Link href={n.href} className="ll-nav-link" aria-current={pathname === n.href ? "page" : undefined}>
        {n.label}
        {n.href === "/app/incoming" && waiting > 0 && (
          <span className="ll-nav-count" aria-label={`${waiting} waiting`}>{waiting}</span>
        )}
      </Link>
    </li>
  ));

  return (
    <div className="min-h-screen pb-16">
      <header>
        <div className="ll-nav">
          <Link href="/" className="ll-wordmark">LendLoop</Link>
          <nav aria-label="Main">
            <ul className="ll-nav-links">{links}</ul>
          </nav>
          <div className="ll-nav-end">
            {me && (
              <span className="ll-nav-user-text">
                <span className="ll-nav-user-name">{me.name}</span>
                {me.role === "admin" && <span className="ll-nav-user-role">Admin</span>}
              </span>
            )}
            <UserButton />
          </div>
        </div>
        <ul className="ll-nav-mobile ll-nav-links">{links}</ul>
      </header>
      <main className="ll-page">{isLoading || !stored ? <Loading /> : children}</main>
    </div>
  );
}
