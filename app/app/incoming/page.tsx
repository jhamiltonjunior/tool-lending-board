"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { LoanList } from "@/components/LoanList";
import { Button, ErrorText, useAction } from "@/components/ui";

export default function Incoming() {
  const loans = useQuery(api.loans.incoming);
  const approve = useAction(useMutation(api.loans.approve));
  const decline = useAction(useMutation(api.loans.decline));
  const returned = useAction(useMutation(api.loans.markReturned));
  const busy = approve.busy || decline.busy || returned.busy;
  return (
    <div className="space-y-3">
      <ErrorText error={approve.error ?? decline.error ?? returned.error} />
      <LoanList
        loans={loans}
        perspective="owner"
        empty="Nobody has asked to borrow your tools yet."
        actions={(l) => (
          <>
            {l.status === "pending" && (
              <>
                <Button disabled={busy} onClick={() => approve.run({ loanId: l._id })}>Approve</Button>
                <Button variant="danger" disabled={busy} onClick={() => decline.run({ loanId: l._id })}>Decline</Button>
              </>
            )}
            {l.status === "approved" && (
              <Button variant="ghost" disabled={busy} onClick={() => returned.run({ loanId: l._id })}>Mark returned</Button>
            )}
          </>
        )}
      />
    </div>
  );
}
