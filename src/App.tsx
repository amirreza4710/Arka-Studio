/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { toPng } from 'html-to-image';
import { User } from 'firebase/auth';
import {
  INITIAL_ARKA_STORIES,
  INITIAL_ARKA_CAROUSELS,
  CANVAS_FORMATS,
  ArkaStoryData,
  ArkaCarouselDeck,
  StoryCategory,
  CanvasFormatId,
  CanvasFormatSpec,
} from './data/arkaStories';
import {
  BUILT_IN_CAMPAIGN_PRESETS,
  CampaignPreset,
  PRESETS_STORAGE_KEY,
} from './data/campaignPresets';
import {
  StoryCanvas,
  IsolatedStoryCanvasViewport,
  CanvasIsolationMode,
  LogoDisplayMode,
  StoryCanvasMountEvent,
  StoryCanvasAssetEvent,
  CarouselSlideMeta,
} from './components/StoryCanvas';
import { StoryEditorPanel } from './components/StoryEditorPanel';
import {
  ArkaAIStudioPanel,
  CustomKeyVerifiedInfo,
} from './components/ArkaAIStudioPanel';
import { GoogleWorkspacePanel } from './components/GoogleWorkspacePanel';
import { DebugConsole, DebugLogEntry } from './components/DebugConsole';
import {
  initAuth,
  signInWithGmail,
  signOutGmail,
  saveUserStudioPreferences,
  fetchUserStudioPreferences,
  getAccessToken,
} from './firebase';
import {
  ArkaConnectionSource,
  CanvasSlideSchemaItem,
} from './config/arkaCore';
import {
  fetchByokVaultStatus,
  verifyAndSaveByokKeyToServerVault,
  deleteByokKeyFromServerVault,
} from './services/arkaAiClient';
import {
  Download,
  ChevronRight,
  ChevronLeft,
  LayoutGrid,
  Maximize2,
  CheckCircle2,
  RotateCcw,
  Loader2,
  ZoomIn,
  ZoomOut,
  Bookmark,
  Plus,
  Layers,
  Smartphone,
  Square,
  RectangleVertical,
  GalleryHorizontalEnd,
  Sparkles,
  SlidersHorizontal,
  Eye,
  LogOut,
  FileSpreadsheet,
  Moon,
  Sun,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  X,
  Trash2,
} from 'lucide-react';

const STORAGE_KEY = 'arka_story_studio_v2';
const CAROUSEL_STORAGE_KEY = 'arka_carousel_decks_v2';
const ACTIVE_CONFIG_STORAGE_KEY = 'arka_story_active_config_v2';

type MobileTabId = 'preview' | 'ai-studio' | 'editor' | 'workspace' | 'gallery';
type DesktopSidePanelMode = 'ai-studio' | 'editor' | 'workspace';

