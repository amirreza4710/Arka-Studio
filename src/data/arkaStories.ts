export type StoryThemeMode = 'navy-paper' | 'paper-navy' | 'emerald-tax';

export type StoryCategory =
  | 'all'
  | 'comprehensive'
  | 'demo-promo'
  | 'moadian';

export type CanvasFormatId =
  | 'story-9-16'
  | 'post-4-5'
  | 'post-1-1'
  | 'carousel-4-5'
  | 'carousel-1-1';

export interface CanvasFormatSpec {
  id: CanvasFormatId;
  label: string;
  shortLabel: string;
  ratioLabel: string;
  mode: 'story' | 'single-post' | 'carousel';
  width: number;
  height: number;
  defaultPreviewScale: number;
}

export const CANVAS_FORMATS: CanvasFormatSpec[] = [
  {
    id: 'story-9-16',
    label: 'استوری اینستاگرام (۹:۱۶ · ۱۰۸۰×۱۹۲۰)',
    shortLabel: 'استوری ۹:۱۶',
    ratioLabel: '1080×1920',
    mode: 'story',
    width: 1080,
    height: 1920,
    defaultPreviewScale: 0.37,
  },
  {
    id: 'post-4-5',
    label: 'پست تک‌صفحه عمودی (۴:۵ · ۱۰۸۰×۱۳۵۰)',
    shortLabel: 'پست تکی ۴:۵',
    ratioLabel: '1080×1350',
    mode: 'single-post',
    width: 1080,
    height: 1350,
    defaultPreviewScale: 0.46,
  },
  {
    id: 'post-1-1',
    label: 'پست تک‌صفحه مربعی (۱:۱ · ۱۰۸۰×۱۰۸۰)',
    shortLabel: 'پست تکی ۱:۱',
    ratioLabel: '1080×1080',
    mode: 'single-post',
    width: 1080,
    height: 1080,
    defaultPreviewScale: 0.52,
  },
  {
    id: 'carousel-4-5',
    label: 'پست کاروسل چنداسلایدی عمودی (۴:۵ · ۱۰۸۰×۱۳۵۰)',
    shortLabel: 'کاروسل ۴:۵',
    ratioLabel: '1080×1350',
    mode: 'carousel',
    width: 1080,
    height: 1350,
    defaultPreviewScale: 0.46,
  },
  {
    id: 'carousel-1-1',
    label: 'پست کاروسل چنداسلایدی مربعی (۱:۱ · ۱۰۸۰×۱۰۸۰)',
    shortLabel: 'کاروسل ۱:۱',
    ratioLabel: '1080×1080',
    mode: 'carousel',
    width: 1080,
    height: 1080,
    defaultPreviewScale: 0.52,
  },
];

export interface StoryCardItem {
  id: string;
  kicker: string;
  title: string;
  subtitle: string;
  metric?: string;
  statusText?: string;
}

export interface ArkaStoryData {
  id: string;
  order: number;
  category: Exclude<StoryCategory, 'all'>;
  categoryLabel: string;
  titleShort: string;
  theme: StoryThemeMode;
  customAccentHex?: string;
  layoutType:
    | 'integration-flow'
    | 'bento-comprehensive'
    | 'moadian-ledger'
    | 'demo-100-promo'
    | 'case-study-proof'
    | 'ecosystem-cta';
  headerMeta: string;
  eyebrow: string;
  headlinePart1: string;
  headlineHighlight: string;
  headlinePart2: string;
  leadCopy: string;
  primaryStatValue?: string;
  primaryStatLabel?: string;
  secondaryBannerTitle?: string;
  secondaryBannerSub?: string;
  items: StoryCardItem[];
  footerRight: string;
  footerLeft: string;
  phoneNumber: string;
  workingHours: string;
  stickerGuide: {
    stickerType: 'LINK' | 'POLL' | 'QUESTION';
    stickerTitle: string;
    stickerActionText: string;
    captionTip: string;
  };
}

export interface ArkaCarouselDeck {
  id: string;
  title: string;
  subtitle: string;
  captionText: string;
  slides: ArkaStoryData[];
}

export interface ArkaSiteProductTemplate {
  id: string;
  group: 'سیستم‌های تخصصی آرکا' | 'ماژول‌های هوشمند آرکا';
  name: string;
  badge: string;
  eyebrow: string;
  headlinePart1: string;
  headlineHighlight: string;
  headlinePart2: string;
  leadCopy: string;
  primaryStatValue: string;
  primaryStatLabel: string;
  highlights: { title: string; subtitle: string; metric: string }[];
}

