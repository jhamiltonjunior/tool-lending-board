/// <reference types="vite/client" />
// Files with more than one dot (tests, this setup, helpers) are skipped by the
// Convex bundler, so none of this is ever deployed.
export const modules = import.meta.glob("./**/!(*.*.*)*.*s");
