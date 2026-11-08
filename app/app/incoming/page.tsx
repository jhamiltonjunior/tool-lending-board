"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { RequestList } from "@/components/LoanList";
import { Button, ErrorText, PageHeader, useAction } from "@/components/ui";

export default function Incoming() {
  const loans = useQuery(api.loans.incoming);
  const approve = useAction(useMutation(api.loans.approve));
  const decline = useAction(useMutation(api.loans.decline));
  const returned = useAction(useMutation(api.loans.markReturned));
  const dispute = useAction(useMutation(api.loans.disputeReturn));
  const busy = approve.busy || decline.busy || returned.busy || dispute.busy;

  const waiting = loans?.filter((l) => l.status === "pending");
  const out = loans?.filter((l) => l.status === "approved");
  const history = loans?.filter((l) => !["pending", "approved"].includes(l.status));

  return (
    <div>
      <PageHeader title="Incoming." lede="Neighbors asking for your tools." />
      <ErrorText error={approve.error ?? decline.error ?? returned.error ?? dispute.error} />

      <section>
        <h2 className="ll-section-label">Waiting for you.</h2>
        <RequestList
          loans={waiting}
          perspective="owner"
          empty={{ title: "No one is waiting.", text: "New requests for your tools show up here." }}
          actions={(l) => (
            <>
              <Button size="sm" disabled={busy} onClick={() => approve.run({ loanId: l._id })}>Approve</Button>
              <Button size="sm" variant="quiet" disabled={busy} onClick={() => decline.run({ loanId: l._id })}>Decline</Button>
            </>
          )}
        />
      </section>

      <section className="ll-section">
        <h2 className="ll-section-label">Lent out.</h2>
        <RequestList
          loans={out}
          perspective="owner"
          empty={{ title: "Everything is home." }}
          actions={(l) =>
            l.returnReported ? (
              <>
                <Button size="sm" disabled={busy} onClick={() => returned.run({ loanId: l._id })}>Confirm return</Button>
                <Button size="sm" variant="quiet" disabled={busy} onClick={() => dispute.run({ loanId: l._id })}>Not back yet</Button>
              </>
            ) : (
              <Button size="sm" disabled={busy} onClick={() => returned.run({ loanId: l._id })}>Mark as returned</Button>
            )
          }
        />
      </section>

      {history && history.length > 0 && (
        <section className="ll-section">
          <h2 className="ll-section-label">Earlier.</h2>
          <RequestList loans={history} perspective="owner" empty={{ title: "" }} />
        </section>
      )}
    </div>
  );
}