// Official systems and modules extracted directly from https://arka-acc.ir/api/site/published
export const ARKA_SITE_CATALOG: ArkaSiteProductTemplate[] = [
  {
    id: 'sys-comprehensive',
    group: 'سیستم‌های تخصصی آرکا',
    name: 'پکیج جامع مالی و حسابداری آرکا',
    badge: 'پرچمدار',
    eyebrow: 'هوش مالی برای کسب‌وکارهای امروز',
    headlinePart1: 'آرکا؛ فراتر از حسابداری،',
    headlineHighlight: 'مدیریت هوشمند',
    headlinePart2: 'کسب‌وکار شما',
    leadCopy:
      'با محیط کاربری ساده، اطلاعات یکپارچه و گزارش‌های مدیریتی متنوع و دقیق، بر فروش، موجودی کالا، حساب‌ها و عملکرد مالی مجموعه خود تسلط کامل داشته باشید.',
    primaryStatValue: '۱۰۰ سند دمو رایگان',
    primaryStatLabel: 'سادگی در استفاده · دقت در گزارش‌دهی · هوشمندی در تصمیم‌گیری',
    highlights: [
      {
        title: 'گزارشات جامع مدیریتی و حسابداری',
        subtitle: 'وضعیت مالی، سود و زیان و ترازنامه را یکجا ببینید و آگاهانه تصمیم بگیرید',
        metric: 'تحلیل آنی',
      },
      {
        title: 'ثبت و گزارشات جامع انبارداری',
        subtitle: 'کنترل دقیق ورود و خروج کالا، کاردکس تعدادی-ریالی و برنامه‌ریزی تامین',
        metric: 'چند انباره',
      },
      {
        title: 'مدیریت یکپارچه بانک، چک و نقدینگی',
        subtitle: 'رهگیری سررسید چک‌های دریافتی و پرداختی و کنترل حساب‌های بانکی',
        metric: 'خزانه‌داری',
      },
      {
        title: 'سرویس مستقیم سامانه مؤدیان',
        subtitle: 'ارسال و پیگیری آسان صورتحساب‌های الکترونیکی بدون خطا و جریمه',
        metric: 'مالیاتی',
      },
    ],
  },
  {
    id: 'sys-pachal',
    group: 'سیستم‌های تخصصی آرکا',
    name: 'حسابداری هوشمند پاچال (فروشگاهی)',
    badge: 'پرفروش',
    eyebrow: 'سیستم تخصصی فروشگاهی آرکا',
    headlinePart1: 'حسابداری هوشمند',
    headlineHighlight: 'پاچال آرکــا؛',
    headlinePart2: 'سرعت و دقت پشت دخل فروشگاه',
    leadCopy:
      'راهکاری تخصصی برای مدیریت مالی و عملیاتی فروش روزانه در فروشگاه‌ها؛ صدور سریع فاکتور، اتصال به بارکدخوان و کارتخوان، و کنترل دقیق موجودی قفسه و انبار.',
    primaryStatValue: 'صدور فاکتور در ۳ ثانیه',
    primaryStatLabel: 'تولید و چاپ بارکد کالا · اتصال به صندوق و ترازو · گزارش سود روزانه',
    highlights: [
      {
        title: 'صدور فوق‌سریع فاکتور فروشگاهی',
        subtitle: 'طراحی‌شده برای ساعات پرترافیک فروشگاه بدون معطلی مشتری',
        metric: 'فروش سریع',
      },
      {
        title: 'تولید و چاپ بارکد کالا',
        subtitle: 'شناسایی سریع کالاها با بارکدخوان و کاهش خطای صندوقدار',
        metric: 'بارکدخوان',
      },
      {
        title: 'باشگاه مشتریان و پیامک خودکار',
        subtitle: 'ثبت امتیاز خرید و ارسال پیامک هدفمند برای وفادارسازی مشتریان',
        metric: 'CRM فروشگاهی',
      },
      {
        title: 'بستن صندوق و گزارش سود شیفت',
        subtitle: 'کنترل دقیق وجوه نقد، کارتخوان و موجودی کالا در پایان هر روز',
        metric: 'کنترل صندوق',
      },
    ],
  },
  {
    id: 'sys-sooleh',
    group: 'سیستم‌های تخصصی آرکا',
    name: 'حسابداری تولیدی و انبار سوله (تولیدی؛ بنکداری)',
    badge: 'تولیدی و بنکداری',
    eyebrow: 'سیستم تخصصی تولید، بنکداری و انبار',
    headlinePart1: 'حسابداری هوشمند',
    headlineHighlight: 'سوله آرکــا؛',
    headlinePart2: 'تسلط کامل بر کالا، انبار و تولید',
    leadCopy:
      'ساخته‌شده برای تولیدی‌ها و بنکداری‌هایی که می‌خواهند کالا، انبار، فرمول تولید (BOM)، بهای تمام‌شده و فروش عمده را در یک هسته یکپارچه مدیریت کنند.',
    primaryStatValue: 'مدیریت BOM و چند انبار',
    primaryStatLabel: 'محاسبه دقیق بهای تمام‌شده تولید · کنترل حواله انبار و بنکداری',
    highlights: [
      {
        title: 'مدیریت خط تولید و بهای تمام‌شده',
        subtitle: 'تعریف فرمول تولید، مصرف مواد اولیه و محاسبه قیمت تمام‌شده واقعی',
        metric: 'تولیدی',
      },
      {
        title: 'کنترل پیشرفته چند انبار و سوله',
        subtitle: 'ردیابی ورود و خروج کالا در انبارهای متعدد با واحدهای شمارش دوگانه',
        metric: 'انبار پیشرفته',
      },
      {
        title: 'ویژه بنکداران و پخش عمده',
        subtitle: 'مدیریت تسویه‌های مدت‌دار، راس‌گیری چک‌ها و سقف اعتبار مشتریان عمده',
        metric: 'بنکداری',
      },
      {
        title: 'گزارش گردش و نقطه سفارش کالا',
        subtitle: 'هشدار کسری موجودی و شناسایی کالاهای پرگردش یا راکد در سوله',
        metric: 'هوش انبار',
      },
    ],
  },
  {
    id: 'sys-tarkhis',
    group: 'سیستم‌های تخصصی آرکا',
    name: 'حسابداری هوشمند ترخیص (بازرگانی و تجاری)',
    badge: 'بازرگانی',
    eyebrow: 'سیستم تخصصی بازرگانی و تجارت آرکا',
    headlinePart1: 'حسابداری هوشمند',
    headlineHighlight: 'ترخیص آرکــا؛',
    headlinePart2: 'قطب‌نمای مالی شرکت‌های بازرگانی',
    leadCopy:
      'راهکاری تخصصی برای شرکت‌های بازرگانی و تجاری؛ مدیریت بهای تمام‌شده واردات و خرید، هزینه‌های حمل و ترخیص، چندارزی و تحلیل سود هر پارت کالا.',
    primaryStatValue: 'بهای تمام‌شده هر پارت',
    primaryStatLabel: 'سرشکن کردن هزینه‌های حمل و گمرک · گزارش سود بازرگانی به تفکیک کالا',
    highlights: [
      {
        title: 'محاسبه دقیق بهای تمام‌شده بازرگانی',
        subtitle: 'ثبت هزینه‌های جانبی خرید، حمل، بیمه و ترخیص روی قیمت تمام‌شده کالا',
        metric: 'بهای تمام‌شده',
      },
      {
        title: 'مدیریت هوشمند بازاریابان و پورسانت',
        subtitle: 'تعریف اهداف فروش، ثبت سفارش ویزیتورها و محاسبه خودکار پورسانت',
        metric: 'تیم فروش',
      },
      {
        title: 'اعتبارسنجی مشتریان و راس چک‌ها',
        subtitle: 'کنترل ریسک فروش اعتباری و مدیریت دقیق جریان نقدینگی بازرگانی',
        metric: 'کنترل اعتبار',
      },
      {
        title: 'داشبوردهای تحلیلی مدیران بازرگانی',
        subtitle: 'مقایسه عملکرد فروش دوره‌ای و سودآوری هر گروه کالایی در لحظه',
        metric: 'BI بازرگانی',
      },
    ],
  },
  {
    id: 'sys-project-vitrin-menu',
    group: 'سیستم‌های تخصصی آرکا',
    name: 'حسابداری پروژه، ویترین (آنلاین‌شاپ) و منو (رستوران)',
    badge: 'تخصصی اصناف',
    eyebrow: 'پوشش کامل نیازهای شرکتی، آنلاین و رستورانی',
    headlinePart1: 'از شرکت‌های مهندسی تا',
    headlineHighlight: 'آنلاین‌شاپ و رستوران؛',
    headlinePart2: 'نرم‌افزار تخصصی صنف خودت را انتخاب کن',
    leadCopy:
      'خانواده نرم‌افزاری آرکا برای هر مدل کسب‌وکار معماری اختصاصی دارد: «پروژه» برای شرکت‌های خدماتی و پیمانکاری، «ویترین» برای فروشگاه‌های آنلاین و «منو» برای رستوران و کافی‌شاپ.',
    primaryStatValue: '۸ سیستم تخصصی',
    primaryStatLabel: 'پروژه · ویترین · منو · شتاب (استارتاپی) · منطبق با ساختار کاری شما',
    highlights: [
      {
        title: 'حسابداری پروژه (شرکتی و مهندسی)',
        subtitle: 'کنترل درآمد، هزینه و صورت‌وضعیت هر پروژه و مرکز هزینه به‌صورت مجزا',
        metric: 'پروژه‌محور',
      },
      {
        title: 'حسابداری ویترین (فروشگاه آنلاین)',
        subtitle: 'پل هوشمند میان سکوهای فروش اینترنتی، موجودی انبار و اسناد مالی',
        metric: 'آنلاین‌شاپ',
      },
      {
        title: 'حسابداری منو (رستوران و کافی‌شاپ)',
        subtitle: 'مدیریت رسپی غذا، سفارش‌گیری سریع، بهای تمام‌شده منو و صندوق',
        metric: 'رستورانی',
      },
      {
        title: 'حسابداری شتاب (ویژه استارتاپ‌ها)',
        subtitle: 'هم‌بنیان‌گذار مالی استارتاپ‌ها برای رصد نرخ سوخت سرمایه و شاخص‌های رشد',
        metric: 'استارتاپ',
      },
    ],
  },
  {
    id: 'mod-moadian-ai',
    group: 'ماژول‌های هوشمند آرکا',
    name: 'سرویس سامانه مؤدیان + ایجنت هوش مصنوعی مالی',
    badge: 'ماژول‌های نوین',
    eyebrow: 'نسل جدید ماژول‌های هوشمند آرکا',
    headlinePart1: 'سرویس سامانه مؤدیان و',
    headlineHighlight: 'ایجنت هوش مصنوعی مالی',
    headlinePart2: 'در کنار سیستم ابری آرکا',
    leadCopy:
      'علاوه بر هسته حسابداری، ماژول‌های پیشرفته آرکا شامل سرویس سامانه مؤدیان، داشبوردهای مدیریتی، سیستم جامع ابری، اتوماسیون اداری و ایجنت هوش مصنوعی مالی، کسب‌وکار شما را به سطح اول تکنولوژی می‌برد.',
    primaryStatValue: '۸ ماژول هوشمند',
    primaryStatLabel: 'سامانه مؤدیان · سیستم ابری · باشگاه مشتریان CRM · ایجنت مالی',
    highlights: [
      {
        title: 'سرویس مستقیم سامانه مؤدیان',
        subtitle: 'ارسال و پیگیری آسان صورتحساب‌های الکترونیکی با تایید ساختار مالیاتی',
        metric: 'مؤدیان',
      },
      {
        title: 'ایجنت هوش مصنوعی مالی آرکا',
        subtitle: 'تحلیل هوشمند روندهای مالی و کمک به تصمیم‌گیری سریع‌تر مدیران',
        metric: 'هوش مالی',
      },
      {
        title: 'سیستم جامع ابری و سکوهای فروش',
        subtitle: 'دسترسی امن از هر مکان و یکپارچه‌سازی با پلتفرم‌های فروش آنلاین',
        metric: 'ابری و وب',
      },
      {
        title: 'اتوماسیون اداری و مدیریت وظایف',
        subtitle: 'تعریف کارتابل، ارجاع وظایف تیمی و ثبت تیکت پشتیبانی درون‌سازمانی',
        metric: 'اتوماسیون',
      },
    ],
  },
];

