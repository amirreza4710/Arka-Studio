import { getFirebaseIdToken } from '../firebase';
import {
  ArkaBrandProfile,
  ArkaConnectionSource,
  ClassifiedAiError,
  DEFAULT_ARKA_BRAND_PROFILE,
  GeminiRouterModelId,
} from '../config/arkaCore';

const BRAND_PROFILE_LOCAL_CACHE_KEY = 'arka_brand_intelligence_profile_v1';

export interface ByokVaultStatus {
  ok: boolean;
  authenticated: boolean;
  configured: boolean;
  maskedKey: string | null;
  provider: 'gemini';
  models: string[];
  hasPro: boolean;
  hasFlash: boolean;
  updatedAt: string | null;
  isAdminFallbackAllowed: boolean;
  serverKeyConfigured: boolean;
}

export interface ArkaAiExecutionMeta {
  selectedModel: GeminiRouterModelId;
  plannedModel?: GeminiRouterModelId;
  usedFallback?: boolean;
  fallbackReason?: string;
  modelDisplayName: string;
  detectedArkaMode: string;
  detectedSlashCommand?: string | null;
  reasoningFa: string;
  connectionMode: string;
  keySource?: 'vault-byok' | 'custom-byok' | 'server-env';
  jsonModeActive?: boolean;
  liveContextCached?: boolean;
  liveContextFetchedLive?: boolean;
  latencyMs?: number;
}

export interface GeneratedSeoArticleSection {
  headingLevel: 'H2' | 'H3';
  headingTitle: string;
  bodyParagraphs: string[];
  keyTakeaway?: string;
}

export interface GeneratedSeoArticleFaq {
  question: string;
  answer: string;
}

export interface GeneratedInternalLinkSuggestion {
  anchorText: string;
  targetUrl: string;
  placementContext: string;
}

export interface GeneratedSeoArticleResult {
  articleTitleH1: string;
  metaTitle: string;
  metaDescription: string;
  suggestedSlug: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  searchIntent: 'Informational' | 'Commercial' | 'Transactional' | 'Navigational';
  searchIntentAnalysisFa: string;
  aeoDirectAnswerBox: string;
  geoCitationSummary: string;
  estimatedReadingMinutes: number;
  sections: GeneratedSeoArticleSection[];
  faqItems: GeneratedSeoArticleFaq[];
  internalLinks: GeneratedInternalLinkSuggestion[];
  linkedinPostSnippet: string;
  instagramCaptionSnippet: string;
  heroSlide?: any;
}

export class ArkaAiRequestError extends Error {
  public readonly classified: ClassifiedAiError;

  constructor(classified: ClassifiedAiError) {
    super(classified.messageFa);
    this.name = 'ArkaAiRequestError';
    this.classified = classified;
  }
}

export function loadCachedBrandProfile(): ArkaBrandProfile {
  try {
    if (typeof window !== 'undefined') {
      const raw = window.localStorage.getItem(BRAND_PROFILE_LOCAL_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_ARKA_BRAND_PROFILE,
          ...parsed,
        };
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return { ...DEFAULT_ARKA_BRAND_PROFILE };
}

export function saveCachedBrandProfile(profile: ArkaBrandProfile): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        BRAND_PROFILE_LOCAL_CACHE_KEY,
        JSON.stringify(profile)
      );
    }
  } catch {
    // Ignore storage quota errors
  }
}

async function buildAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const idToken = await getFirebaseIdToken();
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }
  return headers;
}

function parseErrorPayload(
  status: number,
  data: any,
  fallbackMsg: string
): ClassifiedAiError {
  if (data?.errorDetails && typeof data.errorDetails === 'object') {
    return {
      errorCode: data.errorDetails.errorCode || 'UPSTREAM_ERROR',
      httpStatus: status,
      messageFa: data.errorDetails.messageFa || data.error || fallbackMsg,
      technicalReason: data.errorDetails.technicalReason,
      retryable: Boolean(data.errorDetails.retryable),
      canFallbackToFlash: Boolean(data.errorDetails.canFallbackToFlash),
      suggestedFallbackModel:
        data.errorDetails.suggestedFallbackModel || null,
      attemptedModel: data.errorDetails.attemptedModel,
      retryAfterSeconds: data.retryAfterSeconds || data.errorDetails.retryAfterSeconds,
    };
  }

  return {
    errorCode:
      status === 401
        ? 'AUTH_REQUIRED'
        : status === 403
        ? 'PERMISSION_DENIED'
        : status === 429
        ? 'QUOTA_EXCEEDED'
        : 'UPSTREAM_ERROR',
    httpStatus: status,
    messageFa: data?.error || fallbackMsg,
    retryable: status === 429 || status >= 500,
    canFallbackToFlash: status === 429,
    suggestedFallbackModel: status === 429 ? 'gemini-2.5-flash' : null,
    retryAfterSeconds: data?.retryAfterSeconds,
  };
}

export async function fetchByokVaultStatus(): Promise<ByokVaultStatus> {
  const headers = await buildAuthHeaders();
  const resp = await fetch('/api/arka-ai/key-status', {
    method: 'GET',
    headers,
    cache: 'no-store',
  });
  const data = await resp.json();
  if (!resp.ok || !data?.ok) {
    return {
      ok: false,
      authenticated: false,
      configured: false,
      maskedKey: null,
      provider: 'gemini',
      models: [],
      hasPro: false,
      hasFlash: false,
      updatedAt: null,
      isAdminFallbackAllowed: false,
      serverKeyConfigured: false,
    };
  }
  return data as ByokVaultStatus;
}

