import type { PaginationOptions } from "convex/server";

export const MAX_PAGE_SIZE = 100;

// The client picks the page size; the server caps it so nobody can ask for a
// 100,000-row page and force expensive reads.
export function capPage(opts: PaginationOptions): PaginationOptions {
  return { ...opts, numItems: Math.min(Math.max(1, Math.floor(opts.numItems)), MAX_PAGE_SIZE) };
}
