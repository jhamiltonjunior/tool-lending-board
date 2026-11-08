"use client";

import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Tool } from "@/components/ToolSlot";
import {
  Button,
  CategoryFilter,
  Empty,
  ErrorText,
  Field,
  formatRange,
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

type Range = { startDate: string; endDate: string };
const nextDay = (iso: string) => new Date(Date.parse(iso) + 86_400_000).toISOString().slice(0, 10);
const overlaps = (a: Range, b: Range) => a.startDate <= b.endDate && b.startDate <= a.endDate;

// First day from today that no approved loan covers (bookings come sorted by start).
function firstFreeDay(booked: Range[]): string {
  let day = today();
  for (const b of booked) if (b.startDate <= day && day <= b.endDate) day = nextDay(b.endDate);
  return day;
}

function RequestForm({ tool, onDone, onCancel }: { tool: Tool; onDone: () => void; onCancel: () => void }) {
  const first = firstFreeDay(tool.booked);
  const [startDate, setStart] = useState(first);
  const [endDate, setEnd] = useState(first);
  const { run, busy, error } = useAction(useMutation(api.loans.request));
  const toolId = tool._id;
  const clash = tool.booked.find((b) => overlaps(b, { startDate, endDate }));
  return (
    <form
      className="ll-slot-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run({ toolId, startDate, endDate })) onDone();
      }}
    >
      <Field label="From">
        <input
          type="date"
          className="ll-input"
          required
          min={today()}
          value={startDate}
          onChange={(e) => {
            setStart(e.target.value);
            if (endDate < e.target.value) setEnd(e.target.value);
          }}
        />
      </Field>
      <Field label="Until">
        <input type="date" className="ll-input" required min={startDate} value={endDate} onChange={(e) => setEnd(e.target.value)} />
      </Field>
      <div className="flex gap-1">
        <Button type="submit" variant="primary" disabled={busy || clash !== undefined}>Send request</Button>
        <Button variant="quiet" onClick={onCancel}>Cancel</Button>
      </div>
      {tool.booked.length > 0 && (
        <p className="ll-small basis-full m-0">
          Already booked: {tool.booked.map((b) => formatRange(b.startDate, b.endDate)).join(", ")}.
        </p>
      )}
      {clash && (
        <div className="basis-full">
          <ErrorText error={`Those days overlap a booking (${formatRange(clash.startDate, clash.endDate)}). Pick other dates.`} />
        </div>
      )}
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
            ) : t.myRequest ? (
              // Comes from the server, so it survives reloads and shows on every device.
              <span className="ll-status">Requested {formatRange(t.myRequest.startDate, t.myRequest.endDate)}</span>
            ) : requesting === t._id ? null : (
              <Button size="sm" onClick={() => setRequesting(t._id)}>
                {t.available ? "Request to borrow" : "Request later dates"}
              </Button>
            );
            return (
              <ToolSlot key={t._id} tool={t} owner={<OwnerLine tool={t} you={mine} />} action={action}>
                {requesting === t._id && (
                  <RequestForm tool={t} onCancel={() => setRequesting(null)} onDone={() => setRequesting(null)} />
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
