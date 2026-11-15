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
  GeminiRouterModelId,
  resolveSmartModelForTask,
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

interface VerifiedFirebaseUser {
  uid: string;
  email?: string;
}

function extractBearerToken(req: express.Request): string {
  const authHeader = String(req.headers.authorization || '').trim();
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return '';
  }
  return authHeader.slice(7).trim();
}

async function verifyFirebaseIdToken(
  idToken: string
): Promise<VerifiedFirebaseUser | null> {
  const token = String(idToken || '').trim();
  if (!token || token.length > 8192 || !firebaseWebApiKey) {
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
      users?: Array<{ localId?: string; email?: string }>;
    };
    const user = Array.isArray(data?.users) ? data.users[0] : null;
    if (!user?.localId) {
      return null;
    }

    return {
      uid: String(user.localId),
      email: user.email ? String(user.email) : undefined,
    };
  } catch {
    return null;
  }
}

// Simple In-Memory Rate Limiter (keyed by userId if authenticated, else IP)
interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitBucket>();

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

function checkRateLimit(params: {
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

function createGeminiClient(customApiKey?: string): {
  ai: GoogleGenAI;
  keySource: 'custom-byok' | 'server-env';
  fingerprint: string;
} {
  const trimmedCustom = String(customApiKey || '').trim();
  const apiKey = trimmedCustom || process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    throw new Error(
      'کلید GEMINI_API_KEY در محیط سرور یافت نشد و کلید شخصی نیز ثبت نشده است. لطفاً کلید شخصی خود را از دکمه «مدیریت اعتبار و API Key» وارد و تایید کنید.'
    );
  }
  const digest = crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
  const fingerprint = `${trimmedCustom ? 'byok' : 'env'}:${digest}`;
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
    keySource: trimmedCustom ? 'custom-byok' : 'server-env',
    fingerprint,
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

// 6-Hour In-Memory Cache for live arka-acc.ir context
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
    // Fallback immediately to static 8-system Arka catalog so AI is never blocked
  }

  // Also cache static fallback timestamp if no cache exists yet
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

// Short 5-minute cache for ai.models.list() per key fingerprint
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

async function generateContentWithSmartFallback(params: {
  ai: GoogleGenAI;
  primaryModel: GeminiRouterModelId;
  fallbackModel: GeminiRouterModelId;
  contents: string;
  config: Record<string, any>;
}): Promise<{
  response: any;
  actualModelUsed: GeminiRouterModelId;
  usedFallback: boolean;
  fallbackReason?: string;
}> {
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
          'محدودیت سهمیه یا در دسترس نبودن موقت مدل Pro ← سوئیچ خودکار به gemini-2.5-flash',
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '2mb' }));

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

  // 2. Live API Key Verification Endpoint (POST /api/arka-ai/verify-key)
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

      const { ai, fingerprint } = createGeminiClient(trimmedKey);
      const models = await listAvailableGeminiModels(ai, fingerprint, true);

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
      const status =
        err?.status === 401 || err?.status === 403 ? err.status : 400;
      return res.status(status).json({
        ok: false,
        valid: false,
        provider: 'gemini',
        error:
          err?.message ||
          'کلید API نامعتبر است یا دسترسی به لیست مدل‌های Gemini مسدود شده است.',
      });
    }
  });

  // 3. Pre-flight AI Connection Diagnostics & Available Real Gemini Models
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

      let discoveredModels: string[] = ['gemini-2.5-flash', 'gemini-2.5-pro'];
      if (hasServerKey && verifiedUser) {
        try {
          const { ai, fingerprint } = createGeminiClient();
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
        serverKeyConfigured: hasServerKey,
        availableModels: [
          {
            id: 'gemini-2.5-flash',
            label: 'Gemini 2.5 Flash (پرشتاب و بهینه برای تسک‌های سریع)',
            bestFor: ['/fast', '/hybrid'],
          },
          {
            id: 'gemini-2.5-pro',
            label: 'Gemini 2.5 Pro (استدلال عمیق، کارگردانی ویدیو، ماتریس بصری و تقویم)',
            bestFor: ['/rpe', '/visual', '/video', '/copy', 'campaign-calendar-30'],
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

  // 4. Live Connection Readiness Verification Endpoint (supports BYOK or Authenticated Server Key)
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
      const rawCustomKey = typeof body.customApiKey === 'string' ? body.customApiKey.trim() : '';
      if (!rawCustomKey && !verifiedUser) {
        return res.status(401).json({
          ok: false,
          verified: false,
          error:
            'احراز هویت انجام نشد. برای تست اتصال با سهمیه سرور، ابتدا وارد حساب گوگل شوید یا کلید شخصی خود را ثبت کنید.',
        });
      }

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
      } = body;

      const { ai, keySource, fingerprint } = createGeminiClient(customApiKey);
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

      let primaryModel: GeminiRouterModelId = modelDecision.modelId;
      if (
        primaryModel === 'gemini-2.5-pro' &&
        availableModels.length > 0 &&
        !availableModels.some((m) => m.includes('2.5-pro')) &&
        availableModels.some((m) => m.includes('2.5-flash'))
      ) {
        primaryModel = 'gemini-2.5-flash';
      }

      const { response: pingResponse, actualModelUsed, usedFallback } =
        await generateContentWithSmartFallback({
          ai,
          primaryModel,
          fallbackModel: 'gemini-2.5-flash',
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
      res.status(500).json({
        ok: false,
        verified: false,
        error:
          err?.message ||
          'اعتبارسنجی اتصال سرویس هوش مصنوعی ناموفق بود. لطفاً کلید API یا اتصال شبکه را بررسی کنید.',
      });
    }
  });

  // 5. Specialized Arka AI Content, 6-Module Enterprise Core, StoryCanvas & Campaign Generator
  app.post('/api/arka-ai/generate', async (req, res) => {
    const startedAt = Date.now();
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
        });
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const rawCustomKey = typeof body.customApiKey === 'string' ? body.customApiKey.trim() : '';
      if (!rawCustomKey && !verifiedUser) {
        return res.status(401).json({
          ok: false,
          error:
            'احراز هویت انجام نشد. برای استفاده از هوش مصنوعی با سهمیه سرور، وارد حساب گوگل شوید یا کلید شخصی خود را ثبت کنید.',
        });
      }

      const fieldError = validateTextFields([
        { labelFa: 'دستور یا توضیحات تکمیلی', value: body.customPrompt, maxLength: MAX_PROMPT_LENGTH },
        { labelFa: 'نام محصول', value: body.productName, maxLength: MAX_TEXT_FIELD_LENGTH },
        { labelFa: 'مخاطب هدف', value: body.targetAudience, maxLength: MAX_TEXT_FIELD_LENGTH },
        { labelFa: 'هدف کمپین', value: body.campaignGoal, maxLength: MAX_TEXT_FIELD_LENGTH },
        { labelFa: 'لحن محتوا', value: body.tone, maxLength: MAX_TEXT_FIELD_LENGTH },
        { labelFa: 'حالت اجرا', value: body.mode, maxLength: MAX_SHORT_FIELD_LENGTH },
        { labelFa: 'حالت اتصال', value: body.connectionMode, maxLength: MAX_SHORT_FIELD_LENGTH },
        { labelFa: 'کلید API شخصی', value: body.customApiKey, maxLength: MAX_API_KEY_LENGTH },
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
      } = body;

      const { ai, keySource, fingerprint } = createGeminiClient(customApiKey);
      const siteContext = await getLiveArkaSiteContext(false);

      const trimmedCustom = String(customPrompt || '').trim();
      const slashMatch = trimmedCustom.match(
        /^\/(fast|hybrid|rpe|visual|video|copy|start|help)\b|^راهنما\b/i
      );
      const activeSlash = slashMatch
        ? (slashMatch[1] || 'help').toLowerCase()
        : null;

      const isJsonFlagActive =
        Boolean(jsonMode) ||
        Boolean(injectToCanvas) ||
        /--json\b|\[json\]|output:\s*json|فرمت\s*json/i.test(trimmedCustom);

      const modelDecision = resolveSmartModelForTask(
        trimmedCustom,
        mode,
        isJsonFlagActive
      );

      // Inspect available models on this key before running generation
      let availableModels: string[] = [];
      try {
        availableModels = await listAvailableGeminiModels(ai, fingerprint);
      } catch {
        availableModels = ['gemini-2.5-flash', 'gemini-2.5-pro'];
      }

      let routedModelId: GeminiRouterModelId = modelDecision.modelId;
      let preflightAdjusted = false;
      if (
        routedModelId === 'gemini-2.5-pro' &&
        availableModels.length > 0 &&
        !availableModels.some((m) => m.includes('2.5-pro')) &&
        availableModels.some((m) => m.includes('2.5-flash'))
      ) {
        routedModelId = 'gemini-2.5-flash';
        preflightAdjusted = true;
      }

      const buildExecutionMeta = (
        actualModelUsed: GeminiRouterModelId,
        usedFallback: boolean,
        fallbackReason?: string
      ) => ({
        selectedModel: actualModelUsed,
        plannedModel: modelDecision.modelId,
        usedFallback: usedFallback || preflightAdjusted,
        fallbackReason:
          fallbackReason ||
          (preflightAdjusted
            ? 'مدل Pro روی این کلید یافت نشد ← مسیریابی پیش‌فرض به gemini-2.5-flash'
            : undefined),
        modelDisplayName: modelDecision.modelDisplayName,
        detectedArkaMode: modelDecision.detectedArkaMode,
        detectedSlashCommand: modelDecision.detectedSlashCommand,
        reasoningFa: modelDecision.reasoningFa,
        connectionMode,
        keySource,
        jsonModeActive: isJsonFlagActive,
        liveContextCached: siteContext.cached,
        liveContextFetchedLive: siteContext.fetchedLive,
        latencyMs: Date.now() - startedAt,
      });

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

      const systemInstruction = `${ARKA_SYSTEM_INSTRUCTION}

تمامی متن‌های فارسی باید ۱۰۰٪ به زبان فارسی سلیس، استاندارد، بدون غلط املایی و منحصراً بر اساس ویژگی‌های واقعی نرم‌افزار حسابداری آرکا (https://arka-acc.ir) شامل دموی رایگان ۱۰۰ سند، ۱ سال پشتیبانی رایگان، سرویس مستقیم سامانه مؤدیان، و ۸ سیستم تخصصی پاچال، سوله، ترخیص، منو، پروژه، ویترین، شتاب و پکیج جامع نوشته شوند.
تلفن رسمی آرکا: 051-36079047 | وب‌سایت: arka-acc.ir | آدرس: مشهد، سید رضی ۴۰، پلاک ۲۶۵.
${slashDirective ? `\n${slashDirective}\n` : ''}
دانش زنده و کاتالوگ ۸ سیستم سایت آرکا:
${siteContext.summary}`;

      // Onboarding Router (/start, /help, راهنما)
      if (activeSlash === 'start' || activeSlash === 'help') {
        const onboardingText = `خوش آمدید به «هسته مرکزی هوشمند استودیو آرکا (Arka Studio Enterprise Core)» — متصل به https://arka-acc.ir

لیست کامل ۶ دستور میانبر عملیاتی:
1. /fast [موضوع] — اجرای سریع با gemini-2.5-flash (تولید مستقیم و بدون مقدمه)
2. /hybrid [موضوع] — حالت ترکیبی (۳ رویکرد متفاوت + ۱ پرسش استراتژیک)
3. /rpe [موضوع] — معماری عمیق با gemini-2.5-pro (مصاحبه و استراتژی برند/کمپین)
4. /visual [موضوع] — ماتریس بصری ۸گانه (۸ مؤلفه انگلیسی + Master Prompt + اسلاید بوم)
5. /video [موضوع] — کارگردان ریلز و موشن (۳ قلاب + جدول ۵ ستونی + Veo Prompt + کاور بوم)
6. /copy [موضوع] — مهندسی کپی تبدیل‌محور (PAS/AIDA/BAB + اسلایدهای آماده StoryCanvas)

نکته: تمامی خروجی‌های ۶ماژوله آماده تزریق مستقیم به بوم StoryCanvas و ذخیره در Google Sheets و Drive هستند.`;
        return res.json({
          ok: true,
          mode,
          executionMeta: buildExecutionMeta('gemini-2.5-flash', false),
          result: { coreMarkdown: onboardingText },
        });
      }

      // Structured 6-Module Enterprise Engine:
      // Activated when --json / JSON Mode is active OR when any of /hybrid, /rpe, /visual, /video, /copy is used
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
          await generateContentWithSmartFallback({
            ai,
            primaryModel: routedModelId,
            fallbackModel: modelDecision.fallbackModelId,
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
          data: parsed?.data || parsed || {},
          interaction: parsed?.interaction || {
            clarifying_questions: [],
            suggested_next_steps: [
              'تزریق مستقیم اسلاید به بوم StoryCanvas',
              'ذخیره تصویر PNG یا جدول در Google Drive / Sheets',
            ],
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

      // Fast-Path plain execution (/fast without --json)
      if (activeSlash === 'fast') {
        const fastPrompt = `محصول: ${productName} | مخاطب: ${targetAudience} | هدف: ${campaignGoal} | لحن: ${tone}\nدرخواست کاربر: ${trimmedCustom}`;
        const { response, actualModelUsed, usedFallback, fallbackReason } =
          await generateContentWithSmartFallback({
            ai,
            primaryModel: routedModelId,
            fallbackModel: 'gemini-2.5-flash',
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

      if (mode === 'canvas-slide') {
        const prompt = `یک محتوای کامل برای بوم گرافیکی اینستاگرام (استوری یا پست تک‌صفحه) ویژه محصول «${productName}» از نرم‌افزار حسابداری آرکا طراحی کن.
مخاطب هدف: ${targetAudience}
هدف تبلیغاتی: ${campaignGoal}
لحن: ${tone}
${customPrompt ? `توضیحات تکمیلی کاربر: ${customPrompt}` : ''}
دقیقاً ۴ آیتم در آرایه items تولید کن تا بوم گرافیکی کامل و متوازن باشد.`;

        const { response, actualModelUsed, usedFallback, fallbackReason } =
          await generateContentWithSmartFallback({
            ai,
            primaryModel: routedModelId,
            fallbackModel: modelDecision.fallbackModelId,
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
          await generateContentWithSmartFallback({
            ai,
            primaryModel: routedModelId,
            fallbackModel: modelDecision.fallbackModelId,
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
          await generateContentWithSmartFallback({
            ai,
            primaryModel: routedModelId,
            fallbackModel: modelDecision.fallbackModelId,
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
          await generateContentWithSmartFallback({
            ai,
            primaryModel: routedModelId,
            fallbackModel: modelDecision.fallbackModelId,
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
        await generateContentWithSmartFallback({
          ai,
          primaryModel: routedModelId,
          fallbackModel: modelDecision.fallbackModelId,
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
      const status =
        typeof err?.status === 'number' && err.status >= 400 ? err.status : 500;
      return res.status(status).json({
        ok: false,
        error:
          err?.message ||
          'خطا در ارتباط با موتور هوش مصنوعی آرکا. لطفاً کلید یا اتصال اینترنت را بررسی کنید.',
      });
    }
  });

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

startServer();
