"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, CategoryFilter, Empty, ErrorText, Field, Loading, PageHeader, SearchField, useAction } from "@/components/ui";
import { OwnerLine, ToolSlot } from "@/components/ToolSlot";

const today = () => new Date().toISOString().slice(0, 10);

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
  const tools = useQuery(api.tools.list, {});
  const me = useQuery(api.users.me);
  const [requesting, setRequesting] = useState<Id<"tools"> | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());

  const counts = useMemo(() => {
    const c: Record<string, number> = { "": tools?.length ?? 0 };
    for (const t of tools ?? []) c[t.category] = (c[t.category] ?? 0) + 1;
    return c;
  }, [tools]);

  const shown = tools?.filter(
    (t) => (!category || t.category === category) && t.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const free = tools?.filter((t) => t.available).length ?? 0;
  const neighbors = new Set(tools?.map((t) => t.ownerId)).size;

  return (
    <div>
      <PageHeader
        title="The board."
        lede={tools ? `${tools.length} tools from ${neighbors} neighbor${neighbors === 1 ? "" : "s"}, ${free} free right now.` : undefined}
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
    </div>
  );
}
