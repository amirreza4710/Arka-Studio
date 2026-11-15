import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  LogoDisplayMode,
  CanvasIsolationMode,
  StoryCanvasMountEvent,
  StoryCanvasAssetEvent,
} from './StoryCanvas';
import {
  Terminal,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Trash2,
  Copy,
  Check,
  Search,
  ShieldCheck,
  KeyRound,
  Monitor,
} from 'lucide-react';

export interface DebugLogEntry {
  id: string;
  time: string;
  timestamp?: number;
  level: 'ok' | 'warn' | 'error';
  source:
    | 'StoryCanvas'
    | 'Fonts'
    | 'Assets'
    | 'Server'
    | 'AI-Router'
    | 'Auth'
    | 'LiveContext'
    | 'Workspace';
  message: string;
}

export interface AuthDebugSnapshot {
  isSignedIn: boolean;
  email?: string | null;
  hasWorkspaceToken: boolean;
  creditSourceLabel: string;
  hasByokKey: boolean;
  lastAuthError?: string | null;
}

interface ResourceHealth {
  serverStatus: string;
  serverOk: boolean;
  serverLatencyMs?: number;
  canvasStatus: string;
  canvasOk: boolean;
  fontStatus: string;
  fontOk: boolean;
  logoStatus: string;
  logoOk: boolean;
}

type LogFilterGroup =
  | 'all'
  | 'issues'
  | 'render'
  | 'ai'
  | 'auth';

interface DebugConsoleProps {
  activeStoryId: string;
  activeStoryTitle: string;
  activePresetId: string;
  logoMode: LogoDisplayMode;
  customLogoUrl: string;
  previewScale: number;
  isolationMode?: CanvasIsolationMode;
  canvasMountEvent: StoryCanvasMountEvent | null;
  lastAssetEvent: StoryCanvasAssetEvent | null;
  externalLogs?: DebugLogEntry[];
  authDebugInfo?: AuthDebugSnapshot;
  onOpenAuthKeyModal?: () => void;
  onClearExternalLogs?: () => void;
  onHardReset: () => void;
}

