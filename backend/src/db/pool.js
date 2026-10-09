import pg from "pg";

import { env } from "../config/env.js";

/**
 * Node's own connection to the shared Postgres instance - the platform
 * tables only (users/sessions/applications/repositories, all app_*
 * prefixed). Never used to touch the Python service's code-intelligence
 * tables; that data is only ever reachable through the internal HTTP API.
 */
export const pool = new pg.Pool({ connectionString: env.databaseUrl });

pool.on("error", (err) => {
  // A idle client emitting a background error (e.g. the connection was
  // dropped) must not crash the whole process - the pool replaces it on
  // the next checkout.
  console.error("Unexpected Postgres pool error:", err);
});
