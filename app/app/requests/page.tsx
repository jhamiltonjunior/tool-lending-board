"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { RequestList } from "@/components/LoanList";
import { Button, ErrorText, PageHeader, useAction } from "@/components/ui";

export default function MyRequests() {
  const loans = useQuery(api.loans.myRequests);
  const cancel = useAction(useMutation(api.loans.cancel));
  const open = loans?.filter((l) => l.status === "pending" || l.status === "approved");
  const history = loans?.filter((l) => l.status !== "pending" && l.status !== "approved");

  return (
    <div>
      <PageHeader title="My requests." lede="What you asked to borrow, and what you have right now." />
      <ErrorText error={cancel.error} />
      <RequestList
        loans={open}
        perspective="borrower"
        empty={{ title: "Nothing borrowed yet.", text: "Find a tool on the board and ask for the days you need it." }}
        actions={(l) =>
          l.status === "pending" ? (
            <Button size="sm" variant="quiet" disabled={cancel.busy} onClick={() => cancel.run({ loanId: l._id })}>
              Cancel request
            </Button>
          ) : null
        }
      />
      {history && history.length > 0 && (
        <section className="ll-section">
          <h2 className="ll-section-label">Earlier.</h2>
          <RequestList loans={history} perspective="borrower" empty={{ title: "" }} />
        </section>
      )}
    </div>
  );
}
