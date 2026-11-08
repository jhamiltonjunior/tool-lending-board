"use client";

import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Button,
  CategoryFilter,
  Empty,
  ErrorText,
  Field,
  Loading,
  LoadMore,
  PageHeader,
  SearchField,
  useAction,
  useDebounced,
} from "@/components/ui";
import { OwnerLine, ToolSlot } from "@/components/ToolSlot";

const today = () => new Date().toISOString().slice(0, 10);
const PAGE_SIZE = 20;

function RequestForm({ toolId, onDone, onCancel }: { toolId: Id<"tools">; onDone: () => void; onCancel: () => void }) {
  const [startDate, setStart] = useState(today());
  const [endDate, setEnd] = useState(today());
  const { run, busy, error } = useAction(useMutation(api.loans.request));
  return (
    <form
      className="ll-slot-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run({ toolId, startDate, endDate })) onDone();
      }}
    >
      <Field label="From">
        <input type="date" className="ll-input" required min={today()} value={startDate} onChange={(e) => setStart(e.target.value)} />
      </Field>
      <Field label="Until">
        <input type="date" className="ll-input" required min={startDate} value={endDate} onChange={(e) => setEnd(e.target.value)} />
      </Field>
      <div className="flex gap-1">
        <Button type="submit" variant="primary" disabled={busy}>Send request</Button>
        <Button variant="quiet" onClick={onCancel}>Cancel</Button>
      </div>
      {error && <div className="basis-full"><ErrorText error={error} /></div>}
    </form>
  );
}

export default function Board() {
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  // Filtering and search run on the server, one page at a time.
  const query = useDebounced(search.trim());
  const { results, status, loadMore } = usePaginatedQuery(
    api.tools.list,
    { category: category || undefined, search: query || undefined },
    { initialNumItems: PAGE_SIZE },
  );
  const stats = useQuery(api.tools.stats);
  const me = useQuery(api.users.me);
  const [requesting, setRequesting] = useState<Id<"tools"> | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());

  const counts = stats ? { "": stats.total, ...stats.byCategory } : undefined;
  const shown = status === "LoadingFirstPage" ? undefined : results;

  return (
    <div>
      <PageHeader
        title="The board."
        lede={stats ? `${stats.total} tool${stats.total === 1 ? "" : "s"}, ${stats.free} free right now.` : undefined}
        side={<div className="w-[300px] max-w-full"><SearchField value={search} onChange={setSearch} /></div>}
      />
      <div className="mb-6">
        <CategoryFilter value={category} onChange={setCategory} counts={counts} />
      </div>

      {shown === undefined ? (
        <Loading />
      ) : shown.length === 0 ? (
        <Empty title="Nothing matches.">Ask the street: someone may have one that isn&apos;t listed yet.</Empty>
      ) : (
        <ul className="ll-list">
          {shown.map((t) => {
            const mine = me?._id === t.ownerId;
            const action = mine ? (
              <span className="ll-small">Your tool</span>
            ) : sent.has(t._id) ? (
              <span className="ll-status">Request sent</span>
            ) : requesting === t._id ? null : (
              <Button size="sm" onClick={() => setRequesting(t._id)}>
                {t.available ? "Request to borrow" : "Request later dates"}
              </Button>
            );
            return (
              <ToolSlot key={t._id} tool={t} owner={<OwnerLine tool={t} you={mine} />} action={action}>
                {requesting === t._id && (
                  <RequestForm
                    toolId={t._id}
                    onCancel={() => setRequesting(null)}
                    onDone={() => {
                      setRequesting(null);
                      setSent(new Set(sent).add(t._id));
                    }}
                  />
                )}
              </ToolSlot>
            );
          })}
        </ul>
      )}
      <LoadMore status={status} onMore={() => loadMore(PAGE_SIZE)} />
    </div>
  );
}
