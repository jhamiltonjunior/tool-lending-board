import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const categories = [
  "power tools",
  "hand tools",
  "garden",
  "kitchen",
  "camping",
  "cleaning",
  "other",
] as const;

export const conditions = ["new", "good", "fair", "worn"] as const;

export const loanStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
);

// What a notification is about: a status change, or the borrower reporting the tool
// back (and the owner saying it is not back yet).
export const loanEvent = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
  v.literal("return_reported"),
  v.literal("return_disputed"),
);

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("user")),
    trustedLender: v.boolean(),
    // Approved loans as owner, kept up to date on approval so lists never count loans.
    timesLent: v.optional(v.number()),
    // Clerk's updated_at for the profile data stored here, so a stale session token
    // never overwrites a newer name.
    profileUpdatedAt: v.optional(v.number()),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: v.string(),
    condition: v.string(),
    description: v.string(),
    // Set while the tool is with a borrower (approved loan that has started).
    // Kept by the loan mutations and the clock, so reads never scan loans.
    activeLoanId: v.optional(v.id("loans")),
    lentUntil: v.optional(v.string()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_category", ["category"])
    .index("by_lent", ["lentUntil"])
    .searchIndex("search_name", { searchField: "name", filterFields: ["category"] }),

  loans: defineTable({
    toolId: v.id("tools"),
    ownerId: v.id("users"),
    borrowerId: v.id("users"),
    // ISO calendar dates (YYYY-MM-DD); no time zone ambiguity for a lending board.
    startDate: v.string(),
    endDate: v.string(),
    status: loanStatus,
    returnedAt: v.optional(v.number()),
    // The borrower says the tool is back; the owner still confirms (or disputes) it.
    returnReportedAt: v.optional(v.number()),
  })
    .index("by_tool", ["toolId"])
    .index("by_tool_status", ["toolId", "status"])
    .index("by_owner", ["ownerId"])
    .index("by_borrower", ["borrowerId"])
    .index("by_status_start", ["status", "startDate"])
    .index("by_status_end", ["status", "endDate"]),

  // One row per (loan, day): the unique idempotency key makes n8n retries safe.
  reminders: defineTable({
    loanId: v.id("loans"),
    day: v.string(),
    idempotencyKey: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    channel: v.string(),
  })
    .index("by_key", ["idempotencyKey"])
    .index("by_loan", ["loanId"]),

  // Activity shown on each loan ("Reminder sent 2 days ago"). eventKey dedupes retries.
  automationEvents: defineTable({
    loanId: v.optional(v.id("loans")),
    eventKey: v.string(),
    kind: v.union(
      v.literal("notification_sent"),
      v.literal("notification_failed"),
      v.literal("reminder_sent"),
      v.literal("reminder_failed"),
      v.literal("workflow_error"),
    ),
    detail: v.string(),
    // For notification_failed: the outbox row an admin can resend.
    outboxId: v.optional(v.id("outbox")),
  })
    .index("by_key", ["eventKey"])
    .index("by_loan", ["loanId"])
    .index("by_kind", ["kind"]),

  // Transactional outbox: a loan event is written in the same transaction as the
  // status change and stays here until n8n accepts it, so restarts and deploys
  // never lose a notification (delivery is at least once).
  outbox: defineTable({
    loanId: v.id("loans"),
    recipientId: v.id("users"),
    status: loanEvent,
    eventKey: v.string(),
    state: v.union(v.literal("pending"), v.literal("delivered"), v.literal("dead"), v.literal("dropped")),
    attempts: v.number(),
    // Due time for the next attempt; while an attempt runs it doubles as a lease.
    nextAttemptAt: v.number(),
    // Start of the current delivery window (reset by an admin resend).
    since: v.number(),
    lastError: v.optional(v.string()),
    deliveredAt: v.optional(v.number()),
  }).index("by_state_next", ["state", "nextAttemptAt"]),

  // Singletons, one row each, looked up by key:
  //   "today"    the current UTC day; queries read it so they refresh when the day changes
  //   "board"    counters for the board and admin headers
  //   "delivery" circuit breaker for the n8n webhook
  singletons: defineTable({
    key: v.string(),
    today: v.optional(v.string()),
    users: v.optional(v.number()),
    lentOut: v.optional(v.number()),
    toolsByCategory: v.optional(v.record(v.string(), v.number())),
    n8nDown: v.optional(v.boolean()),
    n8nDownSince: v.optional(v.number()),
  }).index("by_key", ["key"]),
});
