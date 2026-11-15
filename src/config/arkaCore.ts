export type ArkaMode =
  | 'fast_path'
  | 'hybrid'
  | 'deep_rpe'
  | 'visual_matrix'
  | 'video_director'
  | 'copy_engine';

export type GeminiRouterModelId = 'gemini-2.5-flash' | 'gemini-2.5-pro';

export interface SlashCommandConfig {
  command: '/fast' | '/hybrid' | '/rpe' | '/visual' | '/video' | '/copy';
  label: string;
  shortTitle: string;
  mode: ArkaMode;
  placeholder: string;
  badgeColor: string;
  preferredModel: GeminiRouterModelId;
}

export const ARKA_SLASH_COMMANDS: SlashCommandConfig[] = [
  {
    command: '/fast',
    label: '⚡ اجرای سریع',
    shortTitle: 'Fast-Path',
    mode: 'fast_path',
    placeholder: 'تسک مشخص یا متن خود را برای اجرای فوری با gemini-2.5-flash بنویسید...',
    badgeColor: 'border-amber-500/40 text-amber-300 bg-amber-500/10',
    preferredModel: 'gemini-2.5-flash',
  },
  {
    command: '/hybrid',
    label: '🎯 حالت ترکیبی',
    shortTitle: 'Hybrid Mode',
    mode: 'hybrid',
    placeholder: 'هدف کلی را بنویسید (۳ رویکرد کامل + ۱ سوال کالیبراسیون)...',
    badgeColor: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10',
    preferredModel: 'gemini-2.5-flash',
  },
  {
    command: '/rpe',
    label: '🧠 معماری عمیق RPE',
    shortTitle: 'Deep RPE',
    mode: 'deep_rpe',
    placeholder: 'پروژه کلان، کمپین یا استراتژی برند آرکا را برای معماری عمیق شرح دهید...',
    badgeColor: 'border-purple-500/40 text-purple-300 bg-purple-500/10',
    preferredModel: 'gemini-2.5-pro',
  },
  {
    command: '/visual',
    label: '🎨 ماتریس بصری ۸گانه',
    shortTitle: 'Visual Matrix',
    mode: 'visual_matrix',
    placeholder: 'ایده صحنه یا گرافیک را بنویسید (ماتریس ۸ مؤلفه‌ای + Master Prompt + اسلاید بوم)...',
    badgeColor: 'border-cyan-500/40 text-cyan-300 bg-cyan-500/10',
    preferredModel: 'gemini-2.5-pro',
  },
  {
    command: '/video',
    label: '🎬 کارگردان ریلز و موشن',
    shortTitle: 'Video Director',
    mode: 'video_director',
    placeholder: 'موضوع ریلز یا تیزر را بنویسید (۳ قلاب + جدول استوری‌بورد + Veo Prompt)...',
    badgeColor: 'border-rose-500/40 text-rose-300 bg-rose-500/10',
    preferredModel: 'gemini-2.5-pro',
  },
  {
    command: '/copy',
    label: '✍️ مهندسی کپی و اسلاید بوم',
    shortTitle: 'Copy & Slides',
    mode: 'copy_engine',
    placeholder: 'پلتفرم (لندینگ، لینکدین، تردز، کاروسل) و موضوع را بنویسید...',
    badgeColor: 'border-fuchsia-500/40 text-fuchsia-300 bg-fuchsia-500/10',
    preferredModel: 'gemini-2.5-pro',
  },
];

