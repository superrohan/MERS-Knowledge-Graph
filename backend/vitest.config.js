import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    testTimeout: 20000,
    hookTimeout: 30000,
    // Application/user/session data now lives in a real, shared Postgres
    // database rather than a separate in-memory Map per test file, and
    // test isolation relies on a destructive, table-wide clear() between
    // tests (see applicationRepository.clear()) - running test files in
    // parallel would let one file's clear() truncate data another file
    // is mid-test with. Serial file execution keeps that safe.
    fileParallelism: false,
  },
});
