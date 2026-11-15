import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ArkaStoryData, CanvasFormatSpec } from '../data/arkaStories';
import {
  CheckCircle2,
  PhoneCall,
  Globe,
  ShieldCheck,
  FileCheck2,
  Layers,
  ArrowUpLeft,
  Building2,
  Download,
  ArrowLeft,
  BookmarkCheck,
} from 'lucide-react';

export type LogoDisplayMode = 'official-full' | 'official-badge' | 'custom';
export type CanvasIsolationMode = 'standard' | 'iframe-isolated';

export interface StoryCanvasMountEvent {
  mounted: boolean;
  storyId: string;
  storyTitle: string;
  theme: string;
  width: number;
  height: number;
  renderedBoundsWidth?: number;
  renderedBoundsHeight?: number;
  renderMode?: CanvasIsolationMode;
  renderHealth?: 'healthy' | 'auto-recovered';
}

export interface StoryCanvasAssetEvent {
  src: string;
  status: 'loaded' | 'error';
  width?: number;
  height?: number;
}

export interface CarouselSlideMeta {
  slideNumber: number;
  totalSlides: number;
  deckTitle: string;
}

interface StoryCanvasProps {
  story: ArkaStoryData;
  formatSpec?: CanvasFormatSpec;
  carouselMeta?: CarouselSlideMeta;
  logoMode: LogoDisplayMode;
  customLogoUrl: string;
  logoScale: number;
  showSafeZoneGuides: boolean;
  showStickerPlaceholder: boolean;
  canvasRef?: React.RefObject<HTMLDivElement | null>;
  renderMode?: CanvasIsolationMode;
  onCanvasMountChange?: (event: StoryCanvasMountEvent) => void;
  onAssetEvent?: (event: StoryCanvasAssetEvent) => void;
  onContainerRenderFail?: () => void;
}

