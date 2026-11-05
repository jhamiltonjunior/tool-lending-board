"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Show, SignInButton } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import { Empty } from "@/components/ui";

export default function Home() {
  const tools = useQuery(api.tools.publicList);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight">LendLoop</h1>
        <p className="mt-2 text-lg text-zinc-600">Borrow what you need. Lend what you don&apos;t.</p>
        <div className="mt-6">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="rounded-lg bg-zinc-900 px-5 py-2.5 font-medium text-white hover:bg-zinc-700">
                Sign in to lend or borrow
              </button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <Link href="/app" className="rounded-lg bg-zinc-900 px-5 py-2.5 font-medium text-white hover:bg-zinc-700">
              Go to your board
            </Link>
          </Show>
        </div>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Available now</h2>
        {tools === undefined ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : tools.length === 0 ? (
          <Empty>No tools listed yet. Be the first to lend one.</Empty>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {tools.map((t) => (
              <li key={t._id} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3">
                <span className="font-medium">{t.name}</span>
                <span className="text-xs text-zinc-500">{t.category}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
