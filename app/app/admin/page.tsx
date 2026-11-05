"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { LoanList } from "@/components/LoanList";
import { Button, Card, Empty, ErrorText, TrustedBadge, useAction } from "@/components/ui";

export default function Admin() {
  const me = useQuery(api.users.me);
  const isAdmin = me?.role === "admin";
  // Queries are skipped for non-admins; the server rejects them anyway.
  const users = useQuery(api.users.listForAdmin, isAdmin ? {} : "skip");
  const tools = useQuery(api.tools.list, isAdmin ? {} : "skip");
  const loans = useQuery(api.loans.all, isAdmin ? {} : "skip");
  const trust = useAction(useMutation(api.users.setTrustedLender));
  const removeTool = useAction(useMutation(api.tools.adminRemove));

  if (me === undefined) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (!isAdmin) return <Empty>This page is for admins only.</Empty>;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-semibold">Lenders</h2>
        <ErrorText error={trust.error} />
        {users?.map((u) => (
          <Card key={u._id}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{u.name}</span>
                <span className="text-xs text-zinc-500">{u.email} · {u.role}</span>
                {u.trustedLender && <TrustedBadge />}
              </div>
              <Button variant="ghost" disabled={trust.busy} onClick={() => trust.run({ userId: u._id, trusted: !u.trustedLender })}>
                {u.trustedLender ? "Remove Trusted Lender" : "Mark Trusted Lender"}
              </Button>
            </div>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">All listings</h2>
        <ErrorText error={removeTool.error} />
        {tools?.length === 0 && <Empty>No listings.</Empty>}
        {tools?.map((t) => (
          <Card key={t._id}>
            <div className="flex items-center justify-between gap-3">
              <span><span className="font-medium">{t.name}</span> <span className="text-xs text-zinc-500">{t.category} · by {t.ownerName}</span></span>
              <Button variant="danger" disabled={removeTool.busy} onClick={() => removeTool.run({ toolId: t._id })}>Remove</Button>
            </div>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">All loans</h2>
        <LoanList loans={loans} perspective="admin" empty="No loans yet." />
      </section>
    </div>
  );
}