export const ARKA_SYSTEM_INSTRUCTION = `# ROLE & ORGANIZATIONAL IDENTITY
تو «هسته مرکزی هوشمند استودیو آرکا (Arka Studio Enterprise Core)» هستی؛ موتور استراتژیک، کارگردان هنری، طراح اسلایدهای گرافیکی و مهندس کپی‌رایتینگ که به صورت اختصاصی برای اکوسیستم «آرکا» (نرم‌افزار حسابداری آرکا https://arka-acc.ir، کاتالوگ ۸ سیستم یکپارچه آرکا، سرویس مستقیم سامانه مؤدیان و نسخه دموی رایگان ۱۰۰ سند) طراحی شده‌ای.
هدف تو بی‌نیاز کردن کامل سازمان از هرگونه هوش مصنوعی ثانویه است. خروجی‌های تو هرگز خام یا کلیشه‌ای نیستند، بلکه «محصول نهایی، پولیش‌خورده، منطبق بر کانتکست زنده سایت و آماده تزریق مستقیم به بوم گرافیکی (StoryCanvas)» هستند.

# 6-MODULE OPERATIONAL ARCHITECTURE
بر اساس دستور میانبر ابتدای پیام یا ماهیت درخواست، یکی از ۶ ماژول زیر را فعال کن:
1. /fast (mode: "fast_path"): اجرای مستقیم، سریع و بدون مقدمه تسک‌های مشخص، ویرایشی یا تولید متن‌های کوتاه.
2. /hybrid (mode: "hybrid"): ارائه پیش‌نویس کامل در ۳ رویکرد متفاوت (۱. مینیمال و مدیریتی، ۲. داستان‌گو و دغدغه‌محور، ۳. جسورانه و ساختارشکن) + طرح فقط ۱ پرسش دقیق استراتژیک در انتها برای کالیبراسیون.
3. /rpe (mode: "deep_rpe"): ورود به اتاق فکر برای طراحی کمپین‌های کلان یا سیستم‌های پیچیده؛ طرح ۲ الی ۳ پرسش عمیق و مرحله‌به‌مرحله برای استخراج ابعاد پنهان قبل از تولید معماری نهایی.
4. /visual (mode: "visual_matrix"): مهندسی پرامپت تصویر انگلیسی بدون نویز بر پایه ۸ مؤلفه استاندارد (subject_and_action, environment_and_context, composition_and_framing, lighting_and_volumetrics, color_palette_and_grading, materiality_and_texture, medium_and_technical_specs, aesthetic_and_style) + ارائه master_prompt یکپارچه و negative_prompt + اسلاید آماده بوم.
5. /video (mode: "video_director"): بسته کامل کارگردانی ویدیو و موشن‌گرافیک شامل: Brief & Pacing، دقیقاً ۳ قلاب متفاوت برای ۳ ثانیه اول (3-Way Hook Arsenal)، جدول استوری‌بورد ۵ ستونی (time_range, visual_and_camera, audio_vo, on_screen_text, ai_video_prompt به انگلیسی دقیق برای Veo) و CTA/Caption/Cover Prompt + اسلاید کاور آماده بوم در canvas_slides.
6. /copy (mode: "copy_engine"): مهندسی متن تبدیل‌محور (PAS / AIDA / BAB / Contrarian)، ۳ تیتر میخکوب‌کننده (headline_hooks)، بلوک‌های اسلایدبه‌اسلاید (structured_blocks و آرایه canvas_slides) آماده تزریق به StoryCanvas در سایزهای 9:16، 4:5 و 1:1 + میکروکپی دکمه‌ها و هشتگ‌ها.

# DUAL-OUTPUT & STORYCANVAS INJECTION PROTOCOL
- اگر پیام کاربر شامل --json یا درخواست JSON / تزریق به StoryCanvas بود، فقط یک آبجکت JSON معتبر (بدون \`\`\`json و بدون متن اضافه) مطابق Master Schema برگردان که حتماً شامل فیلدهای زیر باشد:
{
  "meta": {
    "studio": "Arka Enterprise AI",
    "active_mode": "fast_path | hybrid | deep_rpe | visual_matrix | video_director | copy_engine",
    "target_aspect_ratio": "9:16 | 4:5 | 1:1",
    "used_live_context": true
  },
  "canvas_slides": [
    {
      "slide_number": 1,
      "badge_text": "تگ بالای اسلاید (مثلاً: سیستم جامع آرکا)",
      "headline": "تیتر اصلی کوتاه و کوبنده برای رندر روی StoryCanvas",
      "subheadline": "زیرتیتر مکمل حداکثر ۲ خط",
      "bullet_points": ["مزیت کلیدی اول", "مزیت کلیدی دوم", "مزیت کلیدی سوم", "مزیت کلیدی چهارم"],
      "footer_cta": "متن فوتر یا دکمه اسلاید (مثلاً: دموی ۱۰۰ سند رایگان در arka-acc.ir/demo)",
      "visual_background_prompt": "English prompt for slide background visual...",
      "theme_accent": "#08cdbd"
    }
  ],
  "data": {
    "variants": [
      { "variant_id": 1, "approach_name": "عنوان رویکرد", "title": "تیتر", "content": "متن کامل" }
    ],
    "visual_matrix": {
      "subject_and_action": "",
      "environment_and_context": "",
      "composition_and_framing": "",
      "lighting_and_volumetrics": "",
      "color_palette_and_grading": "",
      "materiality_and_texture": "",
      "medium_and_technical_specs": "",
      "aesthetic_and_style": "",
      "master_prompt": "",
      "negative_prompt": "",
      "aspect_ratio": "9:16"
    },
    "video_production": {
      "brief": { "duration_seconds": 30, "pacing": "", "audio_mood": "", "psychological_angle": "" },
      "hooks": [{ "type": "", "visual": "", "on_screen_text": "", "audio_vo": "" }],
      "storyboard": [
        { "scene_number": 1, "time_range": "00:00 - 00:04", "visual_and_camera": "", "audio_vo": "", "on_screen_text": "", "ai_video_prompt": "" }
      ],
      "cta": { "verbal_cta": "", "visual_cta": "", "caption": "", "cover_prompt": "" }
    },
    "copywriting": {
      "strategy": { "target_platform": "", "framework": "PAS", "tone_of_voice": "", "core_pain_point": "" },
      "headline_hooks": [],
      "structured_blocks": [
        { "block_id": 1, "section_or_slide": "", "headline": "", "body_copy": "", "visual_cue": "" }
      ],
      "conversion_triggers": { "primary_cta": "", "micro_copy": "", "hashtags_or_keywords": [] }
    }
  },
  "interaction": {
    "clarifying_questions": [],
    "suggested_next_steps": []
  }
}

تمامی متن‌های فارسی باید کاملاً دقیق، بدون غلط املایی و منطبق بر اطلاعات واقعی سایت arka-acc.ir (دموی رایگان ۱۰۰ سند، ۱ سال پشتیبانی رایگان، سرویس مستقیم سامانه مؤدیان، تلفن 051-36079047 و ۸ محصول تخصصی پاچال، سوله، ترخیص، منو، پروژه، ویترین، شتاب و پکیج جامع) باشند.`;

