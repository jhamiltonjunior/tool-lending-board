"use client";

import { useMutation, useQuery } from "convex/react";
import { ShieldCheck, ShieldOff, TriangleAlert, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { LoanList } from "@/components/LoanList";
import {
  Button,
  Card,
  CategoryIcon,
  Empty,
  ErrorText,
  Loading,
  PageHeader,
  timeAgo,
  TrustedBadge,
  useAction,
} from "@/components/ui";

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-stone-900">{value ?? "–"}</p>
    </Card>
  );
}

export default function Admin() {
  const me = useQuery(api.users.me);
  const isAdmin = me?.role === "admin";
  // Queries are skipped for non-admins; the server rejects them anyway.
  const users = useQuery(api.users.listForAdmin, isAdmin ? {} : "skip");
  const tools = useQuery(api.tools.list, isAdmin ? {} : "skip");
  const loans = useQuery(api.loans.all, isAdmin ? {} : "skip");
  const problems = useQuery(api.automation.recentProblems, isAdmin ? {} : "skip");
  const trust = useAction(useMutation(api.users.setTrustedLender));
  const removeTool = useAction(useMutation(api.tools.adminRemove));

  if (me === undefined) return <Loading />;
  if (!isAdmin) return <Empty title="Admins only" icon={ShieldOff}>You don&apos;t have access to this page.</Empty>;

  return (
    <div className="space-y-10">
      <PageHeader title="Admin" description="Moderate listings, review loans and manage Trusted Lenders." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Members" value={users?.length} />
        <Stat label="Listings" value={tools?.length} />
        <Stat label="Active loans" value={loans?.filter((l) => l.status === "approved").length} />
        <Stat label="Overdue" value={loans?.filter((l) => l.overdue).length} />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Automation problems</h2>
        {problems === undefined ? (
          <Loading />
        ) : problems.length === 0 ? (
          <Empty title="No failed automation runs" icon={ShieldCheck} />
        ) : (
          <div className="space-y-2">
            {problems.map((p) => (
              <Card key={p._id} className="border-rose-200 bg-rose-50/50 p-4">
                <p className="flex items-start gap-2 text-sm text-rose-800">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {p.detail}
                </p>
                <p className="mt-1 pl-6 text-xs text-stone-500">{p.kind.replace("_", " ")} · {timeAgo(p.at)}</p>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Members</h2>
        <ErrorText error={trust.error} />
        <Card className="divide-y divide-stone-100 p-0">
          {users?.map((u) => (
            <div key={u._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium text-stone-900">
                  {u.name} {u.trustedLender && <TrustedBadge />}
                  {u.role === "admin" && <span className="rounded-full bg-stone-900 px-2 py-0.5 text-xs text-white">Admin</span>}
                </p>
                <p className="truncate text-sm text-stone-500">{u.email}</p>
              </div>
              <Button size="sm" variant="ghost" disabled={trust.busy} onClick={() => trust.run({ userId: u._id, trusted: !u.trustedLender })}>
                {u.trustedLender ? <><ShieldOff className="h-3.5 w-3.5" /> Remove Trusted</> : <><ShieldCheck className="h-3.5 w-3.5" /> Mark Trusted Lender</>}
              </Button>
            </div>
          ))}
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">All listings</h2>
        <ErrorText error={removeTool.error} />
        {tools?.length === 0 ? (
          <Empty title="No listings yet" />
        ) : (
          <Card className="divide-y divide-stone-100 p-0">
            {tools?.map((t) => (
              <div key={t._id} className="flex items-center gap-3 px-5 py-3">
                <CategoryIcon category={t.category} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-stone-900">{t.name}</p>
                  <p className="text-sm text-stone-500">by {t.ownerName}</p>
                </div>
                <Button size="sm" variant="danger" disabled={removeTool.busy} onClick={() => removeTool.run({ toolId: t._id })}>
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </Button>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">All loans</h2>
        <LoanList loans={loans} perspective="admin" emptyTitle="No loans yet" />
      </section>
    </div>
  );
}