export async function verifyAndSaveByokKeyToServerVault(params: {
  apiKey: string;
  saveToVault: boolean;
}): Promise<{
  valid: boolean;
  savedToVault: boolean;
  maskedKey: string;
  models: string[];
  hasPro: boolean;
  hasFlash: boolean;
  latencyMs: number;
  checkedAt: string;
}> {
  const headers = await buildAuthHeaders();
  const endpoint = params.saveToVault
    ? '/api/arka-ai/key'
    : '/api/arka-ai/verify-key';
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      customApiKey: params.apiKey.trim(),
      provider: 'gemini',
    }),
  });
  const data = await resp.json();
  if (!resp.ok || !data?.ok || !data?.valid) {
    throw new ArkaAiRequestError(
      parseErrorPayload(
        resp.status,
        data,
        'اعتبارسنجی یا ذخیره کلید در گاوصندوق سرور ناموفق بود.'
      )
    );
  }
  return {
    valid: true,
    savedToVault: Boolean(data.savedToVault),
    maskedKey: String(data.maskedKey || 'AIza••••'),
    models: Array.isArray(data.models) ? data.models : [],
    hasPro: Boolean(data.hasPro),
    hasFlash: Boolean(data.hasFlash),
    latencyMs: Number(data.latencyMs || 0),
    checkedAt: String(data.checkedAt || 'الان'),
  };
}

export async function deleteByokKeyFromServerVault(): Promise<void> {
  const headers = await buildAuthHeaders();
  const resp = await fetch('/api/arka-ai/key', {
    method: 'DELETE',
    headers,
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new ArkaAiRequestError(
      parseErrorPayload(resp.status, data, 'حذف کلید از گاوصندوق سرور ناموفق بود.')
    );
  }
}

export async function verifyArkaAiConnection(params: {
  connectionMode: ArkaConnectionSource;
  customPrompt?: string;
  studioTabMode?: string;
  allowModelFallback?: boolean;
}): Promise<{
  verified: boolean;
  latencyMs: number;
  selectedModel: string;
  modelDisplayName: string;
  reasoningFa: string;
  verifiedAt: string;
  availableModels: string[];
  keySource: string;
}> {
  const headers = await buildAuthHeaders();
  const resp = await fetch('/api/arka-ai/verify-connection', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      connectionMode: params.connectionMode,
      customPrompt: params.customPrompt || '',
      studioTabMode: params.studioTabMode || 'campaign-calendar-30',
      allowModelFallback: Boolean(params.allowModelFallback),
    }),
  });
  const data = await resp.json();
  if (!resp.ok || !data?.ok) {
    throw new ArkaAiRequestError(
      parseErrorPayload(
        resp.status,
        data,
        'اعتبارسنجی اتصال سرویس هوش مصنوعی ناموفق بود.'
      )
    );
  }
  return data;
}

export async function generateArkaStudioContent(params: {
  mode: string;
  productName: string;
  targetAudience: string;
  campaignGoal: string;
  tone: string;
  customPrompt: string;
  jsonMode?: boolean;
  connectionMode: ArkaConnectionSource;
  brandProfile?: ArkaBrandProfile;
  articleKeywords?: string;
  articleSearchIntent?: string;
  allowModelFallback?: boolean;
}): Promise<{
  mode: string;
  executionMeta: ArkaAiExecutionMeta;
  result: any;
}> {
  const headers = await buildAuthHeaders();
  const activeBrand = params.brandProfile || loadCachedBrandProfile();

  const resp = await fetch('/api/arka-ai/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      mode: params.mode,
      productName: params.productName,
      targetAudience: params.targetAudience,
      campaignGoal: params.campaignGoal,
      tone: params.tone,
      customPrompt: params.customPrompt,
      jsonMode: Boolean(params.jsonMode),
      connectionMode: params.connectionMode,
      allowModelFallback: Boolean(params.allowModelFallback),
      articleKeywords: params.articleKeywords || '',
      articleSearchIntent: params.articleSearchIntent || 'Commercial',
      brandContextSummary: `هویت برند: ${activeBrand.brandName} (${activeBrand.websiteUrl}) | ارزش پیشنهادی: ${activeBrand.coreValueProposition} | مخاطبان هدف: ${activeBrand.targetAudienceSegments} | لحن برند: ${activeBrand.toneOfVoice} | تمایز رقابتی: ${activeBrand.competitivePositioning} | اهداف مارکتینگ: ${activeBrand.marketingObjectives} | کلمات کلیدی کانونی: ${activeBrand.focusKeywords} | صفحات ستونی لینک‌سازی داخلی: ${activeBrand.internalLinkPillars}`,
    }),
  });

  const data = await resp.json();
  if (!resp.ok || !data?.ok) {
    throw new ArkaAiRequestError(
      parseErrorPayload(
        resp.status,
        data,
        'خطا در تولید محتوای هوشمند آرکا. لطفاً وضعیت کلید یا سهمیه را بررسی کنید.'
      )
    );
  }

  return {
    mode: data.mode,
    executionMeta: data.executionMeta,
    result: data.result,
  };
}
