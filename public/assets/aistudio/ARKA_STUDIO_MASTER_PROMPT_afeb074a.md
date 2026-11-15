# ARKA STUDIO — MASTER ENGINEERING PROMPT
### Argon 4 | Repository Audit, Security, Arka-First Product Completion

**Repository:** https://github.com/amirreza4710/Arka-Studio/

## 1. Mission

Continue the existing Arka Studio repository. This is NOT a greenfield project.

Inspect the real codebase, identify defects and incomplete work, then repair and complete the approved scope incrementally. Preserve working features, user data and existing architecture wherever sound.

**Do not rebuild the application, replace architecture without evidence, or assume a planned feature is already implemented.** The repository is the source of truth.

## 2. Approved Product Strategy: Arka-First, SaaS-Ready

First stabilize and complete the dedicated Arka product. Prepare only the minimum architecture needed for future multi-organization SaaS.

Implement:
- One canonical organization: `arka_org`.
- Minimal organization/workspace and membership abstraction.
- Backend-enforced membership and role authorization.
- Organization-level brand profile and shared assets.
- Separate user-level preferences and private data.

The client-supplied organization ID is never proof of authorization.

**Defer completely:** public SaaS registration/onboarding, billing, subscriptions, payment gateway, public tenant dashboard, marketplace, complex enterprise administration and premature microservices.

## 3. Audit Before Editing

Inspect Git status, current branch, project structure, package scripts, frontend/backend, APIs, Firebase Auth/Admin, Firestore schema/rules, Gemini integration, credential handling, environment configuration, deployment and tests.

Verify the actual stack. Known indicators include React 19, TypeScript, Vite, Tailwind 4, Express, Firebase, Firestore and Google GenAI SDK.

Investigate these known risk areas if present:
- `CUSTOM_BYOK_STORAGE_KEY` and browser-side API-key storage.
- `createGeminiClient(customApiKey?)`.
- `verifyFirebaseIdToken` and all protected endpoints.
- In-memory rate limiting.
- Silent model fallback.
- User/organization data isolation.

Classify findings by severity and cite exact files/functions and evidence. Do not rewrite working components unnecessarily.

## 4. Safe Execution

- Preserve all uncommitted changes.
- Create a separate feature branch.
- Never overwrite user work.
- Make small, reviewable changes.
- Do not perform destructive migrations or irreversible production changes without approval.
- For risky changes, explain impact, affected data and safest alternative.
- Proceed without unnecessary approval requests for ordinary reversible work.

## 5. Mandatory Security

### BYOK Vault
Remove raw Gemini API keys from `localStorage`, `sessionStorage`, browser persistence, client databases, source code, logs and client-accessible Firestore data.

Implement server-side encryption using **AES-256-GCM**:
- Master key only in server-side secret management or KMS.
- `ENCRYPTION_KEY` may be used only as a server-side secret.
- Never expose master/decrypted keys to frontend, logs or API responses.
- Generate a cryptographically secure, unique nonce for every encryption operation; never reuse a nonce with the same key.
- Store ciphertext, nonce, authentication tag and encryption-version metadata.
- Validate authentication tags.
- Bind each credential to the verified Firebase UID.
- Derive credential ownership from verified auth context, never client-supplied IDs.
- Support validation, masked status, replacement, deletion and safe rotation.
- Preserve decryptability of old records until rotation/migration is verified.

If production secret management is unavailable, document the requirement. Never invent or commit secrets. User A must never access User B's key.

### Firebase Authentication
Use Firebase Admin SDK on the backend where appropriate. Verify token signature, expiration, issuer and audience; check revocation where required.

UID must come only from a verified token. Centralized middleware must protect every sensitive endpoint. Test missing, invalid, expired and (where supported) revoked tokens. Enforce ownership in backend authorization and independently in Firestore rules. A frontend route guard is not security.

### Organization Authorization
For `arka_org`, verify identity, membership, role/permission and resource scope on every protected operation. Never trust a client-supplied `organizationId`. Use least privilege.

### Rate Limiting
Review existing rate limiting. In-memory limiting is insufficient for horizontally scaled production. Use a shared store only if deployment requires it; do not add infrastructure without evidence. Support configurable per-user/per-IP limits, HTTP 429 and `Retry-After`.

## 6. AI Engine and Model Routing

Centralize provider access and credential resolution. Maintain a capability registry based on verified provider/SDK support (text, reasoning, image, video, structured output, etc.). Validate capability before each operation. Do not invent model availability, capabilities or quotas.

