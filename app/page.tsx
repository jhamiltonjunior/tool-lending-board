"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Show, SignInButton } from "@clerk/nextjs";
import { ArrowRight, BellRing, CalendarDays, Handshake } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { CategoryIcon, Empty, Loading, Logo } from "@/components/ui";

const STEPS = [
  { icon: Handshake, title: "List what you own", text: "Drills, ladders, tents: share the things that sit in your garage." },
  { icon: CalendarDays, title: "Request a date range", text: "Ask to borrow for exactly the days you need it." },
  { icon: BellRing, title: "Automatic reminders", text: "Owners and borrowers are notified, and late returns get a nudge." },
];

export default function Home() {
  const tools = useQuery(api.tools.publicList);

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/70 via-stone-50 to-stone-50">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo className="text-lg text-stone-900" />
        <Show when="signed-in">
          <Link href="/app" className="text-sm font-medium text-stone-700 hover:text-stone-900">Open your board →</Link>
        </Show>
      </header>

      <section className="mx-auto max-w-3xl px-4 pb-14 pt-12 text-center sm:pt-20">
        <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-700 shadow-sm ring-1 ring-emerald-600/15">
          Your neighborhood tool library
        </span>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-stone-900 sm:text-6xl">
          Borrow what you need.
          <br />
          <span className="text-emerald-600">Lend what you don&apos;t.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-stone-600">
          LendLoop connects neighbors who have tools with neighbors who need them, without buying something you&apos;ll use twice.
        </p>
        <div className="mt-8 flex justify-center">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-medium text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700">
                Sign in to lend or borrow <ArrowRight className="h-4 w-4" />
              </button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <Link href="/app" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-medium text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700">
              Go to your board <ArrowRight className="h-4 w-4" />
            </Link>
          </Show>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-lg font-semibold text-stone-900">Available now</h2>
          {tools && tools.length > 0 && <span className="text-sm text-stone-500">{tools.length} tools ready to borrow</span>}
        </div>
        {tools === undefined ? (
          <Loading />
        ) : tools.length === 0 ? (
          <Empty title="No tools listed yet">Be the first to lend one to your neighbors.</Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((t) => (
              <li key={t._id} className="flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm shadow-stone-900/[0.03]">
                <CategoryIcon category={t.category} />
                <div className="min-w-0">
                  <p className="truncate font-medium text-stone-900">{t.name}</p>
                  <p className="text-sm capitalize text-stone-500">{t.category}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-t border-stone-200 bg-white">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-14 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.title}>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <s.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-3 font-semibold text-stone-900">{s.title}</h3>
              <p className="mt-1 text-sm text-stone-600">{s.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
