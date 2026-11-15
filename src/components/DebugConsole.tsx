import React, { useState, useEffect, useCallback } from 'react';
import {
  LogoDisplayMode,
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
} from 'lucide-react';

export interface DebugLogEntry {
  id: string;
  time: string;
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

interface ResourceHealth {
  serverStatus: string;
  serverOk: boolean;
  canvasStatus: string;
  canvasOk: boolean;
  fontStatus: string;
  fontOk: boolean;
  logoStatus: string;
  logoOk: boolean;
}

interface DebugConsoleProps {
  activeStoryId: string;
  activeStoryTitle: string;
  activePresetId: string;
  logoMode: LogoDisplayMode;
  customLogoUrl: string;
  previewScale: number;
  canvasMountEvent: StoryCanvasMountEvent | null;
  lastAssetEvent: StoryCanvasAssetEvent | null;
  externalLogs?: DebugLogEntry[];
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
  canvasMountEvent,
  lastAssetEvent,
  externalLogs = [],
  onClearExternalLogs,
  onHardReset,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
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

  const appendLog = useCallback(
    (
      level: DebugLogEntry['level'],
      source: DebugLogEntry['source'],
      message: string
    ) => {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0];
      setLogs((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          time: timeStr,
          level,
          source,
          message,
        },
        ...prev.slice(0, 49),
      ]);
      if (level === 'error') {
        setIsOpen(true);
      }
    },
    []
  );

  // Probe an image/resource URL to determine if it failed due to HTTP 403, 404, or CORS
  const probeFailedAssetStatus = useCallback(
    async (url: string) => {
      if (!url || url.startsWith('data:')) {
        appendLog(
          'error',
          'Assets',
          'خطا در بارگذاری تصویر لوگو (داده تصویر نامعتبر است).'
        );
        return;
      }
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

  // Track real-time StoryCanvas mount & update events
  useEffect(() => {
    if (!canvasMountEvent) return;
    setHealth((prev) => ({
      ...prev,
      canvasOk: canvasMountEvent.mounted,
      canvasStatus: canvasMountEvent.mounted
        ? `مونت‌شده (${canvasMountEvent.width}×${canvasMountEvent.height} · مقیاس ${Math.round(
            previewScale * 100
          )}٪)`
        : 'مونت نشده',
    }));
    appendLog(
      'ok',
      'StoryCanvas',
      `کامپوننت StoryCanvas مونت و رندر شد: «${canvasMountEvent.storyTitle}» (${canvasMountEvent.width}×${canvasMountEvent.height}px · تم: ${canvasMountEvent.theme})`
    );
  }, [canvasMountEvent, previewScale, appendLog]);

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
        logoStatus: `بارگذاری موفق (${lastAssetEvent.width || 0}×${
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
          'رویداد document.fonts.onloadingdone: فونت Vazirmatn به طور کامل بارگذاری و فعال شد.'
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
        probeFailedAssetStatus(src);
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

    // 1. Check Server & Host HTTP status (detect 403 Forbidden)
    let serverStatusText = 'HTTP 200 OK';
    let serverOkFlag = true;
    try {
      const res = await fetch(window.location.href, {
        method: 'HEAD',
        cache: 'no-store',
      });
      serverStatusText = `HTTP ${res.status} (${window.location.host})`;
      if (res.status === 403) {
        serverOkFlag = false;
        hasError = true;
        appendLog(
          'error',
          'Server',
          `خطای 403 Forbidden روی دامنه ${window.location.host} شناسایی شد.`
        );
      } else if (!res.ok) {
        serverOkFlag = false;
        hasError = true;
        appendLog(
          'warn',
          'Server',
          `پاسخ غیرمنتظره سرور: HTTP ${res.status} در بررسی پیش‌نمایش.`
        );
      } else {
        appendLog(
          'ok',
          'Server',
          `اتصال سرور پیش‌نمایش برقرار است (HTTP ${res.status} · Host: ${window.location.host}).`
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

    // 2. Check StoryCanvas DOM mounting & dimensions
    let canvasStatusText = 'رندر کامل (1080×1920)';
    let canvasOkFlag = true;
    const canvasNodes = document.querySelectorAll('[data-story-canvas="true"]');
    if (canvasNodes.length > 0) {
      const firstCanvas = canvasNodes[0] as HTMLElement;
      const w = firstCanvas.offsetWidth;
      const h = firstCanvas.offsetHeight;
      canvasStatusText = `فعال (${w}×${h} · مقیاس ${Math.round(previewScale * 100)}٪)`;
    } else {
      canvasStatusText = 'عدم رندر در DOM';
      canvasOkFlag = false;
      hasError = true;
      appendLog(
        'error',
        'StoryCanvas',
        'المان StoryCanvas در صفحه یافت نشد (عدم رندر کامپوننت).'
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
        fontStatusText = `فعال (HTTP ${fontRes.status} · document.fonts: آماده)`;
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
            fontLoaded ? 'تایید' : 'در حال بارگذاری از CDN'
          }`
        );
      }
    } catch {
      fontStatusText = 'خطا در بررسی فونت';
      fontOkFlag = false;
      appendLog(
        'warn',
        'Fonts',
        'خطا در بررسی مستقیم فایل محلی فونت وزیرمتن؛ استفاده از نسخه CDN.'
      );
    }

    // 4. Verify Image Assets HTTP status (403 check) & natural dimensions
    const targetLogoPath =
      logoMode === 'custom' && customLogoUrl.trim()
        ? customLogoUrl.trim()
        : logoMode === 'official-badge'
        ? '/arka-favicon-192.png'
        : '/images/arka-logo.png';

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
          img.onerror = () => reject(new Error('خطا در декоد تصویر لوگو'));
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
  }, [appendLog, customLogoUrl, logoMode, previewScale]);

  useEffect(() => {
    runFullDiagnostics();
  }, [activeStoryId, activePresetId, logoMode, customLogoUrl, runFullDiagnostics]);

  const allHealthy =
    health.serverOk && health.canvasOk && health.fontOk && health.logoOk;

  return (
    <section
      dir="rtl"
      className="w-full bg-[#0B1220] border border-slate-800/90 rounded-2xl overflow-hidden transition-all"
    >
      {/* Collapsed / Header Toggle Bar */}
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-[#111A2E]/90">
        <div className="flex items-center gap-2.5">
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
                StoryCanvas ({activeStoryTitle})، فونت وزیرمتن و تصاویر لوگو آماده هستند
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>هشدار یا خطای 403/بارگذاری در منابع شناسایی شد (مشاهده لاگ‌ها)</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
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
            <span>{isOpen ? 'بستن کنسول دیباگ' : 'مشاهده لاگ‌ها و وضعیت'}</span>
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
          {/* 4 Health Status Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-[#111A2E] border border-slate-800">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span>وضعیت سرور و دامنه (HTTP)</span>
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

            <div className="p-3 rounded-xl bg-[#111A2E] border border-slate-800">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span>وضعیت مونت StoryCanvas</span>
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
          </div>

          {/* Live Event Log Table */}
          <div className="rounded-xl border border-slate-800 bg-[#07090E] overflow-hidden">
            <div className="px-3.5 py-2 bg-[#0F1420] border-b border-slate-800 flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-300">
                لاگ رویدادهای AI Router، اعتبارسنجی کلید، کش سایت و StoryCanvas ({externalLogs.length + logs.length})
              </span>
              <div className="flex items-center gap-2">
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
                  پاکسازی کش مرورگر و بازنشانی سخت
                </button>
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto divide-y divide-slate-800/70 text-xs">
              {externalLogs.length + logs.length === 0 ? (
                <div className="p-4 text-center text-slate-500">
                  هنوز لاگی ثبت نشده است. روی «بررسی مجدد منابع» کلیک کنید.
                </div>
              ) : (
                [...externalLogs, ...logs].slice(0, 80).map((entry) => (
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