export const INITIAL_ARKA_STORIES: ArkaStoryData[] = [
  {
    id: 'story-1-origin',
    order: 1,
    category: 'comprehensive',
    categoryLabel: 'معرفی جامع آرکا',
    titleShort: '۱. قطب‌نمای مالی و یکپارچگی آنی',
    theme: 'navy-paper',
    layoutType: 'integration-flow',
    headerMeta: '۱۰+ سال تجربه واقعی در کسب‌وکار و بازار',
    eyebrow: 'هوش مالی برای کسب‌وکارهای امروز',
    headlinePart1: 'آرکــا؛ فراتر از حسابداری،',
    headlineHighlight: 'مدیریت هوشمند',
    headlinePart2: 'کسب‌وکار شما',
    leadCopy:
      'سادگی در استفاده، دقت در گزارش‌دهی، هوشمندی در تصمیم‌گیری؛ با ثبت یک فاکتور فروش، تمام بخش‌های انبار، مشتری، بانک و سود لحظه‌ای بروز می‌شوند.',
    primaryStatValue: 'فاکتور فروش #۱۴۰۴/۸۹۲',
    primaryStatLabel: 'مبلغ کل: ۱۴۸,۵۰۰,۰۰۰ ریال · ثبت همزمان در ۴ زیرسیستم آرکا',
    items: [
      {
        id: 's1-1',
        kicker: '۰۱ · ثبت عملیات انبارداری',
        title: 'کسر آنی موجودی کالا',
        subtitle: 'مسیری ساده و دقیق برای ثبت و پیگیری ورود و خروج کالا در انبارها',
        metric: '۴ قلم کالا',
        statusText: 'ثبت حواله خودکار',
      },
      {
        id: 's1-2',
        kicker: '۰۲ · عملیات حسابداری',
        title: 'مانده حساب و سقف اعتبار',
        subtitle: 'ثبت و مدیریت یکپارچه اسناد و رویدادهای مالی مشتریان بدون دوباره‌کاری',
        metric: 'تراز بدهکار',
        statusText: 'بروزرسانی آنی',
      },
      {
        id: 's1-3',
        kicker: '۰۳ · اطلاعات بانک و چک',
        title: 'مدیریت نقدینگی و چک صیادی',
        subtitle: 'دسترسی یکپارچه به اطلاعات حساب‌های بانکی، صندوق و سررسید چک‌ها',
        metric: 'چک ۱۵ روزه',
        statusText: 'ثبت در خزانه',
      },
      {
        id: 's1-4',
        kicker: '۰۴ · گزارشات جامع مدیریتی',
        title: 'محاسبه لحظه‌ای سود خالص',
        subtitle: 'وضعیت مالی و عملکرد کسب‌وکارتان را یکجا ببینید و آگاهانه‌تر تصمیم بگیرید',
        metric: '+۲۴.۸٪ سود',
        statusText: 'داشبورد مدیر',
      },
    ],
    footerRight: 'سادگی در استفاده · دقت در گزارش‌دهی · هوشمندی در تصمیم‌گیری',
    footerLeft: 'arka-acc.ir',
    phoneNumber: '051-36079047',
    workingHours: 'پاسخگویی ۸ الی ۱۷',
    stickerGuide: {
      stickerType: 'POLL',
      stickerTitle: 'بزرگ‌ترین چالش مالی فعلی کسب‌وکار شما چیست؟',
      stickerActionText: 'مغایرت انبار و فروش / محاسبه سود واقعی هر ماه',
      captionTip:
        'این طرح بر اساس بخش معرفی اصلی سایت arka-acc.ir تنظیم شده است. در حالت استوری استیکر نظرسنجی و در حالت پست لینک بیو را معرفی کنید.',
    },
  },
  {
    id: 'story-2-bento',
    order: 2,
    category: 'comprehensive',
    categoryLabel: 'معرفی جامع آرکا',
    titleShort: '۲. داشبوردهای هوشمند و مزایای ۱۲گانه',
    theme: 'paper-navy',
    layoutType: 'bento-comprehensive',
    headerMeta: 'پاچال · سوله · ترخیص · پروژه · منو · ویترین',
    eyebrow: 'تبدیل داده‌های مالی به بینش مدیریتی',
    headlinePart1: 'کمتر درگیر پیچیدگی‌ها شوید؛',
    headlineHighlight: 'شفاف‌تر ببینید',
    headlinePart2: 'و هوشمندانه‌تر تصمیم بگیرید',
    leadCopy:
      'کدام بخش سودآورتر است؟ کدام محصول بیشترین بازده را دارد؟ آرکا طراحی شده تا قطب‌نمای مالی کسب‌وکار شما در دریای داده‌ها باشد.',
    primaryStatValue: '۳,۸۴۰,۰۰۰,۰۰۰ ریال',
    primaryStatLabel: 'تصویری روشن از حساب‌ها، گردش کالا و عملکرد مالی جهت تصمیم‌گیری هوشمندانه',
    items: [
      {
        id: 's2-1',
        kicker: '۰۱ · گزارشات جامع انبارداری',
        title: 'دید جامع از موجودی و گردش کالا',
        subtitle: 'کنترل دقیق چند انبار، تولید و چاپ بارکد کالا و برنامه‌ریزی بهتر تامین',
        metric: 'چند انباره',
      },
      {
        id: 's2-2',
        kicker: '۰۲ · سیستم جامع ابری و وب',
        title: 'دسترسی یکپارچه در ویندوز و کلود',
        subtitle: 'مدیریت کسب‌وکار و سکوهای فروش آنلاین از هر مکان با امنیت بالا',
        metric: 'ابری و محلی',
      },
      {
        id: 's2-3',
        kicker: '۰۳ · باشگاه مشتریان و پیامک',
        title: 'CRM و سامانه ارتباطی هدفمند',
        subtitle: 'ارسال پیامک، اطلاع‌رسانی منظم به مشتریان و مدیریت هوشمند بازاریابان',
        metric: 'یکپارچه',
      },
      {
        id: 's2-4',
        kicker: '۰۴ · اتوماسیون و دارایی ثابت',
        title: 'مدیریت وظایف و استهلاک دارایی‌ها',
        subtitle: 'از ثبت اطلاعات اول دوره و دارایی ثابت تا کارتابل وظایف و تیکت پشتیبانی',
        metric: '۱۲ ماژول کامل',
      },
    ],
    footerRight: 'گروه نرم‌افزاری آرکا · راهنمای هوشمند کسب‌وکار',
    footerLeft: 'arka-acc.ir',
    phoneNumber: '051-36079047',
    workingHours: 'پاسخگویی ۸ الی ۱۷',
    stickerGuide: {
      stickerType: 'QUESTION',
      stickerTitle: 'کدام نسخه آرکا (پاچال، سوله، ترخیص، پروژه، منو) مناسب صنف شماست؟',
      stickerActionText: 'برای دریافت مشاوره تخصصی رایگان پیام دهید',
      captionTip:
        'زمینه روشن سایت آرکا (#f5f8fa) به همراه کارت سرمه‌ای (#062959) و فیروزه‌ای (#08cdbd) دقیقاً حس صفحه اصلی سایت را منتقل می‌کند.',
    },
  },
  {
    id: 'story-3-moadian',
    order: 3,
    category: 'moadian',
    categoryLabel: 'سامانه مؤدیان',
    titleShort: '۳. سرویس مستقیم سامانه مؤدیان آرکا',
    theme: 'emerald-tax',
    layoutType: 'moadian-ledger',
    headerMeta: 'توسعه‌یافته همراه با مشاوران مالی و مالیاتی',
    eyebrow: 'سرویس سامانه مؤدیان گروه نرم‌افزاری آرکا',
    headlinePart1: 'ارسال و پیگیری آسان',
    headlineHighlight: 'صورتحساب الکترونیکی',
    headlinePart2: 'در سامانه مؤدیان بدون خطا',
    leadCopy:
      'طراحی‌شده بر اساس نیازهای واقعی حسابداران بازار؛ از اعتبارسنجی خودکار اقلام فاکتور پیش از ارسال تا پیگیری وضعیت در کارپوشه مالیاتی.',
    primaryStatValue: 'شناسه یکتا: A1B9F4 • تایید نهایی سامانه',
    primaryStatLabel: 'پشتیبانی کامل از الگوهای فروش، طلا، پیمانکاری و صورتحساب‌های اصلاحی/ابطالی',
    items: [
      {
        id: 's3-1',
        kicker: 'گام اول · کنترل هوشمند خطا',
        title: 'اعتبارسنجی خودکار قبل از ارسال',
        subtitle: 'بررسی کد اقتصادی، شناسه کالا/خدمت و محاسبات ارزش افزوده پیش از ثبت',
        metric: 'خطای صفر',
        statusText: 'تایید ساختار',
      },
      {
        id: 's3-2',
        kicker: 'گام دوم · ارسال مستقیم و سریع',
        title: 'اتصال مستقیم از متن فاکتور فروش یا اکسل',
        subtitle: 'ارسال تکی و گروهی صورتحساب‌های نوع اول و دوم بدون دوباره‌کاری',
        metric: 'ارسال آنی',
        statusText: 'متصل به کارپوشه',
      },
      {
        id: 's3-3',
        kicker: 'گام سوم · آموزش و پشتیبانی همراه',
        title: 'آرکا آکادمی + ثبت تیکت پشتیبانی',
        subtitle: 'آموزش گام‌به‌گام دریافت کلید خصوصی و همراهی تیم پشتیبانی تا رفع کامل ابهام‌ها',
        metric: '۱ سال پشتیبانی',
        statusText: 'همراه حسابدار',
      },
    ],
    footerRight: 'آرامش مالیاتی کسب‌وکار با سرویس سامانه مؤدیان آرکا',
    footerLeft: 'arka-acc.ir/pages/tax',
    phoneNumber: '051-36079047',
    workingHours: 'پاسخگویی ۸ الی ۱۷',
    stickerGuide: {
      stickerType: 'LINK',
      stickerTitle: 'مشاهده سرویس سامانه مؤدیان در سایت آرکا',
      stickerActionText: 'https://arka-acc.ir/pages/tax',
      captionTip:
        'مخاطب را مستقیماً به صفحه اختصاصی سرویس سامانه مؤدیان در سایت arka-acc.ir هدایت کنید.',
    },
  },
  {
    id: 'story-4-demo-promo',
    order: 4,
    category: 'demo-promo',
    categoryLabel: 'پروموشن دمو و پشتیبانی',
    titleShort: '۴. پروموشن دموی رایگان ۱۰۰ سند',
    theme: 'navy-paper',
    layoutType: 'demo-100-promo',
    headerMeta: 'تضمین انتخاب آگاهانه و بدون ریسک',
    eyebrow: 'پیشنهاد ویژه گروه نرم‌افزاری آرکا',
    headlinePart1: 'قبل از پرداخت حتی یک ریال،',
    headlineHighlight: '۱۰۰ سند واقعی',
    headlinePart2: 'در نسخه دمو ثبت و تست کنید!',
    leadCopy:
      'ما به سادگی و قدرت آرکا ایمان داریم. نسخه دموی رایگان را مستقیم از صفحه دریافت دمو در سایت دانلود کنید و با داده‌های واقعی کسب‌وکار خودتان بسنجید.',
    primaryStatValue: '۱۰۰',
    primaryStatLabel: 'سند کاملاً رایگان در نسخه دمو · دسترسی به امکانات اصلی',
    secondaryBannerTitle: '+ ۱ سال پشتیبانی رایگان و همراهی آرکا آکادمی',
    secondaryBannerSub: 'با خرید هر نسخه، تیم فنی و سیستم ثبت تیکت پشتیبانی آرکا یک سال تمام بدون هزینه اضافه کنار شماست.',
    items: [
      {
        id: 's4-1',
        kicker: 'مزیت اول · شروع دقیق',
        title: 'ثبت آسان اطلاعات اول دوره',
        subtitle: 'ثبت مانده حساب‌ها، موجودی کالا و چک‌های اول دوره به همراه راهنمای ویدیویی',
        metric: 'نصب سریع',
      },
      {
        id: 's4-2',
        kicker: 'مزیت دوم · تجربه واقعی',
        title: 'تست گزارشات مدیریتی و انبار در عمل',
        subtitle: 'مشاهده سرعت صدور فاکتور، کاردکس کالا و تراز آزمایشی پیش از خرید نهایی',
        metric: '۱۰۰ سند کامل',
      },
    ],
    footerRight: 'دریافت مستقیم دموی رایگان از وب‌سایت رسمی آرکا',
    footerLeft: 'arka-acc.ir/demo',
    phoneNumber: '051-36079047',
    workingHours: 'پاسخگویی ۸ الی ۱۷',
    stickerGuide: {
      stickerType: 'LINK',
      stickerTitle: 'دانلود رایگان نسخه دمو (۱۰۰ سند واقعی)',
      stickerActionText: 'https://arka-acc.ir/demo',
      captionTip:
        'لینک صفحه /demo سایت آرکا را روی استیکر لینک قرار دهید تا کاربر مستقیماً فایل نصبی دمو را دریافت کند.',
    },
  },
  {
    id: 'story-5-case-study',
    order: 5,
    category: 'comprehensive',
    categoryLabel: 'معرفی جامع آرکا',
    titleShort: '۵. تجربه واقعی مشتریان (رنگ بهارستان)',
    theme: 'paper-navy',
    layoutType: 'case-study-proof',
    headerMeta: 'داستان موفقیت مشتریان آرکا در بازار ایران',
    eyebrow: 'نتیجه واقعی در میدان عمل',
    headlinePart1: 'چطور پراکندگی انبار و فروش به',
    headlineHighlight: 'تصمیم‌گیری لحظه‌ای',
    headlinePart2: 'تبدیل شد؟',
    leadCopy:
      'تجربه پیاده‌سازی نرم‌افزار جامع آرکا در مجموعه‌های بازرگانی و تولیدی همچون «شرکت رنگ بهارستان»؛ پایان فایل‌های جزیره‌ای و مغایرت‌های پایان فصل.',
    primaryStatValue: 'شرکت رنگ بهارستان',
    primaryStatLabel: 'یکپارچه‌سازی زنجیره سفارش، موجودی انبار، حساب مشتریان و گزارش‌های مدیریتی',
    items: [
      {
        id: 's5-1',
        kicker: 'چالش پیش از آرکا',
        title: 'پراکندگی اطلاعات فروش و موجودی انبار',
        subtitle: 'تاخیر در تهیه گزارش‌های مدیریتی و دشواری کنترل همزمان موجودی کالا و حساب مشتریان',
        metric: 'قبل از استقرار',
      },
      {
        id: 's5-2',
        kicker: 'راهکار پیاده‌سازی‌شده',
        title: 'استقرار هسته یکپارچه مالی و انبار آرکا',
        subtitle: 'اتصال مستقیم صدور فاکتور به کسر موجودی، کنترل اعتبار مشتری و خزانه‌داری',
        metric: 'استقرار کامل',
      },
      {
        id: 's5-3',
        kicker: 'نتیجه ملموس مدیریتی',
        title: 'دسترسی لحظه‌ای به گزارش سود و موجودی',
        subtitle: 'شفافیت کامل مالی برای مدیران و سرعت بالای عملیات روزانه برای تیم فروش و حسابداری',
        metric: 'شفافیت ۱۰۰٪',
      },
    ],
    footerRight: 'مورد اعتماد مدیران بازرگانی، پخش، تولیدی و فروشگاه‌ها',
    footerLeft: 'arka-acc.ir',
    phoneNumber: '051-36079047',
    workingHours: 'پاسخگویی ۸ الی ۱۷',
    stickerGuide: {
      stickerType: 'QUESTION',
      stickerTitle: 'حوزه فعالیت کسب‌وکار شما چیست؟ (فروشگاهی، تولیدی، بازرگانی)',
      stickerActionText: 'مشاوره رایگان استقرار متناسب با صنف شما',
      captionTip:
        'نمایش تجربه واقعی مشتریان، قوی‌ترین سند اثبات کارایی نرم‌افزار در پست‌های تک‌صفحه و استوری است.',
    },
  },
  {
    id: 'story-6-cta-suite',
    order: 6,
    category: 'demo-promo',
    categoryLabel: 'پروموشن دمو و پشتیبانی',
    titleShort: '۶. خانواده ۸ سیستم تخصصی آرکا + تماس (CTA)',
    theme: 'navy-paper',
    layoutType: 'ecosystem-cta',
    headerMeta: 'سیستم‌ها و ماژول‌های تخصصی گروه نرم‌افزاری آرکا',
    eyebrow: 'هم‌قدم با رشد کسب‌وکار شما',
    headlinePart1: 'از پاچال و سوله تا',
    headlineHighlight: 'ترخیص، پروژه و ویترین؛',
    headlinePart2: 'راهکار دقیق صنف خودت را انتخاب کن',
    leadCopy:
      'همین امروز نسخه دموی ۱۰۰ سند رایگان را از سایت دریافت کنید یا برای انتخاب بسته دقیق کسب‌وکار خود با کارشناسان ما در تماس باشید.',
    primaryStatValue: '051-36079047',
    primaryStatLabel: 'مشاوره تخصصی رایگان · پاسخگویی ۸ الی ۱۷ · مشهد، سید رضی ۴۰، پلاک ۲۶۵',
    items: [
      {
        id: 's6-1',
        kicker: 'فروشگاهی و رستورانی',
        title: 'حسابداری هوشمند پاچال و منو',
        subtitle: 'مدیریت سریع فروش روزانه، صندوق، بارکد کالا و رسپی رستوران و کافی‌شاپ',
        metric: 'پرفروش',
      },
      {
        id: 's6-2',
        kicker: 'تولیدی، بنکداری و انبار',
        title: 'حسابداری هوشمند سوله آرکا',
        subtitle: 'کنترل دقیق فرمول تولید، چند انبار، بهای تمام‌شده و فروش عمده بنکداری',
        metric: 'ویژه سوله',
      },
      {
        id: 's6-3',
        kicker: 'بازرگانی، شرکتی و استارتاپ',
        title: 'حسابداری ترخیص، پروژه و شتاب',
        subtitle: 'بهای تمام‌شده واردات و بازرگانی، کنترل پروژه‌های پیمانکاری و رشد استارتاپ',
        metric: 'تخصصی B2B',
      },
      {
        id: 's6-4',
        kicker: 'فروش آنلاین و ماژول‌های هوشمند',
        title: 'ویترین، سامانه مؤدیان و ایجنت هوش مصنوعی',
        subtitle: 'اتصال به سایت فروشگاهی، ارسال صورتحساب مالیاتی، سیستم ابری و CRM',
        metric: 'اکوسیستم کامل',
      },
    ],
    footerRight: 'مشهد · سید رضی ۴۰ · بین مهران ۹ و ۱۱ · پلاک ۲۶۵ · طبقه اول',
    footerLeft: 'arka-acc.ir/products',
    phoneNumber: '051-36079047',
    workingHours: 'پاسخگویی ۸ الی ۱۷',
    stickerGuide: {
      stickerType: 'LINK',
      stickerTitle: 'مشاهده نرم‌افزارها و دانلود دمو | arka-acc.ir',
      stickerActionText: 'https://arka-acc.ir/products',
      captionTip:
        'این اسلاید/استوری جمع‌بندی کامل سبد محصولات سایت آرکا است و برای اسلاید آخر کاروسل یا استوری پایانی ایده‌آل است.',
    },
  },
];

