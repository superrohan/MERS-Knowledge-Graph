import { AppError } from "../middleware/errorHandler.js";
import { env } from "../config/env.js";
import { sessionRepository } from "../repositories/session.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { generateSessionToken, hashToken } from "../utils/token.js";
import { requireString } from "../utils/validation.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function toPublicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

/**
 * Real (not mocked) authentication: register/login with an email +
 * password, backed by a Postgres-persisted user record and a
 * server-side session (see repositories/user.repository.js,
 * session.repository.js). A password is only ever handled long enough
 * to hash or verify it (utils/password.js); a session token is only
 * ever persisted as its SHA-256 hash (utils/token.js) - the same
 * "never store the raw secret" rule applied consistently.
 */
export class AuthService {
  constructor({ users = userRepository, sessions = sessionRepository } = {}) {
    this.users = users;
    this.sessions = sessions;
  }

  async register({ name, email, password }) {
    const cleanName = requireString(name, "Name");
    const cleanEmail = requireString(email, "Email").toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) {
      throw new AppError(400, "VALIDATION_ERROR", "Enter a valid email address.");
    }
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      throw new AppError(400, "VALIDATION_ERROR", `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }

    const existing = await this.users.findByEmail(cleanEmail);
    if (existing) {
      throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists.");
    }

    const passwordHash = await hashPassword(password);
    const user = await this.users.create({ name: cleanName, email: cleanEmail, passwordHash });
    return this._createSession(user);
  }

  async login({ email, password }) {
    const cleanEmail = requireString(email, "Email").toLowerCase();
    requireString(password, "Password");

    const user = await this.users.findByEmail(cleanEmail);
    // Always run verifyPassword, even against a placeholder hash when no
    // account exists, so a login attempt for an unknown email takes
    // roughly the same time as one for a known email with a wrong
    // password - this doesn't need to be perfect, just not a trivial
    // email-enumeration timing oracle.
    const passwordOk = await verifyPassword(password, user?.passwordHash ?? "0".repeat(32) + ":" + "0".repeat(128));
    if (!user || !passwordOk) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Incorrect email or password.");
    }
    return this._createSession(user);
  }

  async logout(token) {
    if (!token) return;
    await this.sessions.deleteByTokenHash(hashToken(token));
  }

  /** Resolves a bearer token to its user, or undefined if the token is
   * missing, unknown, or expired (an expired session is deleted on
   * first use, not left to linger). */
  async getSessionUser(token) {
    if (!token) return undefined;
    const session = await this.sessions.findByTokenHash(hashToken(token));
    if (!session) return undefined;
    if (session.expiresAt.getTime() < Date.now()) {
      await this.sessions.deleteByTokenHash(session.tokenHash);
      return undefined;
    }
    return this.users.findById(session.userId);
  }

  async _createSession(user) {
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + env.sessionTtlMs);
    await this.sessions.create(hashToken(token), user.id, expiresAt);
    return { token, user: toPublicUser(user) };
  }
}

export const authService = new AuthService();
