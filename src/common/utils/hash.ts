import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';

// OWASP minimum recommended argon2id parameters (~19 MiB memory) — chosen to
// keep per-login memory/CPU cost low on resource-constrained servers while
// staying within OWASP's safe range against GPU/ASIC cracking.
const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}

// Refresh tokens are high-entropy random JWTs, not low-entropy user secrets,
// so a fast SHA-256 digest (rather than argon2) is the appropriate way to
// store them non-reversibly for lookup/revocation without brute-force risk.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
