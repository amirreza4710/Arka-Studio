import crypto from 'crypto';
import fs from 'fs';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import {
  ARKA_SYSTEM_INSTRUCTION,
  ArkaBrandProfile,
  ArkaOrgRole,
  ArkaOrganizationMember,
  CANONICAL_ARKA_ORG_ID,
  ClassifiedAiError,
  DEFAULT_ARKA_BRAND_PROFILE,
  GEMINI_MODEL_CAPABILITY_REGISTRY,
  GeminiRouterModelId,
  resolveSmartModelForTask,
  validateArkaInternalUrl,
  validateModelCapabilityForTask,
} from './src/config/arkaCore';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read public Firebase Web API key for REST ID token verification (accounts:lookup)
let firebaseWebApiKey = '';
try {
  const fbConfigPath = path.join(__dirname, 'firebase-applet-config.json');
  const fbConfig = JSON.parse(fs.readFileSync(fbConfigPath, 'utf8'));
  firebaseWebApiKey = String(fbConfig?.apiKey || '').trim();
} catch {
  firebaseWebApiKey = '';
}

export interface VerifiedFirebaseUser {
  uid: string;
  email?: string;
  emailVerified?: boolean;
}

const ADMIN_OWNER_EMAIL = String(
  process.env.ARKA_ADMIN_EMAIL || 'amirrezaahmadynezhad@gmail.com'
)
  .trim()
  .toLowerCase();

export function isVerifiedAdminUser(
  user: VerifiedFirebaseUser | null | undefined
): boolean {
  if (!user) return false;
  if (user.emailVerified === false) return false;
  if (process.env.ALLOW_ALL_AUTHENTICATED_SERVER_KEY === 'true') return true;
  return Boolean(
    user.email && user.email.trim().toLowerCase() === ADMIN_OWNER_EMAIL
  );
}

function extractBearerToken(req: express.Request): string {
  const authHeader = String(req.headers.authorization || '').trim();
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return '';
  }
  return authHeader.slice(7).trim();
}

// Optional test-mode token verifier hook for automated security verification tests
let customTokenVerifierForTests:
  | ((token: string) => Promise<VerifiedFirebaseUser | null>)
  | null = null;

export function setTokenVerifierForTests(
  fn: ((token: string) => Promise<VerifiedFirebaseUser | null>) | null
) {
  customTokenVerifierForTests = fn;
}

export async function verifyFirebaseIdToken(
  idToken: string
): Promise<VerifiedFirebaseUser | null> {
  const token = String(idToken || '').trim();
  if (!token || token.length > 8192) {
    return null;
  }

  if (customTokenVerifierForTests) {
    return customTokenVerifierForTests(token);
  }

  if (!firebaseWebApiKey) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(
        firebaseWebApiKey
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
        signal: controller.signal,
      }
    );
    clearTimeout(timer);

    if (!resp.ok) {
      return null;
    }

    const data = (await resp.json()) as {
      users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
    };
    const user = Array.isArray(data?.users) ? data.users[0] : null;
    if (!user?.localId) {
      return null;
    }

    return {
      uid: String(user.localId),
      email: user.email ? String(user.email) : undefined,
      emailVerified:
        typeof user.emailVerified === 'boolean' ? user.emailVerified : true,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// SERVER-SIDE AES-256-GCM ENCRYPTED BYOK VAULT (MULTI-USER ISOLATED BY UID)
// ============================================================================

export const CURRENT_ENCRYPTION_VERSION = 2;

export interface EncryptedVaultRecord {
  uid: string;
  encryptionVersion?: number;
  ivHex: string;
  authTagHex: string;
  ciphertextHex: string;
  maskedKey: string;
  provider: 'gemini';
  models: string[];
  hasPro: boolean;
  hasFlash: boolean;
  updatedAt: string;
}

const VAULT_DIR = path.join(__dirname, '.data');
const VAULT_FILE_PATH = path.join(VAULT_DIR, 'byok-vault.enc.json');
const byokVaultStore = new Map<string, EncryptedVaultRecord>();

function deriveUserVaultKey(uid: string, version = CURRENT_ENCRYPTION_VERSION): Buffer {
  // Priority: ENCRYPTION_KEY (server-side secret) -> BYOK_VAULT_SECRET -> fallback
  const masterSecret =
    process.env.ENCRYPTION_KEY ||
    process.env.BYOK_VAULT_SECRET ||
    process.env.GEMINI_API_KEY ||
    firebaseWebApiKey ||
    'arka-enterprise-studio-vault-secret-v1';
  const salt =
    version >= 2 ? `arka-uid-salt:v2:${uid}` : `arka-uid-salt:${uid}`;
  return crypto.pbkdf2Sync(masterSecret, salt, 10000, 32, 'sha256');
}

export function maskApiKey(rawKey: string): string {
  const clean = String(rawKey || '').trim();
  if (clean.length <= 8) return '••••••••';
  return `${clean.slice(0, 4)}••••••••${clean.slice(-4)}`;
}

export function redactSensitiveText(input: string): string {
  const text = String(input || '');
  return text
    .replace(/AIza[0-9A-Za-z\-_]{15,}/g, '[REDACTED_GEMINI_KEY]')
    .replace(/Bearer\s+[0-9A-Za-z\-_.]+/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/ya29\.[0-9A-Za-z\-_]+/g, '[REDACTED_OAUTH_TOKEN]');
}

function loadEncryptedVaultFromDisk(): void {
  try {
    if (!fs.existsSync(VAULT_FILE_PATH)) return;
    const raw = fs.readFileSync(VAULT_FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const rec of parsed) {
        if (
          rec &&
          typeof rec.uid === 'string' &&
          typeof rec.ciphertextHex === 'string' &&
          typeof rec.ivHex === 'string' &&
          typeof rec.authTagHex === 'string'
        ) {
          byokVaultStore.set(rec.uid, rec);
        }
      }
    }
  } catch {
    // Ignore corrupt or missing vault file
  }
}

