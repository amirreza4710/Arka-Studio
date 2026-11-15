/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Arka Studio Autonomous Engineering & Security Verification Suite
 * Tests:
 * 1. API Key Masking & Redaction
 * 2. AES-256-GCM BYOK Vault Encryption, Decryption, AAD UID Binding & Multi-User Isolation
 * 3. Key Rotation & Deletion without Plaintext Exposure
 * 4. Admin-Only Server Key Policy (Non-Admin Rejection vs Verified Admin Access)
 * 5. Gemini Model Capability Registry & Modality Validation
 * 6. Smart Model Routing (including SEO/AEO/GEO Article Studio -> gemini-2.5-pro)
 * 7. Structured Error Classification & No-Silent-Downgrade Policy (429 Quota -> Explicit Retry with Flash)
 * 8. Zero Plaintext BYOK Storage in Frontend Codebase & Brand Intelligence Hub
 * 9. HTTP API Security Endpoints Integration Check (401 on anonymous generate, 401 on anonymous vault delete)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {
  storeEncryptedUserApiKey,
  storeLegacyV1EncryptedUserApiKeyForTests,
  decryptUserApiKeyForUid,
  getUserVaultMetadata,
  deleteUserApiKeyFromVault,
  maskApiKey,
  isVerifiedAdminUser,
  classifyGeminiError,
  createArkaExpressApp,
  setTokenVerifierForTests,
  assignOrgMemberRoleForTests,
  recordSafeAiAuditLog,
  getSafeAiAuditLogs,
  redactSensitiveText,
} from '../server';
import {
  resolveSmartModelForTask,
  validateModelCapabilityForTask,
  DEFAULT_ARKA_BRAND_PROFILE,
  CANONICAL_ARKA_ORG_ID,
  validateArkaInternalUrl,
} from '../src/config/arkaCore';

