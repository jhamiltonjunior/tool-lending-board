"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, Card, CATEGORIES, CONDITIONS, Empty, ErrorText, useAction } from "@/components/ui";

type Draft = { name: string; category: string; condition: string; description: string };
const EMPTY: Draft = { name: "", category: CATEGORIES[0], condition: CONDITIONS[1], description: "" };

function ToolForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial: Draft;
  submitLabel: string;
  onSubmit: (d: Draft) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const [d, setD] = useState(initial);
  const { run, busy, error } = useAction(onSubmit);
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if ((await run(d)) && !onCancel) setD(EMPTY);
      }}
    >
      <input required maxLength={80} placeholder="Tool name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" />
      <div className="flex gap-2">
        <select value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} className="flex-1 rounded-lg border px-2 py-2 text-sm">
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={d.condition} onChange={(e) => setD({ ...d, condition: e.target.value })} className="flex-1 rounded-lg border px-2 py-2 text-sm">
          {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <textarea maxLength={500} placeholder="Short description" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" rows={2} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>{submitLabel}</Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
      <ErrorText error={error} />
    </form>
  );
}

export default function MyListings() {
  const tools = useQuery(api.tools.mine);
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const remove = useMutation(api.tools.remove);
  const [editing, setEditing] = useState<Id<"tools"> | null>(null);
  const del = useAction(remove);

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_1.4fr]">
      <Card>
        <h2 className="mb-3 font-semibold">List a tool</h2>
        <ToolForm initial={EMPTY} submitLabel="Add listing" onSubmit={(d) => create(d)} />
      </Card>
      <div className="space-y-3">
        <ErrorText error={del.error} />
        {tools === undefined ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : tools.length === 0 ? (
          <Empty>You haven&apos;t listed anything yet.</Empty>
        ) : (
          tools.map((t) => (
            <Card key={t._id}>
              {editing === t._id ? (
                <ToolForm
                  initial={{ name: t.name, category: t.category, condition: t.condition, description: t.description }}
                  submitLabel="Save"
                  onSubmit={async (d) => { await update({ toolId: t._id, ...d }); setEditing(null); }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{t.name}</h3>
                    <p className="text-xs text-zinc-500">{t.category} · {t.condition} · {t.available ? "available" : "on loan"}</p>
                    {t.description && <p className="mt-1 text-sm text-zinc-700">{t.description}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="ghost" onClick={() => setEditing(t._id)}>Edit</Button>
                    <Button variant="danger" disabled={del.busy} onClick={() => del.run({ toolId: t._id })}>Delete</Button>
                  </div>
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
