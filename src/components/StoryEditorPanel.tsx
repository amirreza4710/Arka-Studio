import React, { useState } from 'react';
import {
  ArkaStoryData,
  StoryThemeMode,
  ARKA_SITE_CATALOG,
  ArkaSiteProductTemplate,
} from '../data/arkaStories';
import { CampaignPreset } from '../data/campaignPresets';
import { LogoDisplayMode } from './StoryCanvas';
import {
  Type,
  Palette,
  Layers,
  Share2,
  Upload,
  RotateCcw,
  Copy,
  Check,
  Eye,
  Sparkles,
  Bookmark,
  Plus,
  Trash2,
  RefreshCw,
  Database,
} from 'lucide-react';

interface StoryEditorPanelProps {
  story: ArkaStoryData;
  onUpdateStory: (updated: ArkaStoryData) => void;
  logoMode: LogoDisplayMode;
  onChangeLogoMode: (mode: LogoDisplayMode) => void;
  customLogoUrl: string;
  onChangeCustomLogoUrl: (url: string) => void;
  logoScale: number;
  onChangeLogoScale: (scale: number) => void;
  showSafeZoneGuides: boolean;
  onToggleSafeZoneGuides: () => void;
  showStickerPlaceholder: boolean;
  onToggleStickerPlaceholder: () => void;
  onResetCurrentStory: () => void;
  presets: CampaignPreset[];
  activePresetId: string;
  onSelectPreset: (preset: CampaignPreset) => void;
  onSaveNewPreset: (name: string, description: string) => void;
  onUpdateExistingPreset: (presetId: string) => void;
  onDeletePreset: (presetId: string) => void;
  carouselCaption?: string;
}

type EditorTab = 'content' | 'catalog' | 'cards' | 'style' | 'presets' | 'instagram';

