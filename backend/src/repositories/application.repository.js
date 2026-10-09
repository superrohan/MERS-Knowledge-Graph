import { pool } from "../db/pool.js";
import { decryptSecret, encryptSecret } from "../utils/crypto.js";

/**
 * Postgres-backed Application storage (app_applications +
 * app_repositories), scoped by tenant.
 *
 * Every application belongs to a tenant (spec §50: repository
 * isolation); every read/write takes tenantId so scoping is enforced
 * here, not bolted on later. A repository's GitLab access token is
 * encrypted (see utils/crypto.js) before the INSERT and decrypted right
 * back on the way out - nothing above this class ever sees ciphertext,
 * and nothing below it ever receives or stores plaintext.
 */
function rowToApplication(appRow, repoRows) {
  return {
    id: appRow.id,
    tenantId: appRow.tenant_id,
    ownerId: appRow.owner_id,
    name: appRow.name,
    aaNumber: appRow.aa_number,
    status: appRow.status,
    stats: appRow.stats,
    lastIndexedAt: appRow.last_indexed_at ? appRow.last_indexed_at.toISOString() : null,
    lastIndexedCommits: appRow.last_indexed_commits,
    activeJobId: appRow.active_job_id,
    createdAt: appRow.created_at.toISOString(),
    updatedAt: appRow.updated_at.toISOString(),
    repositories: repoRows.map((r) => ({
      id: r.id,
      name: r.name,
      repoKey: r.repo_key,
      repositoryUrl: r.repository_url,
      branch: r.branch,
      isPrivate: r.is_private,
      accessToken: r.encrypted_access_token ? decryptSecret(r.encrypted_access_token) : null,
    })),
  };
}

export class ApplicationRepository {
  async create(app) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO app_applications
            (id, tenant_id, owner_id, name, aa_number, status, stats, last_indexed_at,
             last_indexed_commits, active_job_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          app.id,
          app.tenantId,
          app.ownerId,
          app.name,
          app.aaNumber,
          app.status,
          JSON.stringify(app.stats),
          app.lastIndexedAt,
          JSON.stringify(app.lastIndexedCommits),
          app.activeJobId,
          app.createdAt,
          app.updatedAt,
        ],
      );
      for (const [index, repo] of app.repositories.entries()) {
        await client.query(
          `INSERT INTO app_repositories
              (id, application_id, repo_key, name, repository_url, branch, is_private,
               encrypted_access_token, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            repo.id,
            app.id,
            repo.repoKey,
            repo.name,
            repo.repositoryUrl,
            repo.branch,
            repo.isPrivate,
            repo.accessToken ? encryptSecret(repo.accessToken) : null,
            index,
          ],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    return app;
  }

  async findById(id, tenantId) {
    const { rows: appRows } = await pool.query("SELECT * FROM app_applications WHERE id = $1 AND tenant_id = $2", [
      id,
      tenantId,
    ]);
    if (appRows.length === 0) return undefined;
    const { rows: repoRows } = await pool.query(
      "SELECT * FROM app_repositories WHERE application_id = $1 ORDER BY position",
      [id],
    );
    return rowToApplication(appRows[0], repoRows);
  }

  async listByTenant(tenantId) {
    const { rows: appRows } = await pool.query(
      "SELECT * FROM app_applications WHERE tenant_id = $1 ORDER BY seq DESC",
      [tenantId],
    );
    if (appRows.length === 0) return [];
    const { rows: repoRows } = await pool.query(
      "SELECT * FROM app_repositories WHERE application_id = ANY($1) ORDER BY position",
      [appRows.map((r) => r.id)],
    );
    const repoRowsByAppId = new Map();
    for (const row of repoRows) {
      const list = repoRowsByAppId.get(row.application_id) ?? [];
      list.push(row);
      repoRowsByAppId.set(row.application_id, list);
    }
    return appRows.map((appRow) => rowToApplication(appRow, repoRowsByAppId.get(appRow.id) ?? []));
  }

  /** Only ever patches top-level application fields (status, stats,
   * lastIndexedAt/Commits, activeJobId) - a repository's own row (URL,
   * branch, access token) is written once at creation and never
   * updated, so it's simply reused unchanged on every re-index. */
  async update(id, tenantId, patch) {
    const existing = await this.findById(id, tenantId);
    if (!existing) return undefined;
    const merged = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    await pool.query(
      `UPDATE app_applications
          SET name = $1, aa_number = $2, status = $3, stats = $4, last_indexed_at = $5,
              last_indexed_commits = $6, active_job_id = $7, updated_at = $8
        WHERE id = $9 AND tenant_id = $10`,
      [
        merged.name,
        merged.aaNumber,
        merged.status,
        JSON.stringify(merged.stats),
        merged.lastIndexedAt,
        JSON.stringify(merged.lastIndexedCommits),
        merged.activeJobId,
        merged.updatedAt,
        id,
        tenantId,
      ],
    );
    return merged;
  }

  async delete(id, tenantId) {
    const { rowCount } = await pool.query("DELETE FROM app_applications WHERE id = $1 AND tenant_id = $2", [
      id,
      tenantId,
    ]);
    return rowCount > 0;
  }

  /** Dev/test only - never called from application request handling. */
  async clear() {
    await pool.query("TRUNCATE app_applications CASCADE");
  }
}

export const applicationRepository = new ApplicationRepository();
