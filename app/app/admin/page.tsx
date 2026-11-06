"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { RequestList } from "@/components/LoanList";
import { Button, Caption, Empty, ErrorText, label, Loading, PageHeader, timeAgo, ToolGlyph, useAction } from "@/components/ui";

function Stat({ name, value }: { name: string; value: number | undefined }) {
  return (
    <div className="ll-stat">
      <p className="ll-small m-0">{name}</p>
      <p className="ll-stat-value">{value ?? "–"}</p>
    </div>
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
  if (!isAdmin) return <Empty title="Admins only.">Ask an admin if you need something changed on the board.</Empty>;

  return (
    <div>
      <PageHeader title="Admin." lede="Look after the board: listings, loans and who lends reliably." />

      <div className="ll-stats">
        <Stat name="Neighbors" value={users?.length} />
        <Stat name="Tools listed" value={tools?.length} />
        <Stat name="Lent out now" value={loans?.filter((l) => l.status === "approved").length} />
        <Stat name="Late" value={loans?.filter((l) => l.overdue).length} />
      </div>

      <section className="ll-section">
        <h2 className="ll-section-label">Automation.</h2>
        {problems === undefined ? (
          <Loading />
        ) : problems.length === 0 ? (
          <p className="ll-caption"><strong>Every run went through.</strong> Failed notifications and reminders would show up here.</p>
        ) : (
          <div className="ll-rows">
            {problems.map((p) => (
              <div key={p._id} className="ll-row">
                <span className="ll-caption" style={{ color: "var(--alert)" }}>{p.detail}</span>
                <span className="ll-small">{timeAgo(p.at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="ll-section">
        <h2 className="ll-section-label">Neighbors.</h2>
        <ErrorText error={trust.error} />
        <div className="ll-rows ll-on-panel">
          {users?.map((u) => (
            <div key={u._id} className="ll-row">
              <span className="ll-caption">
                <strong>{u.name}</strong> {u.email}{u.role === "admin" ? ", admin" : ""}{u.trustedLender ? ", trusted lender" : ""}.
              </span>
              <Button size="sm" disabled={trust.busy} onClick={() => trust.run({ userId: u._id, trusted: !u.trustedLender })}>
                {u.trustedLender ? "Remove Trusted Lender" : "Mark as Trusted Lender"}
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="ll-section">
        <h2 className="ll-section-label">Tools.</h2>
        <ErrorText error={removeTool.error} />
        {tools?.length === 0 ? (
          <Empty title="Nothing listed yet." />
        ) : (
          <div className="ll-rows ll-on-panel">
            {tools?.map((t) => (
              <div key={t._id} className="ll-row">
                <span className="flex min-w-0 items-center gap-3">
                  <ToolGlyph category={t.category} size={20} />
                  <Caption as="span" title={t.name} rest={`${label(t.category)}, from ${t.ownerName}.`} />
                </span>
                <Button size="sm" variant="quiet" disabled={removeTool.busy} onClick={() => removeTool.run({ toolId: t._id })}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="ll-section">
        <h2 className="ll-section-label">Loans.</h2>
        <RequestList loans={loans} perspective="admin" empty={{ title: "No loans yet." }} />
      </section>
    </div>
  );
}
