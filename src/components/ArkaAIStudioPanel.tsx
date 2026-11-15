import React, { useState, useEffect, useRef } from 'react';
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
  fetchUserBrandProfile,
  saveUserBrandProfile,
} from '../firebase';
import {
  ARKA_SLASH_COMMANDS,
  ARKA_SYSTEM_INSTRUCTION,
  SlashCommandConfig,
  ArkaConnectionSource,
  CanvasSlideSchemaItem,
  ClassifiedAiError,
  ArkaBrandProfile,
  DEFAULT_ARKA_BRAND_PROFILE,
  resolveSmartModelForTask,
} from '../config/arkaCore';
import {
  ArkaAiRequestError,
  GeneratedSeoArticleResult,
  generateArkaStudioContent,
  loadCachedBrandProfile,
  saveCachedBrandProfile,
  verifyArkaAiConnection,
} from '../services/arkaAiClient';
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
  Loader2,
  CheckCircle2,
  AlertCircle,
  Cpu,
  ShieldCheck,
  Braces,
  KeyRound,
  HardDrive,
  Palette,
  Video,
  MessageSquareText,
  Zap,
  FileText,
  BrainCircuit,
  Link2,
  HelpCircle,
  Share2,
  RotateCcw,
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

export interface CustomKeyVerifiedInfo {
  valid: boolean;
  maskedKey?: string | null;
  models: string[];
  hasPro: boolean;
  hasFlash: boolean;
  checkedAt: string;
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
  onInjectCanvasSlideItem?: (
    slide: CanvasSlideSchemaItem,
    targetAspectRatio?: string,
    captionText?: string
  ) => void;
  onInjectCarouselDeckIntoStudio: (deck: ArkaCarouselDeck) => void;
  onCalendarSavedToDrive?: (spreadsheetInfo: {
    spreadsheetId: string;
    spreadsheetUrl: string;
    title: string;
  }) => void;
  onSaveCanvasPngToDrive?: () => void;
  onWriteStructuredToSheet?: (params: {
    title: string;
    tabName: string;
    headers: string[];
    rows: string[][];
  }) => void;
  preferredConnectionMode?: ArkaConnectionSource;
  onChangeConnectionMode?: (mode: ArkaConnectionSource) => void;
  customKeyVerifiedInfo?: CustomKeyVerifiedInfo | null;
  onOpenAuthKeyModal?: () => void;
  onEmitTelemetryLog?: (
    level: 'ok' | 'warn' | 'error',
    source: 'AI-Router' | 'Auth' | 'LiveContext' | 'Workspace',
    message: string
  ) => void;
}

export const ARKA_STUDIO_CORE_SYSTEM_INSTRUCTION = ARKA_SYSTEM_INSTRUCTION;