// Multi-slide connected Carousel Decks (5 slides per carousel)
export const INITIAL_ARKA_CAROUSELS: ArkaCarouselDeck[] = [
  {
    id: 'carousel-deck-systems',
    title: 'کاروسل ۱: معرفی خانواده نرم‌افزارهای تخصصی آرکا (۵ اسلاید به‌هم‌پیوسته)',
    subtitle: 'کاور قلاب + معرفی سیستم‌های پاچال، سوله، ترخیص، پروژه، منو و ویترین + دعوت به دانلود دمو',
    captionText: `کدام نسخه از نرم‌افزارهای هوشمند آرکــا مناسب کسب‌وکار شماست؟ 🧭\n\nدر گروه نرم‌افزاری آرکا (با بیش از ۱۰ سال تجربه عملی در بازار)، به جای یک نسخه پیچیده و عمومی، برای هر صنف راهکار تخصصی طراحی کرده‌ایم:\n\n🔹 ۱. پکیج جامع مالی و حسابداری آرکا\n🔹 ۲. حسابداری هوشمند پاچال (ویژه فروشگاه‌ها)\n🔹 ۳. حسابداری تولیدی و انبار سوله (تولیدی، بنکداری و انبار)\n🔹 ۴. حسابداری هوشمند ترخیص (بازرگانی و تجاری)\n🔹 ۵. حسابداری پروژه (شرکتی/خدماتی)، منو (رستوران) و ویترین (آنلاین‌شاپ)\n\n🎁 همین حالا نسخه دموی رایگان (تا ۱۰۰ سند واقعی) را از سایت دانلود کنید:\n🌐 https://arka-acc.ir/demo\n📞 مشاوره تخصصی (۸ الی ۱۷): ۰۵۱۳۶۰۷۹۰۴۷\n📍 مشهد، سید رضی ۴۰، بین مهران ۹ و ۱۱، پلاک ۲۶۵`,
    slides: [
      INITIAL_ARKA_STORIES[0],
      INITIAL_ARKA_STORIES[1],
      INITIAL_ARKA_STORIES[2],
      INITIAL_ARKA_STORIES[3],
      INITIAL_ARKA_STORIES[5],
    ],
  },
  {
    id: 'carousel-deck-moadian-benefits',
    title: 'کاروسل ۲: راهنمای سامانه مؤدیان و مزایای یکپارچگی مالی آرکا (۴ اسلاید)',
    subtitle: 'تمرکز بر رفع دغدغه مالیاتی، مطالعه موردی رنگ بهارستان و ۱۰۰ سند دموی رایگان',
    captionText: `ارسال صورتحساب الکترونیکی به سامانه مؤدیان؛ بدون خطا و بدون استرس جرایم مالیاتی! 🛡️\n\nبا سرویس سامانه مؤدیان و نرم‌افزار جامع آرکا:\n✅ قبل از ارسال، ساختار فاکتور و کدهای مالیاتی به‌صورت خودکار کنترل می‌شود.\n✅ با ثبت هر فاکتور، موجودی انبار، حساب مشتری و خزانه همزمان بروز می‌شوند.\n✅ ۱ سال پشتیبانی رایگان و آموزش‌های گام‌به‌گام آرکا آکادمی در کنار شماست.\n\n🌐 دریافت دموی رایگان ۱۰۰ سند: https://arka-acc.ir\n📞 تلفن سراسری: ۰۵۱۳۶۰۷۹۰۴۷`,
    slides: [
      INITIAL_ARKA_STORIES[2],
      INITIAL_ARKA_STORIES[4],
      INITIAL_ARKA_STORIES[3],
      INITIAL_ARKA_STORIES[5],
    ],
  },
];
