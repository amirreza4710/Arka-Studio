import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Shared Gemini AI Client initialized strictly on the server
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'کلید GEMINI_API_KEY در محیط سرور یافت نشد. لطفاً در بخش Settings > Secrets کلید را بررسی کنید.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Baseline rich knowledge base of https://arka-acc.ir
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

let cachedLiveSiteSummary: string = '';
let lastFetchedAt = 0;

async function getLiveArkaSiteContext(forceRefresh = false): Promise<{
  summary: string;
  fetchedLive: boolean;
  updatedAt: string;
}> {
  const now = Date.now();
  if (!forceRefresh && cachedLiveSiteSummary && now - lastFetchedAt < 10 * 60 * 1000) {
    return {
      summary: cachedLiveSiteSummary,
      fetchedLive: true,
      updatedAt: new Date(lastFetchedAt).toISOString(),
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5500);
    const resp = await fetch('https://arka-acc.ir/api/site/published', {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'ArkaInstagramStudio/2.0',
      },
    });
    clearTimeout(timer);

    if (resp.ok) {
      const json = (await resp.json()) as Record<string, any>;
      const rawStr = JSON.stringify(json);
      // Extract key readable strings from the live JSON if available
      const snippet = rawStr.slice(0, 3500);
      cachedLiveSiteSummary = `${ARKA_BASE_KNOWLEDGE}\n\n[داده‌های زنده واکشی‌شده از https://arka-acc.ir/api/site/published]:\n${snippet}`;
      lastFetchedAt = now;
      return {
        summary: cachedLiveSiteSummary,
        fetchedLive: true,
        updatedAt: new Date(lastFetchedAt).toISOString(),
      };
    }
  } catch {
    // Fallback gracefully to ARKA_BASE_KNOWLEDGE if external fetch times out
  }

  return {
    summary: ARKA_BASE_KNOWLEDGE,
    fetchedLive: false,
    updatedAt: new Date().toISOString(),
  };
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

  // 1. Live Arka Website Sync Endpoint
  app.get('/api/arka-site/live-context', async (req, res) => {
    try {
      const force = req.query.refresh === '1';
      const data = await getLiveArkaSiteContext(force);
      res.json({
        ok: true,
        fetchedLive: data.fetchedLive,
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

  // 2. Specialized Arka AI Content, Reels Scenario, Carousel & Campaign Generator
  app.post('/api/arka-ai/generate', async (req, res) => {
    try {
      const {
        mode = 'canvas-slide',
        productName = 'پکیج جامع مالی و حسابداری آرکا',
        targetAudience = 'مدیران کسب‌وکار، فروشگاه‌ها و حسابداران',
        campaignGoal = 'دریافت نسخه دموی رایگان ۱۰۰ سند و مشاوره خرید',
        tone = 'حرفه‌ای، متقاعدکننده و صمیمی',
        customPrompt = '',
      } = req.body || {};

      const ai = getGeminiClient();
      const siteContext = await getLiveArkaSiteContext(false);

      const systemInstruction = `تو کارگردان خلاق مارکتینگ، کپی‌رایتر ارشد اینستاگرام و متخصص محصولات «گروه نرم‌افزاری آرکــا» (https://arka-acc.ir) هستی.
تمامی محتواها باید ۱۰۰٪ به زبان فارسی سلیس، استاندارد، بدون غلط املایی و منحصراً بر اساس ویژگی‌های واقعی نرم‌افزار حسابداری آرکا (از جمله دموی رایگان ۱۰۰ سند، ۱ سال پشتیبانی رایگان، سرویس مستقیم سامانه مؤدیان، و ۸ سیستم تخصصی پاچال، سوله، ترخیص، منو، پروژه، ویترین، شتاب و پکیج جامع) نوشته شوند.
تلفن رسمی آرکا: 051-36079047 | وب‌سایت: arka-acc.ir | آدرس: مشهد، سید رضی ۴۰، پلاک ۲۶۵.

دانش پایه سایت آرکا:
${siteContext.summary}`;

      if (mode === 'canvas-slide') {
        const prompt = `یک محتوای کامل برای بوم گرافیکی اینستاگرام (استوری یا پست تک‌صفحه) ویژه محصول «${productName}» از نرم‌افزار حسابداری آرکا طراحی کن.
مخاطب هدف: ${targetAudience}
هدف تبلیغاتی: ${campaignGoal}
لحن: ${tone}
${customPrompt ? `توضیحات تکمیلی کاربر: ${customPrompt}` : ''}
دقیقاً ۴ آیتم در آرایه items تولید کن تا بوم گرافیکی کامل و متوازن باشد.`;

        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: SLIDE_SCHEMA,
          },
        });

        const parsed = JSON.parse((response.text ?? '{}').trim());
        return res.json({ ok: true, mode, result: parsed });
      }

      if (mode === 'carousel-deck') {
        const prompt = `یک پست کاروسل ۵ اسلایدی به‌هم‌پیوسته و حرفه‌ای اینستاگرام برای محصول «${productName}» از گروه نرم‌افزاری آرکا (arka-acc.ir) طراحی کن.
مخاطب هدف: ${targetAudience}
هدف کمپین: ${campaignGoal}
لحن: ${tone}
${customPrompt ? `توضیحات تکمیلی کاربر: ${customPrompt}` : ''}
اسلاید ۱ باید قلاب (Hook) قدرتمند باشد، اسلایدهای ۲ تا ۴ مزایا و راهکارهای دقیق آرکا را تشریح کنند و اسلاید ۵ دعوت به اقدام (دانلود دموی ۱۰۰ سند رایگان از arka-acc.ir و تماس 051-36079047) باشد. هر اسلاید باید دقیقاً ۴ کارت در items داشته باشد.`;

        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
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

        const parsed = JSON.parse((response.text ?? '{}').trim());
        return res.json({ ok: true, mode, result: parsed });
      }

      if (mode === 'reels-script') {
        const prompt = `یک سناریوی کامل و دقیق برای ساخت ویدیو ریلز (Reels) یا موشن‌گرافی تبلیغاتی اینستاگرام ویژه «${productName}» از نرم‌افزار حسابداری آرکا (arka-acc.ir) بنویس.
مخاطب هدف: ${targetAudience}
هدف ویدیو: ${campaignGoal}
لحن: ${tone}
${customPrompt ? `درخواست اختصاصی کاربر: ${customPrompt}` : ''}
سناریو باید شامل قلاب ۳ ثانیه اول، سکانس‌بندی دقیق (تصویر/موشن، متن نریشن گوینده، نوشته روی تصویر)، پیشنهاد موسیقی/افکت صوتی، کپشن کامل و یک اسلاید کاور آماده (coverSlide) برای تزریق مستقیم به بوم استودیو باشد.`;

        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                scenarioTitle: { type: Type.STRING, description: 'عنوان سناریوی ریلز یا موشن‌گرافی' },
                hookFirst3Seconds: { type: Type.STRING, description: 'قلاب خیره‌کننده ۳ ثانیه اول ویدیو' },
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
                    },
                    required: ['sceneNumber', 'timeCode', 'visualAction', 'voiceover', 'onScreenText'],
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

        const parsed = JSON.parse((response.text ?? '{}').trim());
        return res.json({ ok: true, mode, result: parsed });
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

        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
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

        const parsed = JSON.parse((response.text ?? '{}').trim());
        return res.json({ ok: true, mode: 'campaign-calendar-30', result: parsed });
      }

      // Default / 4th mode: 'campaign-plan' (Sales Campaign & Content Calendar + Caption)
      const prompt = `یک برنامه کمپین فروش و تقویم محتوایی ۵ روزه اینستاگرام (شامل استوری، پست تک‌صفحه، کاروسل و ریلز) همراه با کپشن‌های آماده برای «${productName}» از نرم‌افزار حسابداری آرکا (arka-acc.ir) طراحی کن.
مخاطب هدف: ${targetAudience}
هدف فروش: ${campaignGoal}
لحن: ${tone}
${customPrompt ? `نکات مدنظر کاربر: ${customPrompt}` : ''}
همچنین یک اسلاید اصلی کمپین (heroSlide) در خروجی قرار بده تا کاربر بتواند با یک کلیک آن را وارد بوم طراحی کند.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
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

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json({ ok: true, mode: 'campaign-plan', result: parsed });
    } catch (err: any) {
      const status = err?.status || 500;
      return res.status(status).json({
        ok: false,
        error:
          err?.message ||
          'خطا در ارتباط با موتور هوش مصنوعی آرکا. لطفاً دوباره تلاش کنید.',
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
    console.log(`Arka Studio full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
