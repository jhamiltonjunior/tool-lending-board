"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Package, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AvailabilityBadge,
  Button,
  Card,
  CATEGORIES,
  CategoryIcon,
  CONDITIONS,
  Empty,
  ErrorText,
  Field,
  inputClass,
  Loading,
  PageHeader,
  useAction,
} from "@/components/ui";

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
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if ((await run(d)) && !onCancel) setD(EMPTY);
      }}
    >
      <Field label="Name">
        <input required maxLength={80} placeholder="e.g. Cordless drill" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <select value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} className={`${inputClass} capitalize`}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Condition">
          <select value={d.condition} onChange={(e) => setD({ ...d, condition: e.target.value })} className={`${inputClass} capitalize`}>
            {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Description">
        <textarea maxLength={500} placeholder="Anything a borrower should know" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} className={inputClass} rows={3} />
      </Field>
      <ErrorText error={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className="flex-1">{submitLabel}</Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
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
    <div>
      <PageHeader title="My listings" description="Tools you're willing to lend to neighbors." />
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card className="h-fit lg:sticky lg:top-24">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-stone-900">
            <Plus className="h-4 w-4 text-emerald-600" /> List a tool
          </h2>
          <ToolForm initial={EMPTY} submitLabel="Add listing" onSubmit={(d) => create(d)} />
        </Card>

        <div className="space-y-3">
          <ErrorText error={del.error} />
          {tools === undefined ? (
            <Loading />
          ) : tools.length === 0 ? (
            <Empty title="You haven't listed anything yet" icon={Package}>Add your first tool with the form.</Empty>
          ) : (
            tools.map((t) => (
              <Card key={t._id}>
                {editing === t._id ? (
                  <ToolForm
                    initial={{ name: t.name, category: t.category, condition: t.condition, description: t.description }}
                    submitLabel="Save changes"
                    onSubmit={async (d) => {
                      await update({ toolId: t._id, ...d });
                      setEditing(null);
                    }}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <div className="flex items-start gap-4">
                    <CategoryIcon category={t.category} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-stone-900">{t.name}</h3>
                        <AvailabilityBadge available={t.available} />
                      </div>
                      <p className="text-sm capitalize text-stone-500">{t.category} · {t.condition}</p>
                      {t.description && <p className="mt-2 text-sm text-stone-600">{t.description}</p>}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(t._id)} aria-label="Edit">
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button size="sm" variant="danger" disabled={del.busy} onClick={() => del.run({ toolId: t._id })} aria-label="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
