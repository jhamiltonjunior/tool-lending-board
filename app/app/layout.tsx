import { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import AppShell from "@/components/AppShell";

// Resource-based check: every page under /app requires a session, checked on the
// server. Data access is authorized again inside each Convex function.
export default async function AppLayout({ children }: { children: ReactNode }) {
  await auth.protect();
  return <AppShell>{children}</AppShell>;
}
