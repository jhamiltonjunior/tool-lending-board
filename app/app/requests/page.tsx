"use client";

import { useMutation, useQuery } from "convex/react";
import { X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { LoanList } from "@/components/LoanList";
import { Button, ErrorText, PageHeader, useAction } from "@/components/ui";

export default function MyRequests() {
  const loans = useQuery(api.loans.myRequests);
  const cancel = useAction(useMutation(api.loans.cancel));
  const open = loans?.filter((l) => l.status === "pending" || l.status === "approved");
  const history = loans?.filter((l) => l.status !== "pending" && l.status !== "approved");

  return (
    <div className="space-y-10">
      <div>
        <PageHeader title="My requests" description="Tools you asked to borrow." />
        <ErrorText error={cancel.error} />
        <LoanList
          loans={open}
          perspective="borrower"
          emptyTitle="No open requests"
          emptyText="Browse tools and request one for the days you need it."
          actions={(l) =>
            l.status === "pending" ? (
              <Button size="sm" variant="ghost" disabled={cancel.busy} onClick={() => cancel.run({ loanId: l._id })}>
                <X className="h-3.5 w-3.5" /> Cancel request
              </Button>
            ) : null
          }
        />
      </div>
      {history && history.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">History</h2>
          <LoanList loans={history} perspective="borrower" emptyTitle="" />
        </div>
      )}
    </div>
  );
}