async function runVerificationSuite() {
  console.log('==============================================================');
  console.log('🛡️ ARKA STUDIO AUTONOMOUS SECURITY & AI VERIFICATION SUITE');
  console.log('==============================================================');

  const testUidA = 'test_uid_alpha_991';
  const testUidB = 'test_uid_beta_992';
  const testUidLegacy = 'test_uid_legacy_v1_993';
  const sampleKeyA1 = 'AIzaSyTestUserAlphaKey1111111111119876';
  const sampleKeyA2 = 'AIzaSyTestUserAlphaRotated222222225432';
  const sampleKeyLegacy = 'AIzaSyLegacyV1EncryptedKey333333331122';

  try {
    // 1. Masking & Zero Plaintext Leak Check
    const masked = maskApiKey(sampleKeyA1);
    assert.equal(
      masked,
      'AIza••••••••9876',
      'Masked key should only show first 4 chars, bullets, and last 4 chars'
    );
    assert.ok(
      !masked.includes('TestUserAlpha'),
      'Masked key must never leak middle secret characters'
    );
    console.log('✅ [PASS] 1. API Key Masking & Redaction verified:', masked);

    // 2. AES-256-GCM Per-UID Encrypted Vault Storage (v2) & Retrieval
    const entryA1 = storeEncryptedUserApiKey({
      uid: testUidA,
      rawApiKey: sampleKeyA1,
      models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
      hasPro: true,
      hasFlash: true,
    });

    assert.equal(entryA1.maskedKey, 'AIza••••••••9876');
    assert.equal(entryA1.encryptionVersion, 2, 'New vault records must use encryptionVersion 2');
    const serializedEntry = JSON.stringify(entryA1);
    assert.ok(
      !serializedEntry.includes(sampleKeyA1),
      'Encrypted vault record on disk MUST NOT contain plaintext API key'
    );

    const decryptedForA = decryptUserApiKeyForUid(testUidA);
    assert.equal(
      decryptedForA,
      sampleKeyA1,
      'Owner UID must be able to decrypt its own AES-256-GCM key'
    );
    console.log('✅ [PASS] 2. AES-256-GCM Per-UID Encryption (v2) & Decryption verified');

    // 3. Multi-User Isolation: User B cannot read or decrypt User A's key
    const metaForB = getUserVaultMetadata(testUidB);
    assert.equal(metaForB, null, 'User B vault must return null when unconfigured');
    const decryptedForB = decryptUserApiKeyForUid(testUidB);
    assert.equal(decryptedForB, null, 'User B must not decrypt any key');
    console.log('✅ [PASS] 3. Multi-User Isolation (User A vs User B) verified');

    // 4. Backward-Compatible Decryptability of Legacy v1 Encrypted Records
    storeLegacyV1EncryptedUserApiKeyForTests({
      uid: testUidLegacy,
      rawApiKey: sampleKeyLegacy,
    });
    const legacyMeta = getUserVaultMetadata(testUidLegacy);
    assert.ok(legacyMeta !== null, 'Legacy v1 record metadata must exist');
    assert.equal(legacyMeta.encryptionVersion, 1);
    const decryptedLegacy = decryptUserApiKeyForUid(testUidLegacy);
    assert.equal(
      decryptedLegacy,
      sampleKeyLegacy,
      'Legacy v1 encrypted BYOK record must remain decryptable alongside v2 records'
    );
    console.log('✅ [PASS] 4. Legacy v1 Encrypted Record Backward-Compatibility verified');

    // 5. Key Rotation & Deletion Lifecycle
    storeEncryptedUserApiKey({
      uid: testUidA,
      rawApiKey: sampleKeyA2,
      models: ['gemini-2.5-flash'],
      hasPro: false,
      hasFlash: true,
    });
    const rotatedMetaA = getUserVaultMetadata(testUidA);
    assert.ok(rotatedMetaA !== null, 'User A vault metadata must exist after rotation');
    assert.equal(
      rotatedMetaA.maskedKey,
      'AIza••••••••5432',
      'Key rotation must update maskedKey'
    );
    assert.equal(
      decryptUserApiKeyForUid(testUidA),
      sampleKeyA2,
      'Decrypted key after rotation must match new key'
    );

    const deleted = deleteUserApiKeyFromVault(testUidA);
    assert.equal(deleted, true, 'Deleting existing key must return true');
    assert.equal(
      getUserVaultMetadata(testUidA),
      null,
      'After deletion, vault must return null'
    );
    assert.equal(
      decryptUserApiKeyForUid(testUidA),
      null,
      'After deletion, decryptUserApiKeyForUid must return null'
    );
    console.log('✅ [PASS] 5. BYOK Key Rotation & Deletion lifecycle verified');

    // 6. Admin-Only Server Key Policy Verification
    assert.equal(
      isVerifiedAdminUser(null),
      false,
      'Unauthenticated user must never be treated as admin'
    );
    assert.equal(
      isVerifiedAdminUser({
        uid: testUidA,
        email: 'regular.user@gmail.com',
        emailVerified: true,
      }),
      false,
      'Authenticated non-admin user must NOT be allowed server key fallback'
    );
    assert.equal(
      isVerifiedAdminUser({
        uid: 'admin_uid_1',
        email: 'amirrezaahmadynezhad@gmail.com',
        emailVerified: false,
      }),
      false,
      'Unverified email must NOT be allowed admin server key fallback'
    );
    assert.equal(
      isVerifiedAdminUser({
        uid: 'admin_uid_1',
        email: 'amirrezaahmadynezhad@gmail.com',
        emailVerified: true,
      }),
      true,
      'Verified admin email must be granted server key fallback'
    );
    console.log('✅ [PASS] 6. Admin-Only Server Key Policy verified');

    // 7. Gemini Model Capability Registry & Modality Validation
    const validTextPro = validateModelCapabilityForTask(
      'gemini-2.5-pro',
      'structured_json'
    );
    assert.equal(validTextPro.supported, true);

    const invalidImageOnPro = validateModelCapabilityForTask(
      'gemini-2.5-pro',
      'image_generation'
    );
    assert.equal(
      invalidImageOnPro.supported,
      false,
      'gemini-2.5-pro must reject direct image_generation capability'
    );
    assert.ok(
      invalidImageOnPro.reasonFa?.includes('قابلیت رندر مستقیم پیکسل تصویر را ندارد'),
      'Capability rejection must return clear Persian explanation'
    );
    console.log('✅ [PASS] 7. Gemini Model Capability Discovery & Modality Validation verified');

    // 8. Smart Model Routing (Fast vs Strategic / SEO-Article)
    const fastRoute = resolveSmartModelForTask(
      '/fast یک کپشن کوتاه بنویس',
      'enterprise-6',
      false
    );
    assert.equal(fastRoute.modelId, 'gemini-2.5-flash');

    const seoArticleRoute = resolveSmartModelForTask(
      'مقاله جامع سامانه مودیان',
      'seo-article',
      false
    );
    assert.equal(seoArticleRoute.modelId, 'gemini-2.5-pro');
    assert.equal(seoArticleRoute.fallbackModelId, 'gemini-2.5-flash');
    assert.equal(seoArticleRoute.requiredCapability, 'seo_aeo_geo_article');
    console.log('✅ [PASS] 8. Smart Model Router (Fast -> Flash, SEO/AEO/GEO -> Pro) verified');

    // 9. Structured Error Classification & No-Silent-Downgrade Policy
    const classifiedQuota = classifyGeminiError(
      { status: 429, message: '429 Too Many Requests: RESOURCE_EXHAUSTED quota exceeded' },
      'gemini-2.5-pro'
    );
    assert.equal(classifiedQuota.errorCode, 'QUOTA_EXHAUSTED' in classifiedQuota ? 'QUOTA_EXCEEDED' : 'QUOTA_EXCEEDED');
    assert.equal(classifiedQuota.httpStatus, 429);
    assert.equal(classifiedQuota.canFallbackToFlash, true);
    assert.equal(classifiedQuota.suggestedFallbackModel, 'gemini-2.5-flash');

    const classifiedInvalidKey = classifyGeminiError(
      { status: 400, message: 'API_KEY_INVALID: API key not valid. Please pass a valid API key.' },
      'gemini-2.5-flash'
    );
    assert.equal(classifiedInvalidKey.errorCode, 'INVALID_API_KEY');
    assert.equal(classifiedInvalidKey.canFallbackToFlash, false);
    console.log('✅ [PASS] 9. Structured Error Classification & Explicit Fallback Metadata verified');

    // 10. Verify Zero Plaintext BYOK Storage in Frontend Codebase
    const appTsxContent = fs.readFileSync(
      path.join(process.cwd(), 'src', 'App.tsx'),
      'utf8'
    );
    assert.ok(
      !appTsxContent.includes('CUSTOM_BYOK_STORAGE_KEY'),
      'App.tsx must not reference CUSTOM_BYOK_STORAGE_KEY or store BYOK API keys in localStorage'
    );
    assert.ok(
      DEFAULT_ARKA_BRAND_PROFILE.brandName.includes('آرکا'),
      'Default Brand Intelligence profile must be initialized'
    );
    assert.equal(
      DEFAULT_ARKA_BRAND_PROFILE.orgId,
      CANONICAL_ARKA_ORG_ID,
      'Default Brand Profile must belong to canonical organization arka_org'
    );
    console.log('✅ [PASS] 10. Zero Plaintext Browser Storage & Canonical Brand Hub verified');

    // 11. Safe Metadata Audit Logging & Secret Redaction
    const redactedSample = redactSensitiveText(
      `Error with key ${sampleKeyA1} and Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.secretpayload`
    );
    assert.ok(
      !redactedSample.includes(sampleKeyA1),
      'redactSensitiveText must strip raw Gemini API keys'
    );
    assert.ok(
      !redactedSample.includes('secretpayload'),
      'redactSensitiveText must strip Bearer tokens'
    );

    const auditEntry = recordSafeAiAuditLog({
      uid: testUidA,
      credentialSource: 'vault-byok',
      model: 'gemini-2.5-pro',
      operation: 'seo-article',
      outcome: 'success',
      latencyMs: 412,
    });
    assert.equal(auditEntry.organizationId, CANONICAL_ARKA_ORG_ID);
    const serializedLogs = JSON.stringify(getSafeAiAuditLogs());
    assert.ok(
      !serializedLogs.includes(sampleKeyA1),
      'Audit logs must never contain raw API keys'
    );
    console.log('✅ [PASS] 11. Safe Metadata Audit Logging & Secret Redaction verified');

    // 12. Verified Internal URL Sanitization (arka-acc.ir)
    const validDemoUrl = validateArkaInternalUrl('https://arka-acc.ir/demo');
    assert.equal(validDemoUrl.valid, true);
    assert.equal(validDemoUrl.normalizedUrl, 'https://arka-acc.ir/demo');

    const fabricatedUrl = validateArkaInternalUrl(
      'https://fake-domain.example.com/non-existent-page'
    );
    assert.equal(
      fabricatedUrl.valid,
      false,
      'Fabricated external URL must be flagged as invalid internal link'
    );
    assert.equal(
      fabricatedUrl.normalizedUrl,
      'https://arka-acc.ir/products',
      'Fabricated URL must normalize safely to verified arka-acc.ir page'
    );
    console.log('✅ [PASS] 12. Verified Arka Internal URL Validation & Normalization verified');

    // 13 & 14. HTTP API Endpoint Security & Canonical arka_org RBAC Integration Checks
    const app = createArkaExpressApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      const anonGenRes = await fetch(`${baseUrl}/api/arka-ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'enterprise-6',
          productName: 'پکیج جامع مالی آرکا',
          targetAudience: 'مدیران مالی',
          campaignGoal: 'دموی رایگان',
          tone: 'حرفه‌ای',
        }),
      });
      assert.equal(
        anonGenRes.status,
        401,
        'Anonymous POST /api/arka-ai/generate without key must return HTTP 401'
      );
      const anonGenJson = await anonGenRes.json();
      assert.equal(anonGenJson.errorDetails?.errorCode, 'AUTH_REQUIRED');

      const anonKeyStatusRes = await fetch(`${baseUrl}/api/arka-ai/key-status`);
      assert.equal(anonKeyStatusRes.status, 200);
      const anonKeyStatusJson = await anonKeyStatusRes.json();
      assert.equal(anonKeyStatusJson.configured, false);
      assert.equal(anonKeyStatusJson.maskedKey, null);

      const anonDeleteRes = await fetch(`${baseUrl}/api/arka-ai/key`, {
        method: 'DELETE',
      });
      assert.equal(
        anonDeleteRes.status,
        401,
        'Anonymous DELETE /api/arka-ai/key must return HTTP 401'
      );

      // Test authenticated non-admin user without BYOK key in vault -> HTTP 403 BYOK_KEY_REQUIRED
      setTokenVerifierForTests(async (tok) => {
        if (tok === 'mock-non-admin-token') {
          return {
            uid: testUidB,
            email: 'regular.employee@company.ir',
            emailVerified: true,
          };
        }
        if (tok === 'mock-admin-owner-token') {
          return {
            uid: 'admin_owner_uid_1',
            email: 'amirrezaahmadynezhad@gmail.com',
            emailVerified: true,
          };
        }
        return null;
      });

      const nonAdminGenRes = await fetch(`${baseUrl}/api/arka-ai/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-non-admin-token',
        },
        body: JSON.stringify({
          mode: 'enterprise-6',
          productName: 'پکیج جامع مالی آرکا',
          targetAudience: 'مدیران مالی',
          campaignGoal: 'دموی رایگان',
          tone: 'حرفه‌ای',
        }),
      });
      assert.equal(
        nonAdminGenRes.status,
        403,
        'Authenticated non-admin user without BYOK key must return HTTP 403 and NOT consume server key'
      );
      const nonAdminGenJson = await nonAdminGenRes.json();
      assert.equal(nonAdminGenJson.errorDetails?.errorCode, 'BYOK_KEY_REQUIRED');

      // Test foreign organizationId rejection on /api/arka-ai/generate -> HTTP 403 PERMISSION_DENIED
      const foreignOrgGenRes = await fetch(`${baseUrl}/api/arka-ai/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-admin-owner-token',
        },
        body: JSON.stringify({
          organizationId: 'rogue_external_org_999',
          mode: 'enterprise-6',
          productName: 'پکیج جامع مالی آرکا',
          targetAudience: 'مدیران مالی',
          campaignGoal: 'دموی رایگان',
          tone: 'حرفه‌ای',
        }),
      });
      assert.equal(
        foreignOrgGenRes.status,
        403,
        'Supplying a non-canonical organizationId must be rejected with HTTP 403 PERMISSION_DENIED'
      );
      const foreignOrgGenJson = await foreignOrgGenRes.json();
      assert.equal(foreignOrgGenJson.errorDetails?.errorCode, 'PERMISSION_DENIED');

      console.log('✅ [PASS] 13. HTTP API Endpoint Security (401 Anon, 403 Non-Admin Quota Protection, 403 Foreign Org Rejection) verified');

      // 14. Canonical arka_org Brand Profile RBAC Check
      assignOrgMemberRoleForTests(testUidB, 'viewer');

      const viewerPutBrandRes = await fetch(`${baseUrl}/api/arka-org/brand-profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-non-admin-token',
        },
        body: JSON.stringify({
          organizationId: CANONICAL_ARKA_ORG_ID,
          profile: {
            brandName: 'Unauthorized Overwrite Attempt',
          },
        }),
      });
      assert.equal(
        viewerPutBrandRes.status,
        403,
        'Viewer role must be denied from overwriting canonical arka_org brand profile'
      );

      const ownerPutBrandRes = await fetch(`${baseUrl}/api/arka-org/brand-profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-admin-owner-token',
        },
        body: JSON.stringify({
          organizationId: CANONICAL_ARKA_ORG_ID,
          profile: {
            ...DEFAULT_ARKA_BRAND_PROFILE,
            tagline: 'نرم‌افزار حسابداری و سامانه مودیان آرکا · نسخه سازمانی تاییدشده',
          },
        }),
      });
      assert.equal(
        ownerPutBrandRes.status,
        200,
        'Verified owner must be allowed to update canonical arka_org brand profile'
      );
      const ownerPutBrandJson = await ownerPutBrandRes.json();
      assert.equal(ownerPutBrandJson.organizationId, CANONICAL_ARKA_ORG_ID);
      assert.equal(ownerPutBrandJson.membership.role, 'owner');
      assert.ok(
        ownerPutBrandJson.profile.version >= 2,
        'Updating canonical arka_org brand profile must increment version number'
      );

      console.log('✅ [PASS] 14. Canonical arka_org Brand Profile RBAC (Viewer 403 vs Owner 200 + Versioning) verified');
    } finally {
      setTokenVerifierForTests(null);
      server.close();
    }

    console.log('==============================================================');
    console.log('🎉 ALL 14 AUTONOMOUS SECURITY & ENGINEERING CHECKS PASSED!');
    console.log('==============================================================');
  } finally {
    deleteUserApiKeyFromVault(testUidA);
    deleteUserApiKeyFromVault(testUidB);
    deleteUserApiKeyFromVault(testUidLegacy);
  }
}

runVerificationSuite().catch((err) => {
  console.error('❌ Verification Suite Failed:', err);
  process.exit(1);
});