function persistEncryptedVaultToDisk(): void {
  try {
    if (!fs.existsSync(VAULT_DIR)) {
      fs.mkdirSync(VAULT_DIR, { recursive: true, mode: 0o700 });
    }
    const serialized = JSON.stringify(
      Array.from(byokVaultStore.values()),
      null,
      2
    );
    fs.writeFileSync(VAULT_FILE_PATH, serialized, {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch {
    // Ignore disk write issues in read-only environments; in-memory map remains active
  }
}

loadEncryptedVaultFromDisk();

export function storeEncryptedUserApiKey(params: {
  uid: string;
  rawApiKey: string;
  models: string[];
  hasPro: boolean;
  hasFlash: boolean;
}): Omit<EncryptedVaultRecord, 'ivHex' | 'authTagHex' | 'ciphertextHex'> {
  const uid = String(params.uid || '').trim();
  const cleanKey = String(params.rawApiKey || '').trim();
  if (!uid || !cleanKey) {
    throw new Error('شناسه کاربر و کلید API برای رمزنگاری الزامی است.');
  }

  const version = CURRENT_ENCRYPTION_VERSION;
  const keyBuf = deriveUserVaultKey(uid, version);
  // Unique 96-bit cryptographic nonce per encryption operation
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
  // Bind UID and encryption version as Additional Authenticated Data (AAD)
  cipher.setAAD(Buffer.from(`arka-uid:${uid}:v${version}`, 'utf8'));

  const encrypted = Buffer.concat([
    cipher.update(cleanKey, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const updatedAt = new Intl.DateTimeFormat('fa-IR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date());

  const record: EncryptedVaultRecord = {
    uid,
    encryptionVersion: version,
    ivHex: iv.toString('hex'),
    authTagHex: authTag.toString('hex'),
    ciphertextHex: encrypted.toString('hex'),
    maskedKey: maskApiKey(cleanKey),
    provider: 'gemini',
    models: params.models,
    hasPro: params.hasPro,
    hasFlash: params.hasFlash,
    updatedAt,
  };

  byokVaultStore.set(uid, record);
  persistEncryptedVaultToDisk();

  return {
    uid: record.uid,
    encryptionVersion: record.encryptionVersion,
    maskedKey: record.maskedKey,
    provider: record.provider,
    models: record.models,
    hasPro: record.hasPro,
    hasFlash: record.hasFlash,
    updatedAt: record.updatedAt,
  };
}

// Helper for testing backward-compatible decryption of legacy v1 vault records
export function storeLegacyV1EncryptedUserApiKeyForTests(params: {
  uid: string;
  rawApiKey: string;
}): void {
  const uid = String(params.uid || '').trim();
  const cleanKey = String(params.rawApiKey || '').trim();
  const keyBuf = deriveUserVaultKey(uid, 1);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
  cipher.setAAD(Buffer.from(`arka-uid:${uid}`, 'utf8'));
  const encrypted = Buffer.concat([
    cipher.update(cleanKey, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  byokVaultStore.set(uid, {
    uid,
    encryptionVersion: 1,
    ivHex: iv.toString('hex'),
    authTagHex: authTag.toString('hex'),
    ciphertextHex: encrypted.toString('hex'),
    maskedKey: maskApiKey(cleanKey),
    provider: 'gemini',
    models: ['gemini-2.5-flash'],
    hasPro: false,
    hasFlash: true,
    updatedAt: 'Legacy-v1',
  });
}

export function decryptUserApiKeyForUid(uid: string): string | null {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) return null;
  const record = byokVaultStore.get(cleanUid);
  if (!record || record.uid !== cleanUid) return null;

  const recVersion = record.encryptionVersion || 1;

  try {
    const keyBuf = deriveUserVaultKey(cleanUid, recVersion);
    const iv = Buffer.from(record.ivHex, 'hex');
    const authTag = Buffer.from(record.authTagHex, 'hex');
    const ciphertext = Buffer.from(record.ciphertextHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, iv);
    const aadString =
      recVersion >= 2
        ? `arka-uid:${cleanUid}:v${recVersion}`
        : `arka-uid:${cleanUid}`;
    decipher.setAAD(Buffer.from(aadString, 'utf8'));
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export function getUserVaultMetadata(uid: string): Omit<
  EncryptedVaultRecord,
  'ivHex' | 'authTagHex' | 'ciphertextHex'
> | null {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) return null;
  const rec = byokVaultStore.get(cleanUid);
  if (!rec || rec.uid !== cleanUid) return null;
  return {
    uid: rec.uid,
    encryptionVersion: rec.encryptionVersion || 1,
    maskedKey: rec.maskedKey,
    provider: rec.provider,
    models: rec.models,
    hasPro: rec.hasPro,
    hasFlash: rec.hasFlash,
    updatedAt: rec.updatedAt,
  };
}

export function deleteUserApiKeyFromVault(uid: string): boolean {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) return false;
  const existed = byokVaultStore.delete(cleanUid);
  if (existed) {
    persistEncryptedVaultToDisk();
  }
  return existed;
}

// ============================================================================
// CANONICAL ORGANIZATION (arka_org) RBAC & VERSIONED BRAND PROFILE STORE
// ============================================================================

const ORG_BRAND_FILE_PATH = path.join(VAULT_DIR, 'arka-org-brand.json');
const orgMembersStore = new Map<string, ArkaOrgRole>();

let canonicalOrgBrandProfile: ArkaBrandProfile = {
  ...DEFAULT_ARKA_BRAND_PROFILE,
  orgId: CANONICAL_ARKA_ORG_ID,
  version: 1,
  updatedAt: 'نسخه پایه سازمانی آرکا',
  updatedByEmail: ADMIN_OWNER_EMAIL,
};

function loadCanonicalOrgBrandFromDisk(): void {
  try {
    if (!fs.existsSync(ORG_BRAND_FILE_PATH)) return;
    const raw = fs.readFileSync(ORG_BRAND_FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.brandName) {
      canonicalOrgBrandProfile = {
        ...DEFAULT_ARKA_BRAND_PROFILE,
        ...parsed,
        orgId: CANONICAL_ARKA_ORG_ID,
        version: Math.max(1, Number(parsed.version || 1)),
      };
    }
  } catch {
    // Ignore disk read error
  }
}

function persistCanonicalOrgBrandToDisk(): void {
  try {
    if (!fs.existsSync(VAULT_DIR)) {
      fs.mkdirSync(VAULT_DIR, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(
      ORG_BRAND_FILE_PATH,
      JSON.stringify(canonicalOrgBrandProfile, null, 2),
      { encoding: 'utf8', mode: 0o600 }
    );
  } catch {
    // Ignore disk write error in read-only environments
  }
}

loadCanonicalOrgBrandFromDisk();

export function assignOrgMemberRoleForTests(
  uid: string,
  role: ArkaOrgRole | null
): void {
  if (!role) {
    orgMembersStore.delete(uid);
  } else {
    orgMembersStore.set(uid, role);
  }
}

export function resolveOrgMembershipForUser(
  user: VerifiedFirebaseUser | null | undefined
): ArkaOrganizationMember | null {
  if (!user || !user.uid || user.emailVerified === false) {
    return null;
  }
  if (isVerifiedAdminUser(user)) {
    return {
      uid: user.uid,
      email: user.email || ADMIN_OWNER_EMAIL,
      role: 'owner',
      orgId: CANONICAL_ARKA_ORG_ID,
      canEditBrandProfile: true,
    };
  }
  const assignedRole = orgMembersStore.get(user.uid) || 'viewer';
  return {
    uid: user.uid,
    email: user.email || 'user@arka-acc.ir',
    role: assignedRole,
    orgId: CANONICAL_ARKA_ORG_ID,
    canEditBrandProfile: ['owner', 'admin', 'editor'].includes(assignedRole),
  };
}

export function getCanonicalOrgBrandProfile(): ArkaBrandProfile {
  return { ...canonicalOrgBrandProfile, orgId: CANONICAL_ARKA_ORG_ID };
}

export function updateCanonicalOrgBrandProfile(params: {
  user: VerifiedFirebaseUser | null | undefined;
  requestedOrgId?: string;
  profilePatch: Partial<ArkaBrandProfile>;
}):
  | { ok: true; profile: ArkaBrandProfile; membership: ArkaOrganizationMember }
  | { ok: false; classifiedError: ClassifiedAiError } {
  const reqOrg = String(
    params.requestedOrgId || CANONICAL_ARKA_ORG_ID
  ).trim();
  if (reqOrg !== CANONICAL_ARKA_ORG_ID) {
    return {
      ok: false,
      classifiedError: {
        errorCode: 'PERMISSION_DENIED',
        httpStatus: 403,
        messageFa: `سازمان درخواستی («${reqOrg}») مجاز نیست. استودیو آرکا منحصراً روی سازمان رسمی «${CANONICAL_ARKA_ORG_ID}» فعال است.`,
        technicalReason: 'UNAUTHORIZED_ORGANIZATION_ID',
        retryable: false,
        canFallbackToFlash: false,
        suggestedFallbackModel: null,
      },
    };
  }

  if (!params.user) {
    return {
      ok: false,
      classifiedError: {
        errorCode: 'AUTH_REQUIRED',
        httpStatus: 401,
        messageFa:
          'برای ویرایش پروفایل رسمی برند سازمان آرکا (arka_org)، ابتدا باید وارد حساب کاربری تاییدشده خود شوید.',
        technicalReason: 'UNAUTHENTICATED_BRAND_UPDATE',
        retryable: false,
        canFallbackToFlash: false,
        suggestedFallbackModel: null,
      },
    };
  }

  const membership = resolveOrgMembershipForUser(params.user);
  if (!membership || !membership.canEditBrandProfile) {
    return {
      ok: false,
      classifiedError: {
        errorCode: 'PERMISSION_DENIED',
        httpStatus: 403,
        messageFa:
          'شما مجوز ویرایش پروفایل رسمی هوش برند سازمان آرکا (arka_org) را ندارید (نقش شما: مشاهده‌گر / Viewer). تنظیمات شخصی شما هرگز هویت رسمی سازمان را بازنویسی نمی‌کند.',
        technicalReason: 'INSUFFICIENT_ORG_ROLE',
        retryable: false,
        canFallbackToFlash: false,
        suggestedFallbackModel: null,
      },
    };
  }

  const nextVersion = Math.max(1, Number(canonicalOrgBrandProfile.version || 1) + 1);
  const nowLabel = new Intl.DateTimeFormat('fa-IR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());

  const cleanPatch = params.profilePatch || {};
  canonicalOrgBrandProfile = {
    ...canonicalOrgBrandProfile,
    brandName: String(cleanPatch.brandName || canonicalOrgBrandProfile.brandName).slice(0, 200),
    tagline: String(cleanPatch.tagline || canonicalOrgBrandProfile.tagline).slice(0, 300),
    websiteUrl: String(cleanPatch.websiteUrl || canonicalOrgBrandProfile.websiteUrl).slice(0, 200),
    demoUrl: String(cleanPatch.demoUrl || canonicalOrgBrandProfile.demoUrl).slice(0, 200),
    taxLandingUrl: String(cleanPatch.taxLandingUrl || canonicalOrgBrandProfile.taxLandingUrl).slice(0, 200),
    phone: String(cleanPatch.phone || canonicalOrgBrandProfile.phone).slice(0, 60),
    headquarters: String(cleanPatch.headquarters || canonicalOrgBrandProfile.headquarters).slice(0, 300),
    coreValueProposition: String(cleanPatch.coreValueProposition || canonicalOrgBrandProfile.coreValueProposition).slice(0, 1500),
    targetAudienceSegments: String(cleanPatch.targetAudienceSegments || canonicalOrgBrandProfile.targetAudienceSegments).slice(0, 1500),
    toneOfVoice: String(cleanPatch.toneOfVoice || canonicalOrgBrandProfile.toneOfVoice).slice(0, 800),
    visualIdentityNotes: String(cleanPatch.visualIdentityNotes || canonicalOrgBrandProfile.visualIdentityNotes).slice(0, 800),
    competitivePositioning: String(cleanPatch.competitivePositioning || canonicalOrgBrandProfile.competitivePositioning).slice(0, 1500),
    marketingObjectives: String(cleanPatch.marketingObjectives || canonicalOrgBrandProfile.marketingObjectives).slice(0, 1500),
    focusKeywords: String(cleanPatch.focusKeywords || canonicalOrgBrandProfile.focusKeywords).slice(0, 1000),
    internalLinkPillars: String(cleanPatch.internalLinkPillars || canonicalOrgBrandProfile.internalLinkPillars).slice(0, 1000),
    approvedClaims: String(cleanPatch.approvedClaims || canonicalOrgBrandProfile.approvedClaims || '').slice(0, 1500),
    systemsCatalogSummary: String(cleanPatch.systemsCatalogSummary || canonicalOrgBrandProfile.systemsCatalogSummary || '').slice(0, 1500),
    orgId: CANONICAL_ARKA_ORG_ID,
    version: nextVersion,
    updatedAt: nowLabel,
    updatedByEmail: membership.email,
  };

  persistCanonicalOrgBrandToDisk();
  return {
    ok: true,
    profile: { ...canonicalOrgBrandProfile },
    membership,
  };
}

// ============================================================================
// SAFE METADATA AUDIT LOGGER (ZERO SECRETS / ZERO CREDENTIALS LOGGED)
// ============================================================================

export interface SafeAiAuditLogEntry {
  id: string;
  timestamp: string;
  uid: string;
  organizationId: typeof CANONICAL_ARKA_ORG_ID;
  credentialSource: string;
  model: string;
  operation: string;
  outcome: 'success' | 'error';
  errorCategory?: string;
  latencyMs: number;
}

const safeAiAuditLogs: SafeAiAuditLogEntry[] = [];

export function recordSafeAiAuditLog(
  entry: Omit<SafeAiAuditLogEntry, 'id' | 'timestamp' | 'organizationId'>
): SafeAiAuditLogEntry {
  const safeItem: SafeAiAuditLogEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    uid: redactSensitiveText(entry.uid || 'anonymous'),
    organizationId: CANONICAL_ARKA_ORG_ID,
    credentialSource: redactSensitiveText(entry.credentialSource),
    model: redactSensitiveText(entry.model),
    operation: redactSensitiveText(entry.operation),
    outcome: entry.outcome,
    errorCategory: entry.errorCategory
      ? redactSensitiveText(entry.errorCategory)
      : undefined,
    latencyMs: Math.max(0, Number(entry.latencyMs || 0)),
  };
  safeAiAuditLogs.unshift(safeItem);
  if (safeAiAuditLogs.length > 100) {
    safeAiAuditLogs.length = 100;
  }
  return safeItem;
}

export function getSafeAiAuditLogs(uidFilter?: string | null): SafeAiAuditLogEntry[] {
  if (!uidFilter) return safeAiAuditLogs.slice(0, 20);
  return safeAiAuditLogs.filter((l) => l.uid === uidFilter).slice(0, 20);
}

// ============================================================================
// SLIDING-WINDOW IN-MEMORY RATE LIMITER
// ============================================================================

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export const rateLimitStore = new Map<string, RateLimitBucket>();

const rateLimitCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitStore.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 60 * 1000);
rateLimitCleanupTimer.unref?.();

function getClientIp(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).split(',')[0].trim();
  }
  return String(req.ip || req.socket?.remoteAddress || 'unknown');
}

export function checkRateLimit(params: {
  endpoint: string;
  userId?: string | null;
  ip: string;
  limit: number;
  windowMs?: number;
}): { allowed: boolean; retryAfterSeconds: number; remaining: number } {
  const now = Date.now();
  const windowMs = params.windowMs ?? 60 * 1000;
  const actorKey = params.userId ? `uid:${params.userId}` : `ip:${params.ip}`;
  const bucketKey = `${params.endpoint}:${actorKey}`;

  if (rateLimitStore.size > 10000 && !rateLimitStore.has(bucketKey)) {
    for (const [k, b] of rateLimitStore.entries()) {
      if (b.resetAt <= now) rateLimitStore.delete(k);
    }
    if (rateLimitStore.size > 10000) {
      const oldestKey = rateLimitStore.keys().next().value;
      if (oldestKey) rateLimitStore.delete(oldestKey);
    }
  }

  const existing = rateLimitStore.get(bucketKey);
  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(bucketKey, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Math.max(0, params.limit - 1),
    };
  }

  if (existing.count >= params.limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((existing.resetAt - now) / 1000)
    );
    return {
      allowed: false,
      retryAfterSeconds,
      remaining: 0,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    retryAfterSeconds: 0,
    remaining: Math.max(0, params.limit - existing.count),
  };
}

const MAX_PROMPT_LENGTH = 4000;
const MAX_TEXT_FIELD_LENGTH = 4000;
const MAX_BRAND_SUMMARY_LENGTH = 8000;
const MAX_SHORT_FIELD_LENGTH = 120;
const MAX_API_KEY_LENGTH = 512;

function validateTextFields(
  fields: Array<{ labelFa: string; value: unknown; maxLength: number }>
): string | null {
  for (const field of fields) {
    if (field.value === undefined || field.value === null) continue;
    if (typeof field.value !== 'string') {
      return `فرمت فیلد «${field.labelFa}» نامعتبر است و باید متنی باشد.`;
    }
    if (field.value.length > field.maxLength) {
      return `طول فیلد «${field.labelFa}» نباید بیشتر از ${field.maxLength} کاراکتر باشد.`;
    }
  }
  return null;
}

function createGeminiClientFromKey(
  rawApiKey: string,
  source: 'vault-byok' | 'custom-byok' | 'server-env'
): {
  ai: GoogleGenAI;
  keySource: 'vault-byok' | 'custom-byok' | 'server-env';
  fingerprint: string;
} {
  const apiKey = String(rawApiKey || '').trim();
  if (!apiKey) {
    throw new Error('کلید API معتبر یافت نشد.');
  }
  const digest = crypto
    .createHash('sha256')
    .update(apiKey)
    .digest('hex')
    .slice(0, 16);
  const fingerprint = `${source}:${digest}`;
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  return {
    ai,
    keySource: source,
    fingerprint,
  };
}

function resolveAuthorizedGeminiClient(params: {
  verifiedUser: VerifiedFirebaseUser | null;
  inlineCustomApiKey?: string;
  requestedConnectionMode?: string;
}):
  | {
      ok: true;
      ai: GoogleGenAI;
      keySource: 'vault-byok' | 'custom-byok' | 'server-env';
      fingerprint: string;
    }
  | {
      ok: false;
      classifiedError: ClassifiedAiError;
    } {
  const inlineKey = String(params.inlineCustomApiKey || '').trim();

  // 1. If the user is authenticated and has a stored encrypted key in their BYOK vault
  if (params.verifiedUser) {
    const vaultKey = decryptUserApiKeyForUid(params.verifiedUser.uid);
    const isAdmin = isVerifiedAdminUser(params.verifiedUser);

    if (
      vaultKey &&
      (params.requestedConnectionMode === 'custom-byok' || !isAdmin)
    ) {
      const client = createGeminiClientFromKey(vaultKey, 'vault-byok');
      return { ok: true, ...client };
    }

    if (inlineKey) {
      const client = createGeminiClientFromKey(inlineKey, 'custom-byok');
      return { ok: true, ...client };
    }

    // Admin fallback to server GEMINI_API_KEY
    if (isAdmin && process.env.GEMINI_API_KEY) {
      const client = createGeminiClientFromKey(
        process.env.GEMINI_API_KEY,
        'server-env'
      );
      return { ok: true, ...client };
    }

    // If admin has a vault key even when mode wasn't custom-byok, use vault key if server key is absent
    if (vaultKey) {
      const client = createGeminiClientFromKey(vaultKey, 'vault-byok');
      return { ok: true, ...client };
    }

    return {
      ok: false,
      classifiedError: {
        errorCode: 'BYOK_KEY_REQUIRED',
        httpStatus: 403,
        messageFa:
          'کلید شخصی Gemini در گاوصندوق امن حساب شما ثبت نشده است. طبق سیاست امنیتی چندکاربره آرکا، استفاده از سهمیه سرور صرفاً برای ادمین سازمان مجاز است؛ لطفاً از دکمه «مدیریت اعتبار و API Key» کلید شخصی خود را ثبت و رمزنگاری کنید.',
        retryable: false,
        canFallbackToFlash: false,
        suggestedFallbackModel: null,
      },
    };
  }

  // 2. Unauthenticated request: only allowed if inline customApiKey is explicitly provided
  if (inlineKey) {
    const client = createGeminiClientFromKey(inlineKey, 'custom-byok');
    return { ok: true, ...client };
  }

  return {
    ok: false,
    classifiedError: {
      errorCode: 'AUTH_REQUIRED',
      httpStatus: 401,
      messageFa:
        'احراز هویت انجام نشد. لطفاً ابتدا وارد حساب گوگل خود شوید و کلید شخصی خود را در گاوصندوق امن سرور ثبت کنید.',
      retryable: false,
      canFallbackToFlash: false,
      suggestedFallbackModel: null,
    },
  };
}

// ============================================================================
// STRUCTURED PERSIAN ERROR CLASSIFIER FOR GEMINI API
// ============================================================================

export function classifyGeminiError(
  err: any,
  attemptedModel?: GeminiRouterModelId
): ClassifiedAiError {
  const rawMsg = String(err?.message || err || '').trim();
  const lower = rawMsg.toLowerCase();
  const status = Number(err?.status || err?.code || 0);

  if (
    status === 401 ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('invalid api key')
  ) {
    return {
      errorCode: 'INVALID_API_KEY',
      httpStatus: 401,
      messageFa:
        'کلید API Gemini نامعتبر یا منقضی است. لطفاً در بخش «مدیریت اعتبار و API Key» کلید خود را بررسی یا جایگزین کنید.',
      technicalReason: 'INVALID_API_KEY',
      retryable: false,
      canFallbackToFlash: false,
      suggestedFallbackModel: null,
      attemptedModel,
    };
  }

  if (
    status === 403 ||
    lower.includes('permission_denied') ||
    lower.includes('forbidden')
  ) {
    return {
      errorCode: 'PERMISSION_DENIED',
      httpStatus: 403,
      messageFa:
        'دسترسی این کلید API به مدل یا سرویس درخواستی مسدود است (Permission Denied). تنظیمات پروژه Google AI Studio خود را بررسی کنید.',
      technicalReason: 'PERMISSION_DENIED',
      retryable: false,
      canFallbackToFlash: attemptedModel === 'gemini-2.5-pro',
      suggestedFallbackModel:
        attemptedModel === 'gemini-2.5-pro' ? 'gemini-2.5-flash' : null,
      attemptedModel,
    };
  }

  if (
    status === 429 ||
    lower.includes('quota') ||
    lower.includes('resource_exhausted') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests')
  ) {
    const canFallback = attemptedModel === 'gemini-2.5-pro';
    return {
      errorCode: 'QUOTA_EXCEEDED',
      httpStatus: 429,
      messageFa: canFallback
        ? 'سهمیه (Quota 429) مدل تحلیلی Gemini 2.5 Pro روی این کلید به پایان رسیده است. برای جلوگیری از افت ناخواسته کیفیت، مدل به صورت پنهان تغییر نکرد؛ می‌توانید با کلیک روی دکمه زیر، همین درخواست را با مدل جایگزین (Gemini 2.5 Flash) اجرا کنید.'
        : 'محدودیت سهمیه یا تعداد درخواست (Quota 429) روی کلید فعال رخ داده است. لطفاً چند لحظه صبر کنید یا کلید دیگری جایگزین نمایید.',
      technicalReason: 'RESOURCE_EXHAUSTED_429',
      retryable: true,
      canFallbackToFlash: canFallback,
      suggestedFallbackModel: canFallback ? 'gemini-2.5-flash' : null,
      attemptedModel,
    };
  }

  if (
    status === 404 ||
    status === 503 ||
    lower.includes('not found') ||
    lower.includes('overloaded') ||
    lower.includes('unavailable')
  ) {
    const canFallback = attemptedModel === 'gemini-2.5-pro';
    return {
      errorCode: 'MODEL_UNAVAILABLE',
      httpStatus: status === 404 ? 404 : 503,
      messageFa: canFallback
        ? `مدل «${attemptedModel}» در حال حاضر شلوغ یا خارج از دسترس است. در صورت تمایل روی دکمه «تلاش مجدد با مدل جایگزین (Gemini 2.5 Flash)» کلیک کنید.`
        : `مدل «${attemptedModel || 'Gemini'}» موقتاً در دسترس نیست. لطفاً چند ثانیه دیگر تلاش کنید.`,
      technicalReason: 'MODEL_UNAVAILABLE',
      retryable: true,
      canFallbackToFlash: canFallback,
      suggestedFallbackModel: canFallback ? 'gemini-2.5-flash' : null,
      attemptedModel,
    };
  }

  if (
    status === 504 ||
    lower.includes('timeout') ||
    lower.includes('aborted') ||
    lower.includes('etimedout')
  ) {
    return {
      errorCode: 'NETWORK_TIMEOUT',
      httpStatus: 504,
      messageFa:
        'زمان انتظار پاسخ از سرور هوش مصنوعی به پایان رسید (Timeout). لطفاً دوباره تلاش کنید یا از مدل پرشتاب‌تر استفاده نمایید.',
      technicalReason: 'NETWORK_TIMEOUT',
      retryable: true,
      canFallbackToFlash: attemptedModel === 'gemini-2.5-pro',
      suggestedFallbackModel:
        attemptedModel === 'gemini-2.5-pro' ? 'gemini-2.5-flash' : null,
      attemptedModel,
    };
  }

  return {
    errorCode: 'UPSTREAM_ERROR',
    httpStatus: 500,
    messageFa:
      'خطا در پردازش درخواست توسط سرویس هوش مصنوعی. لطفاً وضعیت اتصال یا پرامپت ورودی را بررسی و مجدداً تلاش کنید.',
    technicalReason: 'UPSTREAM_ERROR',
    retryable: true,
    canFallbackToFlash: attemptedModel === 'gemini-2.5-pro',
    suggestedFallbackModel:
      attemptedModel === 'gemini-2.5-pro' ? 'gemini-2.5-flash' : null,
    attemptedModel,
  };
}

// Baseline rich knowledge base of https://arka-acc.ir (8 Integrated Systems)
const ARKA_BASE_KNOWLEDGE = `
اطلاعات رسمی و دقیق وب‌سایت گروه نرم‌افزاری آرکــا (https://arka-acc.ir):
- نام برند: گروه نرم‌افزاری آرکا (Arka Accounting Software Group)
- شعار رسمی: «راهنمای هوشمند کسب‌وکار» | «یکپارچگی کامل برای تصمیم‌گیری سریع‌تر و دقیق‌تر»
- تجربه: بیش از ۱۰ سال تجربه عملی در بازار ایران و توسعه نرم‌افزارهای مالی همراه با مشاوران مالی و مالیاتی.
- تلفن سراسری مشاوره و فروش: 051-36079047 (پاسخگویی ۸ الی ۱۷)
- آدرس دفتر مرکزی: مشهد - سید رضی ۴۰ - بین مهران ۹ و ۱۱ - پلاک ۲۶۵ - طبقه اول
- پیشنهادهای ویژه و مزیت‌های رقابتی اصلی در سایت arka-acc.ir:
  1. نسخه دموی رایگان تا سقف ۱۰۰ سند واقعی (قابل دانلود مستقیم از https://arka-acc.ir/demo) تا مشتری قبل از پرداخت حتی یک ریال، نرم‌افزار را با داده‌های واقعی کسب‌وکار خودش تست کند.
  2. ۱ سال پشتیبانی رایگان به همراه سیستم ثبت تیکت پشتیبانی و آموزش‌های گام‌به‌گام «آرکا آکادمی».
  3. ثبت یک فاکتور فروش = بروزرسانی آنی موجودی انبار، حساب مشتری، خزانه‌داری و داشبورد سود.

خانواده ۸ سیستم و نرم‌افزار تخصصی آرکا در سایت arka-acc.ir/products:
1. پکیج جامع مالی و حسابداری آرکا: یکپارچه‌سازی کامل حسابداری، خرید و فروش، انبار، خزانه‌داری و گزارشات مدیریتی.
2. حسابداری هوشمند پاچال (ویژه فروشگاه‌ها): صدور سریع فاکتور، مدیریت صندوق، بارکدخوان و کنترل موجودی فروشگاهی.
3. حسابداری هوشمند سوله (ویژه تولیدی، بنکداری و انبار): فرمول تولید (BOM)، بهای تمام‌شده، چند انباره و فروش عمده.
4. حسابداری هوشمند ترخیص (ویژه بازرگانی و تجاری): مدیریت اسناد تجاری، بهای تمام‌شده کالاهای بازرگانی و تسویه ارزی/ریالی.
5. حسابداری هوشمند منو (ویژه رستوران و کافی‌شاپ): مدیریت سفارشات، رسپی و بهای تمام‌شده غذا و صندوق رستورانی.
6. حسابداری هوشمند پروژه (ویژه شرکتی و خدماتی): تفکیک مراکز هزینه، صورت‌وضعیت پروژه‌ها و سود و زیان هر قرارداد.
7. حسابداری هوشمند ویترین (ویژه آنلاین‌شاپ و فروشگاه اینترنتی): همگام‌سازی موجودی سایت و اینستاگرام با انبار و حسابداری.
8. حسابداری هوشمند شتاب (ویژه استارتاپ‌ها): گزارش‌های چابک جریان نقدینگی، شاخص‌های رشد و مدیریت هزینه‌های استارتاپی.

ماژول‌ها و سرویس‌های مکمل در سایت arka-acc.ir:
- سرویس مستقیم سامانه مؤدیان (https://arka-acc.ir/pages/tax): اعتبارسنجی خودکار صورتحساب الکترونیکی قبل از ارسال، ارسال مستقیم تکی و گروهی به کارپوشه مالیاتی بدون نیاز به واسط.
- ایجنت هوش مصنوعی مالی آرکا: دستیار هوشمند تحلیلگر مالی و پاسخگویی به سوالات مدیریتی.
- سیستم جامع ابری و تحت وب: دسترسی ایمن از هر مکان در کنار نسخه ویندوز.
- باشگاه مشتریان (CRM)، سامانه پیامکی، تولید و چاپ بارکد، مدیریت وظایف (اتوماسیون)، دارایی ثابت، مدیریت بازاریابان، تیکت پشتیبانی و اطلاعات اول دوره.
- مطالعه موردی واقعی در سایت: «شرکت رنگ بهارستان» (تبدیل پراکندگی اطلاعات فروش و انبار به شفافیت ۱۰۰٪ و گزارش‌گیری لحظه‌ای).
`;

const LIVE_CONTEXT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cachedLiveSiteSummary = '';
let lastFetchedAt = 0;
let lastFetchedLive = false;

async function getLiveArkaSiteContext(forceRefresh = false): Promise<{
  summary: string;
  fetchedLive: boolean;
  cached: boolean;
  updatedAt: string;
}> {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedLiveSiteSummary &&
    now - lastFetchedAt < LIVE_CONTEXT_CACHE_TTL_MS
  ) {
    return {
      summary: cachedLiveSiteSummary,
      fetchedLive: lastFetchedLive,
      cached: true,
      updatedAt: new Date(lastFetchedAt).toISOString(),
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const resp = await fetch('https://arka-acc.ir/api/site/published', {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'ArkaEnterpriseStudio/3.0',
      },
    });
    clearTimeout(timer);

    if (resp.ok) {
      const json = (await resp.json()) as Record<string, any>;
      const rawStr = JSON.stringify(json);
      const snippet = rawStr.slice(0, 3500);
      cachedLiveSiteSummary = `${ARKA_BASE_KNOWLEDGE}\n\n[داده‌های زنده واکشی‌شده از https://arka-acc.ir/api/site/published]:\n${snippet}`;
      lastFetchedAt = now;
      lastFetchedLive = true;
      return {
        summary: cachedLiveSiteSummary,
        fetchedLive: true,
        cached: false,
        updatedAt: new Date(lastFetchedAt).toISOString(),
      };
    }
  } catch {
    // Fallback immediately to static 8-system Arka catalog
  }

  if (!cachedLiveSiteSummary) {
    cachedLiveSiteSummary = ARKA_BASE_KNOWLEDGE;
    lastFetchedAt = now;
    lastFetchedLive = false;
  }

  return {
    summary: cachedLiveSiteSummary || ARKA_BASE_KNOWLEDGE,
    fetchedLive: lastFetchedLive,
    cached: false,
    updatedAt: new Date(lastFetchedAt || now).toISOString(),
  };
}

const modelListCache = new Map<
  string,
  { models: string[]; checkedAt: number }
>();

async function listAvailableGeminiModels(
  ai: GoogleGenAI,
  fingerprint: string,
  bypassCache = false
): Promise<string[]> {
  const now = Date.now();
  const cached = modelListCache.get(fingerprint);
  if (!bypassCache && cached && now - cached.checkedAt < 5 * 60 * 1000) {
    return cached.models;
  }

  const found: string[] = [];
  const pager = await ai.models.list();
  for await (const model of pager) {
    const rawName = String(model.name || '').replace(/^models\//, '');
    if (rawName && rawName.toLowerCase().includes('gemini')) {
      found.push(rawName);
    }
    if (found.length >= 60) break;
  }

  const unique = Array.from(new Set(found));
  modelListCache.set(fingerprint, { models: unique, checkedAt: now });
  return unique;
}

function isQuotaOrAvailabilityError(err: any): boolean {
  const msg = String(err?.message || '').toLowerCase();
  const status = Number(err?.status || err?.code || 0);
  return (
    status === 429 ||
    status === 404 ||
    status === 503 ||
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('rate limit') ||
    msg.includes('not found') ||
    msg.includes('overloaded')
  );
}

/**
 * Executes Gemini generation with explicit fallback control.
 * - By default (`allowModelFallback === false`), it will NOT silently downgrade from Pro to Flash on 429/quota errors.
 * - When the user explicitly clicks "تلاش مجدد با مدل جایگزین" (`allowModelFallback === true`), it executes on the fallback model.
 */
async function executeGeminiGeneration(params: {
  ai: GoogleGenAI;
  primaryModel: GeminiRouterModelId;
  fallbackModel: GeminiRouterModelId;
  allowModelFallback: boolean;
  contents: string;
  config: Record<string, any>;
}): Promise<{
  response: any;
  actualModelUsed: GeminiRouterModelId;
  usedFallback: boolean;
  fallbackReason?: string;
}> {
  if (
    params.allowModelFallback &&
    params.primaryModel !== params.fallbackModel
  ) {
    const response = await params.ai.models.generateContent({
      model: params.fallbackModel,
      contents: params.contents,
      config: params.config,
    });
    return {
      response,
      actualModelUsed: params.fallbackModel,
      usedFallback: true,
      fallbackReason:
        'انتخاب آگاهانه کاربر ← اجرای مجدد درخواست با مدل جایگزین gemini-2.5-flash',
    };
  }

  try {
    const response = await params.ai.models.generateContent({
      model: params.primaryModel,
      contents: params.contents,
      config: params.config,
    });
    return {
      response,
      actualModelUsed: params.primaryModel,
      usedFallback: false,
    };
  } catch (err: any) {
    if (
      params.allowModelFallback &&
      params.primaryModel !== params.fallbackModel &&
      isQuotaOrAvailabilityError(err)
    ) {
      const response = await params.ai.models.generateContent({
        model: params.fallbackModel,
        contents: params.contents,
        config: params.config,
      });
      return {
        response,
        actualModelUsed: params.fallbackModel,
        usedFallback: true,
        fallbackReason:
          'تلاش مجدد با تایید کاربر ← سوئیچ به مدل جایگزین gemini-2.5-flash',
      };
    }
    throw err;
  }
}

function extractSafeJson(rawText: string): any {
  const cleaned = String(rawText || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return JSON.parse(cleaned || '{}');
}

const SLIDE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    categoryLabel: { type: Type.STRING, description: 'برچسب کوتاه دسته‌بندی بالای بوم' },
    headerMeta: { type: Type.STRING, description: 'توضیح کوتاه متا در هدر' },
    eyebrow: { type: Type.STRING, description: 'روتیتر جذاب بالای تیتر اصلی' },
    headlinePart1: { type: Type.STRING, description: 'بخش اول تیتر اصلی' },
    headlineHighlight: { type: Type.STRING, description: 'کلمه کلیدی متمایز و رنگی در تیتر' },
    headlinePart2: { type: Type.STRING, description: 'بخش پایانی تیتر اصلی' },
    leadCopy: { type: Type.STRING, description: 'پاراگراف توضیحی زیر تیتر (حدود ۲۰ تا ۳۵ کلمه)' },
    primaryStatValue: { type: Type.STRING, description: 'عدد یا شاخص کلیدی برجسته کارت اصلی' },
    primaryStatLabel: { type: Type.STRING, description: 'زیرنویس توضیحی شاخص کلیدی' },
    secondaryBannerTitle: { type: Type.STRING, description: 'عنوان بنر میانی (مثلاً ۱ سال پشتیبانی رایگان)' },
    secondaryBannerSub: { type: Type.STRING, description: 'توضیح بنر میانی' },
    stickerTitle: { type: Type.STRING, description: 'متن دعوت به اقدام استیکر اینستاگرام' },
    stickerActionText: { type: Type.STRING, description: 'لینک یا متن دکمه استیکر (مثلاً https://arka-acc.ir/demo)' },
    instagramCaption: { type: Type.STRING, description: 'کپشن کامل و حرفه‌ای اینستاگرام به همراه هشتگ‌های مرتبط با حسابداری آرکا' },
    items: {
      type: Type.ARRAY,
      description: '۴ کارت ویژگی کلیدی داخل بوم',
      items: {
        type: Type.OBJECT,
        properties: {
          kicker: { type: Type.STRING, description: 'روتیتر کوتاه کارت' },
          title: { type: Type.STRING, description: 'عنوان اصلی کارت' },
          subtitle: { type: Type.STRING, description: 'توضیح کاربردی کارت' },
          metric: { type: Type.STRING, description: 'برچسب شاخص ۲ کلمه‌ای' },
        },
        required: ['kicker', 'title', 'subtitle', 'metric'],
      },
    },
  },
  required: [
    'categoryLabel',
    'headerMeta',
    'eyebrow',
    'headlinePart1',
    'headlineHighlight',
    'headlinePart2',
    'leadCopy',
    'primaryStatValue',
    'primaryStatLabel',
    'stickerTitle',
    'stickerActionText',
    'instagramCaption',
    'items',
  ],
};

const SEO_ARTICLE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    articleTitleH1: {
      type: Type.STRING,
      description: 'عنوان اصلی مقاله (H1) جذاب و بهینه‌شده برای سئو و کلیک',
    },
    metaTitle: {
      type: Type.STRING,
      description: 'عنوان متا سئو (حداکثر ۶۰ کاراکتر)',
    },
    metaDescription: {
      type: Type.STRING,
      description: 'توضیحات متا سئو (۱۴۰ تا ۱۶۰ کاراکتر) با دعوت به اقدام',
    },
    suggestedSlug: {
      type: Type.STRING,
      description: 'نامک (URL Slug) انگلیسی پیشنهادی برای سایت arka-acc.ir',
    },
    primaryKeyword: {
      type: Type.STRING,
      description: 'کلمه کلیدی کانونی مقاله',
    },
    secondaryKeywords: {
      type: Type.ARRAY,
      description: '۵ تا ۸ کلمه کلیدی فرعی، هم‌خانواده (LSI) و عبارات طولانی',
      items: { type: Type.STRING },
    },
    searchIntent: {
      type: Type.STRING,
      description: 'Informational | Commercial | Transactional | Navigational',
    },
    searchIntentAnalysisFa: {
      type: Type.STRING,
      description: 'تحلیل دقیق نیت جستجوی کاربر و زاویه ورود به معرفی راهکار آرکا',
    },
    aeoDirectAnswerBox: {
      type: Type.STRING,
      description:
        'پاسخ مستقیم، فشرده و ۴۰ تا ۶۰ کلمه‌ای برای باکس Featured Snippet گوگل و موتورهای پاسخ‌گو (AEO)',
    },
    geoCitationSummary: {
      type: Type.STRING,
      description:
        'فکت‌شیت و خلاصه استنادی غنی از داده برای دیده‌شدن برند آرکا در موتورهای مولد هوش مصنوعی (GEO مانند ChatGPT/Perplexity/Google AI)',
    },
    estimatedReadingMinutes: {
      type: Type.INTEGER,
      description: 'زمان تخمینی مطالعه به دقیقه',
    },
    sections: {
      type: Type.ARRAY,
      description: 'بخش‌های ساختاریافته مقاله (حداقل ۵ بخش H2/H3 با محتوای کامل و تخصصی)',
      items: {
        type: Type.OBJECT,
        properties: {
          headingLevel: { type: Type.STRING, description: 'H2 یا H3' },
          headingTitle: { type: Type.STRING, description: 'عنوان زیربخش' },
          bodyParagraphs: {
            type: Type.ARRAY,
            description: 'پاراگراف‌های کامل، کاربردی و عمیق این بخش',
            items: { type: Type.STRING },
          },
          keyTakeaway: {
            type: Type.STRING,
            description: 'نکته کلیدی یا مزیت عملیاتی مرتبط با نرم‌افزار آرکا',
          },
        },
        required: ['headingLevel', 'headingTitle', 'bodyParagraphs'],
      },
    },
    faqItems: {
      type: Type.ARRAY,
      description: '۴ تا ۶ پرسش و پاسخ متداول برای اسکیمای FAQPage',
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          answer: { type: Type.STRING },
        },
        required: ['question', 'answer'],
      },
    },
    internalLinks: {
      type: Type.ARRAY,
      description: 'پیشنهادهای لینک‌سازی داخلی به صفحات رسمی سایت arka-acc.ir',
      items: {
        type: Type.OBJECT,
        properties: {
          anchorText: { type: Type.STRING, description: 'انکرتکست پیشنهادی' },
          targetUrl: {
            type: Type.STRING,
            description: 'لینک هدف در سایت arka-acc.ir (مثلاً https://arka-acc.ir/demo)',
          },
          placementContext: {
            type: Type.STRING,
            description: 'محل و دلیل درج این لینک در متن مقاله',
          },
        },
        required: ['anchorText', 'targetUrl', 'placementContext'],
      },
    },
    linkedinPostSnippet: {
      type: Type.STRING,
      description: 'پست تخصصی لینکدین استخراج‌شده از این مقاله برای مدیران مالی و کسب‌وکار',
    },
    instagramCaptionSnippet: {
      type: Type.STRING,
      description: 'کپشن اینستاگرام استخراج‌شده از مقاله به همراه هشتگ‌ها',
    },
    verifiedArkaFacts: {
      type: Type.ARRAY,
      description: 'فکت‌ها و آمارهای مستند و تاییدشده از کاتالوگ رسمی آرکا که در مقاله استفاده شده‌اند',
      items: { type: Type.STRING },
    },
    claimsRequiringVerification: {
      type: Type.ARRAY,
      description: 'ادعاها یا نکات عمومی بازار/مالیات که پیش از انتشار نهایی نیاز به بازبینی انسانی دارند',
      items: { type: Type.STRING },
    },
    heroSlide: SLIDE_SCHEMA,
  },
  required: [
    'articleTitleH1',
    'metaTitle',
    'metaDescription',
    'suggestedSlug',
    'primaryKeyword',
    'secondaryKeywords',
    'searchIntent',
    'searchIntentAnalysisFa',
    'aeoDirectAnswerBox',
    'geoCitationSummary',
    'estimatedReadingMinutes',
    'sections',
    'faqItems',
    'internalLinks',
    'linkedinPostSnippet',
    'instagramCaptionSnippet',
    'verifiedArkaFacts',
    'claimsRequiringVerification',
    'heroSlide',
  ],
};

export function createArkaExpressApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // 0. Canonical Organization (arka_org) Brand Intelligence Hub Endpoints
  app.get('/api/arka-org/brand-profile', async (req, res) => {
    try {
      const bearerToken = extractBearerToken(req);
      const verifiedUser = bearerToken
        ? await verifyFirebaseIdToken(bearerToken)
        : null;
      const membership = resolveOrgMembershipForUser(verifiedUser);
      return res.json({
        ok: true,
        organizationId: CANONICAL_ARKA_ORG_ID,
        profile: getCanonicalOrgBrandProfile(),
        membership: membership || {
          uid: 'guest',
          email: '',
          role: 'viewer',
          orgId: CANONICAL_ARKA_ORG_ID,
          canEditBrandProfile: false,
        },
      });
    } catch {
      return res.status(500).json({
        ok: false,
        error: 'خطا در دریافت پروفایل رسمی هوش برند سازمان آرکا.',
      });
    }
  });

  app.put('/api/arka-org/brand-profile', async (req, res) => {
    try {
      const bearerToken = extractBearerToken(req);
      const verifiedUser = bearerToken
        ? await verifyFirebaseIdToken(bearerToken)
        : null;
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const result = updateCanonicalOrgBrandProfile({
        user: verifiedUser,
        requestedOrgId: body.organizationId,
        profilePatch: body.profile || body,
      });

      if (!result.ok) {
        return res.status(result.classifiedError.httpStatus).json({
          ok: false,
          error: result.classifiedError.messageFa,
          errorDetails: result.classifiedError,
        });
      }

      return res.json({
        ok: true,
        organizationId: CANONICAL_ARKA_ORG_ID,
        profile: result.profile,
        membership: result.membership,
      });
    } catch {
      return res.status(500).json({
        ok: false,
        error: 'خطا در بروزرسانی پروفایل رسمی هوش برند سازمان آرکا.',
      });
    }
  });

  // 1. Live Arka Website Sync Endpoint with 6-Hour In-Memory Cache & Force Refresh
  app.get('/api/arka-site/live-context', async (req, res) => {
    try {
      const force = req.query.refresh === '1';
      const data = await getLiveArkaSiteContext(force);
      res.json({
        ok: true,
        fetchedLive: data.fetchedLive,
        cached: data.cached,
        cacheTtlHours: 6,
        systemsCount: 8,
        updatedAt: data.updatedAt,
        siteUrl: 'https://arka-acc.ir',
        summaryPreview: data.summary.slice(0, 600),
      });
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        error: err?.message || 'خطا در همگام‌سازی با سایت آرکا',
      });
    }
  });

  // 2. Encrypted BYOK Vault Status Endpoint (GET /api/arka-ai/key-status)
  // Never returns plaintext or ciphertext; returns only masked metadata for the authenticated user
  app.get('/api/arka-ai/key-status', async (req, res) => {
    try {
      const bearerToken = extractBearerToken(req);
      const verifiedUser = bearerToken
        ? await verifyFirebaseIdToken(bearerToken)
        : null;

      const hasServerKey = Boolean(process.env.GEMINI_API_KEY);
      if (!verifiedUser) {
        return res.json({
          ok: true,
          authenticated: false,
          configured: false,
          maskedKey: null,
          provider: 'gemini',
          models: [],
          hasPro: false,
          hasFlash: false,
          updatedAt: null,
          isAdminFallbackAllowed: false,
          serverKeyConfigured: hasServerKey,
        });
      }

      const meta = getUserVaultMetadata(verifiedUser.uid);
      const isAdmin = isVerifiedAdminUser(verifiedUser);

      return res.json({
        ok: true,
        authenticated: true,
        configured: Boolean(meta),
        maskedKey: meta?.maskedKey || null,
        provider: 'gemini',
        models: meta?.models || [],
        hasPro: Boolean(meta?.hasPro),
        hasFlash: Boolean(meta?.hasFlash),
        updatedAt: meta?.updatedAt || null,
        isAdminFallbackAllowed: isAdmin && hasServerKey,
        serverKeyConfigured: hasServerKey,
      });
    } catch {
      return res.status(500).json({
        ok: false,
        error: 'خطا در بررسی وضعیت گاوصندوق کلید کاربر.',
      });
    }
  });

  // 3. Save / Rotate User Personal Key in Encrypted BYOK Vault (POST /api/arka-ai/key)
  app.post('/api/arka-ai/key', async (req, res) => {
    const startedAt = Date.now();
    try {
      const bearerToken = extractBearerToken(req);
      const verifiedUser = bearerToken
        ? await verifyFirebaseIdToken(bearerToken)
        : null;

      if (!verifiedUser) {
        return res.status(401).json({
          ok: false,
          valid: false,
          error:
            'برای ثبت و رمزنگاری کلید شخصی در گاوصندوق سرور، ابتدا باید وارد حساب گوگل خود شوید.',
          errorDetails: {
            errorCode: 'AUTH_REQUIRED',
            httpStatus: 401,
            messageFa:
              'برای ثبت و رمزنگاری کلید شخصی در گاوصندوق سرور، ابتدا باید وارد حساب گوگل خود شوید.',
            retryable: false,
            canFallbackToFlash: false,
            suggestedFallbackModel: null,
          },
        });
      }

      const rateCheck = checkRateLimit({
        endpoint: 'vault-key-write',
        userId: verifiedUser.uid,
        ip: getClientIp(req),
        limit: 5,
        windowMs: 60 * 1000,
      });
      if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
        return res.status(429).json({
          ok: false,
          valid: false,
          error: `تعداد درخواست‌های ثبت کلید بیش از حد مجاز (۵ بار در دقیقه) است. لطفاً ${rateCheck.retryAfterSeconds} ثانیه صبر کنید.`,
          retryAfterSeconds: rateCheck.retryAfterSeconds,
        });
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const fieldError = validateTextFields([
        { labelFa: 'کلید API شخصی', value: body.customApiKey, maxLength: MAX_API_KEY_LENGTH },
        { labelFa: 'سرویس‌دهنده', value: body.provider, maxLength: 50 },
      ]);
      if (fieldError) {
        return res.status(400).json({ ok: false, valid: false, error: fieldError });
      }

      const trimmedKey = String(body.customApiKey || '').trim();
      if (!trimmedKey || trimmedKey.length < 15) {
        return res.status(400).json({
          ok: false,
          valid: false,
          error: 'لطفاً یک کلید معتبر Google Gemini API Key وارد کنید.',
        });
      }

      let models: string[] = [];
      if (
        process.env.ARKA_TEST_ALLOW_SYNTHETIC_KEYS === '1' &&
        trimmedKey.startsWith('AIzaSyTestValidKey_')
      ) {
        models = ['gemini-2.5-flash', 'gemini-2.5-pro'];
      } else {
        const { ai, fingerprint } = createGeminiClientFromKey(
          trimmedKey,
          'custom-byok'
        );
        models = await listAvailableGeminiModels(ai, fingerprint, true);
      }

      if (models.length === 0) {
        return res.status(401).json({
          ok: false,
          valid: false,
          error: 'هیچ مدل فعالی روی این کلید یافت نشد. صحت کلید را بررسی کنید.',
        });
      }

      const hasPro = models.some((m) => m.includes('2.5-pro'));
      const hasFlash = models.some((m) => m.includes('2.5-flash'));

      const savedMeta = storeEncryptedUserApiKey({
        uid: verifiedUser.uid,
        rawApiKey: trimmedKey,
        models,
        hasPro,
        hasFlash,
      });

      return res.json({
        ok: true,
        valid: true,
        savedToVault: true,
        maskedKey: savedMeta.maskedKey,
        provider: 'gemini',
        models: savedMeta.models,
        hasPro: savedMeta.hasPro,
        hasFlash: savedMeta.hasFlash,
        latencyMs: Date.now() - startedAt,
        checkedAt: savedMeta.updatedAt,
      });
    } catch (err: any) {
      const classified = classifyGeminiError(err);
      return res.status(classified.httpStatus).json({
        ok: false,
        valid: false,
        error: classified.messageFa,
        errorDetails: classified,
      });
    }
  });

  // 4. Delete User Personal Key from Encrypted BYOK Vault (DELETE /api/arka-ai/key)
  app.delete('/api/arka-ai/key', async (req, res) => {
    try {
      const bearerToken = extractBearerToken(req);
      const verifiedUser = bearerToken
        ? await verifyFirebaseIdToken(bearerToken)
        : null;

      if (!verifiedUser) {
        return res.status(401).json({
          ok: false,
          error: 'برای حذف کلید از گاوصندوق سرور، احراز هویت الزامی است.',
        });
      }

      const deleted = deleteUserApiKeyFromVault(verifiedUser.uid);
      return res.json({
        ok: true,
        deleted,
        configured: false,
      });
    } catch {
      return res.status(500).json({
        ok: false,
        error: 'خطا در حذف کلید از گاوصندوق سرور.',
      });
    }
  });

  // 5. Live API Key Verification Endpoint (POST /api/arka-ai/verify-key)
  app.post('/api/arka-ai/verify-key', async (req, res) => {
    const startedAt = Date.now();
    try {
      const bearerToken = extractBearerToken(req);
      const verifiedUser = bearerToken
        ? await verifyFirebaseIdToken(bearerToken)
        : null;

      const rateCheck = checkRateLimit({
        endpoint: 'verify-key',
        userId: verifiedUser?.uid || null,
        ip: getClientIp(req),
        limit: 5,
        windowMs: 60 * 1000,
      });
      if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
        return res.status(429).json({
          ok: false,
          valid: false,
          error: `تعداد درخواست‌های بررسی کلید بیش از حد مجاز (۵ درخواست در دقیقه) است. لطفاً ${rateCheck.retryAfterSeconds} ثانیه صبر کنید.`,
          retryAfterSeconds: rateCheck.retryAfterSeconds,
        });
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const fieldError = validateTextFields([
        { labelFa: 'کلید API شخصی', value: body.customApiKey, maxLength: MAX_API_KEY_LENGTH },
        { labelFa: 'سرویس‌دهنده (Provider)', value: body.provider, maxLength: 50 },
      ]);
      if (fieldError) {
        return res.status(400).json({
          ok: false,
          valid: false,
          provider: 'gemini',
          error: fieldError,
        });
      }

      const { customApiKey = '', provider = 'gemini' } = body;
      const trimmedKey = String(customApiKey || '').trim();
      if (!trimmedKey || trimmedKey.length < 15) {
        return res.status(400).json({
          ok: false,
          valid: false,
          provider,
          error: 'لطفاً یک کلید معتبر Gemini API Key وارد کنید.',
        });
      }

      if (provider !== 'gemini') {
        return res.status(400).json({
          ok: false,
          valid: false,
          provider,
          error: 'در حال حاضر فقط Provider استاندارد Google Gemini پشتیبانی می‌شود.',
        });
      }

      let models: string[] = [];
      if (
        process.env.ARKA_TEST_ALLOW_SYNTHETIC_KEYS === '1' &&
        trimmedKey.startsWith('AIzaSyTestValidKey_')
      ) {
        models = ['gemini-2.5-flash', 'gemini-2.5-pro'];
      } else {
        const { ai, fingerprint } = createGeminiClientFromKey(
          trimmedKey,
          'custom-byok'
        );
        models = await listAvailableGeminiModels(ai, fingerprint, true);
      }

      if (models.length === 0) {
        return res.status(401).json({
          ok: false,
          valid: false,
          provider,
          error: 'هیچ مدل Gemini روی این کلید یافت نشد. دسترسی کلید را بررسی کنید.',
        });
      }

      const hasPro = models.some((m) => m.includes('2.5-pro'));
      const hasFlash = models.some((m) => m.includes('2.5-flash'));
      const latencyMs = Date.now() - startedAt;

      return res.json({
        ok: true,
        valid: true,
        maskedKey: maskApiKey(trimmedKey),
        provider: 'gemini',
        models,
        hasPro,
        hasFlash,
        latencyMs,
        checkedAt: new Intl.DateTimeFormat('fa-IR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }).format(new Date()),
      });
    } catch (err: any) {
      const classified = classifyGeminiError(err);
      return res.status(classified.httpStatus).json({
        ok: false,
        valid: false,
        provider: 'gemini',
        error: classified.messageFa,
        errorDetails: classified,
      });
    }
  });

  // 6. Pre-flight AI Connection Diagnostics & Capability Registry
  app.get('/api/arka-ai/diagnostics', async (req, res) => {
    try {
      const bearerToken = extractBearerToken(req);
      const verifiedUser = bearerToken
        ? await verifyFirebaseIdToken(bearerToken)
        : null;

      const rateCheck = checkRateLimit({
        endpoint: 'diagnostics',
        userId: verifiedUser?.uid || null,
        ip: getClientIp(req),
        limit: 20,
        windowMs: 60 * 1000,
      });
      if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
        return res.status(429).json({
          ok: false,
          error: `تعداد درخواست‌های بررسی وضعیت بیش از حد مجاز است. لطفاً ${rateCheck.retryAfterSeconds} ثانیه صبر کنید.`,
          retryAfterSeconds: rateCheck.retryAfterSeconds,
        });
      }

      const fieldError = validateTextFields([
        { labelFa: 'پرامپت نمونه', value: req.query.prompt, maxLength: MAX_PROMPT_LENGTH },
        { labelFa: 'حالت اجرا', value: req.query.mode, maxLength: MAX_SHORT_FIELD_LENGTH },
      ]);
      if (fieldError) {
        return res.status(400).json({ ok: false, error: fieldError });
      }

      const hasServerKey = Boolean(process.env.GEMINI_API_KEY);
      const samplePrompt = String(req.query.prompt || '');
      const sampleTab = String(req.query.mode || 'campaign-calendar-30');
      const modelDecision = resolveSmartModelForTask(samplePrompt, sampleTab);
      const vaultMeta = verifiedUser
        ? getUserVaultMetadata(verifiedUser.uid)
        : null;

      let discoveredModels: string[] = vaultMeta?.models?.length
        ? vaultMeta.models
        : ['gemini-2.5-flash', 'gemini-2.5-pro'];

      if (!vaultMeta && hasServerKey && isVerifiedAdminUser(verifiedUser)) {
        try {
          const { ai, fingerprint } = createGeminiClientFromKey(
            process.env.GEMINI_API_KEY || '',
            'server-env'
          );
          const liveModels = await listAvailableGeminiModels(ai, fingerprint);
          if (liveModels.length > 0) {
            discoveredModels = liveModels;
          }
        } catch {
          // Keep default model catalog if list check fails momentarily
        }
      }

      res.json({
        ok: true,
        organizationId: CANONICAL_ARKA_ORG_ID,
        serverKeyConfigured: hasServerKey,
        userVaultConfigured: Boolean(vaultMeta),
        userMaskedKey: vaultMeta?.maskedKey || null,
        encryptionVersion: vaultMeta?.encryptionVersion || CURRENT_ENCRYPTION_VERSION,
        isAdminFallbackAllowed: isVerifiedAdminUser(verifiedUser) && hasServerKey,
        canonicalBrandVersion: getCanonicalOrgBrandProfile().version || 1,
        recentAuditLogs: verifiedUser
          ? getSafeAiAuditLogs(isVerifiedAdminUser(verifiedUser) ? null : verifiedUser.uid)
          : [],
        capabilityRegistry: GEMINI_MODEL_CAPABILITY_REGISTRY,
        availableModels: [
          {
            id: 'gemini-2.5-flash',
            label: 'Gemini 2.5 Flash (پرشتاب و بهینه برای تسک‌های سریع)',
            bestFor: ['/fast', '/hybrid'],
          },
          {
            id: 'gemini-2.5-pro',
            label:
              'Gemini 2.5 Pro (استدلال عمیق، مقاله SEO/AEO/GEO، کارگردانی ویدیو و تقویم)',
            bestFor: [
              '/rpe',
              '/visual',
              '/video',
              '/copy',
              'campaign-calendar-30',
              'seo-article',
            ],
          },
        ],
        discoveredModels,
        recommendedDecision: modelDecision,
        checkedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        error: err?.message || 'خطا در بررسی وضعیت سرویس هوش مصنوعی آرکا',
      });
    }
  });

  // 7. Live Connection Readiness Verification Endpoint
  app.post('/api/arka-ai/verify-connection', async (req, res) => {
    const startedAt = Date.now();
    try {
      const bearerToken = extractBearerToken(req);
      const verifiedUser = bearerToken
        ? await verifyFirebaseIdToken(bearerToken)
        : null;

      const rateCheck = checkRateLimit({
        endpoint: 'verify-connection',
        userId: verifiedUser?.uid || null,
        ip: getClientIp(req),
        limit: 5,
        windowMs: 60 * 1000,
      });
      if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
        return res.status(429).json({
          ok: false,
          verified: false,
          error: `تعداد درخواست‌های تست اتصال بیش از حد مجاز (۵ درخواست در دقیقه) است. لطفاً ${rateCheck.retryAfterSeconds} ثانیه صبر کنید.`,
          retryAfterSeconds: rateCheck.retryAfterSeconds,
        });
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const fieldError = validateTextFields([
        { labelFa: 'دستور سفارشی', value: body.customPrompt, maxLength: MAX_PROMPT_LENGTH },
        { labelFa: 'تب استودیو', value: body.studioTabMode, maxLength: MAX_SHORT_FIELD_LENGTH },
        { labelFa: 'حالت اتصال', value: body.connectionMode, maxLength: MAX_SHORT_FIELD_LENGTH },
        { labelFa: 'کلید API شخصی', value: body.customApiKey, maxLength: MAX_API_KEY_LENGTH },
      ]);
      if (fieldError) {
        return res.status(400).json({ ok: false, verified: false, error: fieldError });
      }

      const {
        connectionMode = 'studio-creator-core',
        customPrompt = '',
        studioTabMode = 'campaign-calendar-30',
        customApiKey = '',
        allowModelFallback = false,
      } = body;

      const resolved = resolveAuthorizedGeminiClient({
        verifiedUser,
        inlineCustomApiKey: customApiKey,
        requestedConnectionMode: connectionMode,
      });
      if (!resolved.ok) {
        return res.status(resolved.classifiedError.httpStatus).json({
          ok: false,
          verified: false,
          error: resolved.classifiedError.messageFa,
          errorDetails: resolved.classifiedError,
        });
      }

      const { ai, keySource, fingerprint } = resolved;
      const modelDecision = resolveSmartModelForTask(
        String(customPrompt || ''),
        String(studioTabMode || 'campaign-calendar-30')
      );

      let availableModels: string[] = [];
      try {
        availableModels = await listAvailableGeminiModels(ai, fingerprint);
      } catch {
        availableModels = ['gemini-2.5-flash', 'gemini-2.5-pro'];
      }

      const primaryModel: GeminiRouterModelId = modelDecision.modelId;

      const { response: pingResponse, actualModelUsed, usedFallback } =
        await executeGeminiGeneration({
          ai,
          primaryModel,
          fallbackModel: 'gemini-2.5-flash',
          allowModelFallback: Boolean(allowModelFallback),
          contents: 'فقط کلمه «آماده» را برگردان.',
          config: {
            systemInstruction: ARKA_SYSTEM_INSTRUCTION,
          },
        });

      const latencyMs = Date.now() - startedAt;
      const sampleReply = (pingResponse.text || 'آماده').trim().slice(0, 40);

      res.json({
        ok: true,
        verified: true,
        connectionMode,
        keySource,
        latencyMs,
        sampleReply,
        availableModels,
        selectedModel: actualModelUsed,
        usedFallback,
        modelDisplayName: modelDecision.modelDisplayName,
        reasoningFa: modelDecision.reasoningFa,
        verifiedAt: new Intl.DateTimeFormat('fa-IR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }).format(new Date()),
      });
    } catch (err: any) {
      const classified = classifyGeminiError(err, 'gemini-2.5-pro');
      res.status(classified.httpStatus).json({
        ok: false,
        verified: false,
        error: classified.messageFa,
        errorDetails: classified,
      });
    }
  });

  // 8. Specialized Arka AI Content, SEO/AEO/GEO Article Studio, 6-Module Core, StoryCanvas & Campaign Generator
  app.post('/api/arka-ai/generate', async (req, res) => {
    const startedAt = Date.now();
    let plannedRouterModel: GeminiRouterModelId = 'gemini-2.5-pro';
    try {
      const bearerToken = extractBearerToken(req);
      const verifiedUser = bearerToken
        ? await verifyFirebaseIdToken(bearerToken)
        : null;

      const rateCheck = checkRateLimit({
        endpoint: 'generate',
        userId: verifiedUser?.uid || null,
        ip: getClientIp(req),
        limit: 20,
        windowMs: 60 * 1000,
      });
      if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
        return res.status(429).json({
          ok: false,
          error: `تعداد درخواست‌های تولید محتوا بیش از حد مجاز (۲۰ درخواست در دقیقه) است. لطفاً ${rateCheck.retryAfterSeconds} ثانیه صبر کنید.`,
          retryAfterSeconds: rateCheck.retryAfterSeconds,
          errorDetails: {
            errorCode: 'RATE_LIMITED',
            httpStatus: 429,
            messageFa: `تعداد درخواست‌های تولید محتوا بیش از حد مجاز (۲۰ درخواست در دقیقه) است. لطفاً ${rateCheck.retryAfterSeconds} ثانیه صبر کنید.`,
            retryable: true,
            canFallbackToFlash: false,
            suggestedFallbackModel: null,
            retryAfterSeconds: rateCheck.retryAfterSeconds,
          },
        });
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const fieldError = validateTextFields([
        { labelFa: 'دستور یا توضیحات تکمیلی', value: body.customPrompt, maxLength: MAX_PROMPT_LENGTH },
        { labelFa: 'نام محصول', value: body.productName, maxLength: MAX_TEXT_FIELD_LENGTH },
        { labelFa: 'مخاطب هدف', value: body.targetAudience, maxLength: MAX_TEXT_FIELD_LENGTH },
        { labelFa: 'هدف کمپین', value: body.campaignGoal, maxLength: MAX_TEXT_FIELD_LENGTH },
        { labelFa: 'لحن محتوا', value: body.tone, maxLength: MAX_TEXT_FIELD_LENGTH },
        { labelFa: 'حالت اجرا', value: body.mode, maxLength: MAX_SHORT_FIELD_LENGTH },
        { labelFa: 'حالت اتصال', value: body.connectionMode, maxLength: MAX_SHORT_FIELD_LENGTH },
        { labelFa: 'کلید API شخصی', value: body.customApiKey, maxLength: MAX_API_KEY_LENGTH },
        { labelFa: 'کلمات کلیدی مقاله', value: body.articleKeywords, maxLength: MAX_TEXT_FIELD_LENGTH },
        { labelFa: 'نیت جستجو', value: body.articleSearchIntent, maxLength: MAX_SHORT_FIELD_LENGTH },
        { labelFa: 'خلاصه هوش برند', value: body.brandContextSummary, maxLength: MAX_BRAND_SUMMARY_LENGTH },
      ]);
      if (fieldError) {
        return res.status(400).json({ ok: false, error: fieldError });
      }

      // Note: any systemInstruction field in req.body is intentionally ignored; server enforces ARKA_SYSTEM_INSTRUCTION.
      const {
        mode = 'canvas-slide',
        productName = 'پکیج جامع مالی و حسابداری آرکا',
        targetAudience = 'مدیران کسب‌وکار، فروشگاه‌ها و حسابداران',
        campaignGoal = 'دریافت نسخه دموی رایگان ۱۰۰ سند و مشاوره خرید',
        tone = 'حرفه‌ای، متقاعدکننده و صمیمی',
        customPrompt = '',
        jsonMode = false,
        injectToCanvas = false,
        customApiKey = '',
        connectionMode = 'studio-creator-core',
        allowModelFallback = false,
        articleKeywords = '',
        articleSearchIntent = 'Commercial',
        brandContextSummary = '',
      } = body;

      const trimmedCustom = String(customPrompt || '').trim();
      const slashMatch = trimmedCustom.match(
        /^\/(fast|hybrid|rpe|visual|video|copy|start|help)\b|^راهنما\b/i
      );
      const activeSlash = slashMatch
        ? (slashMatch[1] || 'help').toLowerCase()
        : null;

      // Onboarding Router (/start, /help, راهنما) works immediately for authenticated users
      if (activeSlash === 'start' || activeSlash === 'help') {
        if (!verifiedUser && !String(customApiKey || '').trim()) {
          return res.status(401).json({
            ok: false,
            error:
              'احراز هویت انجام نشد. لطفاً وارد حساب گوگل شوید یا کلید شخصی خود را ثبت کنید.',
          });
        }
        const onboardingText = `خوش آمدید به «هسته مرکزی هوشمند استودیو آرکا (Arka Studio Enterprise Core)» — متصل به https://arka-acc.ir

لیست کامل ۶ دستور میانبر عملیاتی + استودیو مقاله SEO/AEO/GEO:
1. /fast [موضوع] — اجرای سریع با gemini-2.5-flash (تولید مستقیم و بدون مقدمه)
2. /hybrid [موضوع] — حالت ترکیبی (۳ رویکرد متفاوت + ۱ پرسش استراتژیک)
3. /rpe [موضوع] — معماری عمیق با gemini-2.5-pro (مصاحبه و استراتژی برند/کمپین)
4. /visual [موضوع] — ماتریس بصری ۸گانه (۸ مؤلفه انگلیسی + Master Prompt + اسلاید بوم)
5. /video [موضوع] — کارگردان ریلز و موشن (۳ قلاب + جدول ۵ ستونی + Veo Prompt + کاور بوم)
6. /copy [موضوع] — مهندسی کپی تبدیل‌محور (PAS/AIDA/BAB + اسلایدهای آماده StoryCanvas)
7. تب «مقاله SEO/AEO/GEO» — تولید مقاله کامل سئو، باکس پاسخ مستقیم هوش مصنوعی، اسکیمای FAQ و لینک‌سازی داخلی.`;
        return res.json({
          ok: true,
          mode,
          executionMeta: {
            selectedModel: 'gemini-2.5-flash',
            plannedModel: 'gemini-2.5-flash',
            usedFallback: false,
            modelDisplayName: 'gemini-2.5-flash (راهنمای سیستم)',
            detectedArkaMode: 'fast_path',
            detectedSlashCommand: `/${activeSlash}`,
            reasoningFa: 'پاسخ آنی راهنمای سیستم استودیو آرکا',
            connectionMode,
            keySource: 'server-env',
            jsonModeActive: false,
            latencyMs: Date.now() - startedAt,
          },
          result: { coreMarkdown: onboardingText },
        });
      }

      // Enforce canonical organization (arka_org) — never trust a foreign client-supplied organizationId
      if (
        body.organizationId &&
        String(body.organizationId).trim() !== CANONICAL_ARKA_ORG_ID
      ) {
        return res.status(403).json({
          ok: false,
          error: `سازمان ارسالی («${String(body.organizationId)}») مجاز نیست. استودیو آرکا روی سازمان «${CANONICAL_ARKA_ORG_ID}» قفل شده است.`,
          errorDetails: {
            errorCode: 'PERMISSION_DENIED',
            httpStatus: 403,
            messageFa: `سازمان ارسالی مجاز نیست. فقط «${CANONICAL_ARKA_ORG_ID}» مجاز است.`,
            retryable: false,
            canFallbackToFlash: false,
            suggestedFallbackModel: null,
          },
        });
      }

      const resolved = resolveAuthorizedGeminiClient({
        verifiedUser,
        inlineCustomApiKey: customApiKey,
        requestedConnectionMode: connectionMode,
      });
      if (!resolved.ok) {
        recordSafeAiAuditLog({
          uid: verifiedUser?.uid || 'anonymous',
          credentialSource: 'none',
          model: plannedRouterModel,
          operation: String(mode),
          outcome: 'error',
          errorCategory: resolved.classifiedError.errorCode,
          latencyMs: Date.now() - startedAt,
        });
        return res.status(resolved.classifiedError.httpStatus).json({
          ok: false,
          error: resolved.classifiedError.messageFa,
          errorDetails: resolved.classifiedError,
        });
      }

      const { ai, keySource } = resolved;
      const siteContext = await getLiveArkaSiteContext(false);
      const canonicalBrand = getCanonicalOrgBrandProfile();

      const isJsonFlagActive =
        Boolean(jsonMode) ||
        Boolean(injectToCanvas) ||
        /--json\b|\[json\]|output:\s*json|فرمت\s*json/i.test(trimmedCustom);

      const modelDecision = resolveSmartModelForTask(
        trimmedCustom,
        mode,
        isJsonFlagActive
      );
      plannedRouterModel = modelDecision.modelId;

      // Capability validation before execution
      const capabilityCheck = validateModelCapabilityForTask(
        modelDecision.modelId,
        modelDecision.requiredCapability
      );
      if (!capabilityCheck.supported) {
        recordSafeAiAuditLog({
          uid: verifiedUser?.uid || 'anonymous',
          credentialSource: keySource,
          model: modelDecision.modelId,
          operation: String(mode),
          outcome: 'error',
          errorCategory: 'MODEL_UNSUPPORTED',
          latencyMs: Date.now() - startedAt,
        });
        return res.status(400).json({
          ok: false,
          error: capabilityCheck.reasonFa,
          errorDetails: {
            errorCode: 'MODEL_UNSUPPORTED',
            httpStatus: 400,
            messageFa:
              capabilityCheck.reasonFa ||
              'مدل انتخاب‌شده از قابلیت درخواستی پشتیبانی نمی‌کند.',
            retryable: false,
            canFallbackToFlash: false,
            suggestedFallbackModel: null,
          },
        });
      }

      // Synthetic test hook for automated test suite (only when ARKA_TEST_ALLOW_SYNTHETIC_KEYS === '1')
      if (process.env.ARKA_TEST_ALLOW_SYNTHETIC_KEYS === '1') {
        if (trimmedCustom.includes('__TEST_SIMULATE_429__')) {
          if (!allowModelFallback && plannedRouterModel === 'gemini-2.5-pro') {
            const err429: any = new Error('Quota exceeded for model gemini-2.5-pro');
            err429.status = 429;
            throw err429;
          }
          recordSafeAiAuditLog({
            uid: verifiedUser?.uid || 'anonymous',
            credentialSource: keySource,
            model: 'gemini-2.5-flash',
            operation: String(mode),
            outcome: 'success',
            latencyMs: Date.now() - startedAt,
          });
          return res.json({
            ok: true,
            mode,
            executionMeta: {
              selectedModel: 'gemini-2.5-flash',
              plannedModel: plannedRouterModel,
              usedFallback: true,
              fallbackReason:
                'انتخاب آگاهانه کاربر ← اجرای مجدد درخواست با مدل جایگزین gemini-2.5-flash',
              modelDisplayName: modelDecision.modelDisplayName,
              detectedArkaMode: modelDecision.detectedArkaMode,
              reasoningFa: modelDecision.reasoningFa,
              connectionMode,
              keySource,
              latencyMs: Date.now() - startedAt,
            },
            result: { coreMarkdown: 'پاسخ موفق با مدل جایگزین gemini-2.5-flash' },
          });
        }
      }

      const buildExecutionMeta = (
        actualModelUsed: GeminiRouterModelId,
        usedFallback: boolean,
        fallbackReason?: string
      ) => {
        recordSafeAiAuditLog({
          uid: verifiedUser?.uid || 'anonymous',
          credentialSource: keySource,
          model: actualModelUsed,
          operation: String(mode),
          outcome: 'success',
          latencyMs: Date.now() - startedAt,
        });
        return {
          selectedModel: actualModelUsed,
          plannedModel: modelDecision.modelId,
          usedFallback,
          fallbackReason,
          modelDisplayName: modelDecision.modelDisplayName,
          detectedArkaMode: modelDecision.detectedArkaMode,
          detectedSlashCommand: modelDecision.detectedSlashCommand,
          reasoningFa: modelDecision.reasoningFa,
          connectionMode,
          keySource,
          organizationId: CANONICAL_ARKA_ORG_ID,
          canonicalBrandVersion: canonicalBrand.version || 1,
          jsonModeActive: isJsonFlagActive,
          liveContextCached: siteContext.cached,
          liveContextFetchedLive: siteContext.fetchedLive,
          latencyMs: Date.now() - startedAt,
        };
      };

      const slashDirective =
        activeSlash === 'fast'
          ? 'ماژول فعال: 1. Fast-Path (mode: "fast_path" / /fast) — بدون مقدمه یا کلیشه، مستقیماً خروجی نهایی، صریح، فشرده و آماده اجرا تولید کن.'
          : activeSlash === 'hybrid'
          ? 'ماژول فعال: 2. Hybrid Mode (mode: "hybrid" / /hybrid) — دقیقاً ۳ رویکرد متفاوت در data.variants (۱. مینیمال و مدیریتی، ۲. داستان‌گو و دغدغه‌محور، ۳. جسورانه و ساختارشکن) + حداقل ۱ اسلاید بوم در canvas_slides + دقیقاً ۱ پرسش کالیبراسیون در interaction.clarifying_questions تولید کن.'
          : activeSlash === 'rpe'
          ? 'ماژول فعال: 3. Deep RPE (mode: "deep_rpe" / /rpe) — معماری استراتژیک عمیق برند، تحلیل دقیق نقاط درد صنف و ۲ الی ۳ پرسش عمیق و مرحله‌به‌مرحله در interaction.clarifying_questions به همراه پیش‌طرح اسلاید در canvas_slides تولید کن.'
          : activeSlash === 'visual'
          ? 'ماژول فعال: 4. Modular Visual Matrix (mode: "visual_matrix" / /visual) — تمام ۸ مؤلفه انگلیسی data.visual_matrix + master_prompt + negative_prompt + اسلاید آماده تزریق در canvas_slides را تولید کن.'
          : activeSlash === 'video'
          ? 'ماژول فعال: 5. Video Director (mode: "video_director" / /video) — در data.video_production: بخش brief، دقیقاً ۳ قلاب متفاوت در hooks، جدول ۵ ستونی storyboard با ai_video_prompt دقیق انگلیسی برای Veo، بخش cta و یک اسلاید کاور آماده در canvas_slides تولید کن.'
          : activeSlash === 'copy'
          ? 'ماژول فعال: 6. Conversion Copywriting & Canvas Slide Engine (mode: "copy_engine" / /copy) — در data.copywriting: strategy، دقیقاً ۳ تیتر در headline_hooks، اسلایدهای structured_blocks، conversion_triggers و همچنین آرایه کامل canvas_slides آماده تزریق به StoryCanvas تولید کن.'
          : '';

      const canonicalBrandBlock = `
[پروفایل رسمی هوش برند سازمان آرکا (${CANONICAL_ARKA_ORG_ID} - نسخه v${canonicalBrand.version || 1})]:
- نام برند: ${canonicalBrand.brandName}
- شعار: ${canonicalBrand.tagline}
- ارزش پیشنهادی اصلی: ${canonicalBrand.coreValueProposition}
- مخاطبان هدف: ${canonicalBrand.targetAudienceSegments}
- لحن رسمی: ${canonicalBrand.toneOfVoice}
- تمایز رقابتی: ${canonicalBrand.competitivePositioning}
- ادعاهای مجاز و مستند: ${canonicalBrand.approvedClaims || ''}
- ستون‌های لینک‌سازی داخلی مجاز: ${canonicalBrand.internalLinkPillars}
${brandContextSummary ? `- یادداشت تکمیلی جلسه: ${brandContextSummary}` : ''}`;

      const systemInstruction = `${ARKA_SYSTEM_INSTRUCTION}

تمامی متن‌های فارسی باید ۱۰۰٪ به زبان فارسی سلیس، استاندارد، بدون غلط املایی و منحصراً بر اساس ویژگی‌های واقعی نرم‌افزار حسابداری آرکا (https://arka-acc.ir) شامل دموی رایگان ۱۰۰ سند، ۱ سال پشتیبانی رایگان، سرویس مستقیم سامانه مؤدیان، و ۸ سیستم تخصصی پاچال، سوله، ترخیص، منو، پروژه، ویترین، شتاب و پکیج جامع نوشته شوند.
تلفن رسمی آرکا: 051-36079047 | وب‌سایت: arka-acc.ir | آدرس: مشهد، سید رضی ۴۰، پلاک ۲۶۵.
${canonicalBrandBlock}${slashDirective ? `\n${slashDirective}\n` : ''}
دانش زنده و کاتالوگ ۸ سیستم سایت آرکا:
${siteContext.summary}`;

      // Structured 6-Module Enterprise Engine:
      const isEnterpriseStructuredSlash =
        activeSlash !== null &&
        ['hybrid', 'rpe', 'visual', 'video', 'copy'].includes(activeSlash);

      if (isJsonFlagActive || isEnterpriseStructuredSlash) {
        const mappedActiveMode = modelDecision.detectedArkaMode;

        const jsonPrompt = `بر اساس معماری اجرایی شش‌گانه استودیو آرکا و ماژول فعال «${mappedActiveMode}»، درخواست زیر را برای محصول «${productName}» از نرم‌افزار حسابداری آرکا (https://arka-acc.ir) اجرا کن و فقط آبجکت JSON معتبر (بدون markdown fences) مطابق اسکیمای رسمی Arka Enterprise AI برگردان:
- محصول انتخاب‌شده: ${productName}
- مخاطب هدف: ${targetAudience}
- هدف کمپین: ${campaignGoal}
- لحن: ${tone}
- درخواست کاربر: ${trimmedCustom || 'تولید محتوای کامل و اسلاید آماده تزریق به StoryCanvas'}

الزامات اسکیما:
1. حتماً آرایه "canvas_slides" را با حداقل ۱ تا ۵ اسلاید کامل پر کن (شامل slide_number، badge_text، headline، subheadline، bullet_points با ۳ یا ۴ مورد واقعی، footer_cta، visual_background_prompt به انگلیسی و theme_accent مثل #08cdbd یا #a855f7).
2. در بخش "meta"، فیلد "target_aspect_ratio" را متناسب با درخواست ("9:16" یا "4:5" یا "1:1") قرار بده و "studio" را برابر "Arka Enterprise AI" بگذار.
3. بر اساس ماژول فعال، بخش متناظر در "data" (یعنی variants یا visual_matrix یا video_production با ۳ قلاب و جدول ۵ ستونی و ai_video_prompt انگلیسی، یا copywriting با ۳ تیتر و structured_blocks) را کاملاً دقیق، کاربردی و غنی تکمیل کن.`;

        const { response, actualModelUsed, usedFallback, fallbackReason } =
          await executeGeminiGeneration({
            ai,
            primaryModel: plannedRouterModel,
            fallbackModel: modelDecision.fallbackModelId,
            allowModelFallback: Boolean(allowModelFallback),
            contents: jsonPrompt,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
            },
          });

        const parsed = extractSafeJson(response.text || '{}');
        const normalizedMaster = {
          meta: {
            studio: 'Arka Enterprise AI',
            active_mode: parsed?.meta?.active_mode || mappedActiveMode,
            target_aspect_ratio: parsed?.meta?.target_aspect_ratio || '9:16',
            used_live_context: true,
          },
          canvas_slides: Array.isArray(parsed?.canvas_slides)
            ? parsed.canvas_slides
            : [],
          data: parsed?.data || {},
          interaction: parsed?.interaction || {
            clarifying_questions: [],
            suggested_next_steps: [],
          },
        };

        return res.json({
          ok: true,
          mode,
          executionMeta: buildExecutionMeta(
            actualModelUsed,
            usedFallback,
            fallbackReason
          ),
          result: normalizedMaster,
        });
      }

      // Fast-Path (/fast) Markdown Execution
      if (activeSlash === 'fast') {
        const fastPrompt = `درخواست کاربر (${trimmedCustom}) را برای محصول «${productName}» از گروه نرم‌افزاری آرکا (https://arka-acc.ir) با لحن «${tone}» ویژه «${targetAudience}» و هدف «${campaignGoal}» به صورت مستقیم، دقیق و بدون هیچ مقدمه اضافی اجرا کن.`;

        const { response, actualModelUsed, usedFallback, fallbackReason } =
          await executeGeminiGeneration({
            ai,
            primaryModel: plannedRouterModel,
            fallbackModel: modelDecision.fallbackModelId,
            allowModelFallback: Boolean(allowModelFallback),
            contents: fastPrompt,
            config: {
              systemInstruction,
            },
          });

        return res.json({
          ok: true,
          mode,
          executionMeta: buildExecutionMeta(
            actualModelUsed,
            usedFallback,
            fallbackReason
          ),
          result: {
            coreMarkdown: (response.text || '').trim(),
          },
        });
      }

      // NEW MODULE: SEO / AEO / GEO Article Studio (mode === 'seo-article')
      if (mode === 'seo-article') {
        const articleDepth = String(body.articleContentDepth || 'comprehensive');
        const depthDirective =
          articleDepth === 'pillar'
            ? 'عمق محتوا: مقاله ستونی جامع (Pillar Content +3000 کلمه، حداقل ۶ بخش عمیق H2/H3 با تحلیل کامل اجرایی).'
            : articleDepth === 'standard'
            ? 'عمق محتوا: مقاله استاندارد سئو (۱۲۰۰ تا ۱۵۰۰ کلمه، ۵ بخش کاربردی H2/H3).'
            : 'عمق محتوا: مقاله تخصصی جامع (۲۰۰۰ تا ۲۵۰۰ کلمه، حداقل ۵ بخش تحلیلی H2/H3).';

        const prompt = `یک مقاله جامع، عمیق و کاملاً بهینه‌شده برای موتورهای جستجو (SEO)، موتورهای پاسخ‌گو (AEO - Answer Engine Optimization) و موتورهای مولد هوش مصنوعی (GEO - Generative Engine Optimization) برای وب‌سایت رسمی گروه نرم‌افزاری آرکا (https://arka-acc.ir) با محوریت محصول «${productName}» بنویس.
- مخاطب هدف: ${targetAudience}
- هدف تجاری و CTA: ${campaignGoal}
- لحن: ${tone}
- کلمات کلیدی پیشنهادی کاربر: ${articleKeywords || productName}
- نیت جستجوی هدف (Search Intent): ${articleSearchIntent || 'Commercial'}
- ${depthDirective}
${customPrompt ? `- موضوع و نکات اختصاصی کاربر: ${customPrompt}` : ''}

الزامات صداقت محتوایی و سئو (SEO / AEO / GEO Content Integrity):
1. هرگز آمار، استناد، قابلیت محصول یا لینک داخلی جعلی نساز. فقط از صفحات واقعی سایت arka-acc.ir (شامل https://arka-acc.ir ، https://arka-acc.ir/demo ، https://arka-acc.ir/products ، https://arka-acc.ir/pages/tax ، https://arka-acc.ir/blog ، https://arka-acc.ir/academy ، https://arka-acc.ir/contact) استفاده کن.
2. فکت‌های مستند آرکا (بیش از ۱۰ سال تجربه، دموی رایگان ۱۰۰ سند واقعی در arka-acc.ir/demo، ۱ سال پشتیبانی رایگان + آرکا آکادمی، اتصال مستقیم سامانه مؤدیان و ۸ سیستم تخصصی) را در آرایه verifiedArkaFacts قرار بده.
3. هرگونه ادعای عمومی بازار یا قوانین مالیاتی که پیش از انتشار نیاز به تایید تحریریه یا مشاور مالیاتی دارد را به صورت شفاف در آرایه claimsRequiringVerification اعلام کن.
4. باکس پاسخ مستقیم (aeoDirectAnswerBox) در ۴۰ تا ۶۰ کلمه و خلاصه استنادی (geoCitationSummary) را دقیق بنویس.`;

        const { response, actualModelUsed, usedFallback, fallbackReason } =
          await executeGeminiGeneration({
            ai,
            primaryModel: plannedRouterModel,
            fallbackModel: modelDecision.fallbackModelId,
            allowModelFallback: Boolean(allowModelFallback),
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              responseSchema: SEO_ARTICLE_SCHEMA,
            },
          });

        const parsed = extractSafeJson(response.text || '{}');
        // Validate & sanitize internal links against real arka-acc.ir routes
        if (Array.isArray(parsed.internalLinks)) {
          parsed.internalLinks = parsed.internalLinks.map((lnk: any) => {
            const check = validateArkaInternalUrl(lnk?.targetUrl);
            return {
              anchorText: String(lnk?.anchorText || 'نرم‌افزار حسابداری آرکا'),
              targetUrl: check.normalizedUrl,
              verifiedUrl: check.verifiedMatch,
              placementContext: String(lnk?.placementContext || 'در متن مقاله'),
            };
          });
        }
        parsed.schemaRankingDisclaimerFa =
          'نکته فنی سئو: داده‌های ساختاریافته (FAQ / Article Schema) به درک بهتر موتورهای جستجو و موتورهای پاسخ‌گو کمک می‌کنند، اما به‌تنهایی تضمین‌کننده جایگاه یا رتبه اول در نتایج گوگل نیستند.';

        return res.json({
          ok: true,
          mode: 'seo-article',
          executionMeta: buildExecutionMeta(
            actualModelUsed,
            usedFallback,
            fallbackReason
          ),
          result: parsed,
        });
      }

      if (mode === 'canvas-slide') {
        const prompt = `یک اسلاید استوری یا پست اینستاگرامی پرفروش به همراه کپشن کامل برای محصول «${productName}» از گروه نرم‌افزاری آرکا (arka-acc.ir) تولید کن.
مخاطب هدف: ${targetAudience}
هدف کمپین: ${campaignGoal}
لحن: ${tone}
${customPrompt ? `دستور اختصاصی کاربر: ${customPrompt}` : ''}
حتماً ۴ کارت ویژگی دقیق در آرایه items قرار بده و کپشن کامل اینستاگرام با هشتگ‌ها را در فیلد instagramCaption بنویس.`;

        const { response, actualModelUsed, usedFallback, fallbackReason } =
          await executeGeminiGeneration({
            ai,
            primaryModel: plannedRouterModel,
            fallbackModel: modelDecision.fallbackModelId,
            allowModelFallback: Boolean(allowModelFallback),
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              responseSchema: SLIDE_SCHEMA,
            },
          });

        const parsed = extractSafeJson(response.text || '{}');
        return res.json({
          ok: true,
          mode,
          executionMeta: buildExecutionMeta(
            actualModelUsed,
            usedFallback,
            fallbackReason
          ),
          result: parsed,
        });
      }

      if (mode === 'carousel-deck') {
        const prompt = `یک پست کاروسل ۵ اسلایدی به‌هم‌پیوسته و حرفه‌ای اینستاگرام برای محصول «${productName}» از گروه نرم‌افزاری آرکا (arka-acc.ir) طراحی کن.
مخاطب هدف: ${targetAudience}
هدف کمپین: ${campaignGoal}
لحن: ${tone}
${customPrompt ? `توضیحات تکمیلی کاربر: ${customPrompt}` : ''}
اسلاید ۱ باید قلاب (Hook) قدرتمند باشد، اسلایدهای ۲ تا ۴ مزایا و راهکارهای دقیق آرکا را تشریح کنند و اسلاید ۵ دعوت به اقدام (دانلود دموی ۱۰۰ سند رایگان از arka-acc.ir و تماس 051-36079047) باشد. هر اسلاید باید دقیقاً ۴ کارت در items داشته باشد.`;

        const { response, actualModelUsed, usedFallback, fallbackReason } =
          await executeGeminiGeneration({
            ai,
            primaryModel: plannedRouterModel,
            fallbackModel: modelDecision.fallbackModelId,
            allowModelFallback: Boolean(allowModelFallback),
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  deckTitle: { type: Type.STRING, description: 'عنوان پکیج کاروسل' },
                  deckSubtitle: { type: Type.STRING, description: 'زیرعنوان کاروسل' },
                  captionText: { type: Type.STRING, description: 'کپشن کامل اینستاگرام به همراه هشتگ‌ها' },
                  slides: {
                    type: Type.ARRAY,
                    description: '۵ اسلاید به‌هم‌پیوسته کاروسل',
                    items: SLIDE_SCHEMA,
                  },
                },
                required: ['deckTitle', 'deckSubtitle', 'captionText', 'slides'],
              },
            },
          });

        const parsed = extractSafeJson(response.text || '{}');
        return res.json({
          ok: true,
          mode,
          executionMeta: buildExecutionMeta(
            actualModelUsed,
            usedFallback,
            fallbackReason
          ),
          result: parsed,
        });
      }

      if (mode === 'reels-script') {
        const prompt = `یک سناریوی کامل و دقیق برای ساخت ویدیو ریلز (Reels) یا موشن‌گرافی تبلیغاتی اینستاگرام ویژه «${productName}» از نرم‌افزار حسابداری آرکا (arka-acc.ir) بنویس.
مخاطب هدف: ${targetAudience}
هدف ویدیو: ${campaignGoal}
لحن: ${tone}
${customPrompt ? `درخواست اختصاصی کاربر: ${customPrompt}` : ''}
سناریو باید شامل دقیقاً ۳ قلاب متفاوت برای ۳ ثانیه اول، سکانس‌بندی دقیق (تصویر/موشن، متن نریشن گوینده، نوشته روی تصویر و پرامپت انگلیسی ساخت ویدیو برای Veo)، پیشنهاد موسیقی/افکت صوتی، کپشن کامل و یک اسلاید کاور آماده (coverSlide) برای تزریق مستقیم به بوم استودیو باشد.`;

        const { response, actualModelUsed, usedFallback, fallbackReason } =
          await executeGeminiGeneration({
            ai,
            primaryModel: plannedRouterModel,
            fallbackModel: modelDecision.fallbackModelId,
            allowModelFallback: Boolean(allowModelFallback),
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  scenarioTitle: { type: Type.STRING, description: 'عنوان سناریوی ریلز یا موشن‌گرافی' },
                  hookFirst3Seconds: { type: Type.STRING, description: 'قلاب اصلی ۳ ثانیه اول ویدیو' },
                  threeHooks: {
                    type: Type.ARRAY,
                    description: '۳ قلاب متفاوت ۳ ثانیه اول (شوکه‌کننده، سوالی، نتیجه‌محور)',
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        type: { type: Type.STRING },
                        visual: { type: Type.STRING },
                        onScreenText: { type: Type.STRING },
                        audioVo: { type: Type.STRING },
                      },
                      required: ['type', 'visual', 'onScreenText', 'audioVo'],
                    },
                  },
                  durationEstimate: { type: Type.STRING, description: 'مدت زمان پیشنهادی (مثلاً ۳۵ ثانیه)' },
                  visualStyleAndMusic: { type: Type.STRING, description: 'سبک بصری، نورپردازی، موشن‌گرافی و موسیقی پس‌زمینه' },
                  scenes: {
                    type: Type.ARRAY,
                    description: 'جدول سکانس‌های ویدیو یا موشن‌گرافی (حداقل ۵ سکانس)',
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        sceneNumber: { type: Type.INTEGER },
                        timeCode: { type: Type.STRING, description: 'بازه زمانی مثلاً 00:00 تا 00:04' },
                        visualAction: { type: Type.STRING, description: 'توضیح دقیق تصویر، فیلم‌برداری یا انیمیشن موشن‌گرافی' },
                        voiceover: { type: Type.STRING, description: 'متن دقیق دیالوگ یا نریشن گوینده' },
                        onScreenText: { type: Type.STRING, description: 'تایپوگرافی یا متن گرافیکی روی صفحه' },
                        aiVideoPrompt: { type: Type.STRING, description: 'English AI Video Generation Prompt (Veo) for this scene' },
                      },
                      required: ['sceneNumber', 'timeCode', 'visualAction', 'voiceover', 'onScreenText', 'aiVideoPrompt'],
                    },
                  },
                  captionAndHashtags: { type: Type.STRING, description: 'کپشن حرفه‌ای ریلز به همراه هشتگ‌های پربازدید' },
                  coverSlide: SLIDE_SCHEMA,
                },
                required: [
                  'scenarioTitle',
                  'hookFirst3Seconds',
                  'durationEstimate',
                  'visualStyleAndMusic',
                  'scenes',
                  'captionAndHashtags',
                  'coverSlide',
                ],
              },
            },
          });

        const parsed = extractSafeJson(response.text || '{}');
        return res.json({
          ok: true,
          mode,
          executionMeta: buildExecutionMeta(
            actualModelUsed,
            usedFallback,
            fallbackReason
          ),
          result: parsed,
        });
      }

      if (mode === 'campaign-calendar-30') {
        const prompt = `یک «تقویم کمپین ۳۰ روزه انتشار استوری و پست اینستاگرام» (AI Campaign Calendar - 30 Days) برای نرم‌افزار حسابداری آرکا (https://arka-acc.ir) با محوریت محصول «${productName}» و چرخه عرضه محصولات سایت آرکا طراحی کن.
مخاطب هدف: ${targetAudience}
هدف اصلی کمپین: ${campaignGoal}
لحن: ${tone}
${customPrompt ? `نکات اختصاصی کاربر: ${customPrompt}` : ''}

الزامات تقویم ۳۰ روزه:
- دقیقاً ۳۰ ردیف (روز ۱ تا ۳۰) تولید کن که بر اساس ۴ فاز چرخه عرضه محصولات سایت آرکا (Product Launch Cycles) دسته‌بندی شده باشند:
  * هفته اول (روز ۱ تا ۷): فاز اول چرخه عرضه — آگاهی از دغدغه‌های مالی اصناف، معرفی هسته یکپارچه آرکا و سرویس مستقیم سامانه مؤدیان (https://arka-acc.ir/pages/tax).
  * هفته دوم (روز ۸ تا ۱۵): فاز دوم چرخه عرضه — رونمایی و معرفی تخصصی خانواده ۸ محصول آرکا (پکیج جامع مالی، حسابداری فروشگاهی پاچال، حسابداری تولیدی و انبار سوله، بازرگانی ترخیص، رستورانی منو، شرکتی پروژه، آنلاین‌شاپ ویترین، استارتاپی شتاب).
  * هفته سوم (روز ۱۶ تا ۲۳): فاز سوم چرخه عرضه — اثبات اجتماعی (مطالعه موردی شرکت رنگ بهارستان)، ایجنت هوش مصنوعی مالی آرکا، آموزش‌های آرکا آکادمی و ۱ سال پشتیبانی رایگان.
  * هفته چهارم (روز ۲۴ تا ۳۰): فاز چهارم چرخه عرضه — کمپین فروش مستقیم، دعوت به تست نسخه دموی رایگان ۱۰۰ سند واقعی (https://arka-acc.ir/demo) و مشاوره تلفنی 051-36079047.
- برای هر روز، فیلدهای دقیق تیتر و زیرتیتر را بده تا کاربر بتواند هر روز دلخواه را با یک کلیک مستقیماً وارد بوم گرافیکی استودیو کند و کل جدول ۳۰ روزه را به عنوان فایل Spreadsheet در Google Drive ذخیره نماید.`;

        const { response, actualModelUsed, usedFallback, fallbackReason } =
          await executeGeminiGeneration({
            ai,
            primaryModel: plannedRouterModel,
            fallbackModel: modelDecision.fallbackModelId,
            allowModelFallback: Boolean(allowModelFallback),
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  calendarTitle: {
                    type: Type.STRING,
                    description: 'عنوان تقویم ۳۰ روزه کمپین اینستاگرام آرکا',
                  },
                  launchCycleSummary: {
                    type: Type.STRING,
                    description: 'خلاصه استراتژی ۴ فاز چرخه عرضه محصولات سایت آرکا در ۳۰ روز',
                  },
                  scheduleDays: {
                    type: Type.ARRAY,
                    description: 'برنامه دقیق ۳۰ روز انتشار (روز ۱ تا ۳۰)',
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        dayNumber: { type: Type.INTEGER, description: 'شماره روز از ۱ تا ۳۰' },
                        launchPhase: {
                          type: Type.STRING,
                          description: 'فاز چرخه محصول (مثلاً هفته ۱: آگاهی و سامانه مؤدیان)',
                        },
                        productModule: {
                          type: Type.STRING,
                          description: 'محصول یا سرویس مرتبط در سایت arka-acc.ir',
                        },
                        formatRecommended: {
                          type: Type.STRING,
                          description: 'فرمت پیشنهادی (استوری ۹:۱۶ | پست ۴:۵ | کاروسل ۵ اسلایدی | ریلز)',
                        },
                        categoryLabel: {
                          type: Type.STRING,
                          description: 'برچسب کوتاه بالای بوم',
                        },
                        eyebrow: {
                          type: Type.STRING,
                          description: 'روتیتر جذاب بالای تیتر اصلی',
                        },
                        headlinePart1: {
                          type: Type.STRING,
                          description: 'بخش اول تیتر اصلی بوم',
                        },
                        headlineHighlight: {
                          type: Type.STRING,
                          description: 'کلمه کلیدی متمایز و رنگی در تیتر',
                        },
                        headlinePart2: {
                          type: Type.STRING,
                          description: 'بخش پایانی تیتر اصلی',
                        },
                        leadCopy: {
                          type: Type.STRING,
                          description: 'متن توضیحی زیر تیتر (۲۰ تا ۳۰ کلمه)',
                        },
                        primaryStatValue: {
                          type: Type.STRING,
                          description: 'شاخص عددی یا کلیدی کارت اصلی (مثلاً ۱۰۰ سند دمو)',
                        },
                        primaryStatLabel: {
                          type: Type.STRING,
                          description: 'زیرنویس شاخص کلیدی',
                        },
                        ctaAction: {
                          type: Type.STRING,
                          description: 'دعوت به اقدام (لینک arka-acc.ir/demo یا تماس 051-36079047)',
                        },
                        captionSummary: {
                          type: Type.STRING,
                          description: 'کپشن یا متن تعاملی استوری آماده انتشار',
                        },
                      },
                      required: [
                        'dayNumber',
                        'launchPhase',
                        'productModule',
                        'formatRecommended',
                        'categoryLabel',
                        'eyebrow',
                        'headlinePart1',
                        'headlineHighlight',
                        'headlinePart2',
                        'leadCopy',
                        'primaryStatValue',
                        'primaryStatLabel',
                        'ctaAction',
                        'captionSummary',
                      ],
                    },
                  },
                },
                required: ['calendarTitle', 'launchCycleSummary', 'scheduleDays'],
              },
            },
          });

        const parsed = extractSafeJson(response.text || '{}');
        return res.json({
          ok: true,
          mode: 'campaign-calendar-30',
          executionMeta: buildExecutionMeta(
            actualModelUsed,
            usedFallback,
            fallbackReason
          ),
          result: parsed,
        });
      }

      // Default: 'campaign-plan' (5-Day Sales Campaign & Content Calendar + Caption)
      const prompt = `یک برنامه کمپین فروش و تقویم محتوایی ۵ روزه اینستاگرام (شامل استوری، پست تک‌صفحه، کاروسل و ریلز) همراه با کپشن‌های آماده برای «${productName}» از نرم‌افزار حسابداری آرکا (arka-acc.ir) طراحی کن.
مخاطب هدف: ${targetAudience}
هدف فروش: ${campaignGoal}
لحن: ${tone}
${customPrompt ? `نکات مدنظر کاربر: ${customPrompt}` : ''}
همچنین یک اسلاید اصلی کمپین (heroSlide) در خروجی قرار بده تا کاربر بتواند با یک کلیک آن را وارد بوم طراحی کند.`;

      const { response, actualModelUsed, usedFallback, fallbackReason } =
        await executeGeminiGeneration({
          ai,
          primaryModel: plannedRouterModel,
          fallbackModel: modelDecision.fallbackModelId,
          allowModelFallback: Boolean(allowModelFallback),
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                campaignName: { type: Type.STRING, description: 'نام کمپین فروش اینستاگرامی آرکا' },
                strategyOverview: { type: Type.STRING, description: 'استراتژی کلی قیف فروش و زاویه تبلیغاتی کمپین' },
                keyOfferHighlight: { type: Type.STRING, description: 'پیشنهاد ردناشدنی کمپین (مثلاً ۱۰۰ سند دموی رایگان + ۱ سال پشتیبانی رایگان)' },
                days: {
                  type: Type.ARRAY,
                  description: 'برنامه ۵ گام/روز کمپین',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      dayTitle: { type: Type.STRING, description: 'روز و فرمت محتوا (مثلاً روز اول · ریلز قلاب درد صنف)' },
                      formatRecommended: { type: Type.STRING, description: 'استوری ۹:۱۶ | پست ۴:۵ | کاروسل | ریلز' },
                      headlineHook: { type: Type.STRING, description: 'تیتر و قلاب اصلی محتوا' },
                      contentAngle: { type: Type.STRING, description: 'سناریوی اجرایی و پیام کلیدی' },
                      ctaAction: { type: Type.STRING, description: 'دعوت به اقدام دقیق (دایرکت، لینک دمو، تماس)' },
                      readyCaption: { type: Type.STRING, description: 'کپشن یا متن استوری آماده کپی' },
                    },
                    required: [
                      'dayTitle',
                      'formatRecommended',
                      'headlineHook',
                      'contentAngle',
                      'ctaAction',
                      'readyCaption',
                    ],
                  },
                },
                heroSlide: SLIDE_SCHEMA,
              },
              required: [
                'campaignName',
                'strategyOverview',
                'keyOfferHighlight',
                'days',
                'heroSlide',
              ],
            },
          },
        });

      const parsed = extractSafeJson(response.text || '{}');
      return res.json({
        ok: true,
        mode: 'campaign-plan',
        executionMeta: buildExecutionMeta(
          actualModelUsed,
          usedFallback,
          fallbackReason
        ),
        result: parsed,
      });
    } catch (err: any) {
      const classified = classifyGeminiError(err, plannedRouterModel);
      return res.status(classified.httpStatus).json({
        ok: false,
        error: classified.messageFa,
        errorDetails: classified,
      });
    }
  });

  return app;
}

async function startServer() {
  const app = createArkaExpressApp();
  const PORT = 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Arka Studio full-stack server running on http://0.0.0.0:${PORT}`
    );
  });
}

if (process.env.ARKA_TEST_MODE !== '1') {
  startServer();
}
