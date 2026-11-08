import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Outbox worker: retries notifications that are due, including attempts that died
// during a deploy or restart (their lease simply runs out).
crons.interval("deliver pending notifications", { minutes: 1 }, internal.notifications.dispatchDue, {});

// Advances the stored day and hands tools to borrowers whose loan starts today.
crons.interval("advance the board clock", { minutes: 10 }, internal.clock.tick, {});

export default crons;
