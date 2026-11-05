"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, Card, CATEGORIES, Empty, ErrorText, TrustedBadge, useAction } from "@/components/ui";

const today = () => new Date().toISOString().slice(0, 10);

function RequestForm({ toolId, onDone }: { toolId: Id<"tools">; onDone: () => void }) {
  const request = useMutation(api.loans.request);
  const [startDate, setStart] = useState(today());
  const [endDate, setEnd] = useState(today());
  const { run, busy, error } = useAction(request);
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run({ toolId, startDate, endDate })) onDone();
      }}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label>From <input type="date" required min={today()} value={startDate} onChange={(e) => setStart(e.target.value)} className="rounded border px-2 py-1" /></label>
        <label>to <input type="date" required min={startDate} value={endDate} onChange={(e) => setEnd(e.target.value)} className="rounded border px-2 py-1" /></label>
        <Button type="submit" disabled={busy}>Send request</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
      <ErrorText error={error} />
    </form>
  );
}

export default function AllTools() {
  const [category, setCategory] = useState("");
  const tools = useQuery(api.tools.list, category ? { category } : {});
  const me = useQuery(api.users.me);
  const [requesting, setRequesting] = useState<Id<"tools"> | null>(null);
  const [sent, setSent] = useState<Id<"tools"> | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="text-sm text-zinc-600" htmlFor="cat">Category</label>
        <select id="cat" value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border px-2 py-1.5 text-sm">
          <option value="">All</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {tools === undefined ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : tools.length === 0 ? (
        <Empty>No tools in this category yet.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {tools.map((t) => (
            <Card key={t._id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{t.name}</h3>
                  <p className="text-xs text-zinc-500">{t.category} · {t.condition}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${t.available ? "bg-emerald-100 text-emerald-800" : "bg-zinc-200 text-zinc-700"}`}>
                  {t.available ? "available" : "on loan"}
                </span>
              </div>
              {t.description && <p className="mt-2 text-sm text-zinc-700">{t.description}</p>}
              <p className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                Lent by {t.ownerName} {t.ownerTrusted && <TrustedBadge />}
              </p>
              {me && t.ownerId !== me._id && (
                requesting === t._id ? (
                  <RequestForm toolId={t._id} onDone={() => { setRequesting(null); setSent(t._id); }} />
                ) : (
                  <div className="mt-3 flex items-center gap-3">
                    <Button variant="ghost" onClick={() => setRequesting(t._id)}>Request to borrow</Button>
                    {sent === t._id && <span className="text-xs text-emerald-700">Request sent</span>}
                  </div>
                )
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
