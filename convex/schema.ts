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

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("user")),
    trustedLender: v.boolean(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: v.string(),
    condition: v.string(),
    description: v.string(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_category", ["category"]),

  loans: defineTable({
    toolId: v.id("tools"),
    ownerId: v.id("users"),
    borrowerId: v.id("users"),
    // ISO calendar dates (YYYY-MM-DD); no time zone ambiguity for a lending board.
    startDate: v.string(),
    endDate: v.string(),
    status: loanStatus,
    returnedAt: v.optional(v.number()),
  })
    .index("by_tool", ["toolId"])
    .index("by_owner", ["ownerId"])
    .index("by_borrower", ["borrowerId"])
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
  })
    .index("by_key", ["eventKey"])
    .index("by_loan", ["loanId"]),
});
