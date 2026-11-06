"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import { Accordion, Button, Caption, label, ToolGlyph } from "@/components/ui";
import { PEG_HOLES } from "@/components/pegboard";

const STEPS = [
  { title: "List what you own", text: "A drill, a ladder, a tent. Say what condition it's in and what comes with it." },
  { title: "Ask for the days you need", text: "Pick a start and an end date. The owner approves or declines." },
  { title: "Bring it back", text: "If a return runs late, the borrower gets a reminder that day. Nobody has to chase anyone." },
];

const FAQ = [
  {
    q: "Do I pay anything to borrow?",
    a: "No. Borrowing is free between neighbors. Owners lend because a drill that sits in a box all year is a drill nobody uses.",
  },
  {
    q: "Who can see the tools I list?",
    a: "Neighbors who sign in see the whole board. This page only shows what is free right now, without names.",
  },
  {
    q: "What happens if I return something late?",
    a: "The request shows as late for both of you, and you get a reminder once a day until the tool is marked as returned.",
  },
  {
    q: "Can I say no to a request?",
    a: "Yes. Every request waits for the owner. Decline it and the borrower is told right away.",
  },
  {
    q: "What does Trusted Lender mean?",
    a: "Admins mark neighbors who lend often and keep their tools in good shape. The label shows next to their name on the board.",
  },
];

function OpenBoard({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <>
      <Show when="signed-out">
        <SignInButton mode="modal" forceRedirectUrl="/app">
          <button type="button" className={`ll-btn ll-btn-primary ${size !== "md" ? `ll-btn-${size}` : ""}`}>Open the board</button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <Button href="/app" variant="primary" size={size}>Open the board</Button>
      </Show>
    </>
  );
}

function Pegboard() {
  return (
    <svg className="absolute left-0 top-0" viewBox="0 0 560 340" width={560} height={340} aria-hidden="true">
      <g style={{ fill: "var(--ink-muted)" }}>
        {PEG_HOLES.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={2.6} />)}
      </g>
      <rect x={262} y={40} width={120} height={84} rx={16} fill="none" stroke="var(--line-strong)" strokeWidth={1.5} strokeDasharray="6 5" />
    </svg>
  );
}

export default function Home() {
  const tools = useQuery(api.tools.publicList);
  const featured = tools?.slice(0, 4) ?? [];

  return (
    <>
      <header className="ll-nav">
        <Link href="/" className="ll-wordmark">LendLoop</Link>
        <nav aria-label="Main">
          <ul className="ll-nav-links">
            <li><a className="ll-nav-link" href="#board">The board</a></li>
            <li><a className="ll-nav-link" href="#how">How it works</a></li>
            <li><a className="ll-nav-link" href="#questions">Questions</a></li>
          </ul>
        </nav>
        <div className="ll-nav-end">
          <Show when="signed-in"><UserButton /></Show>
          <Show when="signed-out">
            <SignInButton mode="modal" forceRedirectUrl="/app">
              <button type="button" className="ll-btn ll-btn-quiet ll-btn-sm">Sign in</button>
            </SignInButton>
          </Show>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-[1104px] px-8 pt-[120px] text-center max-[720px]:px-4 max-[720px]:pt-16">
          <h1 className="ll-display mx-auto max-w-[12.5em]">Borrow the drill your neighbor already owns.</h1>
          <p className="ll-lede mx-auto" style={{ marginTop: "var(--space-6)", maxWidth: "28em" }}>
            LendLoop is the list of tools on your street. Ask for the days you need, pick it up, bring it back.
          </p>
          <div className="mt-8"><OpenBoard size="lg" /></div>
        </section>

        <div className="ll-page">
          <section id="board" className="scroll-mt-8 pt-32 max-[720px]:pt-16">
            <div className="mb-16 flex items-center justify-between gap-4 max-[720px]:mb-8">
              <h2 className="ll-section-title">On the board this week.</h2>
              {tools && tools.length > featured.length && (
                <span className="ll-small ll-tabular">{tools.length} free right now</span>
              )}
            </div>
            {tools === undefined ? (
              <p className="ll-small">Loading…</p>
            ) : featured.length === 0 ? (
              <p className="ll-caption"><strong>Nothing free right now.</strong> Everything on the board is lent out. Check back in a few days.</p>
            ) : (
              <div className="ll-cards">
                {featured.map((t) => (
                  <figure key={t._id} className="ll-card">
                    <div className="ll-card-art"><ToolGlyph category={t.category} size={44} /></div>
                    <Caption as="figcaption" title={t.name} rest={`${label(t.category)}, free now.`} />
                  </figure>
                ))}
              </div>
            )}
          </section>

          <section id="how" className="scroll-mt-8 pt-32 max-[720px]:pt-16">
            <h2 className="ll-section-title mb-16 max-[720px]:mb-8">How it works.</h2>
            <ol className="m-0 grid list-none gap-8 p-0 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <p className="ll-small ll-tabular m-0">0{i + 1}</p>
                  <h3 className="ll-heading mt-2">{s.title}.</h3>
                  <p className="ll-caption mt-2">{s.text}</p>
                </li>
              ))}
            </ol>
          </section>

          <section id="questions" className="grid scroll-mt-8 items-start gap-8 pt-32 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] max-[720px]:pt-16">
            <h2 className="ll-section-title">Questions.</h2>
            <Accordion items={FAQ} />
          </section>

          <section className="relative mt-32 grid h-[340px] place-items-center overflow-hidden rounded-[var(--radius-lg)] bg-[var(--panel)] max-[720px]:mt-16">
            <Pegboard />
            <div className="relative"><OpenBoard size="lg" /></div>
          </section>
        </div>
      </main>

      <footer className="ll-page flex flex-wrap items-start justify-between gap-6 py-16">
        <span className="ll-wordmark">LendLoop</span>
        <p className="ll-small m-0 max-w-[18em] text-right max-[720px]:text-left">
          Made for neighbors who would rather borrow than buy.
        </p>
      </footer>
    </>
  );
}
