"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, CATEGORIES, CONDITIONS, Empty, ErrorText, Field, label, Loading, PageHeader, useAction } from "@/components/ui";
import { OwnerLine, ToolSlot } from "@/components/ToolSlot";

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
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if ((await run(d)) && !onCancel) setD(EMPTY);
      }}
    >
      <Field label="Name">
        <input className="ll-input" required maxLength={80} placeholder="Cordless drill" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <select className="ll-input" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
          </select>
        </Field>
        <Field label="Condition">
          <select className="ll-input" value={d.condition} onChange={(e) => setD({ ...d, condition: e.target.value })}>
            {CONDITIONS.map((c) => <option key={c} value={c}>{label(c)}</option>)}
          </select>
        </Field>
      </div>
      <Field label="What a borrower should know">
        <textarea className="ll-input" maxLength={500} placeholder="18V, two batteries and a charger." value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
      </Field>
      <ErrorText error={error} />
      <div className="flex gap-1">
        <Button type="submit" variant="primary" disabled={busy}>{submitLabel}</Button>
        {onCancel && <Button variant="quiet" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}

export default function MyTools() {
  const tools = useQuery(api.tools.mine);
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const del = useAction(useMutation(api.tools.remove));
  const [editing, setEditing] = useState<Id<"tools"> | null>(null);

  return (
    <div>
      <PageHeader title="My tools." lede="What you're willing to lend to the street." />
      <div className="grid items-start gap-8 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="ll-panel ll-on-panel">
          <h2 className="ll-heading mb-6">List a tool.</h2>
          <div className="ll-sheet">
            <ToolForm initial={EMPTY} submitLabel="Add to the board" onSubmit={(d) => create(d)} />
          </div>
        </section>

        <section>
          <ErrorText error={del.error} />
          {tools === undefined ? (
            <Loading />
          ) : tools.length === 0 ? (
            <Empty title="Nothing listed yet.">List the first tool on your street with the form.</Empty>
          ) : (
            <ul className="ll-list">
              {tools.map((t) =>
                editing === t._id ? (
                  <li key={t._id} className="ll-panel ll-on-panel" style={{ listStyle: "none" }}>
                    <div className="ll-sheet">
                      <ToolForm
                        initial={{ name: t.name, category: t.category, condition: t.condition, description: t.description }}
                        submitLabel="Save changes"
                        onSubmit={async (d) => {
                          await update({ toolId: t._id, ...d });
                          setEditing(null);
                        }}
                        onCancel={() => setEditing(null)}
                      />
                    </div>
                  </li>
                ) : (
                  <ToolSlot
                    key={t._id}
                    tool={t}
                    owner={<OwnerLine tool={t} you />}
                    action={
                      <>
                        <Button size="sm" onClick={() => setEditing(t._id)}>Edit</Button>
                        <Button size="sm" variant="quiet" disabled={del.busy} onClick={() => del.run({ toolId: t._id })}>Delete</Button>
                      </>
                    }
                  />
                ),
              )}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
