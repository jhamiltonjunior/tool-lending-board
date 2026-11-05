// Convex validates Clerk-issued JWTs (template "convex") against this issuer.
// CLERK_JWT_ISSUER_DOMAIN is set in the Convex deployment environment, never in code.
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
};