export const StoryEditorPanel: React.FC<StoryEditorPanelProps> = ({
  story,
  onUpdateStory,
  logoMode,
  onChangeLogoMode,
  customLogoUrl,
  onChangeCustomLogoUrl,
  logoScale,
  onChangeLogoScale,
  showSafeZoneGuides,
  onToggleSafeZoneGuides,
  showStickerPlaceholder,
  onToggleStickerPlaceholder,
  onResetCurrentStory,
  presets,
  activePresetId,
  onSelectPreset,
  onSaveNewPreset,
  onUpdateExistingPreset,
  onDeletePreset,
  carouselCaption,
}) => {
  const [activeTab, setActiveTab] = useState<EditorTab>('content');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [newPresetName, setNewPresetName] = useState<string>('');
  const [newPresetDesc, setNewPresetDesc] = useState<string>('');

  const handleFieldChange = <K extends keyof ArkaStoryData>(
    key: K,
    value: ArkaStoryData[K]
  ) => {
    onUpdateStory({
      ...story,
      [key]: value,
    });
  };

  const handleCardItemChange = (
    itemId: string,
    field: 'kicker' | 'title' | 'subtitle' | 'metric',
    value: string
  ) => {
    onUpdateStory({
      ...story,
      items: story.items.map((item) =>
        item.id === itemId ? { ...item, [field]: value } : item
      ),
    });
  };

  const handleApplySiteProductTemplate = (tpl: ArkaSiteProductTemplate) => {
    onUpdateStory({
      ...story,
      categoryLabel: tpl.badge,
      headerMeta: tpl.group,
      eyebrow: tpl.eyebrow,
      headlinePart1: tpl.headlinePart1,
      headlineHighlight: tpl.headlineHighlight,
      headlinePart2: tpl.headlinePart2,
      leadCopy: tpl.leadCopy,
      primaryStatValue: tpl.primaryStatValue,
      primaryStatLabel: tpl.primaryStatLabel,
      items: story.items.map((item, idx) => {
        const match = tpl.highlights[idx];
        if (!match) return item;
        return {
          ...item,
          title: match.title,
          subtitle: match.subtitle,
          metric: match.metric,
        };
      }),
    });
  };

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === 'string') {
        onChangeCustomLogoUrl(ev.target.result);
        onChangeLogoMode('custom');
      }
    };
    reader.readAsDataURL(file);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const handleCreatePresetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPresetName.trim();
    if (!trimmed) return;
    onSaveNewPreset(
      trimmed,
      newPresetDesc.trim() || 'تنظیمات سفارشی متن، رنگ و لوگوی ذخیره شده توسط کاربر'
    );
    setNewPresetName('');
    setNewPresetDesc('');
  };

  const themes: { id: StoryThemeMode; title: string; desc: string; swatch: string }[] = [
    {
      id: 'navy-paper',
      title: 'تم رسمی سرمه‌ای و فیروزه‌ای سایت آرکا (#062959 + #08cdbd)',
      desc: 'رنگ سازمانی اصلی سایت arka-acc.ir با کارت‌های روشن و کنتراست بالا',
      swatch: 'bg-[#062959] border-[#08cdbd]',
    },
    {
      id: 'paper-navy',
      title: 'تم روشن سایت آرکا (#f5f8fa + کارت سرمه‌ای #062959)',
      desc: 'مشابه بخش‌های روشن صفحه اصلی سایت آرکا، مناسب جداول و داشبورد',
      swatch: 'bg-[#f5f8fa] border-[#062959]',
    },
    {
      id: 'emerald-tax',
      title: 'تم ویژه سامانه مؤدیان و خدمات ابری (#05232E + #14dac3)',
      desc: 'ترکیب سرمه‌ای-تیل عمیق و فیروزه‌ای درخشان ویژه کمپین‌های مالیاتی',
      swatch: 'bg-[#05232E] border-[#14dac3]',
    },
  ];

  return (
    <aside className="w-full lg:w-[435px] shrink-0 bg-white border border-[#e3e9ed] rounded-[20px] shadow-sm flex flex-col overflow-hidden text-[#233b53]">
      {/* Editor Top Header in Official Arka Navy */}
      <div className="px-5 py-4 bg-[#062959] text-white flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black text-white">
            پنل تنظیمات و ویرایش زنده (آیتم {story.order})
          </h2>
          <p className="text-xs text-[#a4d2d1] mt-0.5">{story.titleShort}</p>
        </div>
        <button
          type="button"
          onClick={onResetCurrentStory}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#062959] bg-[#08cdbd] hover:bg-[#14dac3] rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          title="بازگردانی متن به حالت استاندارد سایت آرکا"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>بازنشانی</span>
        </button>
      </div>

      {/* Segmented Control Tabs */}
      <div className="p-2 bg-[#f5f8fa] border-b border-[#e3e9ed] grid grid-cols-6 gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('content')}
          className={`flex items-center justify-center gap-1 py-2 px-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'content'
              ? 'bg-[#062959] text-white shadow-sm'
              : 'text-[#233b53] hover:bg-white'
          }`}
        >
          <Type className="w-3.5 h-3.5 shrink-0" />
          <span>متن</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('catalog')}
          className={`flex items-center justify-center gap-1 py-2 px-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'catalog'
              ? 'bg-[#062959] text-white shadow-sm'
              : 'text-[#233b53] hover:bg-white'
          }`}
        >
          <Database className="w-3.5 h-3.5 shrink-0" />
          <span>داده سایت</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cards')}
          className={`flex items-center justify-center gap-1 py-2 px-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'cards'
              ? 'bg-[#062959] text-white shadow-sm'
              : 'text-[#233b53] hover:bg-white'
          }`}
        >
          <Layers className="w-3.5 h-3.5 shrink-0" />
          <span>کارت‌ها</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('style')}
          className={`flex items-center justify-center gap-1 py-2 px-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'style'
              ? 'bg-[#062959] text-white shadow-sm'
              : 'text-[#233b53] hover:bg-white'
          }`}
        >
          <Palette className="w-3.5 h-3.5 shrink-0" />
          <span>رنگ/لوگو</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('presets')}
          className={`flex items-center justify-center gap-1 py-2 px-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'presets'
              ? 'bg-[#062959] text-white shadow-sm'
              : 'text-[#233b53] hover:bg-white'
          }`}
        >
          <Bookmark className="w-3.5 h-3.5 shrink-0" />
          <span>پروفایل</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('instagram')}
          className={`flex items-center justify-center gap-1 py-2 px-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'instagram'
              ? 'bg-[#062959] text-white shadow-sm'
              : 'text-[#233b53] hover:bg-white'
          }`}
        >
          <Share2 className="w-3.5 h-3.5 shrink-0" />
          <span>کپشن</span>
        </button>
      </div>

      {/* Tab Body */}
      <div className="p-5 space-y-4 overflow-y-auto max-h-[700px]">
        {activeTab === 'content' && (
          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-[#062959] mb-1">
                روتیتر (Eyebrow)
              </label>
              <input
                type="text"
                value={story.eyebrow}
                onChange={(e) => handleFieldChange('eyebrow', e.target.value)}
                className="w-full bg-[#f5f8fa] border border-[#e3e9ed] focus:border-[#08cdbd] rounded-xl px-3 py-2 text-sm text-[#062959] outline-none transition-colors"
              />
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#062959] mb-1">
                  بخش اول تیتر اصلی
                </label>
                <input
                  type="text"
                  value={story.headlinePart1}
                  onChange={(e) => handleFieldChange('headlinePart1', e.target.value)}
                  className="w-full bg-[#f5f8fa] border border-[#e3e9ed] focus:border-[#08cdbd] rounded-xl px-3 py-2 text-sm text-[#062959] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#089f93] mb-1">
                  بخش تاکید رنگی تیتر (Highlight)
                </label>
                <input
                  type="text"
                  value={story.headlineHighlight}
                  onChange={(e) =>
                    handleFieldChange('headlineHighlight', e.target.value)
                  }
                  className="w-full bg-[#e5fbf9] border border-[#08cdbd] rounded-xl px-3 py-2 text-sm text-[#062959] font-extrabold outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#062959] mb-1">
                  ادامه تیتر اصلی
                </label>
                <input
                  type="text"
                  value={story.headlinePart2}
                  onChange={(e) => handleFieldChange('headlinePart2', e.target.value)}
                  className="w-full bg-[#f5f8fa] border border-[#e3e9ed] focus:border-[#08cdbd] rounded-xl px-3 py-2 text-sm text-[#062959] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#062959] mb-1">
                توضیح زیر تیتر (Lead Copy)
              </label>
              <textarea
                rows={3}
                value={story.leadCopy}
                onChange={(e) => handleFieldChange('leadCopy', e.target.value)}
                className="w-full bg-[#f5f8fa] border border-[#e3e9ed] focus:border-[#08cdbd] rounded-xl px-3 py-2 text-sm text-[#233b53] outline-none leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 pt-2 border-t border-[#e3e9ed]">
              <div>
                <label className="block text-xs font-bold text-[#062959] mb-1">
                  مقدار یا شاخص کلیدی کارت اصلی
                </label>
                <input
                  type="text"
                  value={story.primaryStatValue || ''}
                  onChange={(e) =>
                    handleFieldChange('primaryStatValue', e.target.value)
                  }
                  className="w-full bg-[#f5f8fa] border border-[#e3e9ed] focus:border-[#08cdbd] rounded-xl px-3 py-2 text-sm text-[#062959] font-bold outline-none tabular-nums-fa"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#062959] mb-1">
                  زیرنویس شاخص کلیدی
                </label>
                <input
                  type="text"
                  value={story.primaryStatLabel || ''}
                  onChange={(e) =>
                    handleFieldChange('primaryStatLabel', e.target.value)
                  }
                  className="w-full bg-[#f5f8fa] border border-[#e3e9ed] focus:border-[#08cdbd] rounded-xl px-3 py-2 text-sm text-[#233b53] outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#e3e9ed]">
              <div>
                <label className="block text-xs font-bold text-[#062959] mb-1">
                  شماره تماس سراسری آرکا
                </label>
                <input
                  dir="ltr"
                  type="text"
                  value={story.phoneNumber}
                  onChange={(e) => handleFieldChange('phoneNumber', e.target.value)}
                  className="w-full bg-[#f5f8fa] border border-[#e3e9ed] focus:border-[#08cdbd] rounded-xl px-3 py-2 text-sm text-[#062959] font-bold outline-none text-left tabular-nums-fa"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#062959] mb-1">
                  آدرس وب‌سایت
                </label>
                <input
                  dir="ltr"
                  type="text"
                  value={story.footerLeft}
                  onChange={(e) => handleFieldChange('footerLeft', e.target.value)}
                  className="w-full bg-[#f5f8fa] border border-[#e3e9ed] focus:border-[#08cdbd] rounded-xl px-3 py-2 text-sm text-[#062959] font-bold outline-none text-left"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#062959] mb-1">
                شعار پایین بوم (Footer)
              </label>
              <input
                type="text"
                value={story.footerRight}
                onChange={(e) => handleFieldChange('footerRight', e.target.value)}
                className="w-full bg-[#f5f8fa] border border-[#e3e9ed] focus:border-[#08cdbd] rounded-xl px-3 py-2 text-sm text-[#233b53] outline-none"
              />
            </div>
          </div>
        )}

        {/* ========== TAB 2: OFFICIAL SITE DATA INJECTOR ========== */}
        {activeTab === 'catalog' && (
          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-[#e5fbf9] border border-[#08cdbd]/50 text-xs text-[#062959] leading-relaxed">
              <strong className="font-extrabold block mb-1">
                بانک داده‌های زنده سایت arka-acc.ir:
              </strong>
              با کلیک روی هر یک از سیستم‌ها یا ماژول‌های رسمی زیر، محتوای اسلاید/استوری فعلی به‌صورت خودکار با اطلاعات دقیق همان محصول در سایت آرکا پر می‌شود.
            </div>

            <div className="space-y-2.5">
              {ARKA_SITE_CATALOG.map((tpl) => (
                <div
                  key={tpl.id}
                  className="p-3.5 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] hover:border-[#08cdbd] transition-all space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-[#089f93]">
                      {tpl.group} · {tpl.badge}
                    </span>
                  </div>
                  <h3 className="text-xs font-black text-[#062959]">
                    {tpl.name}
                  </h3>
                  <p className="text-[11px] text-[#7e8c9b] line-clamp-2 leading-relaxed">
                    {tpl.leadCopy}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleApplySiteProductTemplate(tpl)}
                    className="w-full py-1.5 px-3 rounded-lg bg-[#062959] hover:bg-[#0b2b56] text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    جایگذاری داده‌های این محصول در بوم فعلی
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'cards' && (
          <div className="space-y-3.5">
            <p className="text-xs text-[#7e8c9b]">
              عنوان، توضیح و شاخص هر یک از کارت‌های داخل این بوم را می‌توانید مستقیماً ویرایش کنید:
            </p>
            {story.items.map((item, idx) => (
              <div
                key={item.id}
                className="p-3.5 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] space-y-2"
              >
                <div className="flex items-center justify-between text-xs font-bold text-[#062959]">
                  <span>کارت {idx + 1}</span>
                  <input
                    type="text"
                    value={item.metric || ''}
                    onChange={(e) =>
                      handleCardItemChange(item.id, 'metric', e.target.value)
                    }
                    placeholder="شاخص کوتاه"
                    className="w-28 bg-white border border-[#e3e9ed] rounded-lg px-2 py-1 text-xs text-[#062959] font-semibold text-left"
                  />
                </div>
                <input
                  type="text"
                  value={item.title}
                  onChange={(e) =>
                    handleCardItemChange(item.id, 'title', e.target.value)
                  }
                  className="w-full bg-white border border-[#e3e9ed] focus:border-[#08cdbd] rounded-lg px-3 py-1.5 text-xs font-bold text-[#062959] outline-none"
                />
                <textarea
                  rows={2}
                  value={item.subtitle}
                  onChange={(e) =>
                    handleCardItemChange(item.id, 'subtitle', e.target.value)
                  }
                  className="w-full bg-white border border-[#e3e9ed] focus:border-[#08cdbd] rounded-lg px-3 py-1.5 text-xs text-[#233b53] outline-none"
                />
              </div>
            ))}
          </div>
        )}

        {activeTab === 'style' && (
          <div className="space-y-5">
            {/* Theme Selector */}
            <div>
              <label className="block text-xs font-bold text-[#062959] mb-2">
                پالت رنگی رسمی سایت آرکا (arka-acc.ir)
              </label>
              <div className="space-y-2">
                {themes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleFieldChange('theme', t.id)}
                    className={`w-full text-right p-3 rounded-xl border transition-all flex items-center gap-3 cursor-pointer ${
                      story.theme === t.id
                        ? 'bg-[#e5fbf9] border-[#08cdbd] text-[#062959]'
                        : 'bg-[#f5f8fa] border-[#e3e9ed] text-[#233b53] hover:border-[#062959]/40'
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-lg border-2 shrink-0 ${t.swatch}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-extrabold truncate">{t.title}</div>
                      <div className="text-[11px] text-[#7e8c9b] truncate mt-0.5">
                        {t.desc}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Logo Selector */}
            <div className="pt-4 border-t border-[#e3e9ed] space-y-3">
              <label className="block text-xs font-bold text-[#062959]">
                حالت نمایش لوگوی رسمی آرکا (arka-acc.ir)
              </label>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => onChangeLogoMode('official-full')}
                  className={`p-3 rounded-xl border text-right text-xs font-bold flex items-center justify-between cursor-pointer ${
                    logoMode === 'official-full'
                      ? 'bg-[#e5fbf9] border-[#08cdbd] text-[#062959]'
                      : 'bg-[#f5f8fa] border-[#e3e9ed] text-[#233b53]'
                  }`}
                >
                  <span>۱. لوگوی کامل هدر سایت (arka-header-logo.png)</span>
                  <Sparkles className="w-4 h-4 text-[#089f93] shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => onChangeLogoMode('official-badge')}
                  className={`p-3 rounded-xl border text-right text-xs font-bold flex items-center justify-between cursor-pointer ${
                    logoMode === 'official-badge'
                      ? 'bg-[#e5fbf9] border-[#08cdbd] text-[#062959]'
                      : 'bg-[#f5f8fa] border-[#e3e9ed] text-[#233b53]'
                  }`}
                >
                  <span>۲. نماد رسمی آرکا + تایپوگرافی وزیرمتن</span>
                </button>

                <button
                  type="button"
                  onClick={() => onChangeLogoMode('custom')}
                  className={`p-3 rounded-xl border text-right text-xs font-bold flex items-center justify-between cursor-pointer ${
                    logoMode === 'custom'
                      ? 'bg-[#e5fbf9] border-[#08cdbd] text-[#062959]'
                      : 'bg-[#f5f8fa] border-[#e3e9ed] text-[#233b53]'
                  }`}
                >
                  <span>۳. آپلود فایل یا لینک لوگوی سفارشی</span>
                  <Upload className="w-4 h-4 text-[#7e8c9b] shrink-0" />
                </button>
              </div>

              {logoMode === 'custom' && (
                <div className="p-3 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] space-y-2.5">
                  <input
                    dir="ltr"
                    type="text"
                    value={customLogoUrl}
                    onChange={(e) => onChangeCustomLogoUrl(e.target.value)}
                    placeholder="https://arka-acc.ir/images/arka-header-logo.png"
                    className="w-full bg-white border border-[#e3e9ed] rounded-lg px-3 py-1.5 text-xs text-[#062959] outline-none"
                  />
                  <label className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#062959] hover:bg-[#0b2b56] text-xs font-semibold text-white cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>انتخاب فایل لوگو از کامپیوتر یا موبایل</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between text-xs text-[#062959] mb-1">
                  <span className="font-bold">اندازه لوگو در هدر</span>
                  <span className="tabular-nums-fa font-extrabold text-[#089f93]">
                    {Math.round(logoScale * 100)}٪
                  </span>
                </div>
                <input
                  type="range"
                  min={0.8}
                  max={1.35}
                  step={0.05}
                  value={logoScale}
                  onChange={(e) => onChangeLogoScale(parseFloat(e.target.value))}
                  className="w-full accent-[#062959] cursor-pointer"
                />
              </div>
            </div>

            {/* Overlays & Guides */}
            <div className="pt-4 border-t border-[#e3e9ed] space-y-2.5">
              <label className="block text-xs font-bold text-[#062959]">
                راهنمای جایگذاری و ناحیه امن اینستاگرام
              </label>

              <button
                type="button"
                onClick={onToggleStickerPlaceholder}
                className="w-full p-3 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] flex items-center justify-between text-xs font-semibold text-[#062959] cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[#089f93]" />
                  <span>نمایش کادر جایگاه استیکر در حالت استوری</span>
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    showStickerPlaceholder
                      ? 'bg-[#e5fbf9] text-[#089f93]'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {showStickerPlaceholder ? 'فعال' : 'مخفی'}
                </span>
              </button>

              <button
                type="button"
                onClick={onToggleSafeZoneGuides}
                className="w-full p-3 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] flex items-center justify-between text-xs font-semibold text-[#062959] cursor-pointer"
              >
                <span>نمایش خطوط ناحیه امن استوری</span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    showSafeZoneGuides
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {showSafeZoneGuides ? 'فعال' : 'مخفی'}
                </span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'presets' && (
          <div className="space-y-4">
            {/* Save Current Configuration as a New Preset */}
            <form
              onSubmit={handleCreatePresetSubmit}
              className="p-4 rounded-xl bg-[#f5f8fa] border border-[#08cdbd] space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#062959] flex items-center gap-1.5">
                  <Bookmark className="w-3.5 h-3.5 text-[#089f93]" />
                  <span>ذخیره تنظیمات فعلی به‌عنوان پروفایل جدید</span>
                </span>
              </div>
              <p className="text-[11px] text-[#7e8c9b] leading-relaxed">
                تمام تغییرات متن‌ها، رنگ‌بندی و تنظیمات لوگوی فعلی در مرورگر شما (`localStorage`) ذخیره می‌شود.
              </p>
              <div>
                <input
                  type="text"
                  required
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="نام پروفایل (مثلاً: کمپین فروش ویژه پاچال)"
                  className="w-full bg-white border border-[#e3e9ed] focus:border-[#08cdbd] rounded-lg px-3 py-2 text-xs text-[#062959] outline-none"
                />
              </div>
              <div>
                <input
                  type="text"
                  value={newPresetDesc}
                  onChange={(e) => setNewPresetDesc(e.target.value)}
                  placeholder="توضیح کوتاه (اختیاری)"
                  className="w-full bg-white border border-[#e3e9ed] focus:border-[#08cdbd] rounded-lg px-3 py-1.5 text-xs text-[#233b53] outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#08cdbd] hover:bg-[#14dac3] text-xs font-extrabold text-[#062959] transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>ذخیره در پروفایل‌ها (Save Preset)</span>
              </button>
            </form>

            {/* List of Saved & Built-in Presets */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-[#062959]">
                <span>پروفایل‌های آماده و ذخیره‌شده ({presets.length})</span>
              </div>

              {presets.map((preset) => {
                const isActive = preset.id === activePresetId;
                return (
                  <div
                    key={preset.id}
                    className={`p-3.5 rounded-xl border transition-all ${
                      isActive
                        ? 'bg-[#e5fbf9] border-[#08cdbd] text-[#062959]'
                        : 'bg-[#f5f8fa] border-[#e3e9ed] text-[#233b53]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs font-extrabold text-[#062959]">
                          <span className="truncate">{preset.name}</span>
                          <span className="text-[10px] font-medium text-[#7e8c9b] shrink-0">
                            · {preset.isBuiltIn ? 'پیش‌فرض سیستم' : preset.createdAt}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#7e8c9b] mt-1 leading-relaxed">
                          {preset.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-[#e3e9ed]">
                      <button
                        type="button"
                        onClick={() => onSelectPreset(preset)}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                          isActive
                            ? 'bg-[#062959] text-white'
                            : 'bg-white border border-[#e3e9ed] hover:bg-[#062959] hover:text-white text-[#062959]'
                        }`}
                      >
                        {isActive ? 'فعال در استودیو' : 'اعمال این کمپین'}
                      </button>

                      {!preset.isBuiltIn && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onUpdateExistingPreset(preset.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#e3e9ed] hover:border-[#08cdbd] text-[11px] font-bold text-[#089f93] cursor-pointer whitespace-nowrap"
                            title="بروزرسانی این پروفایل با تنظیمات فعلی"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>بروزرسانی</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeletePreset(preset.id)}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 cursor-pointer"
                            title="حذف پروفایل"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'instagram' && (
          <div className="space-y-4">
            {carouselCaption && (
              <div className="p-4 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-[#062959]">
                    کپشن آماده پست و کاروسل اینستاگرام
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(carouselCaption, 'caption')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#08cdbd] text-[#062959] text-xs font-bold cursor-pointer"
                  >
                    {copiedField === 'caption' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedField === 'caption' ? 'کپی شد' : 'کپی کپشن'}</span>
                  </button>
                </div>
                <pre className="text-xs text-[#233b53] whitespace-pre-wrap font-sans leading-relaxed bg-white p-3 rounded-lg border border-[#e3e9ed]">
                  {carouselCaption}
                </pre>
              </div>
            )}

            <div className="p-4 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] space-y-3">
              <div className="text-xs font-extrabold text-[#062959]">
                تنظیمات استیکر استوری ({story.stickerGuide.stickerType})
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#7e8c9b] mb-1">
                  عنوان استیکر / سوال تعاملی
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={story.stickerGuide.stickerTitle}
                    onChange={(e) =>
                      handleFieldChange('stickerGuide', {
                        ...story.stickerGuide,
                        stickerTitle: e.target.value,
                      })
                    }
                    className="flex-1 bg-white border border-[#e3e9ed] rounded-lg px-3 py-1.5 text-xs text-[#062959] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(story.stickerGuide.stickerTitle, 'title')
                    }
                    className="p-2 rounded-lg bg-white border border-[#e3e9ed] hover:border-[#08cdbd] text-[#062959] cursor-pointer"
                  >
                    {copiedField === 'title' ? (
                      <Check className="w-3.5 h-3.5 text-[#089f93]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#7e8c9b] mb-1">
                  لینک یا گزینه‌های استیکر
                </label>
                <div className="flex items-center gap-2">
                  <input
                    dir="ltr"
                    type="text"
                    value={story.stickerGuide.stickerActionText}
                    onChange={(e) =>
                      handleFieldChange('stickerGuide', {
                        ...story.stickerGuide,
                        stickerActionText: e.target.value,
                      })
                    }
                    className="flex-1 bg-white border border-[#e3e9ed] rounded-lg px-3 py-1.5 text-xs text-[#062959] outline-none text-left"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(story.stickerGuide.stickerActionText, 'action')
                    }
                    className="p-2 rounded-lg bg-white border border-[#e3e9ed] hover:border-[#08cdbd] text-[#062959] cursor-pointer"
                  >
                    {copiedField === 'action' ? (
                      <Check className="w-3.5 h-3.5 text-[#089f93]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-[#e3e9ed] text-xs text-[#233b53] leading-relaxed">
                <strong className="text-[#089f93] block mb-1">نکته اجرایی انتشار:</strong>
                {story.stickerGuide.captionTip}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
