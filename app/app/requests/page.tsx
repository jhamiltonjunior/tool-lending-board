"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { LoanList } from "@/components/LoanList";
import { Button, ErrorText, useAction } from "@/components/ui";

export default function MyRequests() {
  const loans = useQuery(api.loans.myRequests);
  const cancel = useAction(useMutation(api.loans.cancel));
  return (
    <div className="space-y-3">
      <ErrorText error={cancel.error} />
      <LoanList
        loans={loans}
        perspective="borrower"
        empty="You haven't requested anything yet."
        actions={(l) =>
          l.status === "pending" ? (
            <Button variant="ghost" disabled={cancel.busy} onClick={() => cancel.run({ loanId: l._id })}>Cancel request</Button>
          ) : null
        }
      />
    </div>
  );
}
