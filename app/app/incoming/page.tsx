"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, RotateCcw, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { LoanList } from "@/components/LoanList";
import { Button, ErrorText, PageHeader, useAction } from "@/components/ui";

export default function Incoming() {
  const loans = useQuery(api.loans.incoming);
  const approve = useAction(useMutation(api.loans.approve));
  const decline = useAction(useMutation(api.loans.decline));
  const returned = useAction(useMutation(api.loans.markReturned));
  const busy = approve.busy || decline.busy || returned.busy;

  const pending = loans?.filter((l) => l.status === "pending");
  const active = loans?.filter((l) => l.status === "approved");
  const history = loans?.filter((l) => !["pending", "approved"].includes(l.status));

  return (
    <div className="space-y-10">
      <PageHeader title="Incoming requests" description="Neighbors asking to borrow your tools." />
      <ErrorText error={approve.error ?? decline.error ?? returned.error} />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Waiting for you</h2>
        <LoanList
          loans={pending}
          perspective="owner"
          emptyTitle="You're all caught up"
          emptyText="New requests for your tools will show up here."
          actions={(l) => (
            <>
              <Button size="sm" disabled={busy} onClick={() => approve.run({ loanId: l._id })}>
                <Check className="h-3.5 w-3.5" /> Approve
              </Button>
              <Button size="sm" variant="danger" disabled={busy} onClick={() => decline.run({ loanId: l._id })}>
                <X className="h-3.5 w-3.5" /> Decline
              </Button>
            </>
          )}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Lent out now</h2>
        <LoanList
          loans={active}
          perspective="owner"
          emptyTitle="Nothing lent out"
          actions={(l) => (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => returned.run({ loanId: l._id })}>
              <RotateCcw className="h-3.5 w-3.5" /> Mark returned
            </Button>
          )}
        />
      </section>

      {history && history.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">History</h2>
          <LoanList loans={history} perspective="owner" emptyTitle="" />
        </section>
      )}
    </div>
  );
}