**Disable silent fallback and quality downgrades.** Never silently switch from `gemini-2.5-pro` to a lighter model after quota or availability errors.

Fallback requires explicit user choice and `allowModelFallback: true`. Show the Persian action:
**«تلاش مجدد با مدل جایگزین (Gemini 2.5 Flash)»**

Do not consume another credential or organization quota without authorization. If the alternative is unavailable, say so.

Distinguish personal BYOK, authorized organization/admin credential and missing credential. Server `GEMINI_API_KEY` fallback is restricted to explicitly authorized admin/service workflows. Ordinary users must not silently consume admin quota.

Show credential source without revealing secrets. Log only safe metadata: user, authorized organization, credential source, model, operation, timestamp, outcome, error category and available usage metadata. Never log secrets, authorization headers or decrypted credentials.

Use consistent Persian error handling for:
`AUTH_REQUIRED`, `INVALID_API_KEY`, `QUOTA_EXCEEDED`, `MODEL_UNAVAILABLE`, `MODEL_UNSUPPORTED`, `NETWORK_ERROR`, `PROVIDER_ERROR`, `RATE_LIMITED`, `INTERNAL_ERROR`.

## 7. Organization vs User Data

This section overrides any conflicting earlier assumption that each user owns a separate official brand profile.

**Organization data:** canonical Arka identity, brand voice, catalog of 8 Arka systems, personas, competitive advantages, strategy, approved claims, assets, shared campaigns and templates.

There must be **one canonical organization-level Arka Brand Profile**, not conflicting per-user copies. Authorized members may edit it according to permissions. Include validation, versioning and update timestamps.

**User data:** personal UI/theme preferences, AI preferences, preferred model, personal drafts where applicable, activity history and individual settings. Personal preferences must never overwrite organizational identity.

Suggested logical structure (adapt to existing architecture; do not replace blindly):
- `/organizations/{orgId}`
- `/organizations/{orgId}/members/{userId}`
- `/organizations/{orgId}/settings/brandProfile`
- `/organizations/{orgId}/assets/{assetId}`
- `/organizations/{orgId}/campaigns/{campaignId}`
- `/users/{userId}/settings/preferences`
- `/users/{userId}/aiGenerations/{generationId}`
- `/users/{userId}/credentials/{credentialId}`

Enforce ownership, membership, schema validation and permissions in backend and Firestore rules.

## 8. Brand Intelligence Hub

Complete the canonical organizational hub with:
- Arka identity and catalog of 8 software systems.
- Product descriptions, personas and target audiences.
- Brand voice, competitive advantages and marketing goals.
- Approved claims, keywords/content strategy and brand assets.

Use one authorized, versioned source of truth. The AI engine retrieves this profile. Do not hardcode Arka-specific commercial assumptions into the generic content-generation engine.

## 9. Content Features to Preserve and Complete

Preserve existing functionality, including where present:
- StoryCanvas and Carousel Editor.
- Social Content Studio.
- 30-day Campaign Calendar.
- Reels/video script generator.
- Google Drive/Sheets synchronization.
- Debug Console.
- Generation history and saved outputs.

Complete **SEO/AEO/GEO Article Studio** with topic, primary/secondary keywords, search intent, target Arka product, audience and content depth as inputs. Outputs: keyword/search-intent analysis, outline, structured article, semantic headings, FAQ/valid structured data where appropriate, SEO title, meta description, suggested internal links, LinkedIn and Instagram repurposing.

Content integrity:
- Schema markup does not guarantee ranking.
- Never fabricate citations, statistics, product capabilities or internal URLs.
- Validate internal links against actual `arka-acc.ir` pages when possible.
- Distinguish verified facts from AI suggestions.
- Attribute external factual sources and flag claims needing human verification.
- Validate structured output before saving.

## 10. UI and Authentication Layers

Preserve Arka visual identity:
- Navy `#062959`, turquoise `#08cdbd`, accent `#14dac3`.
- Dark surfaces `#07090E` and `#0F1420`.
- Vazirmatn, Persian RTL and readable light/dark modes.

Test widths 360, 390, 768, 1024 and 1440 px. Preserve StoryCanvas export dimensions exactly: 1080×1920, 1080×1350 and 1080×1080.

Keep three systems separate:
1. User account: Firebase Authentication.
2. Google Workspace: Google OAuth for Drive/Sheets.
3. AI credentials: Gemini/BYOK Vault.

