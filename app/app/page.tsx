"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CalendarDays, Check, Search } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AvailabilityBadge,
  Button,
  Card,
  CATEGORIES,
  CategoryIcon,
  Empty,
  ErrorText,
  inputClass,
  Loading,
  PageHeader,
  TrustedBadge,
  useAction,
} from "@/components/ui";

const today = () => new Date().toISOString().slice(0, 10);

function RequestForm({ toolId, onDone, onCancel }: { toolId: Id<"tools">; onDone: () => void; onCancel: () => void }) {
  const request = useMutation(api.loans.request);
  const [startDate, setStart] = useState(today());
  const [endDate, setEnd] = useState(today());
  const { run, busy, error } = useAction(request);
  return (
    <form
      className="mt-4 space-y-3 rounded-xl bg-stone-50 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run({ toolId, startDate, endDate })) onDone();
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-medium text-stone-600">
          From
          <input type="date" required min={today()} value={startDate} onChange={(e) => setStart(e.target.value)} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs font-medium text-stone-600">
          Until
          <input type="date" required min={startDate} value={endDate} onChange={(e) => setEnd(e.target.value)} className={`${inputClass} mt-1`} />
        </label>
      </div>
      <ErrorText error={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className="flex-1">Send request</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export default function Browse() {
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const tools = useQuery(api.tools.list, category ? { category } : {});
  const me = useQuery(api.users.me);
  const [requesting, setRequesting] = useState<Id<"tools"> | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());

  const filtered = tools?.filter((t) => t.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div>
      <PageHeader title="Browse tools" description="Everything your neighbors are willing to lend." />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input placeholder="Search tools" value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputClass} pl-9`} />
        </div>
        <div className="flex flex-wrap gap-2">
          {["", ...CATEGORIES].map((c) => (
            <button
              key={c || "all"}
              onClick={() => setCategory(c)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium capitalize transition ${
                category === c ? "bg-stone-900 text-white" : "bg-white text-stone-600 ring-1 ring-inset ring-stone-200 hover:bg-stone-100"
              }`}
            >
              {c || "All"}
            </button>
          ))}
        </div>
      </div>

      {filtered === undefined ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <Empty title="Nothing here yet">Try another category, or list one of your own tools.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const mine = me && t.ownerId === me._id;
            return (
              <Card key={t._id} className="flex flex-col">
                <div className="flex items-start gap-3">
                  <CategoryIcon category={t.category} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold text-stone-900">{t.name}</h3>
                    <p className="text-sm capitalize text-stone-500">{t.category} · {t.condition}</p>
                  </div>
                  <AvailabilityBadge available={t.available} />
                </div>
                {t.description && <p className="mt-3 line-clamp-3 text-sm text-stone-600">{t.description}</p>}
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                  <span>Lent by <span className="font-medium text-stone-700">{mine ? "you" : t.ownerName}</span></span>
                  {t.ownerTrusted && <TrustedBadge />}
                </div>
                <div className="mt-auto">
                  {!mine &&
                    (requesting === t._id ? (
                      <RequestForm
                        toolId={t._id}
                        onCancel={() => setRequesting(null)}
                        onDone={() => {
                          setRequesting(null);
                          setSent(new Set(sent).add(t._id));
                        }}
                      />
                    ) : sent.has(t._id) ? (
                      <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                        <Check className="h-4 w-4" /> Request sent
                      </p>
                    ) : (
                      <Button variant="ghost" className="mt-4 w-full" onClick={() => setRequesting(t._id)}>
                        <CalendarDays className="h-4 w-4" /> Request to borrow
                      </Button>
                    ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
