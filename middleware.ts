import { clerkMiddleware } from "@clerk/nextjs/server";

// Only makes the Clerk session available to server code. Access checks live in
// app/app/layout.tsx (pages) and in every Convex function (data).
export default clerkMiddleware();

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