Show their statuses independently. Centralize authenticated AI requests. Client sends credentials only over HTTPS with a verified Firebase token; backend validates, authorizes, encrypts and persists them. Return masked metadata only.

Firestore rules must require authentication, enforce user ownership and organization membership/roles, validate allowed fields, prevent ownership/role tampering and block cross-user or unauthorized secret access. Test rules independently.

Debug Console may show safe request status/timing, connection status, credential source, model, rate limits and usage metadata. Redact authorization headers, keys, access/refresh tokens, encryption keys and sensitive payloads.

## 11. Testing and Verification

Do not claim completion without evidence.

Test:
- Auth: missing/invalid/expired/revoked tokens where supported; unauthorized organization and cross-user access.
- BYOK: isolation; no raw key in responses/browser/logs; encryption/decryption; tag validation; unique secure nonces; replacement/deletion/rotation; old-record decryptability.
- AI: capability validation; no implicit fallback; explicit fallback; error classification; credential source; no unauthorized server-key use.
- Organization: membership/role enforcement; data isolation; personal preferences cannot overwrite canonical brand data.
- Rate limit: limits, 429 and `Retry-After`.
- Content: structured output, no fabricated URLs/citations, verified-fact distinction and consistent brand context.

Inspect `package.json` and run actual available TypeScript, lint, unit, integration and production-build commands.

Clearly distinguish:
1. Unit tests.
2. Mocked integration tests.
3. Real Firebase integration tests.
4. Real Gemini provider integration tests.
5. Production deployment verification.

Mocked tests are not proof of real provider integration. If credentials/infrastructure are unavailable, report the limitation. Never claim production deployment was verified unless it was.

## 12. Migration Safety

Inspect existing records before changing data models. Identify affected data, use backward-compatible migrations where possible, preserve user data, test safely and provide rollback/recovery guidance. Never silently delete or overwrite production data. Migrate only what is necessary.

## 13. Implementation Priority

1. Audit and security: auth, BYOK removal/encryption, organization authorization, Firestore rules, safe logging, rate limiting.
2. AI reliability: centralized service, verified capability registry, explicit fallback, error classification and credential-source transparency.
3. Product architecture: minimal `arka_org`, data separation, canonical Brand Intelligence and safe migration.
4. Content: Brand Intelligence and Article Studio; preserve existing modules.
5. Quality: responsive RTL UI, Debug Console, tests, production build and documentation.

Reorder only when repository evidence/dependencies justify it; explain why. Do not expand scope.

## 14. Engineering Principles

Existing repository first. Security and data safety before convenience. Backend authorization, never frontend assumptions. One canonical brand profile. Explicit fallback, never silent model changes. Server-side secrets, never browser credentials. Incremental changes, not broad rewrites. MVP-first, no premature SaaS complexity. Preserve working functionality. Prefer the simplest maintainable solution.

If requirements conflict, prioritize: data safety, security, existing functionality, approved product decisions, maintainability, then visual polish.

## 15. Required Final Report

Report:
1. Audit: architecture, defects, security findings and existing functionality.
2. Changes: exact file paths/functions, what changed, why and evidence.
3. Architecture: auth, organization authorization, BYOK encryption/storage, credential resolution, model routing, brand-context retrieval and data separation.
4. Tests: exact commands, results, pass/fail, infrastructure limitations, mocked vs real.
5. Feature status using only:
   - `IMPLEMENTED_AND_VERIFIED`
   - `IMPLEMENTED_BUT_PARTIALLY_VERIFIED`
   - `NOT_IMPLEMENTED`
   - `INTENTIONALLY_DEFERRED`
6. Outstanding security/infrastructure/deployment/product risks.
7. SaaS foundations completed and intentionally deferred work. Do not claim SaaS readiness merely because an organization ID exists.
8. Git branch, changed files, commit hashes if any, push status and working-tree status.

Never claim a test, commit, push or deployment succeeded unless it actually did.

## 16. Final Instruction

Inspect the real repository and working tree first. Produce a concise audit and execution plan, then proceed with safe incremental implementation where possible.

Do not stop at a plan if safe implementation can proceed. Do not rebuild. Do not implement deferred SaaS features. Do not invent test results. Do not hide architectural conflicts or silently change security-sensitive behavior.

**Success means a secure, reliable, functioning Arka Studio that preserves existing value and can evolve into SaaS later without unnecessary rework.**
