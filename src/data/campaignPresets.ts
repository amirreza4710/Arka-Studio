import { ArkaStoryData, INITIAL_ARKA_STORIES, StoryThemeMode } from './arkaStories';
import { LogoDisplayMode } from '../components/StoryCanvas';

export interface CampaignPreset {
  id: string;
  name: string;
  description: string;
  isBuiltIn?: boolean;
  createdAt: string;
  logoMode: LogoDisplayMode;
  customLogoUrl: string;
  logoScale: number;
  showStickerPlaceholder: boolean;
  stories: ArkaStoryData[];
}

export const PRESETS_STORAGE_KEY = 'arka_story_custom_presets_v1';

const createThemedStories = (
  themeMapper: (story: ArkaStoryData, index: number) => Partial<ArkaStoryData>
): ArkaStoryData[] => {
  return INITIAL_ARKA_STORIES.map((story, idx) => ({
    ...story,
    ...themeMapper(story, idx),
    items: story.items.map((item) => ({ ...item })),
    stickerGuide: { ...story.stickerGuide },
  }));
};

export const BUILT_IN_CAMPAIGN_PRESETS: CampaignPreset[] = [
  {
    id: 'preset-default-arka',
    name: 'کمپین رسمی سایت آرکا (سرمه‌ای و کاغذی)',
    description: 'چیدمان استاندارد معرفی جامع، سامانه مؤدیان و پروموشن ۱۰۰ سند رایگان با لوگوی کامل سایت',
    isBuiltIn: true,
    createdAt: '۱۴۰۳/۰۸/۰۱',
    logoMode: 'official-full',
    customLogoUrl: '',
    logoScale: 1,
    showStickerPlaceholder: true,
    stories: INITIAL_ARKA_STORIES,
  },
  {
    id: 'preset-tax-moadian-focus',
    name: 'کمپین ویژه فصل مالیات و سامانه مؤدیان',
    description: 'تم سبز مالیاتی و کهربایی با تیترهای متمرکز بر ارسال صورتحساب الکترونیکی و حذف جرایم مالیاتی',
    isBuiltIn: true,
    createdAt: '۱۴۰۳/۰۸/۱۰',
    logoMode: 'official-full',
    customLogoUrl: '',
    logoScale: 1.05,
    showStickerPlaceholder: true,
    stories: createThemedStories((story) => {
      const themeMap: Record<string, StoryThemeMode> = {
        'story-1-origin': 'emerald-tax',
        'story-2-bento': 'paper-navy',
        'story-3-moadian': 'emerald-tax',
        'story-4-demo-promo': 'emerald-tax',
        'story-5-case-study': 'paper-navy',
        'story-6-cta-suite': 'emerald-tax',
      };
      if (story.id === 'story-1-origin') {
        return {
          theme: themeMap[story.id],
          eyebrow: 'آمادگی کامل برای تکالیف مالیاتی و بازرگانی',
          headlinePart1: 'ثبت فاکتور، انبار و',
          headlineHighlight: 'ارسال به سامانه مؤدیان',
          headlinePart2: 'در یک هسته یکپارچه!',
        };
      }
      if (story.id === 'story-4-demo-promo') {
        return {
          theme: themeMap[story.id],
          eyebrow: 'پیشنهاد ویژه فصل ارسال اظهارنامه و صورتحساب',
          headlinePart1: 'بدون ریسک شروع کن:',
          headlineHighlight: '۱۰۰ سند رایگان دمو',
          headlinePart2: '+ ۱ سال پشتیبانی مالیاتی!',
        };
      }
      return {
        theme: themeMap[story.id] || story.theme,
      };
    }),
  },
  {
    id: 'preset-editorial-b2b-light',
    name: 'کمپین روشن ادیتوریال (ویژه مدیران پخش و بنکداران)',
    description: 'بوم روشن کاغذی با لوگوی ترکیبی نماد آرکا و تایپوگرافی وزیرمتن برای نمایش شفاف گزارش‌های سود',
    isBuiltIn: true,
    createdAt: '۱۴۰۳/۰۸/۱۵',
    logoMode: 'official-badge',
    customLogoUrl: '',
    logoScale: 1,
    showStickerPlaceholder: true,
    stories: createThemedStories((story) => {
      const themeMap: Record<string, StoryThemeMode> = {
        'story-1-origin': 'navy-paper',
        'story-2-bento': 'paper-navy',
        'story-3-moadian': 'emerald-tax',
        'story-4-demo-promo': 'navy-paper',
        'story-5-case-study': 'paper-navy',
        'story-6-cta-suite': 'navy-paper',
      };
      if (story.id === 'story-2-bento') {
        return {
          theme: 'paper-navy',
          eyebrow: 'ویژه شرکت‌های پخش، بنکداران و فروشگاه‌های بزرگ',
          headlinePart1: 'سود واقعی هر کالا و شعبه را',
          headlineHighlight: 'در لحظه رصد کن؛',
          headlinePart2: 'نه در پایان سال مالی!',
        };
      }
      return {
        theme: themeMap[story.id] || story.theme,
      };
    }),
  },
];
