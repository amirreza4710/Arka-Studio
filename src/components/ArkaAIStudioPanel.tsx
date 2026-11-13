import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  ARKA_SITE_CATALOG,
  ArkaStoryData,
  ArkaCarouselDeck,
} from '../data/arkaStories';
import {
  AiGenMode,
  SavedAiGenerationItem,
  saveUserAiGeneration,
  fetchUserAiGenerations,
  deleteUserAiGeneration,
  getAccessToken,
} from '../firebase';
import {
  Sparkles,
  Film,
  Layers,
  CalendarRange,
  CalendarDays,
  FileSpreadsheet,
  ExternalLink,
  ShieldAlert,
  Wand2,
  RefreshCw,
  Copy,
  Check,
  ArrowUpRight,
  LogOut,
  Trash2,
  History,
  Globe,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

export interface Generated30DayScheduleItem {
  dayNumber: number;
  launchPhase: string;
  productModule: string;
  formatRecommended: string;
  categoryLabel: string;
  eyebrow: string;
  headlinePart1: string;
  headlineHighlight: string;
  headlinePart2: string;
  leadCopy: string;
  primaryStatValue: string;
  primaryStatLabel: string;
  ctaAction: string;
  captionSummary: string;
}

export interface Generated30DayCalendarResult {
  calendarTitle: string;
  launchCycleSummary: string;
  scheduleDays: Generated30DayScheduleItem[];
}

interface GeneratedSlidePayload {
  categoryLabel: string;
  headerMeta: string;
  eyebrow: string;
  headlinePart1: string;
  headlineHighlight: string;
  headlinePart2: string;
  leadCopy: string;
  primaryStatValue: string;
  primaryStatLabel: string;
  secondaryBannerTitle?: string;
  secondaryBannerSub?: string;
  stickerTitle: string;
  stickerActionText: string;
  instagramCaption: string;
  items: {
    kicker: string;
    title: string;
    subtitle: string;
    metric: string;
  }[];
}

interface ArkaAIStudioPanelProps {
  currentUser: User | null;
  accessToken?: string | null;
  needsAuth?: boolean;
  isSigningIn: boolean;
  onGoogleSignIn: () => void;
  onGoogleSignOut: () => void;
  activeStory: ArkaStoryData;
  onInjectSlideIntoCanvas: (
    slidePayload: GeneratedSlidePayload,
    captionText?: string
  ) => void;
  onInjectCarouselDeckIntoStudio: (deck: ArkaCarouselDeck) => void;
  onCalendarSavedToDrive?: (spreadsheetInfo: {
    spreadsheetId: string;
    spreadsheetUrl: string;
    title: string;
  }) => void;
}

export const ArkaAIStudioPanel: React.FC<ArkaAIStudioPanelProps> = ({
  currentUser,
  accessToken,
  needsAuth,
  isSigningIn,
  onGoogleSignIn,
  onGoogleSignOut,
  activeStory,
  onInjectSlideIntoCanvas,
  onInjectCarouselDeckIntoStudio,
  onCalendarSavedToDrive,
}) => {
  const [mode, setMode] = useState<AiGenMode>('campaign-calendar-30');
  const [selectedProductId, setSelectedProductId] = useState<string>(
    ARKA_SITE_CATALOG[0].id
  );
  const [targetAudience, setTargetAudience] = useState<string>(
    'مدیران فروشگاه‌ها، شرکت‌های بازرگانی، تولیدی و حسابداران'
  );
  const [campaignGoal, setCampaignGoal] = useState<string>(
    'دانلود دموی رایگان ۱۰۰ سند از arka-acc.ir و دریافت مشاوره خرید'
  );
  const [tone, setTone] = useState<string>(
    'حرفه‌ای، خلاقانه، متقاعدکننده و منطبق با بازار ایران'
  );
  const [customPrompt, setCustomPrompt] = useState<string>('');

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<any | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Live site sync status
  const [isSyncingSite, setIsSyncingSite] = useState<boolean>(false);
  const [siteSyncStatus, setSiteSyncStatus] = useState<{
    fetchedLive: boolean;
    updatedAt: string;
  } | null>(null);

  // Cloud saved generations for logged-in Gmail user
  const [savedHistory, setSavedHistory] = useState<SavedAiGenerationItem[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  // 30-Day AI Campaign Calendar filter & Google Drive Spreadsheet export state
  const [selectedWeekFilter, setSelectedWeekFilter] = useState<number>(0); // 0 = All 30 days, 1..4 = Week 1..4
  const [isConfirmingDriveSave, setIsConfirmingDriveSave] =
    useState<boolean>(false);
  const [isSavingToDrive, setIsSavingToDrive] = useState<boolean>(false);
  const [savedDriveSheetInfo, setSavedDriveSheetInfo] = useState<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    title: string;
  } | null>(null);

  const selectedProduct =
    ARKA_SITE_CATALOG.find((p) => p.id === selectedProductId) ||
    ARKA_SITE_CATALOG[0];

  useEffect(() => {
    // Check live site context on mount
    fetch('/api/arka-site/live-context')
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok) {
          setSiteSyncStatus({
            fetchedLive: Boolean(data.fetchedLive),
            updatedAt: new Intl.DateTimeFormat('fa-IR', {
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date()),
          });
        }
      })
      .catch(() => {
        // Ignore initial ping error
      });
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchUserAiGenerations()
        .then((items) => setSavedHistory(items))
        .catch(() => {
          // Ignore
        });
    } else {
      setSavedHistory([]);
    }
  }, [currentUser]);

  const handleRefreshSiteData = async () => {
    if (isSyncingSite) return;
    setIsSyncingSite(true);
    try {
      const resp = await fetch('/api/arka-site/live-context?refresh=1');
      const data = await resp.json();
      if (data?.ok) {
        setSiteSyncStatus({
          fetchedLive: Boolean(data.fetchedLive),
          updatedAt: new Intl.DateTimeFormat('fa-IR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }).format(new Date()),
        });
      }
    } catch {
      // Ignore
    } finally {
      setIsSyncingSite(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGenerating) return;
    setIsGenerating(true);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/arka-ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          productName: `${selectedProduct.name} (${selectedProduct.group})`,
          targetAudience,
          campaignGoal,
          tone,
          customPrompt,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(
          data?.error ||
            'خطا در تولید محتوای هوشمند. لطفاً تنظیمات کلید در بخش Settings > Secrets را بررسی کنید.'
        );
      }

      setAiResult(data.result);
      setSavedDriveSheetInfo(null);

      // Automatically save to the signed-in Gmail user's cloud history
      if (currentUser && data.result) {
        const title =
          data.result.calendarTitle ||
          data.result.scenarioTitle ||
          data.result.deckTitle ||
          data.result.campaignName ||
          data.result.headlineHighlight ||
          selectedProduct.name;

        const savedItem = await saveUserAiGeneration({
          mode,
          productId: selectedProduct.id,
          title: `${selectedProduct.badge}: ${title}`,
          contentObj: data.result,
        });
        if (savedItem) {
          setSavedHistory((prev) => [savedItem, ...prev.slice(0, 14)]);
        }
      }
    } catch (err: any) {
      setErrorMsg(
        err?.message || 'خطا در ارتباط با موتور هوش مصنوعی آرکا. دوباره تلاش کنید.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteSavedItem = async (id: string) => {
    try {
      await deleteUserAiGeneration(id);
      setSavedHistory((prev) => prev.filter((item) => item.id !== id));
    } catch {
      // Ignore
    }
  };

  const handleConvertAndInjectCarousel = (rawResult: any) => {
    if (!rawResult?.slides || !Array.isArray(rawResult.slides)) return;
    const builtSlides: ArkaStoryData[] = rawResult.slides.map(
      (sl: GeneratedSlidePayload, idx: number) => ({
        ...activeStory,
        id: `ai-carousel-slide-${Date.now()}-${idx + 1}`,
        order: idx + 1,
        categoryLabel: sl.categoryLabel || selectedProduct.badge,
        titleShort: `${idx + 1}. ${sl.headlineHighlight || selectedProduct.name}`,
        headerMeta: sl.headerMeta || 'تولیدشده با هوش مصنوعی آرکا · arka-acc.ir',
        eyebrow: sl.eyebrow || selectedProduct.eyebrow,
        headlinePart1: sl.headlinePart1 || '',
        headlineHighlight: sl.headlineHighlight || selectedProduct.name,
        headlinePart2: sl.headlinePart2 || '',
        leadCopy: sl.leadCopy || '',
        primaryStatValue: sl.primaryStatValue || '۱۰۰ سند دمو',
        primaryStatLabel: sl.primaryStatLabel || 'تست رایگان در arka-acc.ir/demo',
        secondaryBannerTitle:
          sl.secondaryBannerTitle || '+ ۱ سال پشتیبانی رایگان آرکا',
        secondaryBannerSub:
          sl.secondaryBannerSub ||
          'آموزش گام‌به‌گام آرکا آکادمی و سیستم تیکت پشتیبانی',
        items: (sl.items || []).slice(0, 4).map((it, cIdx) => ({
          id: `ai-card-${idx}-${cIdx}`,
          kicker: it.kicker || `ویژگی ۰${cIdx + 1}`,
          title: it.title || '',
          subtitle: it.subtitle || '',
          metric: it.metric || 'آرکا',
        })),
        stickerGuide: {
          ...activeStory.stickerGuide,
          stickerTitle:
            sl.stickerTitle || 'دریافت دموی رایگان ۱۰۰ سند از سایت آرکا',
          stickerActionText:
            sl.stickerActionText || 'https://arka-acc.ir/demo',
        },
      })
    );

    const newDeck: ArkaCarouselDeck = {
      id: `ai-deck-${Date.now()}`,
      title: rawResult.deckTitle || `کاروسل هوشمند ${selectedProduct.name}`,
      subtitle:
        rawResult.deckSubtitle ||
        'تولیدشده توسط موتور هوش مصنوعی استودیو آرکا',
      captionText: rawResult.captionText || '',
      slides: builtSlides,
    };

    onInjectCarouselDeckIntoStudio(newDeck);
  };

  // Inject any day from the 30-Day AI Campaign Calendar directly into the live StoryCanvas
  const handleInjectCalendarDayIntoCanvas = (day: Generated30DayScheduleItem) => {
    const slidePayload: GeneratedSlidePayload = {
      categoryLabel:
        day.categoryLabel || `روز ${day.dayNumber} · ${day.productModule}`,
      headerMeta: `تقویم ۳۰ روزه آرکا · ${day.launchPhase}`,
      eyebrow: day.eyebrow || day.productModule,
      headlinePart1: day.headlinePart1 || '',
      headlineHighlight: day.headlineHighlight || day.productModule,
      headlinePart2: day.headlinePart2 || '',
      leadCopy: day.leadCopy || '',
      primaryStatValue: day.primaryStatValue || '۱۰۰ سند دمو',
      primaryStatLabel:
        day.primaryStatLabel || 'تست رایگان در https://arka-acc.ir/demo',
      secondaryBannerTitle: '+ ۱ سال پشتیبانی رایگان آرکا',
      secondaryBannerSub: `${day.productModule} · ${day.launchPhase}`,
      stickerTitle: `روز ${day.dayNumber}: دریافت دموی رایگان ۱۰۰ سند`,
      stickerActionText: day.ctaAction || 'https://arka-acc.ir/demo',
      instagramCaption: day.captionSummary || '',
      items: activeStory.items.map((it, idx) =>
        idx === 0
          ? {
              kicker: `روز ${day.dayNumber} تقویم`,
              title: day.productModule,
              subtitle: day.launchPhase,
              metric: day.formatRecommended || 'آرکا',
            }
          : {
              kicker: it.kicker,
              title: it.title,
              subtitle: it.subtitle,
              metric: it.metric || 'آرکا',
            }
      ),
    };

    onInjectSlideIntoCanvas(slidePayload, day.captionSummary);
  };

  // Execute Google Drive Spreadsheet creation for the 30-Day AI Campaign Calendar (after user confirmation)
  const executeSave30DayCalendarToDrive = async () => {
    if (!aiResult?.scheduleDays || !Array.isArray(aiResult.scheduleDays)) return;
    setIsConfirmingDriveSave(false);

    const token = accessToken || (await getAccessToken());
    if (!token || needsAuth) {
      onGoogleSignIn();
      return;
    }

    setIsSavingToDrive(true);
    setErrorMsg(null);

    try {
      const sheetTitle =
        aiResult.calendarTitle ||
        `تقویم ۳۰ روزه کمپین اینستاگرام آرکا - ${selectedProduct.name}`;
      const desiredTabName = 'تقویم_۳۰_روزه_آرکا';

      const createRes = await fetch(
        'https://sheets.googleapis.com/v4/spreadsheets',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            properties: {
              title: sheetTitle,
            },
            sheets: [
              {
                properties: {
                  title: desiredTabName,
                  rightToLeft: true,
                },
              },
            ],
          }),
        }
      );

      if (!createRes.ok) {
        throw new Error(
          'خطا در ایجاد فایل Spreadsheet در Google Drive. لطفاً اتصال حساب گوگل خود را بررسی کنید.'
        );
      }

      const createdSheet = await createRes.json();
      const spreadsheetId: string = createdSheet.spreadsheetId;
      const spreadsheetUrl: string =
        createdSheet.spreadsheetUrl ||
        `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

      // Discover actual sheet tab title dynamically from the creation response (never hardcode Sheet1)
      const actualTabTitle: string =
        createdSheet.sheets?.[0]?.properties?.title || desiredTabName;

      const headerRow = [
        'روز تقویم',
        'فاز چرخه محصول (Launch Cycle)',
        'محصول / سرویس سایت آرکا',
        'فرمت پیشنهادی',
        'دسته‌بندی بوم',
        'روتیتر (Eyebrow)',
        'تیتر اصلی',
        'کلمه کلیدی رنگی (Highlight)',
        'توضیح زیر تیتر (Lead Copy)',
        'شاخص کلیدی',
        'دعوت به اقدام (CTA)',
        'کپشن و سناریوی آماده انتشار',
      ];

      const scheduleRows = (
        aiResult.scheduleDays as Generated30DayScheduleItem[]
      ).map((d) => [
        `روز ${d.dayNumber}`,
        d.launchPhase,
        d.productModule,
        d.formatRecommended,
        d.categoryLabel,
        d.eyebrow,
        `${d.headlinePart1} ${d.headlineHighlight} ${d.headlinePart2}`.trim(),
        d.headlineHighlight,
        d.leadCopy,
        `${d.primaryStatValue} (${d.primaryStatLabel})`,
        d.ctaAction,
        d.captionSummary,
      ]);

      const encodedRange = encodeURIComponent(
        `'${actualTabTitle}'!A1:L${scheduleRows.length + 1}`
      );

      const writeRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            values: [headerRow, ...scheduleRows],
          }),
        }
      );

      if (!writeRes.ok) {
        throw new Error(
          'فایل Spreadsheet ساخته شد اما در نوشتن ردیف‌های ۳۰ روزه خطایی رخ داد.'
        );
      }

      const savedInfo = {
        spreadsheetId,
        spreadsheetUrl,
        title: sheetTitle,
      };
      setSavedDriveSheetInfo(savedInfo);
      if (onCalendarSavedToDrive) {
        onCalendarSavedToDrive(savedInfo);
      }
    } catch (err: any) {
      setErrorMsg(
        err?.message || 'خطا در ذخیره تقویم ۳۰ روزه در Google Drive.'
      );
    } finally {
      setIsSavingToDrive(false);
    }
  };

  return (
    <aside className="w-full lg:w-[460px] shrink-0 bg-white border border-[#e3e9ed] rounded-[20px] shadow-sm flex flex-col overflow-hidden text-[#233b53]">
      {/* Top Header in Official Arka Navy & Turquoise */}
      <div className="px-5 py-4 bg-[#062959] text-white flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#08cdbd] text-[#062959] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white">
                هوش مصنوعی تولید محتوا و کمپین آرکــا
              </h2>
              <p className="text-[11px] text-[#a4d2d1]">
                سناریونویس ریلز و موشن · کپشن‌نویس · طراح کمپین و اسلاید
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRefreshSiteData}
            disabled={isSyncingSite}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0b2b56] hover:bg-[#08cdbd] hover:text-[#062959] text-[11px] font-bold text-[#14dac3] border border-[#14dac3]/30 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            title="بروزرسانی زنده اطلاعات از سایت arka-acc.ir"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isSyncingSite ? 'animate-spin' : ''}`}
            />
            <span>همگام با arka-acc.ir</span>
          </button>
        </div>

        {/* Google / Gmail Account Bar & Quota Info */}
        <div className="p-2.5 rounded-xl bg-[#0b2b56] border border-white/12 flex items-center justify-between gap-2">
          {currentUser ? (
            <div className="flex items-center justify-between w-full gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || 'کاربر گوگل'}
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-full border border-[#08cdbd] shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#08cdbd] text-[#062959] font-black text-xs flex items-center justify-center shrink-0">
                    {(currentUser.email || 'G')[0].toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-white truncate">
                    {currentUser.displayName || 'کاربر جیمیل آرکا'}
                  </div>
                  <div
                    dir="ltr"
                    className="text-[11px] text-[#14dac3] truncate text-right"
                  >
                    {currentUser.email}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                    showHistory
                      ? 'bg-[#08cdbd] text-[#062959]'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span className="tabular-nums-fa">
                    آرشیو ({savedHistory.length})
                  </span>
                </button>
                <button
                  type="button"
                  onClick={onGoogleSignOut}
                  className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 cursor-pointer"
                  title="خروج از حساب گوگل"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between w-full gap-2">
              <div className="text-[11px] text-slate-200 leading-snug">
                برای ذخیره ابری سناریوها و استفاده از پروفایل شخصی جیمیل وارد شوید:
              </div>
              <button
                type="button"
                disabled={isSigningIn}
                onClick={onGoogleSignIn}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-[#062959] text-xs font-black shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
                <span>
                  {isSigningIn ? 'در حال اتصال...' : 'ورود با جیمیل (Google)'}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 5 AI Mode Selector Tabs (Including 30-Day AI Campaign Calendar) */}
      <div className="p-2 bg-[#f5f8fa] border-b border-[#e3e9ed] flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => {
            setMode('campaign-calendar-30');
            setShowHistory(false);
          }}
          className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-black transition-colors cursor-pointer min-h-[42px] border ${
            mode === 'campaign-calendar-30' && !showHistory
              ? 'bg-[#062959] text-[#14dac3] border-[#08cdbd] shadow-xs'
              : 'bg-white text-[#062959] border-[#08cdbd]/50 hover:bg-[#e5fbf9]'
          }`}
        >
          <CalendarDays className="w-4 h-4 shrink-0 text-[#08cdbd]" />
          <span>تقویم کمپین ۳۰ روزه آرکا + ذخیره در Google Drive</span>
        </button>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
          <button
            type="button"
            onClick={() => {
              setMode('reels-script');
              setShowHistory(false);
            }}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap min-h-[38px] ${
              mode === 'reels-script' && !showHistory
                ? 'bg-[#062959] text-white shadow-xs'
                : 'text-[#233b53] hover:bg-white'
            }`}
          >
            <Film className="w-3.5 h-3.5 shrink-0" />
            <span>سناریو ریلز/موشن</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('canvas-slide');
              setShowHistory(false);
            }}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap min-h-[38px] ${
              mode === 'canvas-slide' && !showHistory
                ? 'bg-[#062959] text-white shadow-xs'
                : 'text-[#233b53] hover:bg-white'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5 shrink-0" />
            <span>محتوای بوم/پست</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('carousel-deck');
              setShowHistory(false);
            }}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap min-h-[38px] ${
              mode === 'carousel-deck' && !showHistory
                ? 'bg-[#062959] text-white shadow-xs'
                : 'text-[#233b53] hover:bg-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>کاروسل ۵ اسلایدی</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('campaign-plan');
              setShowHistory(false);
            }}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap min-h-[38px] ${
              mode === 'campaign-plan' && !showHistory
                ? 'bg-[#062959] text-white shadow-xs'
                : 'text-[#233b53] hover:bg-white'
            }`}
          >
            <CalendarRange className="w-3.5 h-3.5 shrink-0" />
            <span>کمپین ۵ روزه</span>
          </button>
        </div>
      </div>

      {/* Main Scrollable Content Area */}
      <div className="p-5 space-y-4 overflow-y-auto max-h-[720px]">
        {showHistory ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-[#062959]">
                آرشیو تولیدات هوش مصنوعی حساب جیمیل شما ({savedHistory.length})
              </h3>
              <button
                type="button"
                onClick={() => setShowHistory(false)}
                className="text-xs font-bold text-[#089f93] cursor-pointer"
              >
                بازگشت به تولید محتوا
              </button>
            </div>

            {savedHistory.length === 0 ? (
              <div className="p-6 rounded-2xl bg-[#f5f8fa] border border-[#e3e9ed] text-center space-y-2">
                <p className="text-xs font-bold text-[#062959]">
                  هنوز سناریو یا کمپینی در حساب جیمیل شما ذخیره نشده است.
                </p>
                <p className="text-[11px] text-[#7e8c9b]">
                  با تولید هر سناریو، کپشن یا اسلاید، نسخه‌ای از آن به‌صورت خودکار در فضای ابری اکانت شما ذخیره می‌شود.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {savedHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-black text-[#062959] truncate">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-[#7e8c9b] mt-0.5">
                        {item.mode === 'campaign-calendar-30'
                          ? 'تقویم کمپین ۳۰ روزه چرخه محصولات'
                          : item.mode === 'reels-script'
                          ? 'سناریوی ریلز و موشن'
                          : item.mode === 'carousel-deck'
                          ? 'کاروسل ۵ اسلایدی'
                          : item.mode === 'campaign-plan'
                          ? 'کمپین فروش ۵ روزه'
                          : 'اسلاید و کپشن'}{' '}
                        · {item.createdAtLabel}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            const parsed = JSON.parse(item.contentJson);
                            setMode(item.mode);
                            setAiResult(parsed);
                            setShowHistory(false);
                          } catch {
                            // Ignore
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-[#062959] text-white text-xs font-bold cursor-pointer"
                      >
                        مشاهده
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSavedItem(item.id)}
                        className="p-1.5 rounded-lg bg-rose-50 text-rose-600 border border-rose-200 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Live Site Knowledge Base Banner */}
            <div className="p-3 rounded-xl bg-[#e5fbf9] border border-[#08cdbd]/60 flex items-center justify-between gap-2 text-xs text-[#062959]">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#089f93] shrink-0" />
                <span>
                  منبع داده: وب‌سایت رسمی{' '}
                  <strong className="font-black">arka-acc.ir</strong>
                </span>
              </div>
              <span className="text-[11px] font-bold text-[#089f93] tabular-nums-fa">
                {siteSyncStatus
                  ? `بروزرسانی: ${siteSyncStatus.updatedAt}`
                  : 'متصل به کاتالوگ آرکا'}
              </span>
            </div>

            {/* AI Prompt Configuration Form */}
            <form onSubmit={handleGenerate} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-[#062959] mb-1">
                  ۱. انتخاب محصول یا سرویس از سایت آرکا (arka-acc.ir)
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full bg-[#f5f8fa] border border-[#e3e9ed] focus:border-[#08cdbd] rounded-xl px-3 py-2.5 text-xs font-bold text-[#062959] outline-none"
                >
                  {ARKA_SITE_CATALOG.map((prod) => (
                    <option key={prod.id} value={prod.id}>
                      {prod.name} ({prod.group})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#062959] mb-1">
                    ۲. صنف یا مخاطب هدف
                  </label>
                  <input
                    type="text"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    className="w-full bg-[#f5f8fa] border border-[#e3e9ed] focus:border-[#08cdbd] rounded-xl px-3 py-2 text-xs text-[#062959] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#062959] mb-1">
                    ۳. هدف تبلیغاتی و CTA
                  </label>
                  <input
                    type="text"
                    value={campaignGoal}
                    onChange={(e) => setCampaignGoal(e.target.value)}
                    className="w-full bg-[#f5f8fa] border border-[#e3e9ed] focus:border-[#08cdbd] rounded-xl px-3 py-2 text-xs text-[#062959] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#062959] mb-1">
                  ۴. لحن محتوا و سناریو
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'حرفه‌ای و مدیریتی B2B',
                    'پرانرژی و فروشگاهی (ویژه ریلز)',
                    'آموزشی و دلسوزانه (ویژه مالیات)',
                    'داستان‌سرایی و مطالعه موردی',
                  ].map((presetTone) => (
                    <button
                      key={presetTone}
                      type="button"
                      onClick={() => setTone(presetTone)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                        tone === presetTone
                          ? 'bg-[#062959] text-white border-[#062959]'
                          : 'bg-[#f5f8fa] text-[#233b53] border-[#e3e9ed] hover:border-[#08cdbd]'
                      }`}
                    >
                      {presetTone}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#062959] mb-1">
                  ۵. نکته یا ایده اختصاصی شما (اختیاری)
                </label>
                <textarea
                  rows={2}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="مثلاً: تاکید روی اینکه با ۱۰۰ سند دموی رایگان می‌توانند کل انبار و فاکتورهای فروشگاه را بدون ریسک تست کنند..."
                  className="w-full bg-[#f5f8fa] border border-[#e3e9ed] focus:border-[#08cdbd] rounded-xl px-3 py-2 text-xs text-[#233b53] outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isGenerating}
                className="w-full py-3 px-4 rounded-xl bg-[#08cdbd] hover:bg-[#14dac3] disabled:opacity-60 text-[#062959] font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer min-h-[46px]"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>
                      در حال نگارش هوشمند بر اساس اطلاعات سایت آرکا...
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>
                      {mode === 'campaign-calendar-30'
                        ? 'تولید تقویم ۳۰ روزه چرخه محصولات آرکا (AI Campaign Calendar)'
                        : mode === 'reels-script'
                        ? 'تولید سناریوی ریلز، ویدیو و موشن‌گرافی + کاور'
                        : mode === 'carousel-deck'
                        ? 'تولید کاروسل ۵ اسلایدی به‌هم‌پیوسته + کپشن'
                        : mode === 'campaign-plan'
                        ? 'طراحی کمپین فروش ۵ روزه + تقویم و کپشن'
                        : 'تولید محتوای بوم، استوری/پست + کپشن'}
                    </span>
                  </>
                )}
              </button>
            </form>

            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* ==================== AI OUTPUT DISPLAY ==================== */}
            {aiResult && (
              <div className="pt-4 border-t border-[#e3e9ed] space-y-4">
                {/* 1. REELS & MOTION GRAPHICS SCRIPT OUTPUT */}
                {mode === 'reels-script' && aiResult.scenes && (
                  <div className="space-y-3.5">
                    <div className="p-4 rounded-2xl bg-[#062959] text-white space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-[#14dac3]">
                          سناریوی ویدیو، ریلز و موشن‌گرافی · {aiResult.durationEstimate}
                        </span>
                        {aiResult.coverSlide && (
                          <button
                            type="button"
                            onClick={() =>
                              onInjectSlideIntoCanvas(
                                aiResult.coverSlide,
                                aiResult.captionAndHashtags
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#08cdbd] hover:bg-[#14dac3] text-[#062959] text-[11px] font-black cursor-pointer"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            <span>اعمال کاور ریلز روی بوم</span>
                          </button>
                        )}
                      </div>
                      <h3 className="text-sm font-black text-white">
                        {aiResult.scenarioTitle}
                      </h3>
                      <div className="p-2.5 rounded-xl bg-[#0b2b56] border border-[#14dac3]/30 text-xs">
                        <strong className="text-[#14dac3] block mb-0.5">
                          قلاب ۳ ثانیه اول (Hook):
                        </strong>
                        {aiResult.hookFirst3Seconds}
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        <strong className="text-white">سبک بصری و موسیقی: </strong>
                        {aiResult.visualStyleAndMusic}
                      </p>
                    </div>

                    {/* Scenes List */}
                    <div className="space-y-2.5">
                      <div className="text-xs font-black text-[#062959]">
                        جدول سکانس‌بندی تصویر، موشن‌گرافی و نریشن ({aiResult.scenes.length} سکانس):
                      </div>
                      {aiResult.scenes.map((sc: any, idx: number) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] space-y-1.5 text-xs"
                        >
                          <div className="flex items-center justify-between font-bold text-[#089f93]">
                            <span>سکانس {sc.sceneNumber || idx + 1}</span>
                            <span dir="ltr" className="tabular-nums-fa">
                              {sc.timeCode}
                            </span>
                          </div>
                          <div>
                            <strong className="text-[#062959]">تصویر / موشن‌گرافی: </strong>
                            <span className="text-[#233b53]">{sc.visualAction}</span>
                          </div>
                          <div className="p-2 rounded-lg bg-white border border-[#e3e9ed]">
                            <strong className="text-[#062959]">دیالوگ / نریشن گوینده: </strong>
                            <span className="text-[#062959] font-semibold">
                              «{sc.voiceover}»
                            </span>
                          </div>
                          <div>
                            <strong className="text-[#089f93]">نوشته روی تصویر: </strong>
                            <span className="font-bold text-[#062959]">
                              {sc.onScreenText}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Caption Box */}
                    {aiResult.captionAndHashtags && (
                      <div className="p-3.5 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-[#062959]">
                            کپشن و هشتگ‌های آماده ریلز
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(aiResult.captionAndHashtags, 'reels-cap')
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#062959] text-white text-[11px] font-bold cursor-pointer"
                          >
                            {copiedKey === 'reels-cap' ? (
                              <Check className="w-3.5 h-3.5 text-[#14dac3]" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {copiedKey === 'reels-cap' ? 'کپی شد' : 'کپی کپشن'}
                            </span>
                          </button>
                        </div>
                        <pre className="text-xs text-[#233b53] whitespace-pre-wrap font-sans leading-relaxed bg-white p-3 rounded-lg border border-[#e3e9ed]">
                          {aiResult.captionAndHashtags}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. SINGLE CANVAS SLIDE OUTPUT */}
                {mode === 'canvas-slide' && aiResult.headlineHighlight && (
                  <div className="space-y-3.5">
                    <div className="p-4 rounded-2xl bg-[#062959] text-white space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#14dac3]">
                          {aiResult.eyebrow}
                        </span>
                        <span className="text-[11px] text-slate-300">
                          آماده تزریق به بوم
                        </span>
                      </div>
                      <h3 className="text-base font-black leading-snug">
                        {aiResult.headlinePart1}{' '}
                        <span className="text-[#14dac3]">
                          {aiResult.headlineHighlight}
                        </span>{' '}
                        {aiResult.headlinePart2}
                      </h3>
                      <p className="text-xs text-slate-200 leading-relaxed">
                        {aiResult.leadCopy}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          onInjectSlideIntoCanvas(
                            aiResult,
                            aiResult.instagramCaption
                          )
                        }
                        className="w-full py-2.5 px-4 rounded-xl bg-[#08cdbd] hover:bg-[#14dac3] text-[#062959] font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>تزریق مستقیم این محتوا به بوم طراحی فعلی</span>
                      </button>
                    </div>

                    {aiResult.instagramCaption && (
                      <div className="p-3.5 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-[#062959]">
                            کپشن اختصاصی تولیدشده
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(aiResult.instagramCaption, 'slide-cap')
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#062959] text-white text-[11px] font-bold cursor-pointer"
                          >
                            {copiedKey === 'slide-cap' ? (
                              <Check className="w-3.5 h-3.5 text-[#14dac3]" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>کپی کپشن</span>
                          </button>
                        </div>
                        <pre className="text-xs text-[#233b53] whitespace-pre-wrap font-sans leading-relaxed bg-white p-3 rounded-lg border border-[#e3e9ed]">
                          {aiResult.instagramCaption}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. CAROUSEL 5-SLIDE DECK OUTPUT */}
                {mode === 'carousel-deck' && aiResult.slides && (
                  <div className="space-y-3.5">
                    <div className="p-4 rounded-2xl bg-[#062959] text-white space-y-2.5">
                      <span className="text-xs font-bold text-[#14dac3] block">
                        پکیج کاروسل {aiResult.slides.length} اسلایدی آماده رندر
                      </span>
                      <h3 className="text-sm font-black">{aiResult.deckTitle}</h3>
                      <p className="text-xs text-slate-300">
                        {aiResult.deckSubtitle}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleConvertAndInjectCarousel(aiResult)}
                        className="w-full py-2.5 px-4 rounded-xl bg-[#08cdbd] hover:bg-[#14dac3] text-[#062959] font-black text-xs flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Layers className="w-4 h-4" />
                        <span>
                          باز کردن هر {aiResult.slides.length} اسلاید در بوم کاروسل استودیو
                        </span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      {aiResult.slides.map(
                        (sl: GeneratedSlidePayload, sIdx: number) => (
                          <div
                            key={sIdx}
                            className="p-3 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="text-[11px] font-bold text-[#089f93]">
                                اسلاید {sIdx + 1} · {sl.eyebrow}
                              </div>
                              <div className="text-xs font-black text-[#062959] truncate">
                                {sl.headlinePart1} {sl.headlineHighlight}{' '}
                                {sl.headlinePart2}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                onInjectSlideIntoCanvas(sl, aiResult.captionText)
                              }
                              className="px-2.5 py-1.5 rounded-lg bg-white border border-[#e3e9ed] hover:border-[#08cdbd] text-[11px] font-bold text-[#062959] shrink-0 cursor-pointer"
                            >
                              اعمال تکی
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* 4. 5-DAY SALES CAMPAIGN & CALENDAR OUTPUT */}
                {mode === 'campaign-plan' && aiResult.days && (
                  <div className="space-y-3.5">
                    <div className="p-4 rounded-2xl bg-[#062959] text-white space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#14dac3]">
                          کمپین فروش ۵ روزه اینستاگرام آرکا
                        </span>
                        {aiResult.heroSlide && (
                          <button
                            type="button"
                            onClick={() =>
                              onInjectSlideIntoCanvas(aiResult.heroSlide)
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#08cdbd] text-[#062959] text-[11px] font-black cursor-pointer"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            <span>تزریق کاور کمپین به بوم</span>
                          </button>
                        )}
                      </div>
                      <h3 className="text-sm font-black">{aiResult.campaignName}</h3>
                      <p className="text-xs text-slate-200 leading-relaxed">
                        {aiResult.strategyOverview}
                      </p>
                      <div className="p-2 rounded-lg bg-[#0b2b56] text-[11px] text-[#14dac3] font-bold">
                        پیشنهاد محوری: {aiResult.keyOfferHighlight}
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      {aiResult.days.map((d: any, idx: number) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] space-y-1.5 text-xs"
                        >
                          <div className="flex items-center justify-between font-bold text-[#089f93]">
                            <span>{d.dayTitle}</span>
                            <span className="text-[#062959]">
                              {d.formatRecommended}
                            </span>
                          </div>
                          <div className="font-black text-[#062959]">
                            {d.headlineHook}
                          </div>
                          <p className="text-[#233b53] leading-relaxed">
                            {d.contentAngle}
                          </p>
                          <div className="text-[11px] font-bold text-[#089f93]">
                            CTA: {d.ctaAction}
                          </div>
                          {d.readyCaption && (
                            <div className="pt-2 border-t border-[#e3e9ed] flex items-center justify-between gap-2">
                              <span className="text-[11px] text-[#7e8c9b] truncate">
                                {d.readyCaption}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopy(d.readyCaption, `day-${idx}`)
                                }
                                className="px-2 py-1 rounded bg-white border border-[#e3e9ed] text-[11px] font-bold text-[#062959] shrink-0 cursor-pointer"
                              >
                                {copiedKey === `day-${idx}`
                                  ? 'کپی شد'
                                  : 'کپی کپشن روز'}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5. 30-DAY AI CAMPAIGN CALENDAR + SAVE TO GOOGLE DRIVE SPREADSHEET */}
                {mode === 'campaign-calendar-30' &&
                  aiResult.scheduleDays &&
                  Array.isArray(aiResult.scheduleDays) && (
                    <div className="space-y-4">
                      {/* Summary Header + Save as Google Drive Spreadsheet CTA */}
                      <div className="p-4 rounded-2xl bg-[#062959] text-white space-y-3 border border-[#08cdbd]/40">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-[#14dac3]">
                            تقویم ۳۰ روزه منطبق با چرخه محصولات arka-acc.ir (
                            {aiResult.scheduleDays.length} روز)
                          </span>
                        </div>
                        <h3 className="text-sm font-black text-white">
                          {aiResult.calendarTitle}
                        </h3>
                        <p className="text-xs text-slate-200 leading-relaxed">
                          {aiResult.launchCycleSummary}
                        </p>

                        {/* Save to Google Drive as Spreadsheet Button */}
                        <div className="pt-1 space-y-2">
                          <button
                            type="button"
                            disabled={isSavingToDrive}
                            onClick={() => {
                              if (!accessToken || needsAuth) {
                                onGoogleSignIn();
                              } else {
                                setIsConfirmingDriveSave(true);
                              }
                            }}
                            className="w-full py-2.5 px-4 rounded-xl bg-[#08cdbd] hover:bg-[#14dac3] disabled:opacity-60 text-[#062959] font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm min-h-[42px]"
                          >
                            {isSavingToDrive ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>
                                  در حال ساخت فایل Spreadsheet در Google Drive...
                                </span>
                              </>
                            ) : (
                              <>
                                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                                <span>
                                  {!accessToken || needsAuth
                                    ? 'ورود با گوگل و ذخیره تقویم ۳۰ روزه در Google Drive'
                                    : 'ذخیره تقویم ۳۰ روزه در Google Drive (Spreadsheet)'}
                                </span>
                              </>
                            )}
                          </button>

                          {savedDriveSheetInfo && (
                            <div className="p-3 rounded-xl bg-[#0b2b56] border border-[#14dac3] flex items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <CheckCircle2 className="w-4 h-4 text-[#14dac3] shrink-0" />
                                <span className="truncate font-bold text-white">
                                  ذخیره شد: {savedDriveSheetInfo.title}
                                </span>
                              </div>
                              <a
                                href={savedDriveSheetInfo.spreadsheetUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#08cdbd] text-[#062959] font-black text-[11px] shrink-0"
                              >
                                <span>باز کردن در Drive</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 4-Week Product Launch Cycle Filter Bar */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {[
                          { id: 0, label: 'همه ۳۰ روز' },
                          { id: 1, label: 'هفته ۱ (آگاهی و مؤدیان)' },
                          { id: 2, label: 'هفته ۲ (۸ محصول تخصصی)' },
                          { id: 3, label: 'هفته ۳ (اثبات و هوش مصنوعی)' },
                          { id: 4, label: 'هفته ۴ (دموی ۱۰۰ سند و فروش)' },
                        ].map((wk) => (
                          <button
                            key={wk.id}
                            type="button"
                            onClick={() => setSelectedWeekFilter(wk.id)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                              selectedWeekFilter === wk.id
                                ? 'bg-[#062959] text-white border-[#062959]'
                                : 'bg-[#f5f8fa] text-[#233b53] border-[#e3e9ed] hover:border-[#08cdbd]'
                            }`}
                          >
                            {wk.label}
                          </button>
                        ))}
                      </div>

                      {/* 30-Day Schedule Cards with 1-Click Canvas Injection */}
                      <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                        {(
                          aiResult.scheduleDays as Generated30DayScheduleItem[]
                        )
                          .filter((d) => {
                            if (selectedWeekFilter === 1)
                              return d.dayNumber >= 1 && d.dayNumber <= 7;
                            if (selectedWeekFilter === 2)
                              return d.dayNumber >= 8 && d.dayNumber <= 15;
                            if (selectedWeekFilter === 3)
                              return d.dayNumber >= 16 && d.dayNumber <= 23;
                            if (selectedWeekFilter === 4)
                              return d.dayNumber >= 24 && d.dayNumber <= 30;
                            return true;
                          })
                          .map((day, idx) => (
                            <div
                              key={`${day.dayNumber}-${idx}`}
                              className="p-3.5 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] space-y-2 text-xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="px-2 py-0.5 rounded-md bg-[#062959] text-[#14dac3] font-black text-[11px] tabular-nums-fa">
                                    روز {day.dayNumber}
                                  </span>
                                  <span className="font-bold text-[#089f93] truncate">
                                    {day.productModule}
                                  </span>
                                </div>
                                <span className="text-[11px] font-bold text-[#7e8c9b]">
                                  {day.formatRecommended}
                                </span>
                              </div>

                              <div className="text-[11px] font-semibold text-[#7e8c9b]">
                                {day.launchPhase} · {day.eyebrow}
                              </div>

                              <div className="font-black text-[#062959] leading-snug">
                                {day.headlinePart1}{' '}
                                <span className="text-[#089f93]">
                                  {day.headlineHighlight}
                                </span>{' '}
                                {day.headlinePart2}
                              </div>

                              <p className="text-[#233b53] leading-relaxed text-[11px]">
                                {day.leadCopy}
                              </p>

                              <div className="pt-2 border-t border-[#e3e9ed] flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleInjectCalendarDayIntoCanvas(day)
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#062959] hover:bg-[#0b2b56] text-white text-[11px] font-bold cursor-pointer"
                                >
                                  <ArrowUpRight className="w-3.5 h-3.5 text-[#14dac3]" />
                                  <span>اعمال مستقیم روی بوم طراحی</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCopy(
                                      `${day.headlinePart1} ${day.headlineHighlight} ${day.headlinePart2}\n\n${day.captionSummary}`,
                                      `cal30-${day.dayNumber}`
                                    )
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#e3e9ed] text-[11px] font-bold text-[#062959] cursor-pointer"
                                >
                                  {copiedKey === `cal30-${day.dayNumber}` ? (
                                    <Check className="w-3.5 h-3.5 text-[#089f93]" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                  <span>
                                    {copiedKey === `cal30-${day.dayNumber}`
                                      ? 'کپی شد'
                                      : 'کپی کپشن'}
                                  </span>
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Mandatory User Confirmation Dialog before Creating/Writing Spreadsheet in Google Drive */}
      {isConfirmingDriveSave && aiResult?.scheduleDays && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#e3e9ed] rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 text-right">
            <div className="flex items-center gap-2.5 text-[#062959]">
              <div className="w-10 h-10 rounded-xl bg-[#e5fbf9] text-[#089f93] flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-black">
                تایید ذخیره تقویم ۳۰ روزه در Google Drive
              </h3>
            </div>

            <p className="text-xs text-[#233b53] leading-relaxed">
              آیا مایل هستید تقویم ۳۰ روزه «
              <strong>{aiResult.calendarTitle}</strong>» شامل{' '}
              {aiResult.scheduleDays.length} ردیف برنامه انتشار استوری و پست
              به‌عنوان یک فایل جدید Google Sheets در حساب Google Drive شما ایجاد
              و ذخیره شود؟
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e3e9ed]">
              <button
                type="button"
                onClick={() => setIsConfirmingDriveSave(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-[#233b53] cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={executeSave30DayCalendarToDrive}
                className="px-4 py-2 rounded-xl bg-[#062959] hover:bg-[#0b2b56] text-xs font-black text-white cursor-pointer"
              >
                بله، ایجاد Spreadsheet در Google Drive
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