export const StoryCanvas: React.FC<StoryCanvasProps> = ({
  story,
  formatSpec,
  carouselMeta,
  logoMode,
  customLogoUrl,
  logoScale,
  showSafeZoneGuides,
  showStickerPlaceholder,
  canvasRef,
  renderMode = 'standard',
  onCanvasMountChange,
  onAssetEvent,
  onContainerRenderFail,
}) => {
  const internalRef = useRef<HTMLDivElement | null>(null);

  const canvasWidth = formatSpec?.width || 1080;
  const canvasHeight = formatSpec?.height || 1920;
  const isStory = canvasHeight === 1920;
  const isSquare = canvasHeight === 1080;
  const isPortraitPost = canvasHeight === 1350;
  const isCarousel = Boolean(carouselMeta);

  const isPaperBg = story.theme === 'paper-navy';
  const isEmeraldBg = story.theme === 'emerald-tax';

  const lastTelemetryKeyRef = useRef<string>('');

  useEffect(() => {
    const node = internalRef.current;
    if (!node) return;

    let observerRafId = 0;

    const emitTelemetry = (rectW: number, rectH: number, recovered = false) => {
      if (!onCanvasMountChange) return;
      const roundedW = Math.round(rectW);
      const roundedH = Math.round(rectH);
      const key = `${story.id}-${canvasWidth}-${canvasHeight}-${roundedW}-${roundedH}-${renderMode}-${recovered}`;
      if (lastTelemetryKeyRef.current === key) return;
      lastTelemetryKeyRef.current = key;

      onCanvasMountChange({
        mounted: true,
        storyId: story.id,
        storyTitle: story.titleShort,
        theme: story.theme,
        width: canvasWidth,
        height: canvasHeight,
        renderedBoundsWidth: roundedW,
        renderedBoundsHeight: roundedH,
        renderMode,
        renderHealth: recovered ? 'auto-recovered' : 'healthy',
      });
    };

    const verifyBounds = () => {
      const el = internalRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (
        renderMode === 'standard' &&
        (rect.width < 10 || rect.height < 10) &&
        onContainerRenderFail
      ) {
        onContainerRenderFail();
        emitTelemetry(rect.width, rect.height, true);
      } else {
        emitTelemetry(
          rect.width || canvasWidth,
          rect.height || canvasHeight,
          false
        );
      }
    };

    const rafId = requestAnimationFrame(verifyBounds);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        if (observerRafId) cancelAnimationFrame(observerRafId);
        observerRafId = requestAnimationFrame(() => {
          for (const entry of entries) {
            const { width, height } = entry.contentRect;
            if (
              renderMode === 'standard' &&
              (width < 10 || height < 10) &&
              onContainerRenderFail
            ) {
              onContainerRenderFail();
            } else {
              const rect = entry.target.getBoundingClientRect();
              emitTelemetry(
                rect.width || width || canvasWidth,
                rect.height || height || canvasHeight,
                false
              );
            }
          }
        });
      });
      resizeObserver.observe(node);
    }

    return () => {
      cancelAnimationFrame(rafId);
      if (observerRafId) cancelAnimationFrame(observerRafId);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [
    story.id,
    story.titleShort,
    story.theme,
    canvasWidth,
    canvasHeight,
    renderMode,
    onCanvasMountChange,
    onContainerRenderFail,
  ]);

  // Official arka-acc.ir palette:
  // --primary: #062959 / #0b2b56
  // --accent: #08cdbd / #14dac3
  // --surface: #f5f8fa
  // --ink: #233b53
  const rootBgStyle = isPaperBg
    ? 'bg-[#f5f8fa] text-[#062959]'
    : isEmeraldBg
    ? 'bg-[#05232E] text-[#FFFFFF]'
    : 'bg-[#062959] text-[#FFFFFF]';

  const highlightColorClass = isPaperBg
    ? 'text-[#089f93]'
    : isEmeraldBg
    ? 'text-[#14dac3]'
    : 'text-[#14dac3]';

  const eyebrowColorClass = isPaperBg
    ? 'text-[#0b2b56]'
    : 'text-[#14dac3]';

  const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (!onAssetEvent) return;
    const img = e.currentTarget;
    onAssetEvent({
      src: img.getAttribute('src') || img.src,
      status: 'loaded',
      width: img.naturalWidth,
      height: img.naturalHeight,
    });
  };

  const handleImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (!onAssetEvent) return;
    const img = e.currentTarget;
    onAssetEvent({
      src: img.getAttribute('src') || img.src,
      status: 'error',
    });
  };

  const baseLogoHeight = isSquare ? 56 : isPortraitPost ? 64 : 74;
  const heightPx = Math.round(baseLogoHeight * logoScale);

  const renderLogo = () => {
    if (logoMode === 'custom' && customLogoUrl.trim()) {
      return (
        <div
          className={`inline-flex items-center px-4 py-2.5 rounded-2xl ${
            isPaperBg
              ? 'bg-[#062959] border border-[#0b2b56]'
              : 'bg-[#0b2b56] border border-white/15'
          }`}
        >
          <img
            src={customLogoUrl}
            alt="لوگوی گروه نرم‌افزاری آرکا"
            referrerPolicy="no-referrer"
            onLoad={handleImgLoad}
            onError={handleImgError}
            style={{ height: `${heightPx}px` }}
            className="w-auto max-w-[260px] object-contain"
            crossOrigin="anonymous"
          />
        </div>
      );
    }

    if (logoMode === 'official-badge') {
      return (
        <div className="inline-flex items-center gap-3.5">
          <img
            src="/arka-favicon-192.png"
            alt="نماد آرکا"
            referrerPolicy="no-referrer"
            onLoad={handleImgLoad}
            onError={handleImgError}
            style={{ height: `${heightPx}px`, width: `${heightPx}px` }}
            className="rounded-2xl object-contain shadow-md border border-white/15"
          />
          <div className="flex flex-col">
            <span
              className={`${
                isSquare ? 'text-[26px]' : 'text-[30px]'
              } font-black tracking-tight leading-tight ${
                isPaperBg ? 'text-[#062959]' : 'text-white'
              }`}
            >
              گروه نرم‌افزاری آرکــا
            </span>
            <span
              className={`${
                isSquare ? 'text-[17px]' : 'text-[19px]'
              } font-medium ${
                isPaperBg ? 'text-[#233b53]' : 'text-[#a4d2d1]'
              }`}
            >
              راهنمای هوشمند کسب‌وکار · arka-acc.ir
            </span>
          </div>
        </div>
      );
    }

    // Default: Official Header Logo from arka-acc.ir (/images/arka-header-logo.png)
    return (
      <div className="inline-flex items-center bg-[#062959] px-5 py-2.5 rounded-2xl border border-[#14dac3]/30 shadow-md">
        <img
          src="/images/arka-header-logo.png"
          alt="لوگوی رسمی نرم‌افزار حسابداری آرکا"
          referrerPolicy="no-referrer"
          onLoad={handleImgLoad}
          onError={handleImgError}
          style={{ height: `${heightPx}px` }}
          className="w-auto max-w-[300px] object-contain"
        />
      </div>
    );
  };

  // Responsive padding & typography based on 9:16 vs 4:5 vs 1:1
  const outerPaddingClass = isStory
    ? 'px-[72px] pt-[124px] pb-[108px]'
    : isPortraitPost
    ? 'px-[58px] pt-[52px] pb-[46px]'
    : 'px-[48px] pt-[40px] pb-[36px]';

  const headlineSizeClass = isStory
    ? 'text-[60px] leading-[1.26]'
    : isPortraitPost
    ? 'text-[46px] leading-[1.28]'
    : 'text-[38px] leading-[1.28]';

  const leadSizeClass = isStory
    ? 'mt-5 text-[28px] leading-[1.62]'
    : isPortraitPost
    ? 'mt-3.5 text-[22px] leading-[1.58]'
    : 'mt-2.5 text-[19px] leading-[1.52]';

  return (
    <div
      ref={(node) => {
        internalRef.current = node;
        if (canvasRef) {
          canvasRef.current = node;
        }
      }}
      data-story-canvas="true"
      data-story-id={story.id}
      dir="rtl"
      className={`relative select-none overflow-hidden flex flex-col justify-between ${outerPaddingClass} ${rootBgStyle}`}
      style={{
        width: `${canvasWidth}px`,
        height: `${canvasHeight}px`,
        fontFamily: "'Vazirmatn', Tahoma, system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Subtle Architectural Grid Lines */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.045]"
        style={{
          backgroundImage: isPaperBg
            ? 'linear-gradient(#062959 1px, transparent 1px), linear-gradient(90deg, #062959 1px, transparent 1px)'
            : 'linear-gradient(#FFFFFF 1px, transparent 1px), linear-gradient(90deg, #FFFFFF 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      {/* Official Arka Top Accent Bar (#08cdbd to #062959 or custom theme_accent) */}
      <div
        className="pointer-events-none absolute top-0 inset-x-0 h-[10px]"
        style={{
          background: story.customAccentHex
            ? `linear-gradient(to left, ${story.customAccentHex}, #14dac3, #0b2b56)`
            : 'linear-gradient(to left, #08cdbd, #14dac3, #0b2b56)',
        }}
      />

      {/* Seamless Carousel Visual Continuity Connector Strip on Left Edge */}
      {isCarousel &&
        carouselMeta &&
        carouselMeta.slideNumber < carouselMeta.totalSlides && (
          <div className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 z-30 flex items-center">
            <div className="bg-[#08cdbd] text-[#062959] px-3 py-6 rounded-r-2xl shadow-lg flex flex-col items-center gap-2 font-black text-[18px]">
              <ArrowLeft className="w-6 h-6" />
            </div>
          </div>
        )}

      {/* Optional Instagram Safe Zone Overlay (for 9:16 Story) */}
      {showSafeZoneGuides && isStory && (
        <div className="pointer-events-none absolute inset-0 z-50">
          <div className="h-[115px] w-full bg-rose-500/10 border-b-2 border-dashed border-rose-400/60 flex items-center justify-center text-[20px] font-bold text-rose-300">
            ناحیه امن بالای استوری اینستاگرام (۱۱۵ پیکسل)
          </div>
          <div className="absolute bottom-0 inset-x-0 h-[100px] bg-rose-500/10 border-t-2 border-dashed border-rose-400/60 flex items-center justify-center text-[20px] font-bold text-rose-300">
            ناحیه امن پایین استوری اینستاگرام (۱۰۰ پیکسل)
          </div>
        </div>
      )}

      {/* ==================== 1. HEADER ZONE ==================== */}
      <header
        className={`relative z-10 flex items-center justify-between gap-6 ${
          isSquare ? 'pb-3.5' : isPortraitPost ? 'pb-4' : 'pb-6'
        } border-b ${isPaperBg ? 'border-[#e3e9ed]' : 'border-white/12'}`}
      >
        {renderLogo()}

        <div className="flex flex-col items-end text-left">
          <div className="flex items-center gap-2">
            {isCarousel && carouselMeta && (
              <span className="text-[19px] font-black text-[#08cdbd] tabular-nums-fa">
                اسلاید {carouselMeta.slideNumber} از {carouselMeta.totalSlides} ·
              </span>
            )}
            <span
              className={`${
                isSquare ? 'text-[19px]' : 'text-[22px]'
              } font-bold tracking-tight ${
                isPaperBg ? 'text-[#062959]' : 'text-[#14dac3]'
              }`}
            >
              {story.categoryLabel}
            </span>
          </div>
          <span
            className={`${
              isSquare ? 'text-[16px]' : 'text-[19px]'
            } font-medium mt-0.5 ${
              isPaperBg ? 'text-[#7e8c9b]' : 'text-slate-300'
            }`}
          >
            {story.headerMeta}
          </span>
        </div>
      </header>

      {/* ==================== 2. HERO & VISUAL BODY ZONE ==================== */}
      <main
        className={`relative z-10 flex-1 flex flex-col justify-center ${
          isSquare ? 'my-3' : isPortraitPost ? 'my-4' : 'my-7'
        }`}
      >
        {/* Eyebrow matching arka-acc.ir .eyebrow */}
        <div
          className={`${
            isSquare ? 'text-[20px] mb-1.5' : isPortraitPost ? 'text-[23px] mb-2.5' : 'text-[26px] mb-3.5'
          } font-bold flex items-center gap-2.5 ${eyebrowColorClass}`}
        >
          <span>{story.eyebrow}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums-fa font-semibold opacity-85">arka-acc.ir</span>
        </div>

        {/* Main Headline */}
        <h1 className={`${headlineSizeClass} font-black tracking-tight headline-balance`}>
          {story.headlinePart1}{' '}
          <span
            className={highlightColorClass}
            style={story.customAccentHex ? { color: story.customAccentHex } : undefined}
          >
            {story.headlineHighlight}
          </span>{' '}
          {story.headlinePart2}
        </h1>

        {/* Lead Paragraph */}
        <p
          className={`${leadSizeClass} font-normal ${
            isPaperBg ? 'text-[#233b53]' : 'text-slate-200'
          }`}
        >
          {story.leadCopy}
        </p>

        {/* ========== LAYOUT 1: INTEGRATION FLOW ========== */}
        {story.layoutType === 'integration-flow' && (
          <div className={`${isSquare ? 'mt-3.5 gap-3' : isPortraitPost ? 'mt-5 gap-4' : 'mt-8 gap-5'} flex flex-col`}>
            {/* Trigger Invoice Bar */}
            <div
              className={`bg-white text-[#062959] rounded-[22px] ${
                isSquare ? 'p-4' : isPortraitPost ? 'p-5' : 'p-7'
              } border border-[#e3e9ed] shadow-lg flex items-center justify-between`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`${
                    isSquare ? 'w-12 h-12' : 'w-15 h-15'
                  } rounded-2xl bg-[#08cdbd] text-[#062959] flex items-center justify-center shrink-0`}
                >
                  <FileCheck2 className={isSquare ? 'w-7 h-7' : 'w-8 h-8'} />
                </div>
                <div>
                  <div className={`${isSquare ? 'text-[17px]' : 'text-[20px]'} font-bold text-[#089f93]`}>
                    رویداد پایه در هسته یکپارچه آرکا
                  </div>
                  <div
                    className={`${
                      isSquare ? 'text-[24px]' : isPortraitPost ? 'text-[28px]' : 'text-[33px]'
                    } font-black tracking-tight tabular-nums-fa text-[#062959]`}
                  >
                    {story.primaryStatValue}
                  </div>
                  <div className={`${isSquare ? 'text-[16px]' : 'text-[20px]'} text-[#233b53] tabular-nums-fa`}>
                    {story.primaryStatLabel}
                  </div>
                </div>
              </div>
              <div className="text-left shrink-0 pl-2">
                <span className="text-[17px] font-bold text-[#7e8c9b] block">وضعیت سند</span>
                <span className={`${isSquare ? 'text-[20px]' : 'text-[24px]'} font-black text-[#089f93]`}>
                  ثبت قطعی و آنی
                </span>
              </div>
            </div>

            {/* 2x2 Connected Modules Grid */}
            <div className={`grid grid-cols-2 ${isSquare ? 'gap-3' : 'gap-4'}`}>
              {story.items.slice(0, 4).map((item) => (
                <div
                  key={item.id}
                  className={`rounded-[22px] ${
                    isSquare ? 'p-4' : isPortraitPost ? 'p-5' : 'p-6'
                  } flex flex-col justify-between border ${
                    isPaperBg
                      ? 'bg-white text-[#062959] border-[#e3e9ed] shadow-sm'
                      : 'bg-[#0b2b56] text-white border-white/12'
                  }`}
                >
                  <div>
                    <div
                      className={`flex items-center justify-between ${
                        isSquare ? 'text-[16px] mb-1' : 'text-[19px] mb-2'
                      } font-bold tabular-nums-fa ${
                        isPaperBg ? 'text-[#089f93]' : 'text-[#14dac3]'
                      }`}
                    >
                      <span>{item.kicker}</span>
                      <span className={isPaperBg ? 'text-[#233b53]' : 'text-slate-300'}>
                        {item.metric}
                      </span>
                    </div>
                    <h3
                      className={`${
                        isSquare ? 'text-[22px]' : isPortraitPost ? 'text-[25px]' : 'text-[29px]'
                      } font-extrabold leading-snug mb-1`}
                    >
                      {item.title}
                    </h3>
                    <p
                      className={`${
                        isSquare ? 'text-[16px]' : isPortraitPost ? 'text-[19px]' : 'text-[22px]'
                      } leading-relaxed ${
                        isPaperBg ? 'text-[#233b53]' : 'text-slate-300'
                      }`}
                    >
                      {item.subtitle}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========== LAYOUT 2: BENTO COMPREHENSIVE ========== */}
        {story.layoutType === 'bento-comprehensive' && (
          <div className={`${isSquare ? 'mt-3.5 gap-3' : isPortraitPost ? 'mt-5 gap-4' : 'mt-7 gap-5'} flex flex-col`}>
            {/* Arka Navy Analytical Dashboard Card */}
            <div
              className={`bg-[#062959] text-white rounded-[24px] ${
                isSquare ? 'p-4' : isPortraitPost ? 'p-6' : 'p-7'
              } border border-[#0b2b56] shadow-lg`}
            >
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className={`${isSquare ? 'text-[17px]' : 'text-[20px]'} font-bold text-[#14dac3]`}>
                    داشبوردهای هوشمند مدیریتی · تراز سود و گردش کالا
                  </div>
                  <div
                    className={`${
                      isSquare ? 'text-[28px]' : isPortraitPost ? 'text-[34px]' : 'text-[42px]'
                    } font-black tabular-nums-fa mt-1 text-white`}
                  >
                    {story.primaryStatValue}
                  </div>
                  <div className={`${isSquare ? 'text-[16px]' : 'text-[20px]'} text-slate-300 mt-0.5`}>
                    {story.primaryStatLabel}
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <span className="text-[17px] text-slate-300 block">روند سود دوره</span>
                  <span className={`${isSquare ? 'text-[22px]' : 'text-[28px]'} font-black text-[#14dac3] tabular-nums-fa`}>
                    +۳۱.۴٪ رشد
                  </span>
                </div>
              </div>

              {!isSquare && (
                <div
                  className={`grid grid-cols-6 gap-3 items-end ${
                    isPortraitPost ? 'h-[82px] mt-4 pt-3' : 'h-[116px] mt-6 pt-4'
                  } border-t border-white/10`}
                >
                  {[
                    { label: 'فروردین', h: '48%' },
                    { label: 'اردیبهشت', h: '60%' },
                    { label: 'خرداد', h: '56%' },
                    { label: 'تیر', h: '74%' },
                    { label: 'مرداد', h: '86%' },
                    { label: 'شهریور', h: '100%' },
                  ].map((bar, i) => (
                    <div key={i} className="flex flex-col items-center justify-end h-full gap-1.5">
                      <div
                        className={`w-full rounded-t-lg ${
                          i === 5
                            ? 'bg-[#08cdbd] border-t-2 border-white'
                            : 'bg-[#08cdbd]/45 border-t-2 border-[#14dac3]'
                        }`}
                        style={{ height: bar.h }}
                      />
                      <span className="text-[16px] text-slate-300 font-medium">{bar.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2x2 Feature Cards */}
            <div className={`grid grid-cols-2 ${isSquare ? 'gap-3' : 'gap-4'}`}>
              {story.items.slice(0, 4).map((item) => (
                <div
                  key={item.id}
                  className={`bg-white border border-[#e3e9ed] rounded-[22px] ${
                    isSquare ? 'p-4' : isPortraitPost ? 'p-5' : 'p-6'
                  } shadow-sm flex flex-col justify-between text-[#062959]`}
                >
                  <div>
                    <div
                      className={`flex items-center justify-between ${
                        isSquare ? 'text-[16px] mb-1' : 'text-[19px] mb-2'
                      } font-bold text-[#089f93]`}
                    >
                      <span>{item.kicker}</span>
                      <span className="text-[#7e8c9b] font-semibold">{item.metric}</span>
                    </div>
                    <h3
                      className={`${
                        isSquare ? 'text-[21px]' : isPortraitPost ? 'text-[24px]' : 'text-[28px]'
                      } font-black text-[#062959] leading-snug mb-1`}
                    >
                      {item.title}
                    </h3>
                    <p
                      className={`${
                        isSquare ? 'text-[16px]' : isPortraitPost ? 'text-[18px]' : 'text-[22px]'
                      } text-[#233b53] leading-relaxed`}
                    >
                      {item.subtitle}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========== LAYOUT 3: MOADIAN TAX LEDGER ========== */}
        {story.layoutType === 'moadian-ledger' && (
          <div className={`${isSquare ? 'mt-3.5 gap-3' : isPortraitPost ? 'mt-5 gap-4' : 'mt-7 gap-5'} flex flex-col`}>
            {/* Electronic Tax Invoice Voucher */}
            <div
              className={`bg-white text-[#062959] rounded-[24px] ${
                isSquare ? 'p-4' : isPortraitPost ? 'p-5' : 'p-6'
              } border border-[#e3e9ed] shadow-xl flex items-center justify-between`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`${
                    isSquare ? 'w-12 h-12' : 'w-15 h-15'
                  } rounded-2xl bg-[#08cdbd] text-[#062959] flex items-center justify-center shrink-0`}
                >
                  <ShieldCheck className={isSquare ? 'w-7 h-7' : 'w-8 h-8'} />
                </div>
                <div>
                  <div className={`${isSquare ? 'text-[16px]' : 'text-[19px]'} font-bold text-[#089f93]`}>
                    گواهی ارسال مستقیم به کارپوشه سامانه مؤدیان
                  </div>
                  <div
                    className={`${
                      isSquare ? 'text-[22px]' : isPortraitPost ? 'text-[26px]' : 'text-[30px]'
                    } font-black tabular-nums-fa mt-0.5 text-[#062959]`}
                  >
                    {story.primaryStatValue}
                  </div>
                  <div className={`${isSquare ? 'text-[15px]' : 'text-[19px]'} text-[#233b53] mt-0.5`}>
                    {story.primaryStatLabel}
                  </div>
                </div>
              </div>
            </div>

            {/* 3 Verification Steps */}
            <div className={`flex flex-col ${isSquare ? 'gap-2.5' : 'gap-3.5'}`}>
              {story.items.slice(0, 3).map((item, idx) => (
                <div
                  key={item.id}
                  className={`rounded-[22px] ${
                    isSquare ? 'p-3.5' : isPortraitPost ? 'p-5' : 'p-6'
                  } flex items-start justify-between gap-4 border ${
                    isPaperBg
                      ? 'bg-white text-[#062959] border-[#e3e9ed]'
                      : 'bg-[#0b2b56] text-white border-[#14dac3]/25'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`${
                        isSquare ? 'w-10 h-10 text-[20px]' : 'w-13 h-13 text-[25px]'
                      } rounded-xl bg-[#08cdbd] text-[#062959] font-black flex items-center justify-center shrink-0 tabular-nums-fa mt-0.5`}
                    >
                      {idx + 1}
                    </div>
                    <div>
                      <div
                        className={`${
                          isSquare ? 'text-[15px]' : 'text-[18px]'
                        } font-bold ${isPaperBg ? 'text-[#089f93]' : 'text-[#14dac3]'}`}
                      >
                        {item.kicker}
                      </div>
                      <h3
                        className={`${
                          isSquare ? 'text-[21px]' : isPortraitPost ? 'text-[25px]' : 'text-[29px]'
                        } font-extrabold leading-snug`}
                      >
                        {item.title}
                      </h3>
                      <p
                        className={`${
                          isSquare ? 'text-[15px]' : isPortraitPost ? 'text-[18px]' : 'text-[22px]'
                        } mt-0.5 leading-relaxed ${
                          isPaperBg ? 'text-[#233b53]' : 'text-slate-300'
                        }`}
                      >
                        {item.subtitle}
                      </p>
                    </div>
                  </div>
                  <div className="text-left shrink-0 pt-1">
                    <span
                      className={`${
                        isSquare ? 'text-[16px]' : 'text-[20px]'
                      } font-bold text-[#08cdbd] block`}
                    >
                      {item.metric}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========== LAYOUT 4: DEMO 100 PROMO + 1 YEAR SUPPORT ========== */}
        {story.layoutType === 'demo-100-promo' && (
          <div className={`${isSquare ? 'mt-3.5 gap-3' : isPortraitPost ? 'mt-5 gap-4' : 'mt-7 gap-5'} flex flex-col`}>
            {/* Hero Offer Card with Giant Tabular 100 */}
            <div
              className={`bg-white text-[#062959] rounded-[28px] ${
                isSquare ? 'p-5' : isPortraitPost ? 'p-6' : 'p-8'
              } border-2 border-[#08cdbd] shadow-xl flex items-center justify-between gap-6`}
            >
              <div className="flex-1">
                <div className={`${isSquare ? 'text-[17px]' : 'text-[21px]'} font-bold text-[#089f93] mb-1`}>
                  دریافت مستقیم از arka-acc.ir/demo
                </div>
                <div
                  className={`${
                    isSquare ? 'text-[25px]' : isPortraitPost ? 'text-[30px]' : 'text-[36px]'
                  } font-black text-[#062959] leading-tight`}
                >
                  {story.primaryStatLabel}
                </div>
                <p
                  className={`${
                    isSquare ? 'text-[16px] mt-1.5' : 'text-[22px] mt-2.5'
                  } text-[#233b53] leading-relaxed`}
                >
                  کالاها را تعریف کنید، فاکتور بزنید و گزارش سود و انبار را با داده‌های واقعی کسب‌وکار خودتان بررسی کنید.
                </p>
              </div>
              <div
                className={`bg-[#062959] text-white rounded-[24px] ${
                  isSquare ? 'px-6 py-4' : isPortraitPost ? 'px-8 py-5' : 'px-9 py-6'
                } text-center shrink-0 border border-[#0b2b56]`}
              >
                <div
                  className={`${
                    isSquare ? 'text-[68px]' : isPortraitPost ? 'text-[88px]' : 'text-[112px]'
                  } font-black leading-none text-[#08cdbd] tabular-nums-fa`}
                >
                  {story.primaryStatValue}
                </div>
                <div className={`${isSquare ? 'text-[19px]' : 'text-[24px]'} font-bold text-white mt-1.5`}>
                  سند رایگان
                </div>
              </div>
            </div>

            {/* 1 Year Free Support Guarantee Banner */}
            <div
              className={`bg-[#08cdbd] text-[#062959] rounded-[24px] ${
                isSquare ? 'p-4' : isPortraitPost ? 'p-5' : 'p-6'
              } flex items-center justify-between gap-5 shadow-md`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`${
                    isSquare ? 'w-11 h-11' : 'w-14 h-14'
                  } rounded-2xl bg-[#062959] text-[#08cdbd] flex items-center justify-center shrink-0`}
                >
                  <ShieldCheck className={isSquare ? 'w-6 h-6' : 'w-8 h-8'} />
                </div>
                <div>
                  <h3
                    className={`${
                      isSquare ? 'text-[22px]' : isPortraitPost ? 'text-[26px]' : 'text-[31px]'
                    } font-black text-[#062959]`}
                  >
                    {story.secondaryBannerTitle}
                  </h3>
                  <p className={`${isSquare ? 'text-[16px]' : 'text-[21px]'} text-[#073e46] font-medium mt-0.5`}>
                    {story.secondaryBannerSub}
                  </p>
                </div>
              </div>
            </div>

            {/* 2 Bottom Cards */}
            <div className={`grid grid-cols-2 ${isSquare ? 'gap-3' : 'gap-4'}`}>
              {story.items.slice(0, 2).map((item) => (
                <div
                  key={item.id}
                  className={`rounded-[22px] ${
                    isSquare ? 'p-4' : isPortraitPost ? 'p-5' : 'p-6'
                  } border ${
                    isPaperBg
                      ? 'bg-white text-[#062959] border-[#e3e9ed]'
                      : 'bg-[#0b2b56] text-white border-white/12'
                  }`}
                >
                  <div className="flex items-center justify-between text-[18px] font-bold text-[#14dac3] mb-1">
                    <span>{item.kicker}</span>
                    <span>{item.metric}</span>
                  </div>
                  <h4
                    className={`${
                      isSquare ? 'text-[21px]' : isPortraitPost ? 'text-[24px]' : 'text-[28px]'
                    } font-extrabold mb-1`}
                  >
                    {item.title}
                  </h4>
                  <p
                    className={`${
                      isSquare ? 'text-[16px]' : 'text-[20px]'
                    } leading-relaxed ${isPaperBg ? 'text-[#233b53]' : 'text-slate-300'}`}
                  >
                    {item.subtitle}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========== LAYOUT 5: CASE STUDY PROOF ========== */}
        {story.layoutType === 'case-study-proof' && (
          <div className={`${isSquare ? 'mt-3.5 gap-3' : isPortraitPost ? 'mt-5 gap-4' : 'mt-7 gap-5'} flex flex-col`}>
            {/* Client Spotlight Header Card */}
            <div
              className={`bg-[#062959] text-white rounded-[24px] ${
                isSquare ? 'p-4' : isPortraitPost ? 'p-5' : 'p-7'
              } border border-[#0b2b56] flex items-center justify-between`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`${
                    isSquare ? 'w-12 h-12' : 'w-15 h-15'
                  } rounded-2xl bg-[#08cdbd] text-[#062959] flex items-center justify-center shrink-0`}
                >
                  <Building2 className={isSquare ? 'w-7 h-7' : 'w-8 h-8'} />
                </div>
                <div>
                  <div className={`${isSquare ? 'text-[16px]' : 'text-[19px]'} font-bold text-[#14dac3]`}>
                    مطالعه موردی ثبت‌شده در سایت آرکا
                  </div>
                  <div
                    className={`${
                      isSquare ? 'text-[25px]' : isPortraitPost ? 'text-[30px]' : 'text-[34px]'
                    } font-black mt-0.5`}
                  >
                    {story.primaryStatValue}
                  </div>
                  <div className={`${isSquare ? 'text-[16px]' : 'text-[20px]'} text-slate-300 mt-0.5`}>
                    {story.primaryStatLabel}
                  </div>
                </div>
              </div>
            </div>

            {/* 3-Step Before -> Solution -> Outcome Chain */}
            <div className={`flex flex-col ${isSquare ? 'gap-2.5' : 'gap-3.5'}`}>
              {story.items.slice(0, 3).map((item, idx) => (
                <div
                  key={item.id}
                  className={`rounded-[22px] ${
                    isSquare ? 'p-3.5' : isPortraitPost ? 'p-5' : 'p-6'
                  } border flex items-start justify-between gap-4 ${
                    idx === 2
                      ? 'bg-[#08cdbd] text-[#062959] border-[#08cdbd]'
                      : 'bg-white text-[#062959] border-[#e3e9ed]'
                  }`}
                >
                  <div>
                    <div
                      className={`${
                        isSquare ? 'text-[15px]' : 'text-[18px]'
                      } font-bold mb-0.5 ${
                        idx === 2 ? 'text-[#062959]' : 'text-[#089f93]'
                      }`}
                    >
                      {item.kicker}
                    </div>
                    <h3
                      className={`${
                        isSquare ? 'text-[21px]' : isPortraitPost ? 'text-[25px]' : 'text-[29px]'
                      } font-black leading-snug`}
                    >
                      {item.title}
                    </h3>
                    <p
                      className={`${
                        isSquare ? 'text-[15px]' : isPortraitPost ? 'text-[18px]' : 'text-[22px]'
                      } mt-1 leading-relaxed text-[#233b53]`}
                    >
                      {item.subtitle}
                    </p>
                  </div>
                  <div className="shrink-0 text-left">
                    <span
                      className={`${
                        isSquare ? 'text-[16px]' : 'text-[19px]'
                      } font-extrabold tabular-nums-fa text-[#062959]`}
                    >
                      {item.metric}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========== LAYOUT 6: ECOSYSTEM & DIRECT CTA ========== */}
        {story.layoutType === 'ecosystem-cta' && (
          <div className={`${isSquare ? 'mt-3.5 gap-3' : isPortraitPost ? 'mt-5 gap-4' : 'mt-7 gap-5'} flex flex-col`}>
            {/* 2x2 Product Suite Cards */}
            <div className={`grid grid-cols-2 ${isSquare ? 'gap-3' : 'gap-4'}`}>
              {story.items.slice(0, 4).map((item, idx) => (
                <div
                  key={item.id}
                  className={`rounded-[22px] ${
                    isSquare ? 'p-3.5' : isPortraitPost ? 'p-5' : 'p-6'
                  } border ${
                    idx === 0
                      ? 'bg-white text-[#062959] border-[#08cdbd]'
                      : isPaperBg
                      ? 'bg-white text-[#062959] border-[#e3e9ed]'
                      : 'bg-[#0b2b56] text-white border-white/12'
                  }`}
                >
                  <div
                    className={`flex items-center justify-between ${
                      isSquare ? 'text-[15px] mb-1' : 'text-[18px] mb-1.5'
                    } font-bold ${
                      idx === 0 || isPaperBg ? 'text-[#089f93]' : 'text-[#14dac3]'
                    }`}
                  >
                    <span>{item.kicker}</span>
                    <span>{item.metric}</span>
                  </div>
                  <h3
                    className={`${
                      isSquare ? 'text-[20px]' : isPortraitPost ? 'text-[23px]' : 'text-[27px]'
                    } font-black leading-snug mb-1`}
                  >
                    {item.title}
                  </h3>
                  <p
                    className={`${
                      isSquare ? 'text-[15px]' : isPortraitPost ? 'text-[18px]' : 'text-[21px]'
                    } leading-relaxed ${
                      idx === 0 || isPaperBg ? 'text-[#233b53]' : 'text-slate-300'
                    }`}
                  >
                    {item.subtitle}
                  </p>
                </div>
              ))}
            </div>

            {/* Direct Contact & Consultation Center Box */}
            <div
              className={`bg-[#08cdbd] text-[#062959] rounded-[26px] ${
                isSquare ? 'p-4' : isPortraitPost ? 'p-6' : 'p-7'
              } shadow-xl flex items-center justify-between`}
            >
              <div>
                <div
                  className={`${
                    isSquare ? 'text-[17px]' : 'text-[21px]'
                  } font-bold text-[#073e46] flex items-center gap-2`}
                >
                  <PhoneCall className="w-5 h-5" />
                  <span>دریافت مشاوره تخصصی رایگان و نسخه دمو (۱۰۰ سند)</span>
                </div>
                <div
                  dir="ltr"
                  className={`${
                    isSquare ? 'text-[38px]' : isPortraitPost ? 'text-[46px]' : 'text-[54px]'
                  } font-black tracking-wider text-[#062959] tabular-nums-fa text-right mt-0.5`}
                >
                  {story.phoneNumber}
                </div>
                <div className={`${isSquare ? 'text-[16px]' : 'text-[20px]'} text-[#073e46] font-semibold mt-0.5`}>
                  {story.primaryStatLabel}
                </div>
              </div>
              <div
                className={`${
                  isSquare ? 'w-14 h-14' : 'w-18 h-18'
                } rounded-2xl bg-[#062959] text-[#08cdbd] flex items-center justify-center shrink-0`}
              >
                <Download className={isSquare ? 'w-7 h-7' : 'w-9 h-9'} />
              </div>
            </div>
          </div>
        )}

        {/* ========== INSTAGRAM STICKER (STORY) OR CAROUSEL SWIPE BAR ========== */}
        {isStory && showStickerPlaceholder && (
          <div
            className={`mt-5 rounded-[22px] px-6 py-4 border-2 border-dashed flex items-center justify-between ${
              isPaperBg
                ? 'bg-[#062959]/5 border-[#08cdbd] text-[#062959]'
                : 'bg-white/5 border-[#14dac3]/55 text-white'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-[#08cdbd] text-[#062959] flex items-center justify-center shrink-0">
                <ArrowUpLeft className="w-6 h-6" />
              </div>
              <div>
                <div
                  className={`text-[18px] font-bold ${
                    isPaperBg ? 'text-[#089f93]' : 'text-[#14dac3]'
                  }`}
                >
                  جایگاه استیکر تعاملی اینستاگرام ({story.stickerGuide.stickerType})
                </div>
                <div className="text-[23px] font-extrabold mt-0.5">
                  {story.stickerGuide.stickerTitle}
                </div>
              </div>
            </div>
            <div
              dir="ltr"
              className="text-[20px] font-black px-4 py-2 rounded-xl tabular-nums-fa bg-[#08cdbd] text-[#062959]"
            >
              {story.stickerGuide.stickerActionText}
            </div>
          </div>
        )}

        {isCarousel && carouselMeta && (
          <div
            className={`${
              isSquare ? 'mt-3 py-2.5 px-4' : 'mt-4 py-3.5 px-5'
            } rounded-[18px] flex items-center justify-between ${
              isPaperBg
                ? 'bg-[#062959] text-white'
                : 'bg-white/10 border border-white/15 text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              {Array.from({ length: carouselMeta.totalSlides }).map((_, idx) => (
                <span
                  key={idx}
                  className={`h-2.5 rounded-full transition-all ${
                    idx + 1 === carouselMeta.slideNumber
                      ? 'w-10 bg-[#08cdbd]'
                      : 'w-2.5 bg-white/30'
                  }`}
                />
              ))}
              <span className="text-[17px] font-bold text-slate-300 mr-2 tabular-nums-fa">
                {carouselMeta.deckTitle}
              </span>
            </div>

            {carouselMeta.slideNumber < carouselMeta.totalSlides ? (
              <div className="inline-flex items-center gap-2 text-[19px] font-black text-[#14dac3]">
                <span>ورق بزنید (اسلاید بعدی)</span>
                <ArrowLeft className="w-5 h-5" />
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 text-[19px] font-black text-[#14dac3]">
                <BookmarkCheck className="w-5 h-5" />
                <span>ذخیره کنید · دریافت دمو در arka-acc.ir</span>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ==================== 3. FOOTER ZONE ==================== */}
      <footer
        className={`relative z-10 ${
          isSquare ? 'pt-3 text-[18px]' : isPortraitPost ? 'pt-4 text-[20px]' : 'pt-5 text-[23px]'
        } border-t ${
          isPaperBg ? 'border-[#e3e9ed]' : 'border-white/15'
        } flex items-center justify-between font-bold`}
      >
        <div className="flex items-center gap-2.5 truncate">
          <Layers className="w-6 h-6 text-[#08cdbd] shrink-0" />
          <span className="truncate">{story.footerRight}</span>
        </div>

        <div className="flex items-center gap-4 tabular-nums-fa shrink-0">
          <span dir="ltr" className="font-extrabold opacity-90">
            {story.phoneNumber}
          </span>
          <span aria-hidden="true">·</span>
          <span
            dir="ltr"
            className={`inline-flex items-center gap-1.5 font-black ${
              isPaperBg ? 'text-[#089f93]' : 'text-[#14dac3]'
            }`}
          >
            <Globe className="w-5 h-5" />
            {story.footerLeft}
          </span>
        </div>
      </footer>
    </div>
  );
};

interface IsolatedStoryCanvasViewportProps {
  story: ArkaStoryData;
  formatSpec: CanvasFormatSpec;
  carouselMeta?: CarouselSlideMeta;
  logoMode: LogoDisplayMode;
  customLogoUrl: string;
  logoScale: number;
  showSafeZoneGuides: boolean;
  showStickerPlaceholder: boolean;
  previewScale: number;
  isolationMode: CanvasIsolationMode;
  onSwitchIsolationMode: (mode: CanvasIsolationMode) => void;
  onCanvasMountChange?: (event: StoryCanvasMountEvent) => void;
  onAssetEvent?: (event: StoryCanvasAssetEvent) => void;
}

/**
 * IsolatedStoryCanvasViewport:
 * Supports both Standard Container CSS-Scale Rendering (monitored via ResizeObserver)
 * and an Iframe-Style Isolation Mode (using a same-origin iframe + React Portal with
 * cloned stylesheets and Vazirmatn fonts) that guarantees pixel-accurate rendering
 * even if parent flex/grid containers encounter layout anomalies in Studio preview.
 */
export const IsolatedStoryCanvasViewport: React.FC<
  IsolatedStoryCanvasViewportProps
> = ({
  story,
  formatSpec,
  carouselMeta,
  logoMode,
  customLogoUrl,
  logoScale,
  showSafeZoneGuides,
  showStickerPlaceholder,
  previewScale,
  isolationMode,
  onSwitchIsolationMode,
  onCanvasMountChange,
  onAssetEvent,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeMountNode, setIframeMountNode] = useState<HTMLElement | null>(
    null
  );

  const scaledWidth = Math.max(120, Math.round(formatSpec.width * previewScale));
  const scaledHeight = Math.max(
    120,
    Math.round(formatSpec.height * previewScale)
  );

  const syncHostStylesIntoIframe = useCallback((doc: Document) => {
    doc.documentElement.dir = 'rtl';
    doc.documentElement.lang = 'fa';
    doc.head.innerHTML = '';

    // Copy all <link rel="stylesheet"> and <style> elements from main document head
    const styleNodes = document.head.querySelectorAll(
      'style, link[rel="stylesheet"], link[href*="Vazirmatn"]'
    );
    styleNodes.forEach((node) => {
      doc.head.appendChild(node.cloneNode(true));
    });

    const baseReset = doc.createElement('style');
    baseReset.textContent = `
      html, body {
        margin: 0;
        padding: 0;
        overflow: hidden;
        background: #062959;
        font-family: 'Vazirmatn', Tahoma, system-ui, sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      .tabular-nums-fa {
        font-variant-numeric: tabular-nums;
      }
    `;
    doc.head.appendChild(baseReset);
  }, []);

  useEffect(() => {
    if (isolationMode !== 'iframe-isolated') {
      setIframeMountNode(null);
      return;
    }

    const iframe = iframeRef.current;
    if (!iframe) return;

    const setupIframePortal = () => {
      const doc = iframe.contentDocument;
      if (!doc || !doc.body) return;

      syncHostStylesIntoIframe(doc);
      let rootEl = doc.getElementById('arka-isolated-canvas-root');
      if (!rootEl) {
        rootEl = doc.createElement('div');
        rootEl.id = 'arka-isolated-canvas-root';
        doc.body.innerHTML = '';
        doc.body.appendChild(rootEl);
      }
      setIframeMountNode(rootEl);
    };

    if (iframe.contentDocument?.readyState === 'complete') {
      setupIframePortal();
    } else {
      iframe.addEventListener('load', setupIframePortal);
      return () => iframe.removeEventListener('load', setupIframePortal);
    }
  }, [isolationMode, syncHostStylesIntoIframe]);

  // Also observe <style> additions in document.head while in iframe mode (e.g., Vite style injection)
  useEffect(() => {
    if (isolationMode !== 'iframe-isolated') return;
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;

    const headObserver = new MutationObserver(() => {
      if (iframe.contentDocument) {
        syncHostStylesIntoIframe(iframe.contentDocument);
      }
    });
    headObserver.observe(document.head, { childList: true, subtree: true });
    return () => headObserver.disconnect();
  }, [isolationMode, syncHostStylesIntoIframe]);

  const handleContainerRenderFail = useCallback(() => {
    if (isolationMode === 'standard') {
      onSwitchIsolationMode('iframe-isolated');
    }
  }, [isolationMode, onSwitchIsolationMode]);

  if (isolationMode === 'iframe-isolated') {
    return (
      <div
        className="overflow-hidden rounded-[22px] shadow-2xl border-2 border-[#14dac3] relative bg-[#062959] mx-auto"
        style={{
          width: `${scaledWidth}px`,
          height: `${scaledHeight}px`,
        }}
      >
        <iframe
          ref={iframeRef}
          title="پیش‌نمایش ایزوله بوم آرکا"
          className="w-full h-full border-0 block bg-[#062959]"
          style={{
            width: `${scaledWidth}px`,
            height: `${scaledHeight}px`,
          }}
        />
        {iframeMountNode &&
          createPortal(
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                transform: `scale(${previewScale})`,
                transformOrigin: 'top left',
                width: `${formatSpec.width}px`,
                height: `${formatSpec.height}px`,
              }}
            >
              <StoryCanvas
                story={story}
                formatSpec={formatSpec}
                carouselMeta={carouselMeta}
                logoMode={logoMode}
                customLogoUrl={customLogoUrl}
                logoScale={logoScale}
                showSafeZoneGuides={showSafeZoneGuides}
                showStickerPlaceholder={showStickerPlaceholder}
                renderMode="iframe-isolated"
                onCanvasMountChange={onCanvasMountChange}
                onAssetEvent={onAssetEvent}
              />
            </div>,
            iframeMountNode
          )}
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-[22px] shadow-2xl border-2 border-[#08cdbd]/40 relative bg-[#062959] mx-auto"
      style={{
        width: `${scaledWidth}px`,
        height: `${scaledHeight}px`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transform: `scale(${previewScale})`,
          transformOrigin: 'top left',
          width: `${formatSpec.width}px`,
          height: `${formatSpec.height}px`,
        }}
      >
        <StoryCanvas
          story={story}
          formatSpec={formatSpec}
          carouselMeta={carouselMeta}
          logoMode={logoMode}
          customLogoUrl={customLogoUrl}
          logoScale={logoScale}
          showSafeZoneGuides={showSafeZoneGuides}
          showStickerPlaceholder={showStickerPlaceholder}
          renderMode="standard"
          onCanvasMountChange={onCanvasMountChange}
          onAssetEvent={onAssetEvent}
          onContainerRenderFail={handleContainerRenderFail}
        />
      </div>
    </div>
  );
};