export const DebugConsole: React.FC<DebugConsoleProps> = ({
  activeStoryId,
  activeStoryTitle,
  activePresetId,
  logoMode,
  customLogoUrl,
  previewScale,
  isolationMode = 'standard',
  canvasMountEvent,
  lastAssetEvent,
  externalLogs = [],
  authDebugInfo,
  onOpenAuthKeyModal,
  onClearExternalLogs,
  onHardReset,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const [filterGroup, setFilterGroup] = useState<LogFilterGroup>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [copiedReport, setCopiedReport] = useState<boolean>(false);

  const [health, setHealth] = useState<ResourceHealth>({
    serverStatus: 'در حال بررسی...',
    serverOk: true,
    canvasStatus: 'در حال بررسی...',
    canvasOk: true,
    fontStatus: 'در حال بررسی...',
    fontOk: true,
    logoStatus: 'در حال بررسی...',
    logoOk: true,
  });

  const lastLoggedMountKeyRef = useRef<string>('');
  const probedErrorTimestampsRef = useRef<Map<string, number>>(new Map());

  const appendLog = useCallback(
    (
      level: DebugLogEntry['level'],
      source: DebugLogEntry['source'],
      message: string
    ) => {
      const now = Date.now();
      const timeStr = new Date(now).toTimeString().split(' ')[0];
      setLogs((prev) => [
        {
          id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
          time: timeStr,
          timestamp: now,
          level,
          source,
          message,
        },
        ...prev.slice(0, 59),
      ]);
      if (level === 'error') {
        setIsOpen(true);
      }
    },
    []
  );

  // Probe an image/resource URL to determine if it failed due to HTTP 403, 404, or CORS (debounced 10s per URL)
  const probeFailedAssetStatus = useCallback(
    async (url: string) => {
      if (!url || url.startsWith('data:')) {
        appendLog(
          'error',
          'Assets',
          'خطا در بارگذاری تصویر لوگو (داده Base64 تصویر نامعتبر است).'
        );
        return;
      }

      const now = Date.now();
      const lastProbed = probedErrorTimestampsRef.current.get(url) || 0;
      if (now - lastProbed < 10000) return;
      probedErrorTimestampsRef.current.set(url, now);

      try {
        const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
        if (res.status === 403) {
          appendLog(
            'error',
            'Assets',
            `خطای 403 Forbidden هنگام دسترسی به منبع تصویر: ${url}`
          );
        } else {
          appendLog(
            'error',
            'Assets',
            `خطا در بارگذاری منبع تصویر (${url}) · کد وضعیت HTTP: ${res.status}`
          );
        }
      } catch {
        appendLog(
          'error',
          'Assets',
          `خطای شبکه یا محدودیت CORS هنگام دریافت تصویر: ${url}`
        );
      }
    },
    [appendLog]
  );

  // Track real-time StoryCanvas mount & update events (deduplicate mount log from zoom changes)
  useEffect(() => {
    if (!canvasMountEvent) return;
    const modeLabel =
      (canvasMountEvent.renderMode || isolationMode) === 'iframe-isolated'
        ? 'ایزوله Iframe'
        : 'استاندارد';
    const boundsLabel =
      canvasMountEvent.renderedBoundsWidth &&
      canvasMountEvent.renderedBoundsHeight
        ? `${canvasMountEvent.renderedBoundsWidth}×${canvasMountEvent.renderedBoundsHeight}px واقعی`
        : `${canvasMountEvent.width}×${canvasMountEvent.height}px`;

    setHealth((prev) => ({
      ...prev,
      canvasOk: canvasMountEvent.mounted,
      canvasStatus: canvasMountEvent.mounted
        ? `${modeLabel} · ${canvasMountEvent.width}×${canvasMountEvent.height} (${Math.round(
            previewScale * 100
          )}٪)`
        : 'مونت نشده',
    }));

    const dedupKey = `${canvasMountEvent.storyId}-${canvasMountEvent.width}x${canvasMountEvent.height}-${canvasMountEvent.renderMode}-${canvasMountEvent.renderHealth}`;
    if (lastLoggedMountKeyRef.current !== dedupKey) {
      lastLoggedMountKeyRef.current = dedupKey;
      appendLog(
        canvasMountEvent.renderHealth === 'auto-recovered' ? 'warn' : 'ok',
        'StoryCanvas',
        `بوم رندر شد [${modeLabel}]: «${canvasMountEvent.storyTitle}» (${boundsLabel} · تم: ${canvasMountEvent.theme}${
          canvasMountEvent.renderHealth === 'auto-recovered'
            ? ' · بازیابی خودکار از تداخل کانتینر'
            : ''
        })`
      );
    }
  }, [canvasMountEvent, previewScale, isolationMode, appendLog]);

  // Track real-time StoryCanvas <img> load / error events
  useEffect(() => {
    if (!lastAssetEvent) return;
    const displaySrc = lastAssetEvent.src.startsWith('data:')
      ? 'فایل آپلودشده (Base64)'
      : lastAssetEvent.src;

    if (lastAssetEvent.status === 'loaded') {
      setHealth((prev) => ({
        ...prev,
        logoOk: true,
        logoStatus: `آماده (${lastAssetEvent.width || 0}×${
          lastAssetEvent.height || 0
        }px)`,
      }));
      appendLog(
        'ok',
        'Assets',
        `تصویر لوگو در StoryCanvas بارگذاری شد: ${displaySrc} (${
          lastAssetEvent.width || 0
        }×${lastAssetEvent.height || 0}px)`
      );
    } else {
      setHealth((prev) => ({
        ...prev,
        logoOk: false,
        logoStatus: 'خطا در بارگذاری لوگو (403/404)',
      }));
      probeFailedAssetStatus(lastAssetEvent.src);
    }
  }, [lastAssetEvent, appendLog, probeFailedAssetStatus]);

  // Monitor document.fonts events for Vazirmatn loading completion
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return;

    const handleLoadingDone = () => {
      const vazirReady = document.fonts.check('16px Vazirmatn');
      if (vazirReady) {
        setHealth((prev) => ({
          ...prev,
          fontOk: true,
          fontStatus: 'فونت وزیرمتن آماده (Loaded)',
        }));
        appendLog(
          'ok',
          'Fonts',
          'رویداد document.fonts.onloadingdone: فونت Vazirmatn به‌طور کامل بارگذاری و فعال شد.'
        );
      }
    };

    const handleLoadingError = () => {
      setHealth((prev) => ({
        ...prev,
        fontOk: false,
        fontStatus: 'خطا در بارگذاری فونت',
      }));
      appendLog(
        'error',
        'Fonts',
        'رویداد document.fonts.onloadingerror: خطا در بارگذاری یکی از فایل‌های فونت وزیرمتن.'
      );
    };

    document.fonts.addEventListener('loadingdone', handleLoadingDone);
    document.fonts.addEventListener('loadingerror', handleLoadingError);

    return () => {
      document.fonts.removeEventListener('loadingdone', handleLoadingDone);
      document.fonts.removeEventListener('loadingerror', handleLoadingError);
    };
  }, [appendLog]);

  // Global window capture listener for any <img> resource loading errors across the page
  useEffect(() => {
    const handleResourceCaptureError = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target && target.tagName === 'IMG') {
        const imgEl = target as HTMLImageElement;
        const src = imgEl.currentSrc || imgEl.src;
        if (src) {
          probeFailedAssetStatus(src);
        }
      }
    };

    window.addEventListener('error', handleResourceCaptureError, true);
    return () => {
      window.removeEventListener('error', handleResourceCaptureError, true);
    };
  }, [probeFailedAssetStatus]);

  const runFullDiagnostics = useCallback(async () => {
    setIsChecking(true);
    let hasError = false;

    // 1. Check Backend API Server & Roundtrip Latency
    let serverStatusText = 'HTTP 200 OK';
    let serverOkFlag = true;
    let latencyMs: number | undefined;
    try {
      const t0 = performance.now();
      const res = await fetch('/api/arka-ai/diagnostics', {
        method: 'GET',
        cache: 'no-store',
      });
      latencyMs = Math.round(performance.now() - t0);
      serverStatusText = `HTTP ${res.status} · ${latencyMs}ms (${window.location.host})`;

      if (res.status === 403 || res.status >= 500) {
        serverOkFlag = false;
        hasError = true;
        appendLog(
          'error',
          'Server',
          `پاسخ خطای سرور پیش‌نمایش: HTTP ${res.status} (${latencyMs}ms) روی ${window.location.host}`
        );
      } else if (res.status === 429) {
        serverOkFlag = true;
        appendLog(
          'warn',
          'Server',
          `محدودیت نرخ (Rate Limit 429) برای بررسی وضعیت سرور فعال شده است (${latencyMs}ms).`
        );
      } else if (!res.ok) {
        serverOkFlag = false;
        hasError = true;
        appendLog(
          'warn',
          'Server',
          `پاسخ غیرمنتظره سرور: HTTP ${res.status} (${latencyMs}ms).`
        );
      } else {
        appendLog(
          'ok',
          'Server',
          `سرور بک‌اند و API پیش‌نمایش سالم است (HTTP ${res.status} · ${latencyMs}ms).`
        );
      }
    } catch (err) {
      serverStatusText = 'خطای شبکه';
      serverOkFlag = false;
      hasError = true;
      appendLog(
        'error',
        'Server',
        `عدم دسترسی شبکه به سرور پیش‌نمایش: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`
      );
    }

    // 2. Check Visible StoryCanvas DOM mounting (supports both standard & iframe-isolated modes, ignores -9999px export node)
    let canvasStatusText = 'در انتظار رندر';
    let canvasOkFlag = true;

    const topNodes = Array.from(
      document.querySelectorAll('[data-story-canvas="true"]')
    ) as HTMLElement[];
    const visibleTopCanvas = topNodes.find((el) => {
      const rect = el.getBoundingClientRect();
      return rect.left > -5000 && rect.width > 10 && rect.height > 10;
    });

    let visibleIframeCanvas: HTMLElement | null = null;
    if (isolationMode === 'iframe-isolated') {
      const iframe = document.querySelector(
        'iframe[title="پیش‌نمایش ایزوله بوم آرکا"]'
      ) as HTMLIFrameElement | null;
      const iframeDoc = iframe?.contentDocument;
      if (iframeDoc) {
        visibleIframeCanvas = iframeDoc.querySelector(
          '[data-story-canvas="true"]'
        ) as HTMLElement | null;
      }
    }

    const activeCanvasNode = visibleIframeCanvas || visibleTopCanvas;
    if (activeCanvasNode) {
      const w = activeCanvasNode.offsetWidth || canvasMountEvent?.width || 1080;
      const h =
        activeCanvasNode.offsetHeight || canvasMountEvent?.height || 1920;
      const modeText =
        isolationMode === 'iframe-isolated' ? 'ایزوله Iframe' : 'استاندارد';
      canvasStatusText = `${modeText} · ${w}×${h} (${Math.round(
        previewScale * 100
      )}٪)`;
    } else if (canvasMountEvent?.mounted) {
      const modeText =
        (canvasMountEvent.renderMode || isolationMode) === 'iframe-isolated'
          ? 'ایزوله Iframe'
          : 'استاندارد';
      canvasStatusText = `${modeText} · ${canvasMountEvent.width}×${canvasMountEvent.height} (${Math.round(
        previewScale * 100
      )}٪)`;
    } else {
      canvasStatusText = 'عدم رندر در DOM';
      canvasOkFlag = false;
      hasError = true;
      appendLog(
        'error',
        'StoryCanvas',
        'المان قابل‌مشاهده StoryCanvas در پیش‌نمایش صفحه یافت نشد.'
      );
    }

    // 3. Check document.fonts for Vazirmatn completion & HTTP status
    let fontStatusText = 'وزیرمتن آماده';
    let fontOkFlag = true;
    try {
      const fontRes = await fetch('/fonts/Vazirmatn-Variable.woff2', {
        method: 'HEAD',
      });
      if (document.fonts) {
        await document.fonts.ready;
      }
      const fontLoaded = document.fonts
        ? document.fonts.check('16px Vazirmatn')
        : true;

      if (fontRes.status === 403) {
        fontStatusText = 'خطای 403 فونت';
        fontOkFlag = false;
        hasError = true;
        appendLog(
          'error',
          'Fonts',
          'خطای 403 Forbidden هنگام دریافت فایل فونت /fonts/Vazirmatn-Variable.woff2'
        );
      } else if (fontRes.ok && fontLoaded) {
        fontStatusText = `فعال (HTTP ${fontRes.status} · Vazirmatn آماده)`;
        appendLog(
          'ok',
          'Fonts',
          `بررسی document.fonts: فونت Vazirmatn با موفقیت بارگذاری شده است (HTTP ${fontRes.status}).`
        );
      } else {
        fontStatusText = `هشدار فونت (HTTP ${fontRes.status})`;
        fontOkFlag = fontRes.ok;
        appendLog(
          'warn',
          'Fonts',
          `وضعیت فونت وزیرمتن: HTTP ${fontRes.status} · document.fonts.check: ${
            fontLoaded ? 'تایید' : 'در حال بارگذاری'
          }`
        );
      }
    } catch {
      fontStatusText = 'خطا در بررسی فونت';
      fontOkFlag = false;
      appendLog(
        'warn',
        'Fonts',
        'خطا در بررسی مستقیم فایل محلی فونت وزیرمتن.'
      );
    }

    // 4. Verify Active Image Assets HTTP status (matches StoryCanvas.tsx paths!)
    const targetLogoPath =
      logoMode === 'custom' && customLogoUrl.trim()
        ? customLogoUrl.trim()
        : logoMode === 'official-badge'
        ? '/arka-favicon-192.png'
        : '/images/arka-header-logo.png';

    let logoStatusText = 'بارگذاری موفق';
    let logoOkFlag = true;

    try {
      if (!targetLogoPath.startsWith('data:')) {
        const assetHead = await fetch(targetLogoPath, { method: 'HEAD' });
        if (assetHead.status === 403) {
          throw new Error(`HTTP 403 Forbidden (${targetLogoPath})`);
        }
        if (!assetHead.ok) {
          throw new Error(`HTTP ${assetHead.status} (${targetLogoPath})`);
        }
      }

      const imgDimensions = await new Promise<{ w: number; h: number }>(
        (resolve, reject) => {
          const img = new Image();
          img.onload = () =>
            resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => reject(new Error('خطا در دیکد تصویر لوگو'));
          img.src = targetLogoPath;
        }
      );
      logoStatusText = `آماده (${imgDimensions.w}×${imgDimensions.h}px)`;
    } catch (err) {
      logoStatusText = 'خطای بارگذاری تصویر (403/404)';
      logoOkFlag = false;
      hasError = true;
      appendLog(
        'error',
        'Assets',
        `خطا در بررسی منبع تصویر (${targetLogoPath}): ${
          err instanceof Error ? err.message : 'خطای ناشناخته'
        }`
      );
    }

    setHealth({
      serverStatus: serverStatusText,
      serverOk: serverOkFlag,
      serverLatencyMs: latencyMs,
      canvasStatus: canvasStatusText,
      canvasOk: canvasOkFlag,
      fontStatus: fontStatusText,
      fontOk: fontOkFlag,
      logoStatus: logoStatusText,
      logoOk: logoOkFlag,
    });

    if (hasError) {
      setIsOpen(true);
    }
    setIsChecking(false);
  }, [
    appendLog,
    canvasMountEvent,
    customLogoUrl,
    isolationMode,
    logoMode,
    previewScale,
  ]);

  useEffect(() => {
    runFullDiagnostics();
  }, [
    activeStoryId,
    activePresetId,
    logoMode,
    customLogoUrl,
    isolationMode,
    runFullDiagnostics,
  ]);

  // Unified chronological timeline (externalLogs + internal logs)
  const mergedLogs = useMemo(() => {
    const combined = [...externalLogs, ...logs];
    return combined
      .sort((a, b) => {
        const ta = a.timestamp ?? 0;
        const tb = b.timestamp ?? 0;
        if (ta !== tb) return tb - ta;
        return b.time.localeCompare(a.time);
      })
      .slice(0, 100);
  }, [externalLogs, logs]);

  const issueCounts = useMemo(() => {
    let errors = 0;
    let warns = 0;
    for (const item of mergedLogs) {
      if (item.level === 'error') errors++;
      else if (item.level === 'warn') warns++;
    }
    return { errors, warns };
  }, [mergedLogs]);

  const filteredLogs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return mergedLogs.filter((entry) => {
      if (
        filterGroup === 'issues' &&
        entry.level !== 'error' &&
        entry.level !== 'warn'
      ) {
        return false;
      }
      if (
        filterGroup === 'render' &&
        !['StoryCanvas', 'Fonts', 'Assets', 'Server'].includes(entry.source)
      ) {
        return false;
      }
      if (
        filterGroup === 'ai' &&
        !['AI-Router', 'LiveContext'].includes(entry.source)
      ) {
        return false;
      }
      if (
        filterGroup === 'auth' &&
        !['Auth', 'Workspace'].includes(entry.source)
      ) {
        return false;
      }
      if (q) {
        const haystack = `${entry.source} ${entry.message} ${entry.time}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [mergedLogs, filterGroup, searchTerm]);

  const handleCopyDiagnosticReport = () => {
    const sanitizedSnapshot = {
      capturedAt: new Date().toISOString(),
      host: window.location.host,
      activeStory: {
        id: activeStoryId,
        title: activeStoryTitle,
        presetId: activePresetId,
        previewScale,
        isolationMode,
        canvasMount: canvasMountEvent || null,
      },
      health,
      auth: authDebugInfo
        ? {
            isSignedIn: authDebugInfo.isSignedIn,
            email: authDebugInfo.email || null,
            hasWorkspaceToken: authDebugInfo.hasWorkspaceToken,
            creditSourceLabel: authDebugInfo.creditSourceLabel,
            hasByokKey: authDebugInfo.hasByokKey,
            lastAuthError: authDebugInfo.lastAuthError || null,
          }
        : null,
      recentLogs: mergedLogs.slice(0, 40),
    };
    navigator.clipboard.writeText(JSON.stringify(sanitizedSnapshot, null, 2));
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2200);
  };

  const allHealthy =
    health.serverOk && health.canvasOk && health.fontOk && health.logoOk;

  return (
    <section
      dir="rtl"
      className="w-full bg-[#0B1220] border border-slate-800/90 rounded-2xl overflow-hidden transition-all"
    >
      {/* Collapsed / Header Toggle Bar */}
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-[#111A2E]/90">
        <div className="flex flex-wrap items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-xs font-extrabold text-white">
            پنل دیباگ و پایش رندر پیش‌نمایش (Debug Console)
          </span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          {allHealthy ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                StoryCanvas ({activeStoryTitle})، فونت و منابع آماده هستند
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>هشدار یا خطا در پایش منابع شناسایی شد</span>
            </span>
          )}

          {/* Compact Badges for Auth & Error Count */}
          {authDebugInfo && (
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                authDebugInfo.isSignedIn
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : authDebugInfo.hasByokKey
                  ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
              }`}
            >
              {authDebugInfo.isSignedIn
                ? `Auth: ${authDebugInfo.email || 'متصل'}`
                : authDebugInfo.hasByokKey
                ? 'Auth: BYOK فعال'
                : 'Auth: مهمان'}
            </span>
          )}

          {(issueCounts.errors > 0 || issueCounts.warns > 0) && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-500/15 text-rose-300 border border-rose-500/30 tabular-nums-fa">
              {issueCounts.errors} خطا · {issueCounts.warns} هشدار
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runFullDiagnostics}
            disabled={isChecking}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0B1220] hover:bg-slate-800 border border-slate-700 text-[11px] font-bold text-slate-200 cursor-pointer whitespace-nowrap"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-emerald-400 ${
                isChecking ? 'animate-spin' : ''
              }`}
            />
            <span>بررسی مجدد منابع</span>
          </button>

          <button
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-white cursor-pointer whitespace-nowrap"
          >
            <span>
              {isOpen
                ? 'بستن کنسول دیباگ'
                : `مشاهده لاگ‌ها (${mergedLogs.length})`}
            </span>
            {isOpen ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded Diagnostic Body */}
      {isOpen && (
        <div className="p-4 space-y-4 border-t border-slate-800 bg-[#080D18]">
          {/* 6 Health Status Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {/* 1. Server & Latency */}
            <div className="p-3 rounded-xl bg-[#111A2E] border border-slate-800">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span>وضعیت سرور و API (Latency)</span>
                {health.serverOk ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-rose-400" />
                )}
              </div>
              <div
                dir="ltr"
                className="text-xs font-bold text-white truncate text-right tabular-nums-fa"
              >
                {health.serverStatus}
              </div>
            </div>

            {/* 2. StoryCanvas Render & Isolation */}
            <div className="p-3 rounded-xl bg-[#111A2E] border border-slate-800">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span className="inline-flex items-center gap-1">
                  <Monitor className="w-3 h-3 text-cyan-400" />
                  <span>پایش رندر StoryCanvas</span>
                </span>
                {health.canvasOk ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-rose-400" />
                )}
              </div>
              <div className="text-xs font-bold text-white truncate tabular-nums-fa">
                {health.canvasStatus}
              </div>
            </div>

            {/* 3. Fonts */}
            <div className="p-3 rounded-xl bg-[#111A2E] border border-slate-800">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span>فونت وزیرمتن (document.fonts)</span>
                {health.fontOk ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                )}
              </div>
              <div className="text-xs font-bold text-white truncate tabular-nums-fa">
                {health.fontStatus}
              </div>
            </div>

            {/* 4. Assets */}
            <div className="p-3 rounded-xl bg-[#111A2E] border border-slate-800">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span>منابع تصویر و لوگو (Assets)</span>
                {health.logoOk ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-rose-400" />
                )}
              </div>
              <div className="text-xs font-bold text-white truncate tabular-nums-fa">
                {health.logoStatus}
              </div>
            </div>

            {/* 5. Firebase Auth & Credit Source */}
            <div className="p-3 rounded-xl bg-[#111A2E] border border-slate-800">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-purple-400" />
                  <span>نشست لاگین و منبع AI</span>
                </span>
                {authDebugInfo?.isSignedIn || authDebugInfo?.hasByokKey ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-white truncate">
                  {authDebugInfo
                    ? authDebugInfo.creditSourceLabel
                    : 'در حال بارگذاری'}
                </span>
                {onOpenAuthKeyModal && (
                  <button
                    type="button"
                    onClick={onOpenAuthKeyModal}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/35 text-purple-200 border border-purple-500/30 text-[10px] font-bold cursor-pointer shrink-0"
                  >
                    <KeyRound className="w-2.5 h-2.5" />
                    <span>مدیریت</span>
                  </button>
                )}
              </div>
            </div>

            {/* 6. Google Workspace Drive/Sheets OAuth Status */}
            <div className="p-3 rounded-xl bg-[#111A2E] border border-slate-800">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span>توکن Drive و Sheets (OAuth)</span>
                {authDebugInfo?.hasWorkspaceToken ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                )}
              </div>
              <div className="text-xs font-bold text-white truncate">
                {authDebugInfo?.hasWorkspaceToken
                  ? 'توکن Drive/Sheets متصل و آماده'
                  : authDebugInfo?.isSignedIn
                  ? 'واردشده (تمدید پاپ‌آپ برای Drive لازم است)'
                  : 'مهمان (نیاز به ورود گوگل برای Drive)'}
              </div>
            </div>
          </div>

          {/* Auth Error Callout if last sign-in had an error */}
          {authDebugInfo?.lastAuthError && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs flex items-center justify-between gap-2">
              <span>آخرین خطای ورود گوگل: {authDebugInfo.lastAuthError}</span>
              {onOpenAuthKeyModal && (
                <button
                  type="button"
                  onClick={onOpenAuthKeyModal}
                  className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-white text-[11px] font-bold cursor-pointer shrink-0"
                >
                  بررسی ورود
                </button>
              )}
            </div>
          )}

          {/* Live Event Log Table */}
          <div className="rounded-xl border border-slate-800 bg-[#07090E] overflow-hidden">
            {/* Toolbar: Title, Filter Pills, Search & Actions */}
            <div className="px-3.5 py-2.5 bg-[#0F1420] border-b border-slate-800 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-300">
                  خط زمانی رویدادهای سیستم ({filteredLogs.length} از {mergedLogs.length})
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyDiagnosticReport}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-[#14dac3] cursor-pointer"
                  >
                    {copiedReport ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>گزارش کپی شد</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>کپی گزارش دیباگ</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLogs([]);
                      onClearExternalLogs?.();
                    }}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>پاک کردن لاگ‌ها</span>
                  </button>
                  <span aria-hidden="true" className="text-slate-700">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={onHardReset}
                    className="text-[11px] font-bold text-amber-400 hover:text-amber-300 cursor-pointer"
                  >
                    بازنشانی سخت کش مرورگر
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1">
                  {(
                    [
                      { id: 'all', label: 'همه' },
                      { id: 'issues', label: 'خطا و هشدار' },
                      { id: 'render', label: 'بوم و منابع' },
                      { id: 'ai', label: 'هوش مصنوعی' },
                      { id: 'auth', label: 'لاگین و درایو' },
                    ] as Array<{ id: LogFilterGroup; label: string }>
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFilterGroup(tab.id)}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold cursor-pointer border transition-colors ${
                        filterGroup === tab.id
                          ? 'bg-[#08cdbd] text-[#062959] border-[#08cdbd]'
                          : 'bg-[#07090E] text-slate-300 border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="relative flex-1 min-w-[160px] max-w-[240px]">
                  <Search className="w-3 h-3 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="جستجو در لاگ‌ها..."
                    className="w-full bg-[#07090E] border border-slate-800 focus:border-[#08cdbd] rounded-md pr-7 pl-2 py-1 text-[11px] text-slate-200 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/70 text-xs">
              {filteredLogs.length === 0 ? (
                <div className="p-4 text-center text-slate-500">
                  {mergedLogs.length === 0
                    ? 'هنوز لاگی ثبت نشده است. روی «بررسی مجدد منابع» کلیک کنید.'
                    : 'هیچ لاگی مطابق فیلتر انتخاب‌شده یافت نشد.'}
                </div>
              ) : (
                filteredLogs.map((entry) => (
                  <div
                    key={entry.id}
                    className="px-3.5 py-2 flex items-start gap-3 hover:bg-white/[0.02]"
                  >
                    <span
                      dir="ltr"
                      className="text-[11px] font-mono text-slate-400 shrink-0 tabular-nums-fa"
                    >
                      {entry.time}
                    </span>
                    <span
                      className={`text-[11px] font-bold shrink-0 w-24 ${
                        entry.level === 'error'
                          ? 'text-rose-400'
                          : entry.level === 'warn'
                          ? 'text-amber-400'
                          : entry.source === 'AI-Router'
                          ? 'text-purple-400'
                          : entry.source === 'LiveContext'
                          ? 'text-cyan-400'
                          : entry.source === 'Auth'
                          ? 'text-sky-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      [{entry.source}]
                    </span>
                    <span className="text-slate-200 leading-relaxed flex-1">
                      {entry.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