export default function App() {
  const [stories, setStories] = useState<ArkaStoryData[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === INITIAL_ARKA_STORIES.length) {
          return parsed;
        }
      }
    } catch {
      // Fallback to initial data
    }
    return INITIAL_ARKA_STORIES;
  });

  const [carouselDecks, setCarouselDecks] = useState<ArkaCarouselDeck[]>(() => {
    try {
      const saved = localStorage.getItem(CAROUSEL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Fallback
    }
    return INITIAL_ARKA_CAROUSELS;
  });

  // Load saved custom presets from localStorage
  const [customPresets, setCustomPresets] = useState<CampaignPreset[]>(() => {
    try {
      const saved = localStorage.getItem(PRESETS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch {
      // Ignore parse errors
    }
    return [];
  });

  const [activePresetId, setActivePresetId] = useState<string>(() => {
    try {
      const savedConfig = localStorage.getItem(ACTIVE_CONFIG_STORAGE_KEY);
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        if (parsed.activePresetId) return parsed.activePresetId;
      }
    } catch {
      // Ignore
    }
    return BUILT_IN_CAMPAIGN_PRESETS[0].id;
  });

  // Active Canvas Format: Story 9:16, Single Post 4:5, Single Post 1:1, Carousel 4:5, Carousel 1:1
  const [activeFormatId, setActiveFormatId] = useState<CanvasFormatId>(() => {
    try {
      const savedConfig = localStorage.getItem(ACTIVE_CONFIG_STORAGE_KEY);
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        if (parsed.activeFormatId) return parsed.activeFormatId;
      }
    } catch {
      // Ignore
    }
    return 'story-9-16';
  });

  const activeFormat: CanvasFormatSpec =
    CANVAS_FORMATS.find((f) => f.id === activeFormatId) || CANVAS_FORMATS[0];

  const isCarouselMode = activeFormat.mode === 'carousel';

  const [selectedCategory, setSelectedCategory] = useState<StoryCategory>('all');
  const [activeStoryId, setActiveStoryId] = useState<string>(
    INITIAL_ARKA_STORIES[0].id
  );

  // Carousel deck & slide navigation state
  const [activeDeckId, setActiveDeckId] = useState<string>(
    INITIAL_ARKA_CAROUSELS[0].id
  );
  const [activeCarouselSlideIndex, setActiveCarouselSlideIndex] =
    useState<number>(0);

  // Desktop & Mobile Navigation State
  const [viewMode, setViewMode] = useState<'studio' | 'gallery'>('studio');
  const [desktopSideMode, setDesktopSideMode] =
    useState<DesktopSidePanelMode>('ai-studio');
  const [mobileTab, setMobileTab] = useState<MobileTabId>('preview');

  const [previewScale, setPreviewScale] = useState<number>(
    activeFormat.defaultPreviewScale
  );
  const [autoFitScale, setAutoFitScale] = useState<boolean>(true);
  const [isolationMode, setIsolationMode] =
    useState<CanvasIsolationMode>('standard');
  const stageContainerRef = useRef<HTMLDivElement | null>(null);

  // Google Auth + Workspace OAuth Token State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(true);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [lastAuthError, setLastAuthError] = useState<string | null>(null);

  // Logo & Guide state (persisted in localStorage)
  const [logoMode, setLogoMode] = useState<LogoDisplayMode>(() => {
    try {
      const savedConfig = localStorage.getItem(ACTIVE_CONFIG_STORAGE_KEY);
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        if (parsed.logoMode) return parsed.logoMode;
      }
    } catch {
      // Ignore
    }
    return 'official-full';
  });

  const [customLogoUrl, setCustomLogoUrl] = useState<string>(() => {
    try {
      const savedConfig = localStorage.getItem(ACTIVE_CONFIG_STORAGE_KEY);
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        if (typeof parsed.customLogoUrl === 'string') return parsed.customLogoUrl;
      }
    } catch {
      // Ignore
    }
    return '';
  });

  const [logoScale, setLogoScale] = useState<number>(() => {
    try {
      const savedConfig = localStorage.getItem(ACTIVE_CONFIG_STORAGE_KEY);
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        if (typeof parsed.logoScale === 'number') return parsed.logoScale;
      }
    } catch {
      // Ignore
    }
    return 1;
  });

  const [showSafeZoneGuides, setShowSafeZoneGuides] = useState<boolean>(false);
  const [showStickerPlaceholder, setShowStickerPlaceholder] =
    useState<boolean>(true);

  // Quick Save Preset Inline Input in Workspace Bar
  const [isQuickSaveOpen, setIsQuickSaveOpen] = useState<boolean>(false);
  const [quickPresetName, setQuickPresetName] = useState<string>('');

  // Custom AI-generated caption override
  const [customAiCaption, setCustomAiCaption] = useState<string>('');

  // Export state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportStatusMessage, setExportStatusMessage] = useState<string | null>(
    null
  );

  // Real-time StoryCanvas mount, AI Router, Auth, LiveContext & Workspace telemetry for DebugConsole
  const [canvasMountEvent, setCanvasMountEvent] =
    useState<StoryCanvasMountEvent | null>(null);
  const [lastAssetEvent, setLastAssetEvent] =
    useState<StoryCanvasAssetEvent | null>(null);
  const [telemetryLogs, setTelemetryLogs] = useState<DebugLogEntry[]>([]);

  const emitTelemetryLog = React.useCallback(
    (
      level: DebugLogEntry['level'],
      source: DebugLogEntry['source'],
      message: string
    ) => {
      const nowMs = Date.now();
      const timeStr = new Date(nowMs).toTimeString().split(' ')[0];
      setTelemetryLogs((prev) => [
        {
          id: `tel-${nowMs}-${Math.random().toString(36).slice(2, 7)}`,
          time: timeStr,
          timestamp: nowMs,
          level,
          source,
          message,
        },
        ...prev.slice(0, 49),
      ]);
    },
    []
  );

  // Dedicated 1:1 exact-pixel export ref for PNG generation
  const exportCanvasRef = useRef<HTMLDivElement | null>(null);

  const allPresets: CampaignPreset[] = [
    ...BUILT_IN_CAMPAIGN_PRESETS,
    ...customPresets,
  ];

  // Global High-Contrast Dark Mode (Default: true) & AI Connection Mode Preferences
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const savedConfig = localStorage.getItem(ACTIVE_CONFIG_STORAGE_KEY);
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        if (
          parsed.darkModeVersion === 2 &&
          typeof parsed.darkMode === 'boolean'
        ) {
          return parsed.darkMode;
        }
      }
    } catch {
      // Ignore
    }
    return true;
  });

  const [preferredConnectionMode, setPreferredConnectionMode] =
    useState<ArkaConnectionSource>(() => {
      try {
        const savedConfig = localStorage.getItem(ACTIVE_CONFIG_STORAGE_KEY);
        if (savedConfig) {
          const parsed = JSON.parse(savedConfig);
          if (parsed.preferredConnectionMode === 'gmail-authenticated') {
            return 'gmail-authenticated';
          }
          if (parsed.preferredConnectionMode === 'custom-byok') {
            return 'custom-byok';
          }
        }
      } catch {
        // Ignore
      }
      return 'studio-creator-core';
    });

  // Server-Side Encrypted BYOK Vault metadata (no plaintext key ever stored in browser storage)
  const [customKeyVerifiedInfo, setCustomKeyVerifiedInfo] =
    useState<CustomKeyVerifiedInfo | null>(null);

  // Auth & API Key Management Modal State
  const [isAuthKeyModalOpen, setIsAuthKeyModalOpen] = useState<boolean>(false);
  const [byokDraftInput, setByokDraftInput] = useState<string>('');
  const [isTestingByok, setIsTestingByok] = useState<boolean>(false);
  const [byokVerifyError, setByokVerifyError] = useState<string | null>(null);
  const [byokDraftVerifiedInfo, setByokDraftVerifiedInfo] =
    useState<CustomKeyVerifiedInfo | null>(null);

  // Explicit User Confirmation Modal for Workspace Write Actions (Drive PNG / Sheets Write)
  const [workspaceConfirmModal, setWorkspaceConfirmModal] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [isExecutingWorkspaceConfirm, setIsExecutingWorkspaceConfirm] =
    useState<boolean>(false);

  const syncServerByokVaultStatus = React.useCallback(async () => {
    try {
      const vault = await fetchByokVaultStatus();
      if (vault.configured && vault.maskedKey) {
        const info: CustomKeyVerifiedInfo = {
          valid: true,
          maskedKey: vault.maskedKey,
          models: vault.models,
          hasPro: vault.hasPro,
          hasFlash: vault.hasFlash,
          checkedAt: vault.updatedAt
            ? new Intl.DateTimeFormat('fa-IR', {
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date(vault.updatedAt))
            : 'ذخیره‌شده در گاوصندوق سرور',
        };
        setCustomKeyVerifiedInfo(info);
        setByokDraftVerifiedInfo(info);
      } else {
        setCustomKeyVerifiedInfo(null);
        setByokDraftVerifiedInfo(null);
      }
    } catch {
      // Ignore vault check failure when offline
    }
  }, []);

  // Initialize Firebase Auth & Workspace Token state + load cloud preferences & BYOK vault status
  useEffect(() => {
    const unsub = initAuth(
      (user, token) => {
        setCurrentUser(user);
        setAccessToken(token);
        setNeedsAuth(false);
        setLastAuthError(null);
        syncServerByokVaultStatus();
        fetchUserStudioPreferences()
          .then((prefs) => {
            if (prefs) {
              setDarkMode(prefs.darkMode);
              setPreferredConnectionMode(prefs.preferredConnectionMode);
            }
          })
          .catch(() => {
            // Ignore
          });
      },
      (user) => {
        setCurrentUser(user);
        setAccessToken(null);
        setNeedsAuth(true);
        if (user) {
          emitTelemetryLog(
            'ok',
            'Auth',
            `نشست Firebase Auth بازیابی شد (${user.email}) · ID Token برای هوش مصنوعی آماده است (برای Drive/Sheets تمدید پاپ‌آپ لازم است).`
          );
          syncServerByokVaultStatus();
          fetchUserStudioPreferences()
            .then((prefs) => {
              if (prefs) {
                setDarkMode(prefs.darkMode);
                setPreferredConnectionMode(prefs.preferredConnectionMode);
              }
            })
            .catch(() => {
              // Ignore
            });
        } else {
          setCustomKeyVerifiedInfo(null);
          setByokDraftVerifiedInfo(null);
        }
      }
    );
    return () => unsub();
  }, [emitTelemetryLog, syncServerByokVaultStatus]);

  // Robust ResizeObserver for dynamic container scale calculation
  useEffect(() => {
    if (!autoFitScale) return;

    const node = stageContainerRef.current;
    let rafId = 0;

    const computeScale = (containerWidth: number) => {
      if (containerWidth <= 0) return;
      const horizontalPadding = containerWidth < 640 ? 32 : 64;
      const availableWidth = Math.max(240, containerWidth - horizontalPadding);
      const widthScale = availableWidth / activeFormat.width;

      // Also bound by viewport height so tall 9:16 stories fit comfortably
      const maxStageHeight = Math.max(460, window.innerHeight - 250);
      const heightScale = maxStageHeight / activeFormat.height;

      const optimalScale = +Math.min(
        activeFormat.defaultPreviewScale,
        widthScale,
        Math.max(0.28, heightScale)
      ).toFixed(2);

      const clamped = Math.max(0.22, Math.min(0.65, optimalScale));
      setPreviewScale((prev) => (Math.abs(prev - clamped) >= 0.01 ? clamped : prev));
    };

    if (node && typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          for (const entry of entries) {
            computeScale(entry.contentRect.width);
          }
        });
      });
      observer.observe(node);
      computeScale(node.getBoundingClientRect().width || window.innerWidth);
      return () => {
        if (rafId) cancelAnimationFrame(rafId);
        observer.disconnect();
      };
    } else {
      computeScale(window.innerWidth);
    }
  }, [activeFormat, autoFitScale]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stories));
    } catch {
      // Ignore storage quota errors
    }
  }, [stories]);

  useEffect(() => {
    try {
      localStorage.setItem(CAROUSEL_STORAGE_KEY, JSON.stringify(carouselDecks));
    } catch {
      // Ignore
    }
  }, [carouselDecks]);

  useEffect(() => {
    try {
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(customPresets));
    } catch {
      // Ignore storage quota errors
    }
  }, [customPresets]);

  useEffect(() => {
    try {
      localStorage.setItem(
        ACTIVE_CONFIG_STORAGE_KEY,
        JSON.stringify({
          activePresetId,
          activeFormatId,
          logoMode,
          customLogoUrl,
          logoScale,
          darkMode,
          darkModeVersion: 2,
          preferredConnectionMode,
        })
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [
    activePresetId,
    activeFormatId,
    logoMode,
    customLogoUrl,
    logoScale,
    darkMode,
    preferredConnectionMode,
  ]);

  const handleToggleDarkMode = () => {
    setDarkMode((prev) => {
      const next = !prev;
      if (currentUser) {
        saveUserStudioPreferences({
          darkMode: next,
          preferredConnectionMode,
        }).catch(() => {
          // Ignore
        });
      }
      return next;
    });
  };

  const handleChangeConnectionMode = (nextMode: ArkaConnectionSource) => {
    setPreferredConnectionMode(nextMode);
    emitTelemetryLog(
      'ok',
      'Auth',
      `منبع اعتبار هوش مصنوعی تغییر یافت به: ${
        nextMode === 'custom-byok'
          ? 'کلید API شخصی (BYOK)'
          : nextMode === 'gmail-authenticated'
          ? 'اکانت جیمیل کاربر'
          : 'هسته سازمانی استودیو آرکا'
      }`
    );
    if (currentUser) {
      saveUserStudioPreferences({
        darkMode,
        preferredConnectionMode: nextMode,
      }).catch(() => {
        // Ignore
      });
    }
  };

  const handleTestCustomByokKey = async () => {
    const trimmed = byokDraftInput.trim();
    if (!trimmed) {
      setByokVerifyError('لطفاً کلید Gemini API Key را وارد کنید.');
      return;
    }
    setIsTestingByok(true);
    setByokVerifyError(null);
    try {
      const data = await verifyAndSaveByokKeyToServerVault({
        apiKey: trimmed,
        saveToVault: false,
      });

      const info: CustomKeyVerifiedInfo = {
        valid: true,
        maskedKey: data.maskedKey,
        models: Array.isArray(data.models) ? data.models : [],
        hasPro: Boolean(data.hasPro),
        hasFlash: Boolean(data.hasFlash),
        checkedAt: data.checkedAt || 'الان',
      };
      setByokDraftVerifiedInfo(info);
      emitTelemetryLog(
        'ok',
        'Auth',
        `کلید API شخصی تایید شد (${data.latencyMs || 0}ms) · مدل‌های مجاز: ${info.models.slice(0, 4).join(', ')}`
      );
    } catch (err: any) {
      const msg = err?.message || 'خطا در اعتبارسنجی کلید API.';
      setByokDraftVerifiedInfo(null);
      setByokVerifyError(msg);
      emitTelemetryLog('error', 'Auth', `اعتبارسنجی کلید ناموفق: ${msg}`);
    } finally {
      setIsTestingByok(false);
    }
  };

  const handleSaveVerifiedByokKey = async () => {
    const trimmed = byokDraftInput.trim();
    if (!trimmed) {
      setByokVerifyError('لطفاً کلید Gemini API Key را برای رمزنگاری و ذخیره در سرور وارد کنید.');
      return;
    }
    if (!currentUser) {
      setByokVerifyError('برای ذخیره امن و رمزنگاری کلید شخصی در گاوصندوق سرور، ابتدا با حساب گوگل وارد شوید.');
      return;
    }
    setIsTestingByok(true);
    setByokVerifyError(null);
    try {
      const data = await verifyAndSaveByokKeyToServerVault({
        apiKey: trimmed,
        saveToVault: true,
      });

      const info: CustomKeyVerifiedInfo = {
        valid: true,
        maskedKey: data.maskedKey,
        models: Array.isArray(data.models) ? data.models : [],
        hasPro: Boolean(data.hasPro),
        hasFlash: Boolean(data.hasFlash),
        checkedAt: data.checkedAt || 'الان',
      };
      setCustomKeyVerifiedInfo(info);
      setByokDraftVerifiedInfo(info);
      setByokDraftInput(''); // Immediately purge raw key from browser memory after server vault encryption
      handleChangeConnectionMode('custom-byok');
      setIsAuthKeyModalOpen(false);
      emitTelemetryLog(
        'ok',
        'Auth',
        `کلید API شخصی با رمزنگاری AES-256-GCM در گاوصندوق سرور ذخیره شد (${info.maskedKey || 'Masked'}).`
      );
      setExportStatusMessage(
        'کلید API شخصی شما با رمزنگاری AES-256-GCM در سرور ذخیره و فعال شد (هیچ کلیدی در مرورگر ذخیره نمی‌شود).'
      );
      setTimeout(() => setExportStatusMessage(null), 4000);
    } catch (err: any) {
      const msg = err?.message || 'خطا در ذخیره کلید در گاوصندوق سرور.';
      setByokVerifyError(msg);
      emitTelemetryLog('error', 'Auth', `ذخیره کلید در سرور ناموفق: ${msg}`);
    } finally {
      setIsTestingByok(false);
    }
  };

  const handleClearCustomByokKey = async () => {
    setIsTestingByok(true);
    try {
      if (currentUser) {
        await deleteByokKeyFromServerVault();
      }
      setCustomKeyVerifiedInfo(null);
      setByokDraftInput('');
      setByokDraftVerifiedInfo(null);
      setByokVerifyError(null);
      handleChangeConnectionMode(
        currentUser ? 'gmail-authenticated' : 'studio-creator-core'
      );
      emitTelemetryLog(
        'warn',
        'Auth',
        'کلید API شخصی از گاوصندوق رمزنگاری‌شده سرور حذف شد.'
      );
    } catch (err: any) {
      setByokVerifyError(err?.message || 'خطا در حذف کلید از سرور.');
    } finally {
      setIsTestingByok(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    setLastAuthError(null);
    try {
      const result = await signInWithGmail();
      if (!result.ok || !result.user) {
        const errMsg =
          result.errorMessageFa ||
          'پنجره ورود با گوگل بسته شد یا توسط مرورگر مسدود شده است.';
        setLastAuthError(errMsg);
        emitTelemetryLog(
          'warn',
          'Auth',
          `ورود ناموفق (${result.errorCode || 'unknown'}): ${errMsg}`
        );
        setExportStatusMessage(errMsg);
        setTimeout(() => setExportStatusMessage(null), 5000);
        return;
      }

      setCurrentUser(result.user);
      setAccessToken(result.accessToken || null);
      setNeedsAuth(!result.accessToken);
      setLastAuthError(null);

      if (preferredConnectionMode === 'studio-creator-core') {
        setPreferredConnectionMode('gmail-authenticated');
        saveUserStudioPreferences({
          darkMode,
          preferredConnectionMode: 'gmail-authenticated',
        }).catch(() => {
          // Ignore
        });
      }

      emitTelemetryLog(
        'ok',
        'Auth',
        `ورود موفق با حساب گوگل (${result.user.email}) · ${
          result.accessToken
            ? 'Firebase ID Token و دسترسی Drive/Sheets فعال شد.'
            : 'Firebase ID Token فعال شد (توکن Workspace دریافت نشد).'
        }`
      );
      setExportStatusMessage(
        `خوش آمدید ${result.user.displayName || result.user.email}! حساب گوگل شما متصل شد.`
      );
      setTimeout(() => setExportStatusMessage(null), 4000);
    } catch (err: any) {
      const fallback = err?.message || 'ورود با حساب گوگل انجام نشد. لطفاً دوباره تلاش کنید.';
      setLastAuthError(fallback);
      emitTelemetryLog('error', 'Auth', fallback);
      setExportStatusMessage(fallback);
      setTimeout(() => setExportStatusMessage(null), 4000);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await signOutGmail();
    setCurrentUser(null);
    setAccessToken(null);
    setNeedsAuth(true);
    setLastAuthError(null);
    emitTelemetryLog('warn', 'Auth', 'خروج از حساب گوگل انجام شد.');
    setExportStatusMessage('از حساب گوگل خارج شدید.');
    setTimeout(() => setExportStatusMessage(null), 2500);
  };

  const handleSelectFormat = (format: CanvasFormatSpec) => {
    setActiveFormatId(format.id);
    if (window.innerWidth < 640) {
      const availableWidth = Math.max(260, window.innerWidth - 56);
      setPreviewScale(
        Math.min(
          format.defaultPreviewScale,
          Math.max(0.24, +(availableWidth / format.width).toFixed(2))
        )
      );
    } else {
      setPreviewScale(format.defaultPreviewScale);
    }
  };

  const filteredStories =
    selectedCategory === 'all'
      ? stories
      : stories.filter((s) => s.category === selectedCategory);

  const activeDeck: ArkaCarouselDeck =
    carouselDecks.find((d) => d.id === activeDeckId) || carouselDecks[0];

  const safeSlideIndex = Math.min(
    activeCarouselSlideIndex,
    Math.max(0, activeDeck.slides.length - 1)
  );

  const activeStory: ArkaStoryData = isCarouselMode
    ? activeDeck.slides[safeSlideIndex] || activeDeck.slides[0]
    : stories.find((s) => s.id === activeStoryId) || stories[0];

  const activeCarouselMeta: CarouselSlideMeta | undefined = isCarouselMode
    ? {
        slideNumber: safeSlideIndex + 1,
        totalSlides: activeDeck.slides.length,
        deckTitle: activeDeck.title,
      }
    : undefined;

  const handleCategorySelect = (cat: StoryCategory) => {
    setSelectedCategory(cat);
    if (isCarouselMode) {
      handleSelectFormat(CANVAS_FORMATS[0]);
    }
    if (cat !== 'all') {
      const firstMatch = stories.find((s) => s.category === cat);
      if (firstMatch) {
        setActiveStoryId(firstMatch.id);
      }
    }
  };

  const handleUpdateStory = (updated: ArkaStoryData) => {
    if (isCarouselMode) {
      setCarouselDecks((prev) =>
        prev.map((deck) => {
          if (deck.id !== activeDeck.id) return deck;
          const nextSlides = deck.slides.map((sl, idx) =>
            idx === safeSlideIndex ? updated : sl
          );
          return { ...deck, slides: nextSlides };
        })
      );
    } else {
      setStories((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
    }
  };

  // Inject AI-generated single slide into active canvas
  const handleInjectAiSlideIntoCanvas = (
    slidePayload: any,
    captionText?: string
  ) => {
    const updated: ArkaStoryData = {
      ...activeStory,
      categoryLabel: slidePayload.categoryLabel || activeStory.categoryLabel,
      headerMeta:
        slidePayload.headerMeta || 'تولیدشده با هوش مصنوعی آرکا · arka-acc.ir',
      eyebrow: slidePayload.eyebrow || activeStory.eyebrow,
      headlinePart1: slidePayload.headlinePart1 || '',
      headlineHighlight:
        slidePayload.headlineHighlight || activeStory.headlineHighlight,
      headlinePart2: slidePayload.headlinePart2 || '',
      leadCopy: slidePayload.leadCopy || activeStory.leadCopy,
      primaryStatValue:
        slidePayload.primaryStatValue || activeStory.primaryStatValue,
      primaryStatLabel:
        slidePayload.primaryStatLabel || activeStory.primaryStatLabel,
      secondaryBannerTitle:
        slidePayload.secondaryBannerTitle || activeStory.secondaryBannerTitle,
      secondaryBannerSub:
        slidePayload.secondaryBannerSub || activeStory.secondaryBannerSub,
      items: Array.isArray(slidePayload.items)
        ? slidePayload.items.slice(0, 4).map((it: any, idx: number) => ({
            id: `ai-item-${idx + 1}`,
            kicker: it.kicker || `۰${idx + 1} · ویژگی آرکا`,
            title: it.title || '',
            subtitle: it.subtitle || '',
            metric: it.metric || 'آرکا',
          }))
        : activeStory.items,
      stickerGuide: {
        ...activeStory.stickerGuide,
        stickerTitle:
          slidePayload.stickerTitle || activeStory.stickerGuide.stickerTitle,
        stickerActionText:
          slidePayload.stickerActionText ||
          activeStory.stickerGuide.stickerActionText,
      },
    };

    handleUpdateStory(updated);
    if (captionText) {
      setCustomAiCaption(captionText);
    }
    setMobileTab('preview');
    emitTelemetryLog(
      'ok',
      'StoryCanvas',
      `اسلاید تولیدشده با هوش مصنوعی روی بوم اعمال شد: «${updated.headlineHighlight}»`
    );
    setExportStatusMessage(
      'محتوای تولیدشده توسط هوش مصنوعی آرکا مستقیماً روی بوم طراحی اعمال شد!'
    );
    setTimeout(() => setExportStatusMessage(null), 3500);
  };

  // Inject Enterprise 6-Module canvas_slides item directly into StoryCanvas (auto-adapting aspect ratio 9:16 | 4:5 | 1:1)
  const handleInjectCanvasSlideItem = (
    slide: CanvasSlideSchemaItem,
    targetAspectRatio?: string,
    captionText?: string
  ) => {
    if (targetAspectRatio) {
      const targetFmtId: CanvasFormatId =
        targetAspectRatio === '4:5'
          ? 'post-4-5'
          : targetAspectRatio === '1:1'
          ? 'post-1-1'
          : 'story-9-16';
      const targetFmt = CANVAS_FORMATS.find((f) => f.id === targetFmtId);
      if (targetFmt && targetFmt.id !== activeFormatId) {
        handleSelectFormat(targetFmt);
      }
    }

    const words = (slide.headline || '').trim().split(/\s+/).filter(Boolean);
    const splitPoint = Math.max(1, Math.floor(words.length / 2));
    const part1 = words.slice(0, splitPoint).join(' ');
    const highlight = words.slice(splitPoint, splitPoint + 2).join(' ') || slide.badge_text || 'آرکا';
    const part2 = words.slice(splitPoint + 2).join(' ');

    const bullets = Array.isArray(slide.bullet_points)
      ? slide.bullet_points
      : [];

    const mappedItems = activeStory.items.map((existing, idx) => {
      const bp = bullets[idx];
      if (!bp) return existing;
      return {
        ...existing,
        kicker: `۰${idx + 1} · ${slide.badge_text || 'مزیت کلیدی آرکا'}`,
        title: bp,
        subtitle:
          idx === 0
            ? slide.subheadline || existing.subtitle
            : 'هسته یکپارچه نرم‌افزار حسابداری آرکا (arka-acc.ir)',
        metric: 'آرکا',
      };
    });

    const updated: ArkaStoryData = {
      ...activeStory,
      categoryLabel: slide.badge_text || activeStory.categoryLabel,
      headerMeta: 'تولیدشده با هسته ۶ ماژوله آرکا · arka-acc.ir',
      eyebrow: slide.badge_text || activeStory.eyebrow,
      headlinePart1: part1,
      headlineHighlight: highlight,
      headlinePart2: part2,
      leadCopy: slide.subheadline || activeStory.leadCopy,
      primaryStatValue: bullets[0] || activeStory.primaryStatValue,
      primaryStatLabel:
        slide.footer_cta || 'تست رایگان ۱۰۰ سند در https://arka-acc.ir/demo',
      customAccentHex: slide.theme_accent || undefined,
      items: mappedItems,
      stickerGuide: {
        ...activeStory.stickerGuide,
        stickerTitle: slide.footer_cta || activeStory.stickerGuide.stickerTitle,
        stickerActionText: 'https://arka-acc.ir/demo',
      },
    };

    handleUpdateStory(updated);
    if (captionText) {
      setCustomAiCaption(captionText);
    }
    setMobileTab('preview');
    emitTelemetryLog(
      'ok',
      'StoryCanvas',
      `اسلاید #${slide.slide_number} («${slide.headline}») با سایز ${targetAspectRatio || activeFormat.ratioLabel} به بوم تزریق شد.`
    );
    setExportStatusMessage(
      `اسلاید «${slide.badge_text || slide.headline}» مستقیماً روی بوم StoryCanvas رندر شد!`
    );
    setTimeout(() => setExportStatusMessage(null), 3500);
  };

  // Inject AI-generated multi-slide Carousel Deck into studio
  const handleInjectAiCarouselDeck = (newDeck: ArkaCarouselDeck) => {
    setCarouselDecks((prev) => [newDeck, ...prev]);
    setActiveDeckId(newDeck.id);
    setActiveCarouselSlideIndex(0);
    const carouselFmt = CANVAS_FORMATS.find((f) => f.id === 'carousel-4-5')!;
    handleSelectFormat(carouselFmt);
    setMobileTab('preview');
    setExportStatusMessage(
      `کاروسل هوشمند «${newDeck.title}» (${newDeck.slides.length} اسلاید پیوسته) در استودیو بارگذاری شد!`
    );
    setTimeout(() => setExportStatusMessage(null), 4000);
  };

  // Direct Google Drive PNG upload & Google Sheets structured export (explicit confirmation required)
  const handleRequestSaveCanvasPngToDrive = async () => {
    const token = accessToken || (await getAccessToken());
    if (!token || needsAuth) {
      await handleGoogleSignIn();
      return;
    }

    setWorkspaceConfirmModal({
      title: 'تایید آپلود تصویر PNG بوم در Google Drive',
      description: `آیا مایل هستید تصویر PNG بوم فعلی («${activeStory.titleShort}» با ابعاد ${activeFormat.width}×${activeFormat.height}) مستقیماً در حساب Google Drive شما ذخیره شود؟`,
      confirmLabel: 'بله، آپلود PNG در Google Drive',
      onConfirm: async () => {
        const activeTok = accessToken || (await getAccessToken());
        if (!activeTok) return;
        const dataUrl = await renderActiveCanvasToPngDataUrl();
        if (!dataUrl) {
          throw new Error('امکان رندر تصویر PNG از بوم وجود نداشت.');
        }

        const base64Data = dataUrl.split(',')[1];
        const fileName = `arka-${activeFormat.id}-${activeStory.order}-${activeFormat.width}x${activeFormat.height}.png`;
        const metadata = {
          name: fileName,
          mimeType: 'image/png',
          description: `تولیدشده در استودیو هوشمند آرکا (https://arka-acc.ir) - ${activeStory.titleShort}`,
        };

        const boundary = '-------ArkaStudioDriveBoundary314159';
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelim = `\r\n--${boundary}--`;

        const multipartBody =
          delimiter +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(metadata) +
          delimiter +
          'Content-Type: image/png\r\n' +
          'Content-Transfer-Encoding: base64\r\n\r\n' +
          base64Data +
          closeDelim;

        const uploadRes = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${activeTok}`,
              'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body: multipartBody,
          }
        );

        if (!uploadRes.ok) {
          throw new Error('خطا در آپلود تصویر PNG به Google Drive.');
        }

        emitTelemetryLog(
          'ok',
          'Workspace',
          `تصویر PNG بوم (${fileName}) با موفقیت در Google Drive ذخیره شد.`
        );
        setExportStatusMessage(
          `تصویر PNG بوم فعلی (${fileName}) مستقیماً در Google Drive شما ذخیره شد!`
        );
        setTimeout(() => setExportStatusMessage(null), 4000);
      },
    });
  };

  const handleRequestWriteStructuredToSheet = async (params: {
    title: string;
    tabName: string;
    headers: string[];
    rows: string[][];
  }) => {
    const token = accessToken || (await getAccessToken());
    if (!token || needsAuth) {
      await handleGoogleSignIn();
      return;
    }

    setWorkspaceConfirmModal({
      title: 'تایید ثبت جدول در Google Sheets',
      description: `آیا مایل هستید فایل جدول «${params.title}» شامل ${params.rows.length} ردیف در حساب Google Sheets / Drive شما ایجاد و ذخیره شود؟`,
      confirmLabel: 'بله، ساخت و ثبت در Google Sheets',
      onConfirm: async () => {
        const activeTok = accessToken || (await getAccessToken());
        if (!activeTok) return;

        const createRes = await fetch(
          'https://sheets.googleapis.com/v4/spreadsheets',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${activeTok}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              properties: { title: params.title },
              sheets: [
                {
                  properties: {
                    title: params.tabName,
                    rightToLeft: true,
                  },
                },
              ],
            }),
          }
        );

        if (!createRes.ok) {
          throw new Error('خطا در ایجاد فایل Google Sheets.');
        }

        const createdSheet = await createRes.json();
        const spreadsheetId = createdSheet.spreadsheetId;
        const actualTabTitle =
          createdSheet.sheets?.[0]?.properties?.title || params.tabName;

        const lastColChar = String.fromCharCode(
          64 + Math.min(26, Math.max(1, params.headers.length))
        );
        const encodedRange = encodeURIComponent(
          `'${actualTabTitle}'!A1:${lastColChar}${params.rows.length + 1}`
        );

        const writeRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueInputOption=USER_ENTERED`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${activeTok}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              values: [params.headers, ...params.rows],
            }),
          }
        );

        if (!writeRes.ok) {
          throw new Error('فایل ساخته شد اما نوشتن ردیف‌ها با خطا مواجه شد.');
        }

        emitTelemetryLog(
          'ok',
          'Workspace',
          `جدول «${params.title}» (${params.rows.length} ردیف) در Google Sheets ثبت شد.`
        );
        setExportStatusMessage(
          `جدول «${params.title}» با موفقیت در Google Sheets و Drive شما ذخیره شد!`
        );
        setTimeout(() => setExportStatusMessage(null), 4500);
      },
    });
  };

  const handleSelectPreset = (preset: CampaignPreset) => {
    const clonedStories = preset.stories.map((s) => ({
      ...s,
      items: s.items.map((item) => ({ ...item })),
      stickerGuide: { ...s.stickerGuide },
    }));
    setStories(clonedStories);

    setCarouselDecks((prev) =>
      prev.map((deck) => ({
        ...deck,
        slides: deck.slides.map((sl) => {
          const matching = clonedStories.find((cs) => cs.id === sl.id);
          return matching || sl;
        }),
      }))
    );

    setLogoMode(preset.logoMode);
    setCustomLogoUrl(preset.customLogoUrl);
    setLogoScale(preset.logoScale);
    setShowStickerPlaceholder(preset.showStickerPlaceholder);
    setActivePresetId(preset.id);
    setExportStatusMessage(
      `پروفایل «${preset.name}» با موفقیت روی استوری‌ها و اسلایدها اعمال شد.`
    );
    setTimeout(() => setExportStatusMessage(null), 3000);
  };

  const handleSaveNewPreset = (name: string, description: string) => {
    const nowFa = new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const newPreset: CampaignPreset = {
      id: `custom-preset-${Date.now()}`,
      name,
      description,
      isBuiltIn: false,
      createdAt: nowFa,
      logoMode,
      customLogoUrl,
      logoScale,
      showStickerPlaceholder,
      stories: stories.map((s) => ({
        ...s,
        items: s.items.map((item) => ({ ...item })),
        stickerGuide: { ...s.stickerGuide },
      })),
    };

    setCustomPresets((prev) => [newPreset, ...prev]);
    setActivePresetId(newPreset.id);
    setExportStatusMessage(
      `پروفایل سفارشی «${name}» در حافظه مرورگر (localStorage) ذخیره شد.`
    );
    setTimeout(() => setExportStatusMessage(null), 3500);
  };

  const handleUpdateExistingPreset = (presetId: string) => {
    setCustomPresets((prev) =>
      prev.map((p) => {
        if (p.id !== presetId) return p;
        return {
          ...p,
          logoMode,
          customLogoUrl,
          logoScale,
          showStickerPlaceholder,
          stories: stories.map((s) => ({
            ...s,
            items: s.items.map((item) => ({ ...item })),
            stickerGuide: { ...s.stickerGuide },
          })),
        };
      })
    );
    const target = customPresets.find((p) => p.id === presetId);
    setExportStatusMessage(
      `پروفایل «${target?.name || ''}» با تنظیمات فعلی متن و لوگو بروزرسانی شد.`
    );
    setTimeout(() => setExportStatusMessage(null), 3000);
  };

  const handleDeletePreset = (presetId: string) => {
    const target = customPresets.find((p) => p.id === presetId);
    setCustomPresets((prev) => prev.filter((p) => p.id !== presetId));
    if (activePresetId === presetId) {
      setActivePresetId(BUILT_IN_CAMPAIGN_PRESETS[0].id);
    }
    setExportStatusMessage(`پروفایل «${target?.name || ''}» حذف شد.`);
    setTimeout(() => setExportStatusMessage(null), 3000);
  };

  const handleQuickSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickPresetName.trim();
    if (!trimmed) return;
    handleSaveNewPreset(
      trimmed,
      'تنظیمات سفارشی متن، پالت رنگی و لوگوی ذخیره‌شده در استودیو'
    );
    setQuickPresetName('');
    setIsQuickSaveOpen(false);
  };

  const handleResetCurrentStory = () => {
    const original = INITIAL_ARKA_STORIES.find((s) => s.id === activeStory.id);
    if (original) {
      handleUpdateStory(original);
      setExportStatusMessage(
        'متن و تنظیمات این بوم به حالت پیش‌فرض سایت آرکا (arka-acc.ir) بازگردانده شد.'
      );
      setTimeout(() => setExportStatusMessage(null), 3000);
    }
  };

  const handleResetAllStories = () => {
    setStories(INITIAL_ARKA_STORIES);
    setCarouselDecks(INITIAL_ARKA_CAROUSELS);
    setLogoMode('official-full');
    setCustomLogoUrl('');
    setLogoScale(1);
    setActivePresetId(BUILT_IN_CAMPAIGN_PRESETS[0].id);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(CAROUSEL_STORAGE_KEY);
    setExportStatusMessage(
      'تمامی استوری‌ها، پست‌های تک‌صفحه و کاروسل‌ها به داده‌های رسمی سایت آرکا بازنشانی شدند.'
    );
    setTimeout(() => setExportStatusMessage(null), 3000);
  };

  // Helper to render the active export canvas to PNG Data URL (used for local download & Google Drive upload)
  const renderActiveCanvasToPngDataUrl = async (): Promise<string | null> => {
    await new Promise((r) => setTimeout(r, 120));
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
    const node = exportCanvasRef.current;
    if (!node) return null;

    return toPng(node, {
      width: activeFormat.width,
      height: activeFormat.height,
      pixelRatio: 1,
      cacheBust: true,
    });
  };

  const exportSingleCanvasAsPng = async (
    targetStory?: ArkaStoryData,
    targetSlideIdx?: number
  ) => {
    if (isExporting) return;
    setIsExporting(true);

    const storyToRender = targetStory || activeStory;
    const w = activeFormat.width;
    const h = activeFormat.height;

    setExportStatusMessage(
      `در حال رندر تصویر PNG با ابعاد دقیق ${w}×${h} (${activeFormat.shortLabel})...`
    );

    try {
      if (isCarouselMode && typeof targetSlideIdx === 'number') {
        setActiveCarouselSlideIndex(targetSlideIdx);
        await new Promise((r) => setTimeout(r, 250));
      } else if (!isCarouselMode && storyToRender.id !== activeStoryId) {
        setActiveStoryId(storyToRender.id);
        await new Promise((r) => setTimeout(r, 250));
      } else {
        await new Promise((r) => setTimeout(r, 120));
      }

      const dataUrl = await renderActiveCanvasToPngDataUrl();
      if (!dataUrl) throw new Error('Canvas node not ready');

      const link = document.createElement('a');
      const filePrefix = isCarouselMode
        ? `arka-carousel-slide-${(targetSlideIdx ?? safeSlideIndex) + 1}`
        : `arka-${activeFormat.id}-${storyToRender.order}`;
      link.download = `${filePrefix}-${w}x${h}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setExportStatusMessage(
        `فایل PNG (${activeFormat.shortLabel} · ${w}×${h}) با موفقیت دانلود شد.`
      );
    } catch {
      setExportStatusMessage(
        'خطا در تولید تصویر PNG. لطفاً از لوگوی رسمی داخلی سایت آرکا استفاده کنید.'
      );
    } finally {
      setIsExporting(false);
      setTimeout(() => setExportStatusMessage(null), 4000);
    }
  };

  const exportBatchSequentially = async () => {
    if (isExporting) return;
    setIsExporting(true);

    const w = activeFormat.width;
    const h = activeFormat.height;

    if (isCarouselMode) {
      const prevIdx = safeSlideIndex;
      try {
        for (let i = 0; i < activeDeck.slides.length; i++) {
          setActiveCarouselSlideIndex(i);
          setExportStatusMessage(
            `در حال آماده‌سازی و دانلود اسلاید ${i + 1} از ${activeDeck.slides.length} کاروسل (${w}×${h})...`
          );
          await new Promise((r) => setTimeout(r, 350));
          const dataUrl = await renderActiveCanvasToPngDataUrl();
          if (!dataUrl) continue;

          const link = document.createElement('a');
          link.download = `arka-${activeDeck.id}-slide-${i + 1}-${w}x${h}.png`;
          link.href = dataUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
        setExportStatusMessage(
          `تمامی ${activeDeck.slides.length} اسلاید کاروسل با ابعاد ${w}×${h} دانلود شدند.`
        );
      } catch {
        setExportStatusMessage('در دانلود گروهی اسلایدهای کاروسل خطایی رخ داد.');
      } finally {
        setActiveCarouselSlideIndex(prevIdx);
        setIsExporting(false);
        setTimeout(() => setExportStatusMessage(null), 4500);
      }
      return;
    }

    const previousActiveId = activeStoryId;
    try {
      for (let i = 0; i < stories.length; i++) {
        const current = stories[i];
        setActiveStoryId(current.id);
        setExportStatusMessage(
          `در حال آماده‌سازی و دانلود آیتم ${i + 1} از ${stories.length} (${w}×${h})...`
        );
        await new Promise((r) => setTimeout(r, 350));

        const dataUrl = await renderActiveCanvasToPngDataUrl();
        if (!dataUrl) continue;

        const link = document.createElement('a');
        link.download = `arka-${activeFormat.id}-${current.order}-${w}x${h}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      setExportStatusMessage(
        `هر ۶ طرح با ابعاد ${w}×${h} (${activeFormat.shortLabel}) با موفقیت دانلود شدند.`
      );
    } catch {
      setExportStatusMessage('در دانلود گروهی خطایی رخ داد.');
    } finally {
      setActiveStoryId(previousActiveId);
      setIsExporting(false);
      setTimeout(() => setExportStatusMessage(null), 4500);
    }
  };

  const currentIndex = isCarouselMode
    ? safeSlideIndex
    : filteredStories.findIndex((s) => s.id === activeStory.id);

  const totalItemsInStrip = isCarouselMode
    ? activeDeck.slides.length
    : filteredStories.length;

  const goPrev = () => {
    if (isCarouselMode) {
      if (safeSlideIndex > 0) setActiveCarouselSlideIndex(safeSlideIndex - 1);
    } else if (currentIndex > 0) {
      setActiveStoryId(filteredStories[currentIndex - 1].id);
    }
  };

  const goNext = () => {
    if (isCarouselMode) {
      if (safeSlideIndex < activeDeck.slides.length - 1) {
        setActiveCarouselSlideIndex(safeSlideIndex + 1);
      }
    } else if (currentIndex < filteredStories.length - 1) {
      setActiveStoryId(filteredStories[currentIndex + 1].id);
    }
  };

  const getFormatIcon = (id: CanvasFormatId) => {
    if (id === 'story-9-16') return <Smartphone className="w-4 h-4 shrink-0" />;
    if (id === 'post-4-5') return <RectangleVertical className="w-4 h-4 shrink-0" />;
    if (id === 'post-1-1') return <Square className="w-4 h-4 shrink-0" />;
    return <GalleryHorizontalEnd className="w-4 h-4 shrink-0" />;
  };

  const isGalleryViewActive =
    viewMode === 'gallery' || mobileTab === 'gallery';

  return (
    <div
      dir="rtl"
      className={`min-h-screen overflow-x-hidden bg-[#f5f8fa] text-[#233b53] flex flex-col pb-20 lg:pb-0 transition-colors ${
        darkMode ? 'arka-dark-mode' : ''
      }`}
    >
      {/* ==================== STRICT 3-ZONE TOP BAR CONTRACT (ARKA-ACC.IR THEME) ==================== */}
      <header className="flex items-center justify-between gap-4 lg:gap-8 px-4 sm:px-6 py-3 border-b border-[#0b2b56] bg-[#062959] text-white sticky top-0 z-40 shadow-md">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          className="text-base sm:text-lg font-black tracking-tight text-white whitespace-nowrap shrink-0"
        >
          استودیو هوشمند آرکــا
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav className="hidden lg:flex items-center gap-6 text-sm font-bold text-slate-200">
          <button
            type="button"
            onClick={() => {
              handleCategorySelect('all');
              setViewMode('studio');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-1 border-b-2 ${
              !isCarouselMode && selectedCategory === 'all'
                ? 'text-[#14dac3] border-[#08cdbd]'
                : 'border-transparent'
            }`}
          >
            استوری و پست تکی
          </button>
          <button
            type="button"
            onClick={() => {
              const carouselFmt = CANVAS_FORMATS.find(
                (f) => f.id === 'carousel-4-5'
              )!;
              handleSelectFormat(carouselFmt);
              setViewMode('studio');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-1 border-b-2 ${
              isCarouselMode
                ? 'text-[#14dac3] border-[#08cdbd]'
                : 'border-transparent'
            }`}
          >
            کاروسل چنداسلایدی
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode('studio');
              setDesktopSideMode('ai-studio');
              setMobileTab('ai-studio');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-1 border-b-2 ${
              desktopSideMode === 'ai-studio'
                ? 'text-[#14dac3] border-[#08cdbd]'
                : 'border-transparent'
            }`}
          >
            هوش مصنوعی آرکا
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode('studio');
              setDesktopSideMode('workspace');
              setMobileTab('workspace');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-1 border-b-2 ${
              desktopSideMode === 'workspace'
                ? 'text-[#14dac3] border-[#08cdbd]'
                : 'border-transparent'
            }`}
          >
            گوگل شیتز و درایو
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={isExporting}
            onClick={() => exportSingleCanvasAsPng()}
            className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs font-black text-[#062959] bg-[#08cdbd] hover:bg-[#14dac3] disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-sm min-h-[40px]"
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>دانلود PNG ({activeFormat.ratioLabel})</span>
          </button>
        </div>
      </header>

      {/* ==================== STUDIO WORKSPACE CONTROL DECK ==================== */}
      <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 pt-4 pb-3 flex flex-col gap-3 border-b border-[#e3e9ed]">
        {/* Row 1: Studio Title + Official Sign in with Google + View Mode + Batch Export */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-base sm:text-xl font-black text-[#062959] leading-snug">
              استودیو طراحی استوری، پست، کاروسل و هوش مصنوعی نرم‌افزار حسابداری آرکــا
            </h1>
            <p className="text-xs text-[#7e8c9b] mt-0.5">
              متصل به وب‌سایت رسمی{' '}
              <span className="font-bold text-[#062959]">arka-acc.ir</span> · همگام با Google Sheets و Google Drive · فونت وزیرمتن
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Global Dark Mode Theme Toggle Button */}
            <button
              type="button"
              onClick={handleToggleDarkMode}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-black transition-all cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] ${
                darkMode
                  ? 'bg-[#0F1420] text-[#14dac3] border-[#14dac3]/60 shadow-[0_0_12px_rgba(20,218,195,0.28)]'
                  : 'bg-white text-[#062959] border-[#e3e9ed] hover:border-[#08cdbd]'
              }`}
              title="تغییر تم سراسری استودیو (حالت تیره / حالت روشن)"
            >
              {darkMode ? (
                <>
                  <Sun className="w-4 h-4 text-amber-300" />
                  <span>تم تیره: فعال</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-[#062959]" />
                  <span>تم شب (Dark)</span>
                </>
              )}
            </button>

            {/* Credit Source & Custom API Key (BYOK) Management Modal Trigger */}
            <button
              type="button"
              onClick={() => {
                setByokDraftInput('');
                setByokDraftVerifiedInfo(customKeyVerifiedInfo);
                setByokVerifyError(null);
                setIsAuthKeyModalOpen(true);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-black transition-all cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] ${
                customKeyVerifiedInfo?.valid &&
                preferredConnectionMode === 'custom-byok'
                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/50'
                  : currentUser &&
                    preferredConnectionMode === 'gmail-authenticated'
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/50'
                  : 'bg-purple-500/15 text-purple-300 border-purple-500/50'
              }`}
              title="مدیریت اعتبار هوش مصنوعی و گاوصندوق رمزنگاری‌شده کلید شخصی (BYOK)"
            >
              <KeyRound className="w-4 h-4 shrink-0" />
              <span>
                {customKeyVerifiedInfo?.valid &&
                preferredConnectionMode === 'custom-byok'
                  ? '🔵 کلید شخصی (BYOK)'
                  : currentUser &&
                    preferredConnectionMode === 'gmail-authenticated'
                  ? '🟢 اکانت جیمیل'
                  : '🟠 مدیریت اعتبار و API Key'}
              </span>
            </button>

            {/* Official Sign in with Google Button or Active Account */}
            {currentUser ? (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-[#08cdbd] text-xs font-bold text-[#062959]">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || 'کاربر گوگل'}
                    referrerPolicy="no-referrer"
                    className="w-5 h-5 rounded-full border border-[#08cdbd] shrink-0"
                  />
                ) : (
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      accessToken && !needsAuth ? 'bg-emerald-500' : 'bg-amber-400'
                    }`}
                  />
                )}
                <span className="truncate max-w-[150px]" dir="ltr">
                  {currentUser.email}
                </span>
                {(!accessToken || needsAuth) && (
                  <button
                    type="button"
                    disabled={isSigningIn}
                    onClick={handleGoogleSignIn}
                    className="px-2 py-0.5 rounded-md bg-amber-400 hover:bg-amber-300 text-[#062959] text-[10px] font-black cursor-pointer whitespace-nowrap"
                    title="برای دسترسی به Google Drive و Sheets پنجره تایید گوگل را باز کنید"
                  >
                    {isSigningIn ? '...' : 'تمدید Drive'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleGoogleSignOut}
                  className="text-rose-500 hover:text-rose-400 cursor-pointer"
                  title="خروج از حساب گوگل"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={isSigningIn}
                onClick={handleGoogleSignIn}
                className="gsi-material-button inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-[#e5fbf9] border border-[#08cdbd] text-xs font-black text-[#062959] shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[40px]"
              >
                <div className="gsi-material-button-state" />
                <div className="gsi-material-button-content-wrapper flex items-center gap-2">
                  <div className="gsi-material-button-icon w-4 h-4 shrink-0">
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      style={{ display: 'block' }}
                    >
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
                      <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents">
                    {isSigningIn ? 'در حال اتصال...' : 'Sign in with Google'}
                  </span>
                </div>
              </button>
            )}

            {/* Desktop View Mode Segmented Switch */}
            <div className="hidden lg:flex items-center gap-1 p-1 bg-white border border-[#e3e9ed] rounded-xl shadow-xs">
              <button
                type="button"
                onClick={() => setViewMode('studio')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  viewMode === 'studio'
                    ? 'bg-[#062959] text-white'
                    : 'text-[#233b53] hover:bg-[#f5f8fa]'
                }`}
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>نمای استودیو</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('gallery')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  viewMode === 'gallery'
                    ? 'bg-[#062959] text-white'
                    : 'text-[#233b53] hover:bg-[#f5f8fa]'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>
                  {isCarouselMode
                    ? `نمای پیوسته کاروسل (${activeDeck.slides.length})`
                    : 'نمای یکجای ۶ طرح'}
                </span>
              </button>
            </div>

            <button
              type="button"
              disabled={isExporting}
              onClick={exportBatchSequentially}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-black text-[#062959] bg-[#e5fbf9] hover:bg-[#08cdbd] border border-[#08cdbd] rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[40px]"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {isCarouselMode
                  ? `دانلود یکجای ${activeDeck.slides.length} اسلاید`
                  : `دانلود یکجای ۶ طرح`}
              </span>
            </button>

            <button
              type="button"
              onClick={handleResetAllStories}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-[#233b53] bg-white hover:bg-slate-100 border border-[#e3e9ed] rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[40px]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">بازنشانی</span>
            </button>
          </div>
        </div>

        {/* Row 2: FORMAT & ASPECT RATIO SELECTOR BAR */}
        <div className="bg-white border border-[#e3e9ed] rounded-2xl p-2.5 sm:p-3 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
            <span className="inline-flex items-center gap-1.5 text-xs font-black text-[#062959] pl-1 whitespace-nowrap shrink-0">
              <Layers className="w-4 h-4 text-[#089f93]" />
              <span>سایز بوم:</span>
            </span>

            {CANVAS_FORMATS.map((fmt) => {
              const isSelected = fmt.id === activeFormat.id;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => handleSelectFormat(fmt)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] ${
                    isSelected
                      ? 'bg-[#062959] border-[#062959] text-white shadow-sm'
                      : 'bg-[#f5f8fa] border-[#e3e9ed] text-[#233b53] hover:border-[#08cdbd]'
                  }`}
                >
                  {getFormatIcon(fmt.id)}
                  <span className="hidden md:inline">{fmt.label}</span>
                  <span className="md:hidden">
                    {fmt.shortLabel} ({fmt.ratioLabel})
                  </span>
                </button>
              );
            })}
          </div>

          <div className="hidden xl:block text-xs font-bold text-[#089f93] tabular-nums-fa whitespace-nowrap">
            خروجی استاندارد: {activeFormat.width}×{activeFormat.height} پیکسل
          </div>
        </div>

        {/* Row 3: Campaign Presets Bar */}
        <div className="bg-white border border-[#e3e9ed] rounded-2xl p-2.5 sm:p-3 shadow-xs flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <span className="inline-flex items-center gap-1.5 text-xs font-black text-[#062959] pl-1 whitespace-nowrap shrink-0">
              <Bookmark className="w-4 h-4 text-[#089f93]" />
              <span>پروفایل‌ها (Presets):</span>
            </span>

            {allPresets.map((preset) => {
              const isSelected = preset.id === activePresetId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer whitespace-nowrap shrink-0 min-h-[38px] ${
                    isSelected
                      ? 'bg-[#08cdbd] border-[#08cdbd] text-[#062959] font-black shadow-xs'
                      : 'bg-[#f5f8fa] border-[#e3e9ed] text-[#233b53] hover:border-[#062959]/40'
                  }`}
                >
                  {preset.name}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {isQuickSaveOpen ? (
              <form
                onSubmit={handleQuickSaveSubmit}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  required
                  value={quickPresetName}
                  onChange={(e) => setQuickPresetName(e.target.value)}
                  placeholder="نام پروفایل جدید..."
                  className="bg-[#f5f8fa] border border-[#08cdbd] rounded-lg px-3 py-1.5 text-xs text-[#062959] outline-none w-40 sm:w-48"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-[#062959] hover:bg-[#0b2b56] text-xs font-bold text-white cursor-pointer whitespace-nowrap"
                >
                  ذخیره
                </button>
                <button
                  type="button"
                  onClick={() => setIsQuickSaveOpen(false)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-xs text-[#233b53] cursor-pointer whitespace-nowrap"
                >
                  انصراف
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setIsQuickSaveOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#f5f8fa] hover:bg-[#e5fbf9] border border-[#08cdbd] text-xs font-bold text-[#062959] cursor-pointer whitespace-nowrap shrink-0 min-h-[38px]"
              >
                <Plus className="w-3.5 h-3.5 text-[#089f93]" />
                <span>ذخیره Preset جدید</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Toast Notification Banner */}
      {exportStatusMessage && (
        <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 pt-3">
          <div className="bg-[#062959] border border-[#08cdbd] text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm">
            <CheckCircle2 className="w-4 h-4 text-[#14dac3] shrink-0" />
            <span>{exportStatusMessage}</span>
          </div>
        </div>
      )}

      {/* ==================== MAIN CONTENT VIEWPORT ==================== */}
      <main className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5 flex-1">
        {!isGalleryViewActive ? (
          <div className="flex flex-col lg:flex-row items-start gap-6">
            {/* ==================== LEFT / CENTER COLUMN: LIVE PREVIEW STAGE ==================== */}
            <div
              ref={stageContainerRef}
              className={`flex-1 w-full flex-col gap-4 ${
                mobileTab === 'preview' ? 'flex' : 'hidden lg:flex'
              }`}
            >
              {/* If Carousel Mode is active: Show Carousel Deck Selector + Slide Strip */}
              {isCarouselMode ? (
                <div className="bg-white border border-[#e3e9ed] rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-black text-[#062959]">
                      انتخاب پکیج کاروسل چنداسلایدی آرکا:
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {carouselDecks.map((deck) => (
                        <button
                          key={deck.id}
                          type="button"
                          onClick={() => {
                            setActiveDeckId(deck.id);
                            setActiveCarouselSlideIndex(0);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                            deck.id === activeDeck.id
                              ? 'bg-[#062959] text-white border-[#062959]'
                              : 'bg-[#f5f8fa] text-[#233b53] border-[#e3e9ed] hover:border-[#08cdbd]'
                          }`}
                        >
                          {deck.title}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Connected Carousel Slide Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 pt-2 border-t border-[#e3e9ed]">
                    {activeDeck.slides.map((sl, idx) => {
                      const isCurrentSlide = idx === safeSlideIndex;
                      return (
                        <button
                          key={`${sl.id}-${idx}`}
                          type="button"
                          onClick={() => setActiveCarouselSlideIndex(idx)}
                          className={`text-right p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between min-h-[56px] ${
                            isCurrentSlide
                              ? 'bg-[#062959] border-[#08cdbd] text-white shadow-sm'
                              : 'bg-[#f5f8fa] border-[#e3e9ed] text-[#233b53] hover:border-[#08cdbd]'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] font-bold">
                            <span
                              className={
                                isCurrentSlide ? 'text-[#14dac3]' : 'text-[#089f93]'
                              }
                            >
                              اسلاید {idx + 1} از {activeDeck.slides.length}
                            </span>
                            {idx < activeDeck.slides.length - 1 && (
                              <span className="text-[10px] opacity-75">← پیوسته</span>
                            )}
                          </div>
                          <div className="text-xs font-extrabold mt-1 line-clamp-1">
                            {sl.headlineHighlight}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Standard 6-Item Selector Strip for Story & Single Post */
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
                  {filteredStories.map((item) => {
                    const isSelected = item.id === activeStory.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveStoryId(item.id)}
                        className={`text-right p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between min-h-[58px] ${
                          isSelected
                            ? 'bg-[#062959] border-[#08cdbd] text-white shadow-sm'
                            : 'bg-white border-[#e3e9ed] text-[#233b53] hover:border-[#08cdbd]'
                        }`}
                      >
                        <div
                          className={`text-[11px] font-bold truncate ${
                            isSelected ? 'text-[#14dac3]' : 'text-[#089f93]'
                          }`}
                        >
                          {item.categoryLabel}
                        </div>
                        <div className="text-xs font-extrabold mt-1 line-clamp-1">
                          {item.titleShort}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Center Stage Container */}
              <div className="bg-[#062959] border border-[#0b2b56] rounded-2xl p-3 sm:p-5 flex flex-col items-center justify-center relative min-h-[520px] sm:min-h-[700px] shadow-lg overflow-hidden">
                {/* Stage Top Controls */}
                <div className="w-full flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-white/12">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={goPrev}
                      disabled={currentIndex <= 0}
                      className="p-2 rounded-lg bg-[#0b2b56] border border-white/15 text-white disabled:opacity-40 hover:bg-[#08cdbd] hover:text-[#062959] cursor-pointer transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
                      title="قبلی"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-bold text-white px-1 sm:px-2 tabular-nums-fa truncate max-w-[180px] sm:max-w-none">
                      {isCarouselMode
                        ? `اسلاید ${safeSlideIndex + 1} از ${activeDeck.slides.length} · ${activeFormat.shortLabel}`
                        : `آیتم ${activeStory.order} از ${stories.length} · ${activeStory.titleShort}`}
                    </span>
                    <button
                      type="button"
                      onClick={goNext}
                      disabled={currentIndex >= totalItemsInStrip - 1}
                      className="p-2 rounded-lg bg-[#0b2b56] border border-white/15 text-white disabled:opacity-40 hover:bg-[#08cdbd] hover:text-[#062959] cursor-pointer transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
                      title="بعدی"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Zoom & Isolation Mode Controls */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Iframe-Style Isolation Mode Toggle */}
                    <button
                      type="button"
                      onClick={() =>
                        setIsolationMode((m) =>
                          m === 'standard' ? 'iframe-isolated' : 'standard'
                        )
                      }
                      className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer min-h-[38px] flex items-center gap-1.5 ${
                        isolationMode === 'iframe-isolated'
                          ? 'bg-[#08cdbd] text-[#062959] border-[#08cdbd] font-black'
                          : 'bg-[#0b2b56] text-slate-200 border-white/15 hover:text-white'
                      }`}
                      title="ایزوله‌سازی کامل بوم در یک Iframe مستقل در صورت تداخل استایل یا ابعاد کانتینر"
                    >
                      <span>
                        {isolationMode === 'iframe-isolated'
                          ? 'حالت ایزوله Iframe: فعال'
                          : 'حالت ایزوله Iframe'}
                      </span>
                    </button>

                    {/* Auto-Fit ResizeObserver Toggle */}
                    <button
                      type="button"
                      onClick={() => setAutoFitScale(true)}
                      className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer min-h-[38px] ${
                        autoFitScale
                          ? 'bg-[#0b2b56] text-[#14dac3] border-[#14dac3]/40'
                          : 'bg-[#0b2b56] text-slate-300 border-white/15 hover:text-white'
                      }`}
                      title="محاسبه پویا و خودکار مقیاس بوم با ResizeObserver"
                    >
                      تناسب خودکار
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAutoFitScale(false);
                        setPreviewScale((s) =>
                          Math.max(0.22, +(s - 0.04).toFixed(2))
                        );
                      }}
                      className="p-2 rounded-lg bg-[#0b2b56] border border-white/15 text-slate-200 hover:text-white cursor-pointer min-h-[38px] min-w-[38px] flex items-center justify-center"
                      title="کوچک‌نمایی"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-bold text-[#14dac3] tabular-nums-fa w-11 text-center">
                      {Math.round(previewScale * 100)}٪
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAutoFitScale(false);
                        setPreviewScale((s) =>
                          Math.min(0.65, +(s + 0.04).toFixed(2))
                        );
                      }}
                      className="p-2 rounded-lg bg-[#0b2b56] border border-white/15 text-slate-200 hover:text-white cursor-pointer min-h-[38px] min-w-[38px] flex items-center justify-center"
                      title="بزرگ‌نمایی"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Scaled Multi-Format Viewport with ResizeObserver & Iframe Isolation Support */}
                <IsolatedStoryCanvasViewport
                  story={activeStory}
                  formatSpec={activeFormat}
                  carouselMeta={activeCarouselMeta}
                  logoMode={logoMode}
                  customLogoUrl={customLogoUrl}
                  logoScale={logoScale}
                  showSafeZoneGuides={showSafeZoneGuides}
                  showStickerPlaceholder={showStickerPlaceholder}
                  previewScale={previewScale}
                  isolationMode={isolationMode}
                  onSwitchIsolationMode={(nextMode) => {
                    setIsolationMode(nextMode);
                    if (nextMode === 'iframe-isolated') {
                      setExportStatusMessage(
                        'حالت رندر ایزوله (Iframe Isolation Mode) برای نمایش بی‌نقص بوم فعال شد.'
                      );
                      setTimeout(() => setExportStatusMessage(null), 3500);
                    }
                  }}
                  onCanvasMountChange={setCanvasMountEvent}
                  onAssetEvent={setLastAssetEvent}
                />
              </div>

              {/* Hidden / Collapsible Debug Console below Preview Stage */}
              <DebugConsole
                activeStoryId={activeStory.id}
                activeStoryTitle={`${activeStory.titleShort} (${activeFormat.ratioLabel})`}
                activePresetId={activePresetId}
                logoMode={logoMode}
                customLogoUrl={customLogoUrl}
                previewScale={previewScale}
                isolationMode={isolationMode}
                canvasMountEvent={canvasMountEvent}
                lastAssetEvent={lastAssetEvent}
                externalLogs={telemetryLogs}
                authDebugInfo={{
                  isSignedIn: Boolean(currentUser),
                  email: currentUser?.email || null,
                  hasWorkspaceToken: Boolean(accessToken && !needsAuth),
                  hasByokKey: Boolean(customKeyVerifiedInfo?.valid),
                  creditSourceLabel:
                    customKeyVerifiedInfo?.valid &&
                    preferredConnectionMode === 'custom-byok'
                      ? `کلید شخصی در سرور (${customKeyVerifiedInfo.maskedKey || 'BYOK'})`
                      : currentUser &&
                        preferredConnectionMode === 'gmail-authenticated'
                      ? `اکانت جیمیل (${currentUser.email || 'متصل'})`
                      : currentUser
                      ? 'حساب گوگل + سرور آرکا'
                      : 'مهمان (بدون لاگین)',
                  lastAuthError,
                }}
                onOpenAuthKeyModal={() => {
                  setByokDraftInput('');
                  setByokDraftVerifiedInfo(customKeyVerifiedInfo);
                  setByokVerifyError(null);
                  setIsAuthKeyModalOpen(true);
                }}
                onClearExternalLogs={() => setTelemetryLogs([])}
                onHardReset={handleResetAllStories}
              />
            </div>

            {/* ==================== RIGHT COLUMN: AI STUDIO / WORKSPACE / LIVE EDITOR ==================== */}
            <div className="w-full lg:w-[460px] shrink-0 flex flex-col gap-3">
              {/* Desktop 3-Way Switcher between AI Studio, Google Sheets/Drive, and Graphic Editor */}
              <div className="hidden lg:grid grid-cols-3 gap-1 p-1.5 bg-white border border-[#e3e9ed] rounded-2xl shadow-xs">
                <button
                  type="button"
                  onClick={() => setDesktopSideMode('ai-studio')}
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
                    desktopSideMode === 'ai-studio'
                      ? 'bg-[#062959] text-[#14dac3] shadow-sm'
                      : 'text-[#233b53] hover:bg-[#f5f8fa]'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>هوش مصنوعی آرکا</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDesktopSideMode('workspace')}
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
                    desktopSideMode === 'workspace'
                      ? 'bg-[#062959] text-[#14dac3] shadow-sm'
                      : 'text-[#233b53] hover:bg-[#f5f8fa]'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                  <span>Sheets و Drive</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDesktopSideMode('editor')}
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
                    desktopSideMode === 'editor'
                      ? 'bg-[#062959] text-white shadow-sm'
                      : 'text-[#233b53] hover:bg-[#f5f8fa]'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                  <span>ویرایشگر بوم</span>
                </button>
              </div>

              {/* 1. AI Studio Panel */}
              <div
                className={
                  mobileTab === 'ai-studio'
                    ? 'block'
                    : desktopSideMode === 'ai-studio'
                    ? 'hidden lg:block'
                    : 'hidden'
                }
              >
                <ArkaAIStudioPanel
                  currentUser={currentUser}
                  accessToken={accessToken}
                  needsAuth={needsAuth}
                  isSigningIn={isSigningIn}
                  onGoogleSignIn={handleGoogleSignIn}
                  onGoogleSignOut={handleGoogleSignOut}
                  activeStory={activeStory}
                  onInjectSlideIntoCanvas={handleInjectAiSlideIntoCanvas}
                  onInjectCanvasSlideItem={handleInjectCanvasSlideItem}
                  onInjectCarouselDeckIntoStudio={handleInjectAiCarouselDeck}
                  onSaveCanvasPngToDrive={handleRequestSaveCanvasPngToDrive}
                  onWriteStructuredToSheet={handleRequestWriteStructuredToSheet}
                  preferredConnectionMode={preferredConnectionMode}
                  onChangeConnectionMode={handleChangeConnectionMode}
                  customKeyVerifiedInfo={customKeyVerifiedInfo}
                  onOpenAuthKeyModal={() => {
                    setByokDraftInput('');
                    setByokDraftVerifiedInfo(customKeyVerifiedInfo);
                    setByokVerifyError(null);
                    setIsAuthKeyModalOpen(true);
                  }}
                  onEmitTelemetryLog={emitTelemetryLog}
                  onCalendarSavedToDrive={(info) => {
                    setExportStatusMessage(
                      `تقویم ۳۰ روزه «${info.title}» با موفقیت به‌عنوان فایل Spreadsheet در Google Drive ذخیره شد!`
                    );
                    setTimeout(() => setExportStatusMessage(null), 4500);
                  }}
                />
              </div>

              {/* 2. Google Sheets & Google Drive Workspace Panel */}
              <div
                className={
                  mobileTab === 'workspace'
                    ? 'block'
                    : desktopSideMode === 'workspace'
                    ? 'hidden lg:block'
                    : 'hidden'
                }
              >
                <GoogleWorkspacePanel
                  currentUser={currentUser}
                  accessToken={accessToken}
                  needsAuth={needsAuth}
                  isSigningIn={isSigningIn}
                  onGoogleSignIn={handleGoogleSignIn}
                  activeStory={activeStory}
                  allStories={stories}
                  activeFormat={activeFormat}
                  onUpdateStory={handleUpdateStory}
                  onRenderCanvasToPngDataUrl={renderActiveCanvasToPngDataUrl}
                />
              </div>

              {/* 3. Live Graphic Editor Panel */}
              <div
                className={
                  mobileTab === 'editor'
                    ? 'block'
                    : desktopSideMode === 'editor'
                    ? 'hidden lg:block'
                    : 'hidden'
                }
              >
                <StoryEditorPanel
                  story={activeStory}
                  onUpdateStory={handleUpdateStory}
                  logoMode={logoMode}
                  onChangeLogoMode={setLogoMode}
                  customLogoUrl={customLogoUrl}
                  onChangeCustomLogoUrl={setCustomLogoUrl}
                  logoScale={logoScale}
                  onChangeLogoScale={setLogoScale}
                  showSafeZoneGuides={showSafeZoneGuides}
                  onToggleSafeZoneGuides={() => setShowSafeZoneGuides((v) => !v)}
                  showStickerPlaceholder={showStickerPlaceholder}
                  onToggleStickerPlaceholder={() =>
                    setShowStickerPlaceholder((v) => !v)
                  }
                  onResetCurrentStory={handleResetCurrentStory}
                  presets={allPresets}
                  activePresetId={activePresetId}
                  onSelectPreset={handleSelectPreset}
                  onSaveNewPreset={handleSaveNewPreset}
                  onUpdateExistingPreset={handleUpdateExistingPreset}
                  onDeletePreset={handleDeletePreset}
                  carouselCaption={
                    customAiCaption ||
                    (isCarouselMode ? activeDeck.captionText : undefined)
                  }
                />
              </div>
            </div>
          </div>
        ) : (
          /* ==================== GALLERY / CAROUSEL CONNECTED VIEW ==================== */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 sm:gap-8 justify-items-center">
            {(isCarouselMode ? activeDeck.slides : filteredStories).map(
              (storyItem, idx) => {
                const galleryScale =
                  window.innerWidth < 420
                    ? 0.27
                    : activeFormat.height === 1920
                    ? 0.33
                    : activeFormat.height === 1350
                    ? 0.36
                    : 0.38;

                const slideMeta: CarouselSlideMeta | undefined = isCarouselMode
                  ? {
                      slideNumber: idx + 1,
                      totalSlides: activeDeck.slides.length,
                      deckTitle: activeDeck.title,
                    }
                  : undefined;

                return (
                  <div
                    key={`${storyItem.id}-${idx}`}
                    className="bg-white border border-[#e3e9ed] rounded-2xl p-4 flex flex-col items-center gap-3.5 shadow-sm w-full max-w-[440px]"
                  >
                    <div className="w-full flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-bold text-[#089f93] block">
                          {isCarouselMode
                            ? `اسلاید ${idx + 1} از ${activeDeck.slides.length}`
                            : storyItem.categoryLabel}
                        </span>
                        <h3 className="text-sm font-black text-[#062959]">
                          {storyItem.titleShort}
                        </h3>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (isCarouselMode) {
                              setActiveCarouselSlideIndex(idx);
                            } else {
                              setActiveStoryId(storyItem.id);
                            }
                            setViewMode('studio');
                            setMobileTab('preview');
                          }}
                          className="px-2.5 py-1.5 text-xs font-bold text-[#062959] bg-[#f5f8fa] hover:bg-[#e5fbf9] border border-[#e3e9ed] rounded-lg transition-colors cursor-pointer whitespace-nowrap min-h-[38px]"
                        >
                          ویرایش زنده
                        </button>
                        <button
                          type="button"
                          disabled={isExporting}
                          onClick={() =>
                            exportSingleCanvasAsPng(
                              storyItem,
                              isCarouselMode ? idx : undefined
                            )
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-black text-[#062959] bg-[#08cdbd] hover:bg-[#14dac3] rounded-lg transition-colors cursor-pointer whitespace-nowrap min-h-[38px]"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>PNG</span>
                        </button>
                      </div>
                    </div>

                    <div
                      className="overflow-hidden rounded-[18px] shadow-lg border border-[#e3e9ed] relative bg-[#062959]"
                      style={{
                        width: `${Math.round(activeFormat.width * galleryScale)}px`,
                        height: `${Math.round(activeFormat.height * galleryScale)}px`,
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          transform: `scale(${galleryScale})`,
                          transformOrigin: 'top left',
                          width: `${activeFormat.width}px`,
                          height: `${activeFormat.height}px`,
                        }}
                      >
                        <StoryCanvas
                          story={storyItem}
                          formatSpec={activeFormat}
                          carouselMeta={slideMeta}
                          logoMode={logoMode}
                          customLogoUrl={customLogoUrl}
                          logoScale={logoScale}
                          showSafeZoneGuides={showSafeZoneGuides}
                          showStickerPlaceholder={showStickerPlaceholder}
                        />
                      </div>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        )}
      </main>

      {/* ==================== MOBILE & TABLET FIXED BOTTOM TAB BAR (< lg) ==================== */}
      <nav
        aria-label="ناوبری موبایل استودیو آرکا"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#062959]/95 backdrop-blur-md border-t border-[#0b2b56] grid grid-cols-5 items-center h-16 px-1 shadow-2xl"
      >
        <button
          type="button"
          onClick={() => {
            setViewMode('studio');
            setMobileTab('preview');
          }}
          className={`flex flex-col items-center justify-center min-h-[48px] rounded-xl transition-colors cursor-pointer ${
            mobileTab === 'preview' && viewMode === 'studio'
              ? 'text-[#14dac3] font-black'
              : 'text-slate-300 font-medium'
          }`}
        >
          <Eye className="w-5 h-5" />
          <span className="text-[10px] mt-1 whitespace-nowrap">پیش‌نمایش</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setViewMode('studio');
            setMobileTab('ai-studio');
          }}
          className={`flex flex-col items-center justify-center min-h-[48px] rounded-xl transition-colors cursor-pointer ${
            mobileTab === 'ai-studio' && viewMode === 'studio'
              ? 'text-[#14dac3] font-black'
              : 'text-slate-300 font-medium'
          }`}
        >
          <Sparkles className="w-5 h-5" />
          <span className="text-[10px] mt-1 whitespace-nowrap">هوش مصنوعی</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setViewMode('studio');
            setMobileTab('workspace');
          }}
          className={`flex flex-col items-center justify-center min-h-[48px] rounded-xl transition-colors cursor-pointer ${
            mobileTab === 'workspace' && viewMode === 'studio'
              ? 'text-[#14dac3] font-black'
              : 'text-slate-300 font-medium'
          }`}
        >
          <FileSpreadsheet className="w-5 h-5" />
          <span className="text-[10px] mt-1 whitespace-nowrap">Sheets/Drive</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setViewMode('studio');
            setMobileTab('editor');
          }}
          className={`flex flex-col items-center justify-center min-h-[48px] rounded-xl transition-colors cursor-pointer ${
            mobileTab === 'editor' && viewMode === 'studio'
              ? 'text-[#14dac3] font-black'
              : 'text-slate-300 font-medium'
          }`}
        >
          <SlidersHorizontal className="w-5 h-5" />
          <span className="text-[10px] mt-1 whitespace-nowrap">ویرایشگر</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMobileTab('gallery');
          }}
          className={`flex flex-col items-center justify-center min-h-[48px] rounded-xl transition-colors cursor-pointer ${
            mobileTab === 'gallery'
              ? 'text-[#14dac3] font-black'
              : 'text-slate-300 font-medium'
          }`}
        >
          <LayoutGrid className="w-5 h-5" />
          <span className="text-[10px] mt-1 whitespace-nowrap">گالری</span>
        </button>
      </nav>

      {/* ==================== DEDICATED EXACT-PIXEL EXPORT RENDER TARGET ==================== */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: '-9999px',
          width: `${activeFormat.width}px`,
          height: `${activeFormat.height}px`,
          pointerEvents: 'none',
          zIndex: -1,
          overflow: 'hidden',
        }}
      >
        <StoryCanvas
          canvasRef={exportCanvasRef}
          story={activeStory}
          formatSpec={activeFormat}
          carouselMeta={activeCarouselMeta}
          logoMode={logoMode}
          customLogoUrl={customLogoUrl}
          logoScale={logoScale}
          showSafeZoneGuides={false}
          showStickerPlaceholder={showStickerPlaceholder}
        />
      </div>

      {/* ==================== DUAL AUTH & BYOK API KEY MANAGEMENT MODAL ==================== */}
      {isAuthKeyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0F1420] border border-slate-700 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 text-right text-slate-100">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-300 flex items-center justify-center shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">
                    مدیریت اعتبار هوش مصنوعی، کلید شخصی (BYOK) و حساب گوگل
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    صحت‌سنجی زنده لیست مدل‌ها (ai.models.list) پیش از ذخیره
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAuthKeyModalOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Google Auth & Workspace Session Summary */}
            <div className="p-3 rounded-xl bg-[#07090E] border border-slate-800 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      currentUser ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  <span className="font-black text-white truncate">
                    {currentUser
                      ? `واردشده با گوگل: ${currentUser.email}`
                      : 'وضعیت فعلی: کاربر مهمان (وارد نشده)'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {currentUser ? (
                    <>
                      {(!accessToken || needsAuth) && (
                        <button
                          type="button"
                          disabled={isSigningIn}
                          onClick={handleGoogleSignIn}
                          className="px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-[#062959] text-[11px] font-black cursor-pointer"
                        >
                          {isSigningIn ? 'در حال اتصال...' : 'تمدید Drive/Sheets'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleGoogleSignOut}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[11px] font-bold cursor-pointer"
                      >
                        خروج
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={isSigningIn}
                      onClick={handleGoogleSignIn}
                      className="px-3 py-1 rounded-lg bg-[#08cdbd] hover:bg-[#14dac3] text-[#062959] text-[11px] font-black cursor-pointer"
                    >
                      {isSigningIn ? 'در حال اتصال...' : 'ورود با حساب گوگل'}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                <span>
                  هوش مصنوعی (ID Token):{' '}
                  <strong className={currentUser ? 'text-emerald-300' : 'text-amber-300'}>
                    {currentUser ? 'آماده ✓' : 'نیاز به ورود یا کلید شخصی'}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Drive/Sheets (OAuth):{' '}
                  <strong
                    className={
                      accessToken && !needsAuth ? 'text-emerald-300' : 'text-amber-300'
                    }
                  >
                    {accessToken && !needsAuth
                      ? 'متصل ✓'
                      : isSigningIn
                      ? 'در حال تمدید توکن...'
                      : currentUser
                      ? 'نیاز به تمدید پاپ‌آپ'
                      : 'غیرفعال'}
                  </strong>
                </span>
              </div>

              {/* Compact Progress Bar for Google Account & Workspace Token Renewal Status */}
              <div className="pt-1 space-y-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>
                    {isSigningIn
                      ? 'در حال دریافت و تمدید توکن Google Workspace...'
                      : accessToken && !needsAuth
                      ? 'اتصال کامل گوگل و توکن Workspace فعال است'
                      : currentUser
                      ? 'نشست هوش مصنوعی فعال (در انتظار تمدید توکن Workspace)'
                      : 'در انتظار ورود به حساب گوگل'}
                  </span>
                  <span className="font-mono font-bold text-[#14dac3] tabular-nums-fa">
                    {isSigningIn
                      ? '65%'
                      : accessToken && !needsAuth
                      ? '100%'
                      : currentUser
                      ? '50%'
                      : '0%'}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={
                    isSigningIn
                      ? 65
                      : accessToken && !needsAuth
                      ? 100
                      : currentUser
                      ? 50
                      : 0
                  }
                  className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden"
                >
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isSigningIn
                        ? 'w-[65%] bg-gradient-to-l from-[#14dac3] to-amber-400 animate-pulse'
                        : accessToken && !needsAuth
                        ? 'w-full bg-gradient-to-l from-emerald-400 to-[#08cdbd]'
                        : currentUser
                        ? 'w-1/2 bg-amber-400'
                        : 'w-0 bg-slate-600'
                    }`}
                  />
                </div>
              </div>

              {lastAuthError && (
                <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/40 text-rose-300 text-[11px] flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{lastAuthError}</span>
                </div>
              )}
            </div>

            {/* Active Source Selector Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  if (!currentUser) {
                    handleGoogleSignIn();
                  } else {
                    handleChangeConnectionMode('gmail-authenticated');
                  }
                }}
                className={`p-3 rounded-xl border text-right cursor-pointer transition-all ${
                  currentUser &&
                  preferredConnectionMode === 'gmail-authenticated'
                    ? 'bg-emerald-500/15 border-emerald-400 text-white'
                    : 'bg-[#07090E] border-slate-800 text-slate-300 hover:border-emerald-500/40'
                }`}
              >
                <div className="font-black text-emerald-300">
                  🟢 حالت ۱: اکانت جیمیل
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {currentUser
                    ? `${currentUser.email} (${
                        accessToken && !needsAuth
                          ? 'AI + Drive/Sheets فعال'
                          : 'AI فعال · Drive نیاز به تمدید'
                      })`
                    : 'ورود گوگل + اتصال Drive و Sheets'}
                </div>
              </button>

              <button
                type="button"
                disabled={!customKeyVerifiedInfo?.valid}
                onClick={() => handleChangeConnectionMode('custom-byok')}
                className={`p-3 rounded-xl border text-right cursor-pointer transition-all disabled:opacity-50 ${
                  customKeyVerifiedInfo?.valid &&
                  preferredConnectionMode === 'custom-byok'
                    ? 'bg-cyan-500/15 border-cyan-400 text-white'
                    : 'bg-[#07090E] border-slate-800 text-slate-300 hover:border-cyan-500/40'
                }`}
              >
                <div className="font-black text-cyan-300">
                  🔵 حالت ۲: کلید شخصی (Vault)
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {customKeyVerifiedInfo?.valid
                    ? `رمزنگاری‌شده در سرور (${customKeyVerifiedInfo.maskedKey || 'BYOK'})`
                    : 'ابتدا کلید را پایین تست و در سرور ذخیره کنید'}
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleChangeConnectionMode('studio-creator-core')
                }
                className={`p-3 rounded-xl border text-right cursor-pointer transition-all ${
                  preferredConnectionMode === 'studio-creator-core'
                    ? 'bg-amber-500/15 border-amber-400 text-white'
                    : 'bg-[#07090E] border-slate-800 text-slate-300 hover:border-amber-500/40'
                }`}
              >
                <div className="font-black text-amber-300">
                  🟠 کلید سازمانی آرکا (ویژه ادمین)
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  فالبک مجاز سرور صرفاً برای ادمین تاییدشده
                </div>
              </button>
            </div>

            {/* Custom Gemini API Key BYOK Input + Server-Side AES-256-GCM Vault */}
            <div className="p-4 rounded-xl bg-[#07090E] border border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <label className="text-xs font-black text-[#14dac3] block">
                    گاوصندوق کلید شخصی Gemini (Server-Side AES-256-GCM Vault)
                  </label>
                  <span className="text-[10px] text-slate-400">
                    کلید هرگز در مرورگر ذخیره نمی‌شود و به UID حساب شما قفل می‌گردد
                  </span>
                </div>
                {customKeyVerifiedInfo?.valid && (
                  <button
                    type="button"
                    disabled={isTestingByok}
                    onClick={handleClearCustomByokKey}
                    className="inline-flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>حذف کلید از سرور ({customKeyVerifiedInfo.maskedKey})</span>
                  </button>
                )}
              </div>

              <input
                type="password"
                dir="ltr"
                value={byokDraftInput}
                onChange={(e) => {
                  setByokDraftInput(e.target.value);
                  setByokVerifyError(null);
                }}
                placeholder={
                  customKeyVerifiedInfo?.maskedKey
                    ? `کلید فعلی در سرور: ${customKeyVerifiedInfo.maskedKey} (برای چرخش کلید جدید وارد کنید)`
                    : 'AIzaSy...'
                }
                className="w-full bg-[#0F1420] border border-slate-700 focus:border-[#08cdbd] rounded-xl px-3 py-2.5 text-xs font-mono text-white outline-none text-left"
              />

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isTestingByok || !byokDraftInput.trim()}
                  onClick={handleTestCustomByokKey}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-black cursor-pointer"
                >
                  {isTestingByok ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  <span>
                    {isTestingByok
                      ? 'در حال استعلام از Gemini...'
                      : '۱. تست زنده کلید'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isTestingByok || !byokDraftInput.trim() || !currentUser}
                  onClick={handleSaveVerifiedByokKey}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#08cdbd] hover:bg-[#14dac3] disabled:opacity-40 text-[#062959] text-xs font-black cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {customKeyVerifiedInfo?.valid
                      ? '۲. چرخش و جایگزینی کلید در سرور'
                      : '۲. رمزنگاری و ذخیره در سرور'}
                  </span>
                </button>
              </div>

              {byokVerifyError && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{byokVerifyError}</span>
                </div>
              )}

              {byokDraftVerifiedInfo?.valid && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/35 space-y-1.5 text-xs">
                  <div className="font-black text-emerald-300 flex items-center justify-between">
                    <span>✓ کلید معتبر و آماده اجراست</span>
                    <span className="text-[10px] text-slate-300">
                      بررسی در {byokDraftVerifiedInfo.checkedAt}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300">
                    مدل‌های مجاز روی این کلید:{' '}
                    <span dir="ltr" className="font-mono text-[#14dac3]">
                      {byokDraftVerifiedInfo.models.slice(0, 6).join(' · ')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== EXPLICIT WORKSPACE CONFIRMATION MODAL ==================== */}
      {workspaceConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0F1420] border border-slate-700 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 text-right text-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-[#08cdbd]/20 text-[#14dac3] flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-black text-white">
                {workspaceConfirmModal.title}
              </h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {workspaceConfirmModal.description}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                disabled={isExecutingWorkspaceConfirm}
                onClick={() => setWorkspaceConfirmModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={isExecutingWorkspaceConfirm}
                onClick={async () => {
                  setIsExecutingWorkspaceConfirm(true);
                  try {
                    await workspaceConfirmModal.onConfirm();
                    setWorkspaceConfirmModal(null);
                  } catch (err: any) {
                    setExportStatusMessage(
                      err?.message || 'خطا در اجرای عملیات Google Workspace.'
                    );
                    setTimeout(() => setExportStatusMessage(null), 4000);
                    setWorkspaceConfirmModal(null);
                  } finally {
                    setIsExecutingWorkspaceConfirm(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#08cdbd] hover:bg-[#14dac3] text-xs font-black text-[#062959] cursor-pointer"
              >
                {isExecutingWorkspaceConfirm && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                <span>{workspaceConfirmModal.confirmLabel}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== OFFICIAL ARKA FOOTER ==================== */}
      <footer className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5 border-t border-[#e3e9ed] flex flex-wrap items-center justify-between gap-4 text-xs text-[#7e8c9b]">
        <div className="font-medium text-[#233b53]">
          گروه نرم‌افزاری آرکا · راهنمای هوشمند کسب‌وکار · مشهد، سید رضی ۴۰، بین مهران ۹ و ۱۱، پلاک ۲۶۵ · تلفن سراسری: ۰۵۱۳۶۰۷۹۰۴۷
        </div>
        <div dir="ltr" className="font-black text-[#062959]">
          https://arka-acc.ir
        </div>
      </footer>
    </div>
  );
}