export const ArkaAIStudioPanel: React.FC<ArkaAIStudioPanelProps> = ({
  currentUser,
  accessToken,
  needsAuth,
  isSigningIn,
  onGoogleSignIn,
  onGoogleSignOut,
  activeStory,
  onInjectSlideIntoCanvas,
  onInjectCanvasSlideItem,
  onInjectCarouselDeckIntoStudio,
  onCalendarSavedToDrive,
  onSaveCanvasPngToDrive,
  onWriteStructuredToSheet,
  preferredConnectionMode = 'studio-creator-core',
  onChangeConnectionMode,
  customKeyVerifiedInfo = null,
  onOpenAuthKeyModal,
  onEmitTelemetryLog,
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
  const [articleKeywords, setArticleKeywords] = useState<string>(
    'نرم افزار حسابداری آرکا، ارسال صورتحساب سامانه مودیان، دانلود دموی رایگان حسابداری'
  );
  const [articleSearchIntent, setArticleSearchIntent] = useState<
    'Commercial' | 'Informational' | 'Transactional' | 'Navigational'
  >('Commercial');

  // Brand Intelligence Hub State
  const [showBrandHub, setShowBrandHub] = useState<boolean>(false);
  const [brandProfile, setBrandProfile] = useState<ArkaBrandProfile>(() =>
    loadCachedBrandProfile()
  );
  const [isSavingBrandProfile, setIsSavingBrandProfile] =
    useState<boolean>(false);
  const [brandSavedBanner, setBrandSavedBanner] = useState<string | null>(null);

  const [activeSlashCommand, setActiveSlashCommand] = useState<string | null>(
    null
  );
  const [jsonModeEnabled, setJsonModeEnabled] = useState<boolean>(false);
  const [showRawJsonModal, setShowRawJsonModal] = useState<boolean>(false);
  const [promptPlaceholder, setPromptPlaceholder] = useState<string>(
    'دستور دلخواه را بنویسید یا یکی از ۶ دکمه میانبر بالا (/fast، /hybrid، /rpe، /visual، /video، /copy) را بزنید...'
  );
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null);

  const [connectionMode, setConnectionMode] = useState<ArkaConnectionSource>(
    preferredConnectionMode
  );
  const [isVerifyingConnection, setIsVerifyingConnection] =
    useState<boolean>(false);
  const [connectionDiagnostics, setConnectionDiagnostics] = useState<{
    verified: boolean;
    latencyMs?: number;
    selectedModel: string;
    modelDisplayName: string;
    reasoningFa: string;
    verifiedAt?: string;
    availableModels: string[];
  } | null>(null);
  const [lastExecutionMeta, setLastExecutionMeta] = useState<{
    selectedModel: string;
    plannedModel?: string;
    usedFallback?: boolean;
    fallbackReason?: string;
    modelDisplayName: string;
    detectedArkaMode: string;
    reasoningFa: string;
    connectionMode: string;
    keySource?: string;
    jsonModeActive?: boolean;
    latencyMs?: number;
  } | null>(null);

  useEffect(() => {
    setConnectionMode(preferredConnectionMode);
  }, [preferredConnectionMode]);

  // Load user's cloud Brand Intelligence Hub profile when signed in
  useEffect(() => {
    if (!currentUser) return;
    fetchUserBrandProfile()
      .then((cloudProfile) => {
        if (cloudProfile) {
          setBrandProfile(cloudProfile);
          saveCachedBrandProfile(cloudProfile);
        }
      })
      .catch(() => {
        // Keep cached default profile
      });
  }, [currentUser]);

  const handleSaveBrandHubProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingBrandProfile(true);
    setBrandSavedBanner(null);
    try {
      saveCachedBrandProfile(brandProfile);
      if (currentUser) {
        await saveUserBrandProfile(brandProfile);
      }
      setBrandSavedBanner(
        currentUser
          ? 'پروفایل قطب هوش برند آرکا در فضای ابری حساب شما ذخیره شد و در تمام ماژول‌ها فعال است.'
          : 'پروفایل قطب هوش برند در مرورگر ذخیره شد و در تمام ماژول‌ها فعال است.'
      );
      onEmitTelemetryLog?.(
        'ok',
        'LiveContext',
        `پروفایل قطب هوش برند (${brandProfile.brandName}) بروزرسانی شد.`
      );
      setTimeout(() => setBrandSavedBanner(null), 3500);
    } catch {
      setBrandSavedBanner('ذخیره محلی انجام شد.');
    } finally {
      setIsSavingBrandProfile(false);
    }
  };

  const handleResetBrandHubToDefault = () => {
    setBrandProfile({ ...DEFAULT_ARKA_BRAND_PROFILE });
    saveCachedBrandProfile(DEFAULT_ARKA_BRAND_PROFILE);
    if (currentUser) {
      saveUserBrandProfile(DEFAULT_ARKA_BRAND_PROFILE).catch(() => {});
    }
    setBrandSavedBanner('پروفایل قطب هوش برند به استاندارد کارخانه آرکا بازنشانی شد.');
    setTimeout(() => setBrandSavedBanner(null), 3000);
  };

  const handleSelectConnectionMode = (nextMode: ArkaConnectionSource) => {
    setConnectionMode(nextMode);
    if (onChangeConnectionMode) {
      onChangeConnectionMode(nextMode);
    }
  };

  const hasVerifiedByok = Boolean(customKeyVerifiedInfo?.valid);
  const isGmailActive = Boolean(
    currentUser && connectionMode === 'gmail-authenticated'
  );
  const isByokActive = Boolean(
    hasVerifiedByok && connectionMode === 'custom-byok'
  );

  const creditSourceDisplay = isByokActive
    ? {
        dot: '🔵',
        badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
        label: `گاوصندوق کلید شخصی (${customKeyVerifiedInfo?.maskedKey || 'فعال'})`,
        short: 'گاوصندوق کلید شخصی',
      }
    : isGmailActive
    ? {
        dot: '🟢',
        badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
        label: `اکانت جیمیل (${currentUser?.email || ''})`,
        short: 'اکانت جیمیل',
      }
    : {
        dot: '🟠',
        badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
        label: 'کلید سازمانی سرور آرکا (ویژه ادمین)',
        short: 'هسته سازمانی آرکا',
      };

  const liveModelDecision = resolveSmartModelForTask(
    customPrompt,
    mode,
    jsonModeEnabled
  );

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [classifiedError, setClassifiedError] =
    useState<ClassifiedAiError | null>(null);
  const [aiResult, setAiResult] = useState<any | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [isSyncingSite, setIsSyncingSite] = useState<boolean>(false);
  const [siteSyncStatus, setSiteSyncStatus] = useState<{
    fetchedLive: boolean;
    cached: boolean;
    systemsCount: number;
    updatedAt: string;
  } | null>(null);

  const [savedHistory, setSavedHistory] = useState<SavedAiGenerationItem[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  const [selectedWeekFilter, setSelectedWeekFilter] = useState<number>(0);
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
    fetch('/api/arka-site/live-context')
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok) {
          setSiteSyncStatus({
            fetchedLive: Boolean(data.fetchedLive),
            cached: Boolean(data.cached),
            systemsCount: data.systemsCount || 8,
            updatedAt: new Intl.DateTimeFormat('fa-IR', {
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date()),
          });
          onEmitTelemetryLog?.(
            'ok',
            'LiveContext',
            `کاتالوگ ${data.systemsCount || 8} سیستم آرکا آماده است (${
              data.cached
                ? 'کش ۶ ساعته'
                : data.fetchedLive
                ? 'واکشی زنده از arka-acc.ir'
                : 'دانش استاتیک پشتیبان'
            }).`
          );
        }
      })
      .catch(() => {});

    fetch('/api/arka-ai/diagnostics')
      .then((r) => r.json())
      .then((diag) => {
        if (diag?.ok && diag?.recommendedDecision) {
          setConnectionDiagnostics({
            verified: Boolean(diag.serverKeyConfigured || diag.userVaultConfigured),
            selectedModel: diag.recommendedDecision.modelId,
            modelDisplayName: diag.recommendedDecision.modelDisplayName,
            reasoningFa: diag.recommendedDecision.reasoningFa,
            availableModels: diag.discoveredModels || [
              'gemini-2.5-flash',
              'gemini-2.5-pro',
            ],
          });
        }
      })
      .catch(() => {});
  }, [onEmitTelemetryLog]);

  useEffect(() => {
    if (currentUser) {
      fetchUserAiGenerations()
        .then((items) => setSavedHistory(items))
        .catch(() => {});
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
          cached: Boolean(data.cached),
          systemsCount: data.systemsCount || 8,
          updatedAt: new Intl.DateTimeFormat('fa-IR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }).format(new Date()),
        });
        onEmitTelemetryLog?.(
          data.fetchedLive ? 'ok' : 'warn',
          'LiveContext',
          data.fetchedLive
            ? 'Force Refresh موفق: کانتکست زنده arka-acc.ir واکشی و در کش ۶ ساعته بروزرسانی شد.'
            : 'Force Refresh: تایم‌اوت سایت خارجی؛ استفاده فوری از کاتالوگ ۸ سیستم آرکا.'
        );
      }
    } catch {
      onEmitTelemetryLog?.(
        'warn',
        'LiveContext',
        'خطا در بروزرسانی دستی کانتکست؛ حفظ داده‌های کش.'
      );
    } finally {
      setIsSyncingSite(false);
    }
  };

  const handleVerifyAiConnection = async () => {
    if (isVerifyingConnection) return;
    setIsVerifyingConnection(true);
    setErrorMsg(null);
    setClassifiedError(null);
    try {
      const data = await verifyArkaAiConnection({
        connectionMode,
        customPrompt,
        studioTabMode: mode,
      });
      setConnectionDiagnostics({
        verified: true,
        latencyMs: data.latencyMs,
        selectedModel: data.selectedModel,
        modelDisplayName: data.modelDisplayName,
        reasoningFa: data.reasoningFa,
        verifiedAt: data.verifiedAt,
        availableModels: data.availableModels || [
          'gemini-2.5-flash',
          'gemini-2.5-pro',
        ],
      });
      onEmitTelemetryLog?.(
        'ok',
        'AI-Router',
        `تست اتصال موفق (${data.latencyMs}ms) · مدل فعال: ${data.selectedModel} · منبع: ${
          data.keySource === 'vault-byok'
            ? 'گاوصندوق کلید شخصی (AES-256-GCM)'
            : 'هسته سازمانی آرکا'
        }`
      );
    } catch (err: any) {
      if (err instanceof ArkaAiRequestError) {
        setClassifiedError(err.classified);
        setErrorMsg(err.classified.messageFa);
        onEmitTelemetryLog?.('error', 'AI-Router', err.classified.messageFa);
      } else {
        const msg =
          err?.message || 'خطا در تست و اعتبارسنجی اتصال هوش مصنوعی آرکا.';
        setErrorMsg(msg);
        onEmitTelemetryLog?.('error', 'AI-Router', msg);
      }
    } finally {
      setIsVerifyingConnection(false);
    }
  };

  const handleSelectSlashCommand = (option: SlashCommandConfig) => {
    setActiveSlashCommand(option.command);
    setPromptPlaceholder(option.placeholder);

    if (option.mode === 'deep_rpe') {
      setMode('campaign-calendar-30');
    } else if (option.mode === 'visual_matrix') {
      setMode('canvas-slide');
    } else if (option.mode === 'video_director') {
      setMode('reels-script');
    } else if (option.mode === 'copy_engine') {
      setMode('carousel-deck');
    }

    setCustomPrompt((prev) => {
      const stripped = prev
        .replace(/^\/(fast|hybrid|rpe|visual|video|copy)\b\s*/i, '')
        .trimStart();
      return stripped ? `${option.command} ${stripped}` : `${option.command} `;
    });

    requestAnimationFrame(() => {
      const el = promptInputRef.current;
      if (el) {
        el.focus();
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    });
  };

  const handleToggleJsonFlag = () => {
    setJsonModeEnabled((prev) => {
      const next = !prev;
      setCustomPrompt((cur) => {
        const hasJsonFlag = /--json\b/i.test(cur);
        if (!next && hasJsonFlag) {
          return cur.replace(/\s*--json\b/gi, '').trimEnd();
        }
        if (next && !hasJsonFlag) {
          const trimmed = cur.trimEnd();
          return trimmed ? `${trimmed} --json` : '--json';
        }
        return cur;
      });
      return next;
    });
    requestAnimationFrame(() => {
      const el = promptInputRef.current;
      if (el) {
        el.focus();
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    });
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const executeGenerationRequest = async (allowModelFallback = false) => {
    if (isGenerating) return;
    setIsGenerating(true);
    setErrorMsg(null);
    setClassifiedError(null);

    const activeSource: ArkaConnectionSource = isByokActive
      ? 'custom-byok'
      : isGmailActive
      ? 'gmail-authenticated'
      : 'studio-creator-core';

    const isJsonActive =
      jsonModeEnabled ||
      /--json\b|\[json\]|output:\s*json|فرمت\s*json/i.test(customPrompt);

    onEmitTelemetryLog?.(
      'ok',
      'AI-Router',
      `ارسال درخواست (${
        liveModelDecision.detectedSlashCommand || mode
      }) ← مدل هدف: ${
        allowModelFallback
          ? `${liveModelDecision.fallbackModelId} (تلاش مجدد با جایگزین)`
          : liveModelDecision.modelId
      } · منبع: ${creditSourceDisplay.short}`
    );

    try {
      const data = await generateArkaStudioContent({
        mode,
        productName: `${selectedProduct.name} (${selectedProduct.group})`,
        targetAudience,
        campaignGoal,
        tone,
        customPrompt,
        jsonMode: isJsonActive,
        connectionMode: activeSource,
        brandProfile,
        articleKeywords,
        articleSearchIntent,
        allowModelFallback,
      });

      setAiResult(data.result);
      if (data.executionMeta) {
        setLastExecutionMeta(data.executionMeta);
        onEmitTelemetryLog?.(
          data.executionMeta.usedFallback ? 'warn' : 'ok',
          'AI-Router',
          `پاسخ دریافت شد (${data.executionMeta.latencyMs || 0}ms) · مدل اجراشده: ${
            data.executionMeta.selectedModel
          }${
            data.executionMeta.usedFallback
              ? ` [جایگزین با تایید کاربر از ${data.executionMeta.plannedModel}]`
              : ''
          }`
        );
      }
      setSavedDriveSheetInfo(null);

      if (currentUser && data.result) {
        const title =
          data.result.articleTitleH1 ||
          data.result.calendarTitle ||
          data.result.scenarioTitle ||
          data.result.deckTitle ||
          data.result.campaignName ||
          data.result.canvas_slides?.[0]?.headline ||
          data.result.headlineHighlight ||
          selectedProduct.name;

        const savedItem = await saveUserAiGeneration({
          mode,
          productId: selectedProduct.id,
          title: `${selectedProduct.badge}: ${title}`,
          contentObj: data.result,
        });
        if (savedItem) {
          setSavedHistory((prev) => [savedItem, ...prev.slice(0, 19)]);
        }
      }
    } catch (err: any) {
      if (err instanceof ArkaAiRequestError) {
        setClassifiedError(err.classified);
        setErrorMsg(err.classified.messageFa);
        onEmitTelemetryLog?.(
          'error',
          'AI-Router',
          `[${err.classified.errorCode}] ${err.classified.messageFa}`
        );
      } else {
        const msg =
          err?.message ||
          'خطا در ارتباط با موتور هوش مصنوعی آرکا. دوباره تلاش کنید.';
        setErrorMsg(msg);
        onEmitTelemetryLog?.('error', 'AI-Router', msg);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeGenerationRequest(false);
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
        headerMeta:
          sl.headerMeta || 'تولیدشده با هوش مصنوعی آرکا · arka-acc.ir',
        eyebrow: sl.eyebrow || selectedProduct.eyebrow,
        headlinePart1: sl.headlinePart1 || '',
        headlineHighlight: sl.headlineHighlight || selectedProduct.name,
        headlinePart2: sl.headlinePart2 || '',
        leadCopy: sl.leadCopy || '',
        primaryStatValue: sl.primaryStatValue || '۱۰۰ سند دمو',
        primaryStatLabel:
          sl.primaryStatLabel || 'تست رایگان در arka-acc.ir/demo',
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

  const handleTriggerInjectCanvasSlide = (
    slide: CanvasSlideSchemaItem,
    aspect?: string,
    caption?: string
  ) => {
    if (onInjectCanvasSlideItem) {
      onInjectCanvasSlideItem(slide, aspect, caption);
      return;
    }
    const parts = (slide.headline || '').trim().split(' ');
    const mid = Math.max(1, Math.floor(parts.length / 2));
    onInjectSlideIntoCanvas(
      {
        categoryLabel: slide.badge_text || selectedProduct.badge,
        headerMeta: 'تولیدشده با هسته ۶ ماژوله آرکا · arka-acc.ir',
        eyebrow: slide.badge_text || selectedProduct.eyebrow,
        headlinePart1: parts.slice(0, mid).join(' '),
        headlineHighlight:
          parts.slice(mid, mid + 2).join(' ') || selectedProduct.name,
        headlinePart2: parts.slice(mid + 2).join(' '),
        leadCopy: slide.subheadline || '',
        primaryStatValue: '۱۰۰ سند دمو',
        primaryStatLabel: slide.footer_cta || 'https://arka-acc.ir/demo',
        stickerTitle: slide.footer_cta || 'دریافت دموی رایگان ۱۰۰ سند',
        stickerActionText: 'https://arka-acc.ir/demo',
        instagramCaption: caption || '',
        items: (slide.bullet_points || []).slice(0, 4).map((bp, i) => ({
          kicker: `نکته ۰${i + 1}`,
          title: bp,
          subtitle: selectedProduct.name,
          metric: 'آرکا',
        })),
      },
      caption
    );
  };

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
            properties: { title: sheetTitle },
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

      const savedInfo = { spreadsheetId, spreadsheetUrl, title: sheetTitle };
      setSavedDriveSheetInfo(savedInfo);
      onEmitTelemetryLog?.(
        'ok',
        'Workspace',
        `تقویم ۳۰ روزه در Google Sheets/Drive ذخیره شد: ${sheetTitle}`
      );
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

  const buildFullArticleMarkdown = (art: GeneratedSeoArticleResult): string => {
    const sectionsText = (art.sections || [])
      .map(
        (s) =>
          `${s.headingLevel === 'H3' ? '###' : '##'} ${s.headingTitle}\n\n${(
            s.bodyParagraphs || []
          ).join('\n\n')}${
            s.keyTakeaway ? `\n\n> **نکته کلیدی آرکا:** ${s.keyTakeaway}` : ''
          }`
      )
      .join('\n\n');

    const faqText = (art.faqItems || [])
      .map((f, i) => `**${i + 1}. ${f.question}**\n${f.answer}`)
      .join('\n\n');

    return `# ${art.articleTitleH1}\n\n**Meta Title:** ${art.metaTitle}\n**Meta Description:** ${art.metaDescription}\n**Slug:** /blog/${art.suggestedSlug}\n\n---\n\n### پاسخ مستقیم (AEO Answer Box)\n${art.aeoDirectAnswerBox}\n\n### خلاصه استنادی هوش مصنوعی (GEO Citation)\n${art.geoCitationSummary}\n\n---\n\n${sectionsText}\n\n---\n\n## سوالات متداول (FAQ)\n\n${faqText}`;
  };

  const buildFaqJsonLdSchema = (art: GeneratedSeoArticleResult): string => {
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: (art.faqItems || []).map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: f.answer,
        },
      })),
    };
    return JSON.stringify(schema, null, 2);
  };

  const enterpriseSlides: CanvasSlideSchemaItem[] = Array.isArray(
    aiResult?.canvas_slides
  )
    ? aiResult.canvas_slides
    : [];
  const videoProd = aiResult?.data?.video_production;
  const visualMatrix = aiResult?.data?.visual_matrix;
  const copywriting = aiResult?.data?.copywriting;
  const hybridVariants = Array.isArray(aiResult?.data?.variants)
    ? aiResult.data.variants
    : [];
  const clarifyingQuestions: string[] = Array.isArray(
    aiResult?.interaction?.clarifying_questions
  )
    ? aiResult.interaction.clarifying_questions
    : [];

  return (
    <aside className="w-full lg:w-[460px] shrink-0 bg-white border border-[#e3e9ed] rounded-[20px] shadow-sm flex flex-col overflow-hidden text-[#233b53]">
      {/* Top Header in Arka Navy / Enterprise Dark */}
      <div className="px-4 sm:px-5 py-4 bg-[#062959] text-white flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#08cdbd] text-[#062959] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-white truncate">
                هسته مرکزی هوش مصنوعی آرکــا
              </h2>
              <p className="text-[11px] text-[#a4d2d1] truncate">
                Capability Router · SEO/AEO/GEO · BYOK Vault
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowBrandHub((v) => !v);
                setShowHistory(false);
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                showBrandHub
                  ? 'bg-[#08cdbd] text-[#062959] border-[#08cdbd]'
                  : 'bg-[#0b2b56] text-[#14dac3] border-[#14dac3]/35 hover:bg-[#08cdbd] hover:text-[#062959]'
              }`}
              title="قطب هوش برند آرکا (Brand Intelligence Hub)"
            >
              <BrainCircuit className="w-3.5 h-3.5" />
              <span>هوش برند</span>
            </button>

            <button
              type="button"
              onClick={handleRefreshSiteData}
              disabled={isSyncingSite}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[#0b2b56] hover:bg-[#08cdbd] hover:text-[#062959] text-[11px] font-bold text-[#14dac3] border border-[#14dac3]/30 transition-colors cursor-pointer whitespace-nowrap"
              title="Force Refresh: واکشی مجدد اطلاعات زنده سایت arka-acc.ir"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isSyncingSite ? 'animate-spin' : ''}`}
              />
              <span className="hidden sm:inline">Sync</span>
            </button>
          </div>
        </div>

        {/* Google Account + Encrypted BYOK Vault Quick Status Strip */}
        <div className="p-2.5 rounded-xl bg-[#0b2b56] border border-white/12 flex items-center justify-between gap-2">
          {currentUser ? (
            <div className="flex items-center justify-between w-full gap-2">
              <div className="flex items-center gap-2 min-w-0">
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
                  onClick={() => {
                    setShowHistory((v) => !v);
                    setShowBrandHub(false);
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                    showHistory
                      ? 'bg-[#08cdbd] text-[#062959]'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span className="tabular-nums-fa">
                    ({savedHistory.length})
                  </span>
                </button>
                {onOpenAuthKeyModal && (
                  <button
                    type="button"
                    onClick={onOpenAuthKeyModal}
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/35 text-purple-200 border border-purple-400/30 text-[11px] font-bold cursor-pointer"
                    title="گاوصندوق امن کلید API شخصی (AES-256-GCM) و حساب گوگل"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>{hasVerifiedByok ? 'Vault ✓' : 'API Key'}</span>
                  </button>
                )}
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
              <div className="flex items-center gap-1.5">
                {onOpenAuthKeyModal && (
                  <button
                    type="button"
                    onClick={onOpenAuthKeyModal}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-400/40 text-[11px] font-bold cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>تنظیم گاوصندوق API Key</span>
                  </button>
                )}
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
                  {isSigningIn ? 'در حال اتصال...' : 'ورود با جیمیل'}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 6 AI Mode Selector Tabs (Including SEO / AEO / GEO Article Studio) */}
      <div className="p-2 bg-[#f5f8fa] border-b border-[#e3e9ed] flex flex-col gap-1.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => {
              setMode('campaign-calendar-30');
              setShowHistory(false);
              setShowBrandHub(false);
            }}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-xl text-xs font-black transition-colors cursor-pointer min-h-[40px] border ${
              mode === 'campaign-calendar-30' && !showHistory && !showBrandHub
                ? 'bg-[#062959] text-[#14dac3] border-[#08cdbd] shadow-xs'
                : 'bg-white text-[#062959] border-[#08cdbd]/40 hover:bg-[#e5fbf9]'
            }`}
          >
            <CalendarDays className="w-4 h-4 shrink-0 text-[#08cdbd]" />
            <span>تقویم ۳۰ روزه + Drive</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('seo-article');
              setShowHistory(false);
              setShowBrandHub(false);
            }}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-xl text-xs font-black transition-colors cursor-pointer min-h-[40px] border ${
              mode === 'seo-article' && !showHistory && !showBrandHub
                ? 'bg-[#062959] text-[#14dac3] border-[#08cdbd] shadow-xs'
                : 'bg-white text-[#062959] border-[#08cdbd]/40 hover:bg-[#e5fbf9]'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0 text-[#08cdbd]" />
            <span>استودیو مقاله SEO/AEO/GEO</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
          <button
            type="button"
            onClick={() => {
              setMode('reels-script');
              setShowHistory(false);
              setShowBrandHub(false);
            }}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap min-h-[38px] ${
              mode === 'reels-script' && !showHistory && !showBrandHub
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
              setShowBrandHub(false);
            }}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap min-h-[38px] ${
              mode === 'canvas-slide' && !showHistory && !showBrandHub
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
              setShowBrandHub(false);
            }}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap min-h-[38px] ${
              mode === 'carousel-deck' && !showHistory && !showBrandHub
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
              setShowBrandHub(false);
            }}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap min-h-[38px] ${
              mode === 'campaign-plan' && !showHistory && !showBrandHub
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
      <div className="p-4 sm:p-5 space-y-4 overflow-y-auto max-h-[780px]">
        {showBrandHub ? (
          /* ==================== BRAND INTELLIGENCE HUB ==================== */
          <form onSubmit={handleSaveBrandHubProfile} className="space-y-3.5">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#e3e9ed]">
              <div className="flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-[#089f93]" />
                <h3 className="text-xs font-black text-[#062959]">
                  قطب هوش برند آرکا (Brand Intelligence Hub)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetBrandHubToDefault}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-500 hover:text-amber-400 cursor-pointer"
                  title="بازگردانی به اطلاعات استاندارد سایت arka-acc.ir"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>پیش‌فرض آرکا</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowBrandHub(false)}
                  className="text-xs font-bold text-[#089f93] cursor-pointer"
                >
                  بازگشت
                </button>
              </div>
            </div>

            <p className="text-[11px] text-[#7e8c9b] leading-relaxed">
              اطلاعات این بخش به‌صورت خودکار در تمام ماژول‌های تولید محتوا (مقاله SEO/AEO/GEO، تقویم کمپین، اسلاید بوم، کاروسل و ریلز) تزریق می‌شود تا خروجی‌ها کاملاً هم‌راستا با هویت برند شما باشند.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-[#062959] mb-1">
                  نام برند / سازمان
                </label>
                <input
                  type="text"
                  value={brandProfile.brandName}
                  onChange={(e) =>
                    setBrandProfile((p) => ({ ...p, brandName: e.target.value }))
                  }
                  className="w-full bg-[#f5f8fa] border border-[#e3e9ed] rounded-xl px-3 py-2 text-xs text-[#062959] outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#062959] mb-1">
                  شعار و جایگاه برند (Tagline)
                </label>
                <input
                  type="text"
                  value={brandProfile.tagline}
                  onChange={(e) =>
                    setBrandProfile((p) => ({ ...p, tagline: e.target.value }))
                  }
                  className="w-full bg-[#f5f8fa] border border-[#e3e9ed] rounded-xl px-3 py-2 text-xs text-[#062959] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#062959] mb-1">
                ارزش پیشنهادی و محصولات کلیدی (Core Value Proposition)
              </label>
              <textarea
                rows={2}
                value={brandProfile.coreValueProposition}
                onChange={(e) =>
                  setBrandProfile((p) => ({
                    ...p,
                    coreValueProposition: e.target.value,
                  }))
                }
                className="w-full bg-[#f5f8fa] border border-[#e3e9ed] rounded-xl px-3 py-2 text-xs text-[#062959] outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#062959] mb-1">
                بخش‌بندی مخاطبان هدف (Target Audiences)
              </label>
              <textarea
                rows={2}
                value={brandProfile.targetAudienceSegments}
                onChange={(e) =>
                  setBrandProfile((p) => ({
                    ...p,
                    targetAudienceSegments: e.target.value,
                  }))
                }
                className="w-full bg-[#f5f8fa] border border-[#e3e9ed] rounded-xl px-3 py-2 text-xs text-[#062959] outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#062959] mb-1">
                مزیت رقابتی و تمایز بازار (Competitive Positioning)
              </label>
              <textarea
                rows={2}
                value={brandProfile.competitivePositioning}
                onChange={(e) =>
                  setBrandProfile((p) => ({
                    ...p,
                    competitivePositioning: e.target.value,
                  }))
                }
                className="w-full bg-[#f5f8fa] border border-[#e3e9ed] rounded-xl px-3 py-2 text-xs text-[#062959] outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#062959] mb-1">
                کلمات کلیدی کانونی سئو و صفحات لینک‌سازی داخلی (SEO Pillars)
              </label>
              <textarea
                rows={2}
                value={brandProfile.focusKeywords}
                onChange={(e) =>
                  setBrandProfile((p) => ({
                    ...p,
                    focusKeywords: e.target.value,
                  }))
                }
                className="w-full bg-[#f5f8fa] border border-[#e3e9ed] rounded-xl px-3 py-2 text-xs text-[#062959] outline-none"
              />
            </div>

            {brandSavedBanner && (
              <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{brandSavedBanner}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSavingBrandProfile}
              className="w-full py-2.5 px-4 rounded-xl bg-[#08cdbd] hover:bg-[#14dac3] text-[#062959] font-black text-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSavingBrandProfile ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>ذخیره و همگام‌سازی قطب هوش برند در کل استودیو</span>
            </button>
          </form>
        ) : showHistory ? (
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
                  هنوز سناریو، مقاله یا کمپینی در حساب جیمیل شما ذخیره نشده است.
                </p>
                <p className="text-[11px] text-[#7e8c9b]">
                  با تولید هر مقاله، سناریو یا اسلاید، نسخه‌ای از آن به‌صورت خودکار در فضای ابری اکانت شما ذخیره می‌شود.
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
                        {item.mode} · {item.createdAtLabel}
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
            {/* Quick Google Workspace Sync Strip */}
            {currentUser && !needsAuth ? (
              <div className="p-2.5 rounded-xl bg-[#e5fbf9] border border-[#08cdbd]/50 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="font-bold text-[#062959] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#089f93] shrink-0" />
                  <span>همگام‌سازی مستقیم Google Workspace فعال است</span>
                </span>
                <div className="flex items-center gap-1.5">
                  {onSaveCanvasPngToDrive && (
                    <button
                      type="button"
                      onClick={onSaveCanvasPngToDrive}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#062959] hover:bg-[#0b2b56] text-white font-bold cursor-pointer"
                    >
                      <HardDrive className="w-3 h-3 text-[#14dac3]" />
                      <span>ذخیره خروجی در Drive</span>
                    </button>
                  )}
                </div>
              </div>
            ) : currentUser ? (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/35 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="font-bold text-amber-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>
                    ورود گوگل فعال است · برای Drive/Sheets دسترسی را تمدید کنید
                  </span>
                </span>
                <button
                  type="button"
                  disabled={isSigningIn}
                  onClick={onGoogleSignIn}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-[#062959] font-black cursor-pointer shrink-0"
                >
                  <span>
                    {isSigningIn ? 'در حال اتصال...' : 'اتصال Drive/Sheets'}
                  </span>
                </button>
              </div>
            ) : null}

            {/* AI Prompt Configuration Form */}
            <form onSubmit={handleGenerate} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-[#062959] mb-1">
                  ۱. انتخاب محصول یا سرویس از کاتالوگ ۸گانه آرکا (arka-acc.ir)
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

              {/* Dedicated SEO / AEO / GEO Article Inputs when mode === 'seo-article' */}
              {mode === 'seo-article' && (
                <div className="p-3 rounded-xl bg-[#07090E] border border-[#08cdbd]/40 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between text-[#14dac3] font-black">
                    <span className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      <span>تنظیمات تخصصی مقاله SEO / AEO / GEO</span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Schema + Citations
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      کلمه کلیدی اصلی و عبارات هم‌خانواده (Keywords):
                    </label>
                    <input
                      type="text"
                      value={articleKeywords}
                      onChange={(e) => setArticleKeywords(e.target.value)}
                      placeholder="مثلاً: نرم افزار حسابداری فروشگاهی، اتصال سامانه مودیان..."
                      className="w-full bg-[#0F1420] border border-slate-700 focus:border-[#08cdbd] rounded-lg px-3 py-2 text-xs text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      نیت جستجوی مخاطب (Search Intent):
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {(
                        [
                          { id: 'Commercial', label: 'تجاری و مقایسه‌ای' },
                          { id: 'Informational', label: 'آموزشی و راهنما' },
                          { id: 'Transactional', label: 'خرید و دانلود دمو' },
                          { id: 'Navigational', label: 'برندینگ آرکا' },
                        ] as const
                      ).map((intent) => (
                        <button
                          key={intent.id}
                          type="button"
                          onClick={() => setArticleSearchIntent(intent.id)}
                          className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border cursor-pointer transition-colors ${
                            articleSearchIntent === intent.id
                              ? 'bg-[#08cdbd] text-[#062959] border-[#08cdbd] font-black'
                              : 'bg-[#0F1420] text-slate-300 border-slate-700 hover:border-slate-500'
                          }`}
                        >
                          {intent.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

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

              {/* Row of 6 Neon-Styled Slash Command Buttons + Input */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-xs font-bold text-[#062959]">
                    ۵. موتورهای ۶گانه آرکا (ARKA_SLASH_COMMANDS)
                  </label>
                  {activeSlashCommand && (
                    <span
                      dir="ltr"
                      className="text-[11px] font-mono font-black text-[#14dac3]"
                    >
                      {activeSlashCommand}
                    </span>
                  )}
                </div>

                <div
                  role="group"
                  aria-label="دستورات میانبر ماژول‌های شش‌گانه هوش مصنوعی آرکا"
                  className="p-2 rounded-xl bg-[#07090E] border border-[#1e293b] grid grid-cols-2 sm:grid-cols-3 gap-1.5 shadow-inner"
                >
                  {ARKA_SLASH_COMMANDS.map((item) => {
                    const isActive =
                      activeSlashCommand === item.command ||
                      customPrompt.trimStart().startsWith(item.command);
                    return (
                      <button
                        key={item.command}
                        type="button"
                        onClick={() => handleSelectSlashCommand(item)}
                        title={item.placeholder}
                        className={`px-2.5 py-2 rounded-lg text-[11px] font-black transition-all cursor-pointer flex items-center justify-between gap-1.5 border ${
                          item.badgeColor
                        } ${
                          isActive
                            ? 'ring-2 ring-[#14dac3] shadow-[0_0_12px_rgba(20,218,195,0.45)]'
                            : 'hover:brightness-125'
                        }`}
                      >
                        <span className="truncate">{item.label}</span>
                        <span
                          dir="ltr"
                          className="font-mono text-[10px] opacity-90 shrink-0"
                        >
                          {item.command}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <textarea
                  ref={promptInputRef}
                  rows={3}
                  value={customPrompt}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomPrompt(val);
                    const matched = ARKA_SLASH_COMMANDS.find((m) =>
                      val.trimStart().startsWith(m.command)
                    );
                    if (matched) {
                      setActiveSlashCommand(matched.command);
                      setPromptPlaceholder(matched.placeholder);
                    } else if (!val.trim()) {
                      setActiveSlashCommand(null);
                    }
                    setJsonModeEnabled(
                      /--json\b|\[json\]|output:\s*json|فرمت\s*json/i.test(val)
                    );
                  }}
                  placeholder={promptPlaceholder}
                  className="w-full bg-[#f5f8fa] border border-[#e3e9ed] focus:border-[#08cdbd] focus:ring-2 focus:ring-[#14dac3]/25 rounded-xl px-3 py-2.5 text-xs text-[#233b53] outline-none transition-all"
                />
              </div>

              {/* ==================== PRE-FLIGHT TELEMETRY HUD BAR ==================== */}
              <div className="p-3 rounded-xl bg-[#07090E] border border-[#1e293b] space-y-2 text-[11px] text-slate-200 arka-neon-purple-ring">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-black text-[#14dac3]">
                    <Cpu className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span>نوار وضعیت زنده پیش از اجرا (Pre-Flight HUD)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {onOpenAuthKeyModal && (
                      <button
                        type="button"
                        onClick={onOpenAuthKeyModal}
                        className="px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/20 text-[10px] font-bold text-slate-200 cursor-pointer"
                      >
                        گاوصندوق کلید
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isVerifyingConnection}
                      onClick={handleVerifyAiConnection}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#08cdbd]/20 hover:bg-[#08cdbd]/35 text-[#14dac3] border border-[#14dac3]/30 text-[10px] font-black cursor-pointer"
                    >
                      {isVerifyingConnection ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-3 h-3" />
                      )}
                      <span>تست زنده اتصال</span>
                    </button>
                  </div>
                </div>

                {/* Line 1: Active Credit Source */}
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-slate-400">منبع اعتبار فعال:</span>
                  <span
                    className={`px-2 py-0.5 rounded-md border font-bold text-[10px] ${creditSourceDisplay.badgeClass}`}
                  >
                    {creditSourceDisplay.dot} {creditSourceDisplay.label}
                  </span>
                </div>

                {/* Line 2: Smart Model Router Selection */}
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-slate-400">مدل منتخب هوشمند:</span>
                  <span className="font-mono font-black text-purple-300" dir="ltr">
                    {liveModelDecision.modelId}
                  </span>
                </div>
                <div className="text-[10px] text-[#a4d2d1] leading-snug">
                  {liveModelDecision.reasoningFa}
                </div>

                {/* Line 3: Live Site 8-System Catalog + Brand Hub Status */}
                <div className="pt-1.5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
                  <span className="text-cyan-300 font-bold flex items-center gap-1">
                    <Zap className="w-3 h-3 text-cyan-400 shrink-0" />
                    <span>
                      کاتالوگ ۸ سیستم + هوش برند: فعال (
                      {siteSyncStatus?.cached
                        ? 'Cached · 6h'
                        : siteSyncStatus?.fetchedLive
                        ? 'Live Sync'
                        : 'Ready'}
                      )
                    </span>
                  </span>
                  {connectionDiagnostics?.verified && (
                    <span className="text-emerald-300 font-bold" dir="ltr">
                      ✓ Verified{' '}
                      {typeof connectionDiagnostics.latencyMs === 'number'
                        ? `(${connectionDiagnostics.latencyMs}ms)`
                        : ''}
                    </span>
                  )}
                </div>

                {(hasVerifiedByok || Boolean(currentUser)) && (
                  <div className="pt-1.5 border-t border-slate-800 flex flex-wrap items-center gap-1">
                    {currentUser && (
                      <button
                        type="button"
                        onClick={() =>
                          handleSelectConnectionMode('gmail-authenticated')
                        }
                        className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer border ${
                          isGmailActive
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-slate-900 text-slate-400 border-slate-800'
                        }`}
                      >
                        🟢 جیمیل شخصی
                      </button>
                    )}
                    {hasVerifiedByok && (
                      <button
                        type="button"
                        onClick={() => handleSelectConnectionMode('custom-byok')}
                        className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer border ${
                          isByokActive
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                            : 'bg-slate-900 text-slate-400 border-slate-800'
                        }`}
                      >
                        🔵 گاوصندوق کلید شخصی
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        handleSelectConnectionMode('studio-creator-core')
                      }
                      className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer border ${
                        !isGmailActive && !isByokActive
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-slate-900 text-slate-400 border-slate-800'
                      }`}
                    >
                      🟠 کلید سازمانی آرکا
                    </button>
                  </div>
                )}
              </div>

              {/* Action Row: Submit Button + JSON Mode Switch */}
              <div className="flex items-stretch gap-2">
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="flex-1 py-3 px-4 rounded-xl bg-[#08cdbd] hover:bg-[#14dac3] disabled:opacity-60 text-[#062959] font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer min-h-[46px]"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>
                        در حال اجرا با {liveModelDecision.modelId}...
                      </span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>
                        {activeSlashCommand
                          ? `اجرای دستور ${activeSlashCommand} + تولید اسلاید بوم`
                          : mode === 'seo-article'
                          ? 'تولید مقاله جامع SEO / AEO / GEO + اسکیمای FAQ'
                          : mode === 'campaign-calendar-30'
                          ? 'تولید تقویم ۳۰ روزه چرخه محصولات آرکا'
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

                <button
                  type="button"
                  onClick={handleToggleJsonFlag}
                  title="فعال‌سازی خروجی JSON Mode (responseMimeType: application/json)"
                  className={`px-3 py-2.5 rounded-xl font-mono text-xs font-black border transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0 min-h-[46px] ${
                    jsonModeEnabled ||
                    /--json\b|\[json\]|output:\s*json|فرمت\s*json/i.test(
                      customPrompt
                    )
                      ? 'bg-[#062959] text-[#14dac3] border-[#14dac3] shadow-[0_0_12px_rgba(20,218,195,0.45)]'
                      : 'bg-[#f5f8fa] text-[#062959] border-[#e3e9ed] hover:border-[#08cdbd]'
                  }`}
                >
                  <Braces className="w-3.5 h-3.5" />
                  <span>JSON Mode</span>
                </button>
              </div>
            </form>

            {lastExecutionMeta && (
              <div className="p-2.5 rounded-xl bg-[#f5f8fa] border border-[#08cdbd]/50 text-[11px] text-[#062959] flex flex-wrap items-center justify-between gap-2">
                <span>
                  مدل اجراشده:{' '}
                  <strong className="font-mono font-black text-[#089f93]">
                    {lastExecutionMeta.selectedModel}
                  </strong>
                  {lastExecutionMeta.usedFallback && (
                    <span className="mr-1 text-amber-500 font-bold">
                      (مدل جایگزین با تایید کاربر)
                    </span>
                  )}
                </span>
                <span className="font-bold text-[#233b53] tabular-nums-fa">
                  {lastExecutionMeta.latencyMs
                    ? `${lastExecutionMeta.latencyMs}ms · `
                    : ''}
                  {lastExecutionMeta.keySource === 'vault-byok' ||
                  lastExecutionMeta.keySource === 'custom-byok'
                    ? 'گاوصندوق کلید شخصی شما'
                    : lastExecutionMeta.connectionMode === 'gmail-authenticated'
                    ? 'اکانت جیمیل کاربر'
                    : 'هسته سازمانی آرکا'}
                </span>
              </div>
            )}

            {/* ==================== STRUCTURED ERROR & EXPLICIT FALLBACK RETRY CARD ==================== */}
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{errorMsg}</span>
                  </div>
                  {classifiedError?.errorCode && (
                    <span
                      dir="ltr"
                      className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-[10px] font-mono font-black text-rose-200 shrink-0"
                    >
                      {classifiedError.errorCode}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {classifiedError?.canFallbackToFlash && (
                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={() => executeGenerationRequest(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#08cdbd] hover:bg-[#14dac3] text-[#062959] text-xs font-black cursor-pointer shadow-sm"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>
                        تلاش مجدد با مدل جایگزین (Gemini 2.5 Flash)
                      </span>
                    </button>
                  )}

                  {(classifiedError?.errorCode === 'BYOK_KEY_REQUIRED' ||
                    classifiedError?.errorCode === 'INVALID_API_KEY' ||
                    classifiedError?.errorCode === 'AUTH_REQUIRED') &&
                    onOpenAuthKeyModal && (
                      <button
                        type="button"
                        onClick={onOpenAuthKeyModal}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black cursor-pointer"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>ثبت / مدیریت کلید در گاوصندوق امن سرور</span>
                      </button>
                    )}
                </div>
              </div>
            )}

            {/* ==================== AI OUTPUT DISPLAY & RICH VISUALIZERS ==================== */}
            {aiResult && (
              <div className="pt-4 border-t border-[#e3e9ed] space-y-4">
                {/* 0. SEO / AEO / GEO ARTICLE STUDIO OUTPUT VISUALIZER */}
                {mode === 'seo-article' && aiResult.articleTitleH1 && (
                  <div className="space-y-3.5">
                    <div className="p-4 rounded-2xl bg-[#062959] text-white space-y-2.5 border border-[#08cdbd]/40">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-[#08cdbd]/20 text-[#14dac3] text-[10px] font-black">
                          مقاله SEO / AEO / GEO · نیت جستجو:{' '}
                          {aiResult.searchIntent}
                        </span>
                        <span className="text-[11px] text-slate-300 tabular-nums-fa">
                          زمان مطالعه: {aiResult.estimatedReadingMinutes || 6}{' '}
                          دقیقه
                        </span>
                      </div>

                      <h3 className="text-sm sm:text-base font-black text-white leading-snug">
                        {aiResult.articleTitleH1}
                      </h3>

                      <div className="p-2.5 rounded-xl bg-[#0b2b56] border border-white/10 space-y-1 text-[11px]">
                        <div>
                          <strong className="text-[#14dac3]">Meta Title: </strong>
                          <span className="text-white">{aiResult.metaTitle}</span>
                        </div>
                        <div>
                          <strong className="text-[#14dac3]">
                            Meta Description:{' '}
                          </strong>
                          <span className="text-slate-200">
                            {aiResult.metaDescription}
                          </span>
                        </div>
                        <div dir="ltr" className="text-left font-mono text-[10px] text-cyan-300">
                          https://arka-acc.ir/blog/{aiResult.suggestedSlug}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(
                              buildFullArticleMarkdown(aiResult),
                              'seo-full-md'
                            )
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#08cdbd] hover:bg-[#14dac3] text-[#062959] text-xs font-black cursor-pointer"
                        >
                          {copiedKey === 'seo-full-md' ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {copiedKey === 'seo-full-md'
                              ? 'کل مقاله کپی شد!'
                              : 'کپی متن کامل مقاله (Markdown)'}
                          </span>
                        </button>

                        {aiResult.heroSlide && (
                          <button
                            type="button"
                            onClick={() =>
                              onInjectSlideIntoCanvas(
                                aiResult.heroSlide,
                                aiResult.instagramCaptionSnippet
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-[11px] font-bold cursor-pointer"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5 text-[#14dac3]" />
                            <span>اعمال کاور مقاله روی بوم</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Keywords & Search Intent Analysis */}
                    <div className="p-3 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] space-y-2 text-xs">
                      <div className="font-black text-[#062959]">
                        تحلیل کلمات کلیدی و نیت جستجو (Search Intent):
                      </div>
                      <p className="text-[11px] text-[#233b53] leading-relaxed">
                        {aiResult.searchIntentAnalysisFa}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <span className="px-2 py-0.5 rounded-md bg-[#062959] text-[#14dac3] text-[10px] font-black">
                          اصلی: {aiResult.primaryKeyword}
                        </span>
                        {Array.isArray(aiResult.secondaryKeywords) &&
                          aiResult.secondaryKeywords.map(
                            (kw: string, kIdx: number) => (
                              <span
                                key={kIdx}
                                className="px-2 py-0.5 rounded-md bg-white border border-[#e3e9ed] text-[#233b53] text-[10px] font-bold"
                              >
                                {kw}
                              </span>
                            )
                          )}
                      </div>
                    </div>

                    {/* AEO Direct Answer Box & GEO Citation Box */}
                    <div className="grid grid-cols-1 gap-2.5">
                      <div className="p-3.5 rounded-xl bg-[#e5fbf9] border border-[#08cdbd] space-y-1.5 text-xs">
                        <div className="flex items-center justify-between font-black text-[#062959]">
                          <span>
                            باکس پاسخ مستقیم گوگل (AEO Featured Snippet)
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(
                                aiResult.aeoDirectAnswerBox,
                                'aeo-box-copy'
                              )
                            }
                            className="text-[10px] font-bold text-[#089f93] cursor-pointer"
                          >
                            {copiedKey === 'aeo-box-copy' ? 'کپی شد' : 'کپی'}
                          </button>
                        </div>
                        <p className="text-[#233b53] leading-relaxed">
                          {aiResult.aeoDirectAnswerBox}
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl bg-[#07090E] border border-purple-500/40 text-slate-200 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between font-black text-purple-300">
                          <span>
                            خلاصه استنادی موتورهای هوش مصنوعی (GEO Citation)
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(
                                aiResult.geoCitationSummary,
                                'geo-box-copy'
                              )
                            }
                            className="text-[10px] font-bold text-[#14dac3] cursor-pointer"
                          >
                            {copiedKey === 'geo-box-copy' ? 'کپی شد' : 'کپی'}
                          </button>
                        </div>
                        <p className="text-slate-300 leading-relaxed text-[11px]">
                          {aiResult.geoCitationSummary}
                        </p>
                      </div>
                    </div>

                    {/* Article Sections */}
                    {Array.isArray(aiResult.sections) &&
                      aiResult.sections.length > 0 && (
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-[#062959]">
                              متن ساختاریافته مقاله ({aiResult.sections.length}{' '}
                              بخش)
                            </span>
                            {onWriteStructuredToSheet && (
                              <button
                                type="button"
                                onClick={() =>
                                  onWriteStructuredToSheet({
                                    title: `مقاله سئو آرکا - ${aiResult.articleTitleH1}`,
                                    tabName: 'مقاله_SEO_AEO_GEO',
                                    headers: [
                                      'سطح تیتر',
                                      'عنوان بخش',
                                      'متن کامل بخش',
                                      'نکته کلیدی آرکا',
                                    ],
                                    rows: aiResult.sections.map((s: any) => [
                                      s.headingLevel || 'H2',
                                      s.headingTitle || '',
                                      (s.bodyParagraphs || []).join('\n\n'),
                                      s.keyTakeaway || '',
                                    ]),
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold cursor-pointer"
                              >
                                <FileSpreadsheet className="w-3.5 h-3.5" />
                                <span>ثبت در Google Sheets</span>
                              </button>
                            )}
                          </div>

                          {aiResult.sections.map((sec: any, idx: number) => (
                            <div
                              key={idx}
                              className="p-3.5 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] space-y-2 text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <span className="px-1.5 py-0.5 rounded bg-[#062959] text-[#14dac3] font-mono text-[10px] font-black">
                                  {sec.headingLevel || 'H2'}
                                </span>
                                <h4 className="font-black text-[#062959]">
                                  {sec.headingTitle}
                                </h4>
                              </div>
                              {Array.isArray(sec.bodyParagraphs) &&
                                sec.bodyParagraphs.map(
                                  (p: string, pIdx: number) => (
                                    <p
                                      key={pIdx}
                                      className="text-[#233b53] leading-relaxed"
                                    >
                                      {p}
                                    </p>
                                  )
                                )}
                              {sec.keyTakeaway && (
                                <div className="p-2 rounded-lg bg-white border border-[#08cdbd]/40 text-[11px] font-bold text-[#089f93]">
                                  💡 مزیت عملیاتی آرکا: {sec.keyTakeaway}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                    {/* Internal Linking Recommendations */}
                    {Array.isArray(aiResult.internalLinks) &&
                      aiResult.internalLinks.length > 0 && (
                        <div className="p-3.5 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] space-y-2 text-xs">
                          <div className="font-black text-[#062959] flex items-center gap-1.5">
                            <Link2 className="w-4 h-4 text-[#089f93]" />
                            <span>
                              پیشنهادهای لینک‌سازی داخلی (arka-acc.ir):
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {aiResult.internalLinks.map(
                              (lnk: any, lIdx: number) => (
                                <div
                                  key={lIdx}
                                  className="p-2 rounded-lg bg-white border border-[#e3e9ed] space-y-0.5"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-black text-[#062959]">
                                      انکرتکست: «{lnk.anchorText}»
                                    </span>
                                    <span
                                      dir="ltr"
                                      className="font-mono text-[10px] text-[#089f93]"
                                    >
                                      {lnk.targetUrl}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-[#7e8c9b]">
                                    {lnk.placementContext}
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}

                    {/* FAQ Schema + JSON-LD Copy */}
                    {Array.isArray(aiResult.faqItems) &&
                      aiResult.faqItems.length > 0 && (
                        <div className="p-3.5 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] space-y-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-black text-[#062959] flex items-center gap-1.5">
                              <HelpCircle className="w-4 h-4 text-[#089f93]" />
                              <span>
                                سوالات متداول (FAQ Schema ·{' '}
                                {aiResult.faqItems.length} مورد)
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleCopy(
                                  buildFaqJsonLdSchema(aiResult),
                                  'faq-jsonld'
                                )
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#062959] text-[#14dac3] text-[10px] font-bold cursor-pointer"
                            >
                              <Braces className="w-3 h-3" />
                              <span>
                                {copiedKey === 'faq-jsonld'
                                  ? 'اسکیما کپی شد!'
                                  : 'کپی JSON-LD Schema'}
                              </span>
                            </button>
                          </div>
                          <div className="space-y-1.5">
                            {aiResult.faqItems.map((fq: any, fIdx: number) => (
                              <div
                                key={fIdx}
                                className="p-2.5 rounded-lg bg-white border border-[#e3e9ed] space-y-1"
                              >
                                <div className="font-black text-[#062959]">
                                  ؟ {fq.question}
                                </div>
                                <div className="text-[#233b53] leading-relaxed">
                                  {fq.answer}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* LinkedIn & Instagram Distribution Snippets */}
                    {(aiResult.linkedinPostSnippet ||
                      aiResult.instagramCaptionSnippet) && (
                      <div className="p-3.5 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] space-y-2.5 text-xs">
                        <div className="font-black text-[#062959] flex items-center gap-1.5">
                          <Share2 className="w-4 h-4 text-[#089f93]" />
                          <span>بسته توزیع مقاله در لینکدین و اینستاگرام:</span>
                        </div>
                        {aiResult.linkedinPostSnippet && (
                          <div className="p-2.5 rounded-lg bg-white border border-[#e3e9ed] space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-black text-[#062959]">
                                پست تخصصی لینکدین:
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopy(
                                    aiResult.linkedinPostSnippet,
                                    'art-li-copy'
                                  )
                                }
                                className="text-[10px] font-bold text-[#089f93] cursor-pointer"
                              >
                                {copiedKey === 'art-li-copy'
                                  ? 'کپی شد'
                                  : 'کپی پست لینکدین'}
                              </button>
                            </div>
                            <p className="text-[#233b53] whitespace-pre-wrap leading-relaxed">
                              {aiResult.linkedinPostSnippet}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* A. STORYCANVAS INJECTION CARDS (from 6-module enterprise canvas_slides) */}
                {enterpriseSlides.length > 0 && (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-black text-[#062959] flex items-center gap-1.5">
                        <Palette className="w-4 h-4 text-[#08cdbd]" />
                        <span>
                          اسلایدهای آماده تزریق به StoryCanvas ({enterpriseSlides.length})
                        </span>
                      </span>
                      <div className="flex items-center gap-1.5">
                        {onWriteStructuredToSheet && (
                          <button
                            type="button"
                            onClick={() =>
                              onWriteStructuredToSheet({
                                title: `اسلایدهای کمپین آرکا - ${selectedProduct.name}`,
                                tabName: 'اسلایدهای_بوم_آرکا',
                                headers: [
                                  'شماره اسلاید',
                                  'تگ (Badge)',
                                  'تیتر اصلی',
                                  'زیرتیتر',
                                  'نکات کلیدی',
                                  'فوتر CTA',
                                  'رنگ تم',
                                ],
                                rows: enterpriseSlides.map((sl, i) => [
                                  String(sl.slide_number || i + 1),
                                  sl.badge_text || '',
                                  sl.headline || '',
                                  sl.subheadline || '',
                                  (sl.bullet_points || []).join(' | '),
                                  sl.footer_cta || '',
                                  sl.theme_accent || '#08cdbd',
                                ]),
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold cursor-pointer"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            <span>ارسال به Google Sheet</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {enterpriseSlides.map((sl, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-2xl bg-[#0B101B] border border-slate-700/80 text-white space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-[#08cdbd]/20 text-[#14dac3] text-[10px] font-black">
                            اسلاید {sl.slide_number || idx + 1} · {sl.badge_text}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-400">
                            <span
                              className="w-2.5 h-2.5 rounded-full inline-block"
                              style={{
                                backgroundColor: sl.theme_accent || '#08cdbd',
                              }}
                            />
                            {aiResult?.meta?.target_aspect_ratio || '9:16'}
                          </span>
                        </div>
                        <h4 className="text-sm font-black text-white leading-snug">
                          {sl.headline}
                        </h4>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {sl.subheadline}
                        </p>
                        {Array.isArray(sl.bullet_points) &&
                          sl.bullet_points.length > 0 && (
                            <ul className="space-y-1 text-[11px] text-[#a4d2d1]">
                              {sl.bullet_points.map((bp, bIdx) => (
                                <li key={bIdx}>• {bp}</li>
                              ))}
                            </ul>
                          )}
                        <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              handleTriggerInjectCanvasSlide(
                                sl,
                                aiResult?.meta?.target_aspect_ratio,
                                videoProd?.cta?.caption ||
                                  copywriting?.conversion_triggers?.primary_cta
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#08cdbd] hover:bg-[#14dac3] text-[#062959] text-xs font-black cursor-pointer"
                          >
                            <Wand2 className="w-3.5 h-3.5" />
                            <span>🎨 تزریق مستقیم به بوم (Apply to StoryCanvas)</span>
                          </button>

                          {onSaveCanvasPngToDrive && (
                            <button
                              type="button"
                              onClick={onSaveCanvasPngToDrive}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold cursor-pointer"
                            >
                              <HardDrive className="w-3.5 h-3.5 text-[#14dac3]" />
                              <span>ذخیره در Drive</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* B. /video RICH OUTPUT VISUALIZER */}
                {videoProd && (
                  <div className="space-y-3.5">
                    {videoProd.brief && (
                      <div className="p-3.5 rounded-2xl bg-[#062959] text-white space-y-1.5 border border-rose-500/30">
                        <div className="flex items-center justify-between text-xs font-black text-rose-300">
                          <span className="flex items-center gap-1.5">
                            <Video className="w-4 h-4" />
                            <span>بریف کارگردانی ریلز و موشن (/video)</span>
                          </span>
                          <span className="tabular-nums-fa">
                            {videoProd.brief.duration_seconds || 30} ثانیه
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-200">
                          ریتم: {videoProd.brief.pacing} · مود صوتی:{' '}
                          {videoProd.brief.audio_mood}
                        </div>
                        {videoProd.brief.psychological_angle && (
                          <div className="text-[11px] text-[#14dac3]">
                            زاویه روان‌شناختی: {videoProd.brief.psychological_angle}
                          </div>
                        )}
                      </div>
                    )}

                    {Array.isArray(videoProd.hooks) &&
                      videoProd.hooks.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-black text-[#062959]">
                            ۳ قلاب طلایی برای ۳ ثانیه اول (3-Way Hook Arsenal):
                          </div>
                          <div className="grid grid-cols-1 gap-2">
                            {videoProd.hooks.map((hk: any, hIdx: number) => (
                              <div
                                key={hIdx}
                                className="p-3 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] space-y-1 text-xs"
                              >
                                <div className="font-black text-rose-400">
                                  قلاب {hIdx + 1}: {hk.type}
                                </div>
                                <div className="text-[#233b53]">
                                  <strong>تصویر:</strong> {hk.visual}
                                </div>
                                <div className="text-[#089f93] font-bold">
                                  <strong>متن روی تصویر:</strong> {hk.on_screen_text}
                                </div>
                                <div className="text-[#062959]">
                                  <strong>دیالوگ/VO:</strong> «{hk.audio_vo}»
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {Array.isArray(videoProd.storyboard) &&
                      videoProd.storyboard.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-black text-[#062959]">
                              جدول استوری‌بورد ۵ ستونی ({videoProd.storyboard.length} سکانس)
                            </span>
                            {onWriteStructuredToSheet && (
                              <button
                                type="button"
                                onClick={() =>
                                  onWriteStructuredToSheet({
                                    title: `استوری‌بورد ویدیو آرکا - ${selectedProduct.name}`,
                                    tabName: 'استوری‌بورد_ویدیو',
                                    headers: [
                                      'سکانس',
                                      'زمان',
                                      'تصویر و حرکت دوربین',
                                      'گوینده / صدا',
                                      'متن روی تصویر',
                                      'پرامپت ویدیو (Veo)',
                                    ],
                                    rows: videoProd.storyboard.map(
                                      (sc: any, i: number) => [
                                        String(sc.scene_number || i + 1),
                                        sc.time_range || '',
                                        sc.visual_and_camera || '',
                                        sc.audio_vo || '',
                                        sc.on_screen_text || '',
                                        sc.ai_video_prompt || '',
                                      ]
                                    ),
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold cursor-pointer"
                              >
                                <FileSpreadsheet className="w-3.5 h-3.5" />
                                <span>ثبت جدول در Google Sheets</span>
                              </button>
                            )}
                          </div>

                          <div className="overflow-x-auto rounded-xl border border-[#e3e9ed]">
                            <table className="w-full text-[11px] text-right border-collapse">
                              <thead className="bg-[#062959] text-white">
                                <tr>
                                  <th className="p-2 whitespace-nowrap">زمان</th>
                                  <th className="p-2 min-w-[130px]">تصویر / دوربین</th>
                                  <th className="p-2 min-w-[120px]">گوینده / صدا</th>
                                  <th className="p-2 min-w-[110px]">متن روی تصویر</th>
                                  <th className="p-2 min-w-[150px]">Veo Prompt</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#e3e9ed]">
                                {videoProd.storyboard.map(
                                  (sc: any, sIdx: number) => (
                                    <tr key={sIdx} className="bg-[#f5f8fa] align-top">
                                      <td
                                        dir="ltr"
                                        className="p-2 font-mono font-bold text-[#089f93] whitespace-nowrap"
                                      >
                                        {sc.time_range}
                                      </td>
                                      <td className="p-2 text-[#233b53]">
                                        {sc.visual_and_camera}
                                      </td>
                                      <td className="p-2 text-[#062959] font-semibold">
                                        {sc.audio_vo}
                                      </td>
                                      <td className="p-2 text-[#089f93] font-bold">
                                        {sc.on_screen_text}
                                      </td>
                                      <td className="p-2 space-y-1.5">
                                        <p
                                          dir="ltr"
                                          className="text-[10px] font-mono text-slate-400 text-left leading-snug"
                                        >
                                          {sc.ai_video_prompt}
                                        </p>
                                        {sc.ai_video_prompt && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleCopy(
                                                sc.ai_video_prompt,
                                                `veo-${sIdx}`
                                              )
                                            }
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#062959] text-[#14dac3] text-[10px] font-bold cursor-pointer"
                                          >
                                            {copiedKey === `veo-${sIdx}` ? (
                                              <Check className="w-3 h-3" />
                                            ) : (
                                              <Copy className="w-3 h-3" />
                                            )}
                                            <span>
                                              {copiedKey === `veo-${sIdx}`
                                                ? 'کپی شد'
                                                : 'کپی پرامپت ویدیو'}
                                            </span>
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  )
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                    {videoProd.cta?.caption && (
                      <div className="p-3 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-[#062959]">
                            کپشن و CTA نهایی ویدیو
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(videoProd.cta.caption, 'vid-ent-cap')
                            }
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#062959] text-white text-[10px] font-bold cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            <span>
                              {copiedKey === 'vid-ent-cap' ? 'کپی شد' : 'کپی کپشن'}
                            </span>
                          </button>
                        </div>
                        <p className="text-xs text-[#233b53] whitespace-pre-wrap leading-relaxed">
                          {videoProd.cta.caption}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* C. /visual 8-COMPONENT VISUAL MATRIX GRID */}
                {visualMatrix && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-[#062959]">
                        ماتریس بصری ۸ مؤلفه‌ای (/visual)
                      </span>
                      {visualMatrix.aspect_ratio && (
                        <span
                          dir="ltr"
                          className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono text-[10px] font-bold"
                        >
                          {visualMatrix.aspect_ratio}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      {[
                        { k: 'subject_and_action', label: '۱. سوژه و کنش' },
                        { k: 'environment_and_context', label: '۲. محیط و کانتکست' },
                        { k: 'composition_and_framing', label: '۳. ترکیب‌بندی و کادر' },
                        { k: 'lighting_and_volumetrics', label: '۴. نورپردازی' },
                        { k: 'color_palette_and_grading', label: '۵. پالت و رنگ‌شناسی' },
                        { k: 'materiality_and_texture', label: '۶. بافت و متریال' },
                        { k: 'medium_and_technical_specs', label: '۷. لنز و مشخصات فنی' },
                        { k: 'aesthetic_and_style', label: '۸. سبک هنری' },
                      ].map(
                        (item) =>
                          visualMatrix[item.k] && (
                            <div
                              key={item.k}
                              className="p-2.5 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] space-y-1"
                            >
                              <div className="font-black text-[#089f93]">
                                {item.label}
                              </div>
                              <div
                                dir="ltr"
                                className="text-left font-mono text-[10px] text-[#233b53] leading-relaxed"
                              >
                                {visualMatrix[item.k]}
                              </div>
                            </div>
                          )
                      )}
                    </div>

                    {visualMatrix.master_prompt && (
                      <div className="p-3.5 rounded-2xl bg-[#07090E] border border-cyan-500/40 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-black text-cyan-300">
                            Master Visual Prompt
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(
                                visualMatrix.master_prompt,
                                'master-vis-prompt'
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#08cdbd] text-[#062959] text-[11px] font-black cursor-pointer"
                          >
                            {copiedKey === 'master-vis-prompt' ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {copiedKey === 'master-vis-prompt'
                                ? 'کپی شد!'
                                : 'کپی Master Prompt'}
                            </span>
                          </button>
                        </div>
                        <pre
                          dir="ltr"
                          className="text-[11px] font-mono text-slate-200 whitespace-pre-wrap text-left leading-relaxed"
                        >
                          {visualMatrix.master_prompt}
                        </pre>
                        {visualMatrix.negative_prompt && (
                          <div
                            dir="ltr"
                            className="text-[10px] font-mono text-rose-300 text-left pt-1 border-t border-slate-800"
                          >
                            Negative: {visualMatrix.negative_prompt}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* D. /copy CONVERSION COPYWRITING & BLOCKS */}
                {copywriting && (
                  <div className="space-y-3">
                    {copywriting.strategy && (
                      <div className="p-3.5 rounded-2xl bg-[#062959] text-white space-y-1.5 border border-fuchsia-500/30">
                        <div className="flex items-center justify-between text-xs font-black text-fuchsia-300">
                          <span>استراتژی کپی‌رایتینگ (/copy)</span>
                          <span dir="ltr" className="font-mono">
                            {copywriting.strategy.framework || 'PAS'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-200">
                          پلتفرم: {copywriting.strategy.target_platform} · لحن:{' '}
                          {copywriting.strategy.tone_of_voice}
                        </div>
                        {copywriting.strategy.core_pain_point && (
                          <div className="text-[11px] text-[#14dac3]">
                            نقطه درد هدف: {copywriting.strategy.core_pain_point}
                          </div>
                        )}
                      </div>
                    )}

                    {Array.isArray(copywriting.headline_hooks) &&
                      copywriting.headline_hooks.length > 0 && (
                        <div className="p-3 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] space-y-1.5 text-xs">
                          <div className="font-black text-[#089f93]">
                            ۳ قلاب تیتر میخکوب‌کننده:
                          </div>
                          {copywriting.headline_hooks.map(
                            (hook: string, i: number) => (
                              <div key={i} className="font-bold text-[#062959]">
                                {i + 1}. {hook}
                              </div>
                            )
                          )}
                        </div>
                      )}

                    {Array.isArray(copywriting.structured_blocks) &&
                      copywriting.structured_blocks.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-black text-[#062959]">
                              ساختار اسلایدها / سکشن‌ها ({copywriting.structured_blocks.length})
                            </span>
                            {onWriteStructuredToSheet && (
                              <button
                                type="button"
                                onClick={() =>
                                  onWriteStructuredToSheet({
                                    title: `کپی‌رایتینگ و اسلایدهای آرکا - ${selectedProduct.name}`,
                                    tabName: 'کپی_اسلاید_آرکا',
                                    headers: [
                                      'بخش/اسلاید',
                                      'تیتر',
                                      'متن بدنه',
                                      'راهنمای بصری',
                                    ],
                                    rows: copywriting.structured_blocks.map(
                                      (b: any) => [
                                        b.section_or_slide || '',
                                        b.headline || '',
                                        b.body_copy || '',
                                        b.visual_cue || '',
                                      ]
                                    ),
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold cursor-pointer"
                              >
                                <FileSpreadsheet className="w-3.5 h-3.5" />
                                <span>ارسال به Google Sheet</span>
                              </button>
                            )}
                          </div>
                          {copywriting.structured_blocks.map(
                            (blk: any, i: number) => (
                              <div
                                key={i}
                                className="p-3 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] space-y-1 text-xs"
                              >
                                <div className="text-[11px] font-black text-fuchsia-400">
                                  {blk.section_or_slide}
                                </div>
                                <div className="font-black text-[#062959]">
                                  {blk.headline}
                                </div>
                                <p className="text-[#233b53] leading-relaxed">
                                  {blk.body_copy}
                                </p>
                              </div>
                            )
                          )}
                        </div>
                      )}
                  </div>
                )}

                {/* E. /hybrid VARIANTS & /rpe CLARIFYING QUESTIONS */}
                {hybridVariants.length > 0 && (
                  <div className="space-y-2.5">
                    <div className="text-xs font-black text-[#062959]">
                      رویکردهای پیشنهادی ({hybridVariants.length} نسخه):
                    </div>
                    {hybridVariants.map((vr: any, vIdx: number) => (
                      <div
                        key={vIdx}
                        className="p-3.5 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] space-y-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black text-emerald-400">
                            {vr.approach_name || `رویکرد ${vIdx + 1}`}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(
                                `${vr.title}\n\n${vr.content}`,
                                `var-${vIdx}`
                              )
                            }
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#062959] text-white text-[10px] font-bold cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            <span>{copiedKey === `var-${vIdx}` ? 'کپی شد' : 'کپی'}</span>
                          </button>
                        </div>
                        <div className="font-black text-[#062959]">
                          {vr.title}
                        </div>
                        <p className="text-[#233b53] whitespace-pre-wrap leading-relaxed">
                          {vr.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {clarifyingQuestions.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/35 space-y-2 text-xs">
                    <div className="font-black text-purple-300 flex items-center gap-1.5">
                      <MessageSquareText className="w-4 h-4" />
                      <span>پرسش‌های کالیبراسیون / مصاحبه (برای پاسخ کلیک کنید):</span>
                    </div>
                    <div className="space-y-1.5">
                      {clarifyingQuestions.map((q, qIdx) => (
                        <button
                          key={qIdx}
                          type="button"
                          onClick={() => {
                            setCustomPrompt(
                              `${
                                activeSlashCommand || '/rpe'
                              } پاسخ به سوال «${q}»: `
                            );
                            promptInputRef.current?.focus();
                          }}
                          className="w-full text-right p-2 rounded-lg bg-[#07090E]/70 hover:bg-[#07090E] border border-purple-400/25 text-slate-200 transition-colors cursor-pointer"
                        >
                          {qIdx + 1}. {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 1. REELS & MOTION GRAPHICS SCRIPT OUTPUT */}
                {mode === 'reels-script' && aiResult.scenes && (
                  <div className="space-y-3.5">
                    <div className="p-4 rounded-2xl bg-[#062959] text-white space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-[#14dac3]">
                          سناریوی ویدیو، ریلز و موشن‌گرافی ·{' '}
                          {aiResult.durationEstimate}
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

                    {Array.isArray(aiResult.threeHooks) &&
                      aiResult.threeHooks.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-black text-[#062959]">
                            ۳ قلاب پیشنهادی ۳ ثانیه اول:
                          </div>
                          {aiResult.threeHooks.map((hk: any, idx: number) => (
                            <div
                              key={idx}
                              className="p-3 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] text-xs space-y-1"
                            >
                              <div className="font-black text-[#089f93]">
                                قلاب {idx + 1}: {hk.type}
                              </div>
                              <div className="text-[#233b53]">{hk.visual}</div>
                              <div className="font-bold text-[#062959]">
                                دیالوگ: «{hk.audioVo}»
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-black text-[#062959]">
                          جدول سکانس‌بندی ({aiResult.scenes.length} سکانس):
                        </span>
                        {onWriteStructuredToSheet && (
                          <button
                            type="button"
                            onClick={() =>
                              onWriteStructuredToSheet({
                                title:
                                  aiResult.scenarioTitle ||
                                  `سناریوی ریلز آرکا - ${selectedProduct.name}`,
                                tabName: 'استوری‌بورد_ریلز',
                                headers: [
                                  'شماره سکانس',
                                  'زمان',
                                  'تصویر / موشن',
                                  'نریشن گوینده',
                                  'نوشته روی تصویر',
                                  'پرامپت ویدیو (Veo)',
                                ],
                                rows: aiResult.scenes.map(
                                  (sc: any, idx: number) => [
                                    String(sc.sceneNumber || idx + 1),
                                    sc.timeCode || '',
                                    sc.visualAction || '',
                                    sc.voiceover || '',
                                    sc.onScreenText || '',
                                    sc.aiVideoPrompt || '',
                                  ]
                                ),
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold cursor-pointer"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            <span>ثبت در Google Sheets</span>
                          </button>
                        )}
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
                            <strong className="text-[#062959]">
                              تصویر / موشن‌گرافی:{' '}
                            </strong>
                            <span className="text-[#233b53]">{sc.visualAction}</span>
                          </div>
                          <div className="p-2 rounded-lg bg-white border border-[#e3e9ed]">
                            <strong className="text-[#062959]">
                              دیالوگ / نریشن گوینده:{' '}
                            </strong>
                            <span className="text-[#062959] font-semibold">
                              «{sc.voiceover}»
                            </span>
                          </div>
                          <div>
                            <strong className="text-[#089f93]">
                              نوشته روی تصویر:{' '}
                            </strong>
                            <span className="font-bold text-[#062959]">
                              {sc.onScreenText}
                            </span>
                          </div>
                          {sc.aiVideoPrompt && (
                            <div className="pt-1.5 border-t border-[#e3e9ed] flex items-center justify-between gap-2">
                              <span
                                dir="ltr"
                                className="text-[10px] font-mono text-[#7e8c9b] truncate"
                              >
                                {sc.aiVideoPrompt}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopy(sc.aiVideoPrompt, `sc-veo-${idx}`)
                                }
                                className="px-2 py-1 rounded bg-[#062959] text-[#14dac3] text-[10px] font-bold shrink-0 cursor-pointer"
                              >
                                {copiedKey === `sc-veo-${idx}`
                                  ? 'کپی شد'
                                  : 'کپی Veo Prompt'}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

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
                      <h3 className="text-sm font-black">
                        {aiResult.campaignName}
                      </h3>
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

                {/* 6. MASTER JSON SCHEMA (--json) OR CORE ONBOARDING (/start, /help, /fast) */}
                {aiResult?.meta?.studio && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setShowRawJsonModal((v) => !v)}
                        className="text-[11px] font-mono font-bold text-[#089f93] hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <Braces className="w-3.5 h-3.5" />
                        <span>
                          {showRawJsonModal
                            ? 'پنهان کردن Raw JSON'
                            : 'مشاهده و کپی Raw Master JSON'}
                        </span>
                      </button>
                    </div>
                    {(showRawJsonModal || jsonModeEnabled) && (
                      <div className="p-3.5 rounded-2xl bg-[#07090E] text-white space-y-2 border border-[#14dac3]/40">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-black text-[#14dac3] font-mono">
                            {aiResult.meta.studio} · mode:{' '}
                            {aiResult.meta.active_mode}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(
                                JSON.stringify(aiResult, null, 2),
                                'master-json-out'
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#08cdbd] text-[#062959] text-[11px] font-black cursor-pointer"
                          >
                            {copiedKey === 'master-json-out' ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {copiedKey === 'master-json-out'
                                ? 'کپی شد'
                                : 'کپی Raw JSON'}
                            </span>
                          </button>
                        </div>
                        <pre
                          dir="ltr"
                          className="text-[10px] text-[#14dac3] font-mono whitespace-pre-wrap overflow-x-auto bg-[#0B101B] p-3 rounded-xl border border-white/10 max-h-[300px] text-left"
                        >
                          {JSON.stringify(aiResult, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {aiResult?.coreMarkdown && (
                  <div className="p-4 rounded-2xl bg-[#f5f8fa] border border-[#08cdbd] space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-[#062959]">
                        خروجی هسته مرکزی استودیو آرکا
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(aiResult.coreMarkdown, 'core-md-out')
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#062959] text-white text-[11px] font-bold cursor-pointer"
                      >
                        {copiedKey === 'core-md-out' ? (
                          <Check className="w-3.5 h-3.5 text-[#14dac3]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>کپی متن</span>
                      </button>
                    </div>
                    <pre className="text-xs text-[#233b53] whitespace-pre-wrap font-sans leading-relaxed bg-white p-3.5 rounded-xl border border-[#e3e9ed]">
                      {aiResult.coreMarkdown}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Mandatory User Confirmation Dialog before Creating/Writing Spreadsheet in Google Drive */}
      {isConfirmingDriveSave && aiResult?.scheduleDays && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
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