export type ArkaConnectionSource =
  | 'gmail-authenticated'
  | 'custom-byok'
  | 'studio-creator-core';

export interface CanvasSlideSchemaItem {
  slide_number: number;
  badge_text: string;
  headline: string;
  subheadline: string;
  bullet_points: string[];
  footer_cta: string;
  visual_background_prompt?: string;
  theme_accent?: string;
}

export interface AutoModelDecision {
  modelId: GeminiRouterModelId;
  fallbackModelId: GeminiRouterModelId;
  modelDisplayName: string;
  detectedArkaMode: ArkaMode;
  detectedSlashCommand: string | null;
  reasoningFa: string;
}

/**
 * Smart Model Router:
 * - /fast or lightweight non-JSON tasks -> gemini-2.5-flash
 * - /rpe, /video, /visual, /copy, StoryCanvas slide generation, or JSON outputs -> gemini-2.5-pro (with auto fallback to gemini-2.5-flash)
 */
export function resolveSmartModelForTask(
  customPrompt: string,
  studioTabMode: string,
  jsonModeActive = false
): AutoModelDecision {
  const trimmed = (customPrompt || '').trim();
  const isJsonRequested =
    Boolean(jsonModeActive) ||
    /--json\b|\[json\]|output:\s*json|فرمت\s*json/i.test(trimmed);

  const matchedSlash = ARKA_SLASH_COMMANDS.find((cmd) =>
    trimmed.toLowerCase().startsWith(cmd.command)
  );

  if (matchedSlash) {
    // /fast -> always gemini-2.5-flash unless explicitly forced heavy JSON canvas architecture
    if (matchedSlash.mode === 'fast_path' && !isJsonRequested) {
      return {
        modelId: 'gemini-2.5-flash',
        fallbackModelId: 'gemini-2.5-flash',
        modelDisplayName: 'gemini-2.5-flash (انتخاب خودکار برای اجرای سریع /fast)',
        detectedArkaMode: 'fast_path',
        detectedSlashCommand: '/fast',
        reasoningFa:
          'تشخیص دستور /fast (تسک سریع و صریح) ← مسیریابی خودکار به مدل پرسرعت gemini-2.5-flash',
      };
    }

    if (matchedSlash.mode === 'hybrid' && !isJsonRequested && trimmed.length < 180) {
      return {
        modelId: 'gemini-2.5-flash',
        fallbackModelId: 'gemini-2.5-flash',
        modelDisplayName: 'gemini-2.5-flash (انتخاب خودکار برای پیش‌نویس سریع /hybrid)',
        detectedArkaMode: 'hybrid',
        detectedSlashCommand: '/hybrid',
        reasoningFa:
          'تشخیص دستور /hybrid برای پیش‌نویس سریع ← انتخاب مدل چابک gemini-2.5-flash',
      };
    }

    const modeReasonMap: Record<ArkaMode, string> = {
      fast_path:
        'تشخیص دستور /fast با خروجی JSON ← انتخاب خودکار gemini-2.5-pro (با فالبک به gemini-2.5-flash)',
      hybrid:
        'تشخیص دستور /hybrid ساختاریافته ← انتخاب خودکار gemini-2.5-pro (با فالبک به gemini-2.5-flash)',
      deep_rpe:
        'تشخیص دستور استراتژیک /rpe (معماری عمیق برند) ← انتخاب خودکار gemini-2.5-pro',
      visual_matrix:
        'تشخیص دستور /visual (ماتریس بصری ۸گانه + اسلاید بوم) ← انتخاب خودکار gemini-2.5-pro',
      video_director:
        'تشخیص دستور /video (کارگردانی ریلز، ۳ قلاب و استوری‌بورد) ← انتخاب خودکار gemini-2.5-pro',
      copy_engine:
        'تشخیص دستور /copy (مهندسی کپی‌رایتینگ تبدیل‌محور و اسلاید) ← انتخاب خودکار gemini-2.5-pro',
    };

    const modeLabelMap: Record<ArkaMode, string> = {
      fast_path: 'gemini-2.5-pro (ساختار JSON سریع)',
      hybrid: 'gemini-2.5-pro (حالت ترکیبی پیشرفته)',
      deep_rpe: 'gemini-2.5-pro (انتخاب خودکار برای معماری عمیق /rpe)',
      visual_matrix: 'gemini-2.5-pro (انتخاب خودکار برای ماتریس بصری /visual)',
      video_director: 'gemini-2.5-pro (انتخاب خودکار برای کارگردانی ویدیو /video)',
      copy_engine: 'gemini-2.5-pro (انتخاب خودکار برای مهندسی کپی /copy)',
    };

    return {
      modelId: 'gemini-2.5-pro',
      fallbackModelId: 'gemini-2.5-flash',
      modelDisplayName: modeLabelMap[matchedSlash.mode],
      detectedArkaMode: matchedSlash.mode,
      detectedSlashCommand: matchedSlash.command,
      reasoningFa: modeReasonMap[matchedSlash.mode],
    };
  }

  // Infer from active Studio Tab when no slash command is typed
  const heavyTabs = new Set([
    'campaign-calendar-30',
    'reels-script',
    'carousel-deck',
    'canvas-slide',
    'campaign-plan',
  ]);

  if (heavyTabs.has(studioTabMode) || isJsonRequested) {
    const tabReason =
      studioTabMode === 'reels-script'
        ? 'سناریو و کارگردانی ریلز ← انتخاب خودکار gemini-2.5-pro (با فالبک خودکار به gemini-2.5-flash)'
        : studioTabMode === 'campaign-calendar-30'
        ? 'معماری تقویم ۳۰ روزه چرخه محصولات ← انتخاب خودکار gemini-2.5-pro (با فالبک به gemini-2.5-flash)'
        : studioTabMode === 'carousel-deck'
        ? 'طراحی کاروسل ۵ اسلایدی پیوسته ← انتخاب خودکار gemini-2.5-pro'
        : 'تولید اسلاید ساختاریافته StoryCanvas و خروجی JSON ← انتخاب خودکار gemini-2.5-pro';

    const detectedMode: ArkaMode =
      studioTabMode === 'reels-script'
        ? 'video_director'
        : studioTabMode === 'carousel-deck'
        ? 'copy_engine'
        : studioTabMode === 'canvas-slide'
        ? 'visual_matrix'
        : 'deep_rpe';

    return {
      modelId: 'gemini-2.5-pro',
      fallbackModelId: 'gemini-2.5-flash',
      modelDisplayName:
        studioTabMode === 'reels-script'
          ? 'gemini-2.5-pro (کارگردانی ویدیو)'
          : studioTabMode === 'campaign-calendar-30'
          ? 'gemini-2.5-pro (معماری تقویم ۳۰ روزه)'
          : 'gemini-2.5-pro (تولید اسلاید و JSON)',
      detectedArkaMode: detectedMode,
      detectedSlashCommand: null,
      reasoningFa: tabReason,
    };
  }

  return {
    modelId: 'gemini-2.5-flash',
    fallbackModelId: 'gemini-2.5-flash',
    modelDisplayName: 'gemini-2.5-flash (پرشتاب و بهینه)',
    detectedArkaMode: 'fast_path',
    detectedSlashCommand: null,
    reasoningFa: 'تسک سبک و استاندارد ← انتخاب خودکار مدل چابک gemini-2.5-flash',
  };
}

export const resolveOptimalModelForTask = resolveSmartModelForTask;
