import React, { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import {
  ArkaStoryData,
  CanvasFormatSpec,
} from '../data/arkaStories';
import { getAccessToken } from '../firebase';
import {
  FileSpreadsheet,
  HardDrive,
  Plus,
  RefreshCw,
  UploadCloud,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowUpRight,
  Table,
  ShieldAlert,
} from 'lucide-react';

interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
}

interface SheetTabInfo {
  sheetId: number;
  title: string;
}

interface PendingConfirmationAction {
  type: 'delete-drive-file' | 'append-sheet-row';
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
}

interface GoogleWorkspacePanelProps {
  currentUser: User | null;
  accessToken: string | null;
  needsAuth: boolean;
  isSigningIn: boolean;
  onGoogleSignIn: () => Promise<void>;
  activeStory: ArkaStoryData;
  allStories: ArkaStoryData[];
  activeFormat: CanvasFormatSpec;
  onUpdateStory: (updated: ArkaStoryData) => void;
  onRenderCanvasToPngDataUrl: () => Promise<string | null>;
}

export const GoogleWorkspacePanel: React.FC<GoogleWorkspacePanelProps> = ({
  currentUser,
  accessToken,
  needsAuth,
  isSigningIn,
  onGoogleSignIn,
  activeStory,
  allStories,
  activeFormat,
  onUpdateStory,
  onRenderCanvasToPngDataUrl,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'sheets' | 'drive'>('sheets');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Google Drive files list
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [spreadsheetsList, setSpreadsheetsList] = useState<DriveFileItem[]>([]);

  // Selected Google Sheet & dynamic tab discovery (never hardcode Sheet1)
  const [selectedSpreadsheetId, setSelectedSpreadsheetId] =
    useState<string>('');
  const [sheetTabs, setSheetTabs] = useState<SheetTabInfo[]>([]);
  const [selectedSheetTabTitle, setSelectedSheetTabTitle] =
    useState<string>('');
  const [sheetRows, setSheetRows] = useState<string[][]>([]);
  const [newSpreadsheetTitle, setNewSpreadsheetTitle] = useState<string>(
    'تقویم محتوا و کمپین اینستاگرام نرم‌افزار حسابداری آرکا'
  );

  // Mandatory User Confirmation Dialog State for Mutating/Destructive Operations
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmationAction | null>(null);

  const showNotice = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const fetchDriveAndSpreadsheetFiles = useCallback(async () => {
    const token = accessToken || (await getAccessToken());
    if (!token) return;

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const queryParams = new URLSearchParams({
        pageSize: '25',
        fields: 'files(id,name,mimeType,webViewLink,modifiedTime)',
        orderBy: 'modifiedTime desc',
        q: "trashed = false and (mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType = 'image/png')",
      });

      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?${queryParams.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        throw new Error(
          'دسترسی به فایل‌های Google Drive نیازمند ورود مجدد با حساب گوگل است.'
        );
      }

      const data = await res.json();
      const files: DriveFileItem[] = Array.isArray(data.files)
        ? data.files
        : [];
      setDriveFiles(files);

      const sheetsOnly = files.filter(
        (f) => f.mimeType === 'application/vnd.google-apps.spreadsheet'
      );
      setSpreadsheetsList(sheetsOnly);

      if (sheetsOnly.length > 0 && !selectedSpreadsheetId) {
        setSelectedSpreadsheetId(sheetsOnly[0].id);
      }
    } catch (err: any) {
      setErrorMsg(
        err?.message || 'خطا در دریافت لیست فایل‌های Google Drive و Sheets.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, selectedSpreadsheetId]);

  // Fetch spreadsheet metadata to discover actual sheet tab names
  const fetchSpreadsheetMetadataAndTabs = useCallback(
    async (spreadsheetId: string) => {
      if (!spreadsheetId) return;
      const token = accessToken || (await getAccessToken());
      if (!token) return;

      setIsLoading(true);
      setErrorMsg(null);
      try {
        const metaRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (!metaRes.ok) {
          throw new Error('خطا در خواندن ساختار تب‌های فایل Google Sheets.');
        }

        const metaData = await metaRes.json();
        const tabs: SheetTabInfo[] = (metaData.sheets || []).map((s: any) => ({
          sheetId: s.properties?.sheetId ?? 0,
          title: s.properties?.title || 'Tab1',
        }));

        setSheetTabs(tabs);
        if (tabs.length > 0) {
          const firstTitle = tabs[0].title;
          setSelectedSheetTabTitle(firstTitle);
          await fetchSheetTabValues(spreadsheetId, firstTitle, token);
        }
      } catch (err: any) {
        setErrorMsg(
          err?.message || 'خطا در بارگذاری اطلاعات فایل Google Sheets.'
        );
      } finally {
        setIsLoading(false);
      }
    },
    [accessToken]
  );

  const fetchSheetTabValues = async (
    spreadsheetId: string,
    tabTitle: string,
    tokenOverride?: string
  ) => {
    const token = tokenOverride || accessToken || (await getAccessToken());
    if (!token || !spreadsheetId || !tabTitle) return;

    try {
      const encodedRange = encodeURIComponent(`'${tabTitle}'!A1:L35`);
      const valRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!valRes.ok) {
        throw new Error('خطا در خواندن ردیف‌های شیت انتخاب‌شده.');
      }

      const valData = await valRes.json();
      setSheetRows(Array.isArray(valData.values) ? valData.values : []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'خطا در دریافت داده‌های جدول.');
    }
  };

  useEffect(() => {
    if (accessToken && !needsAuth) {
      fetchDriveAndSpreadsheetFiles();
    }
  }, [accessToken, needsAuth, fetchDriveAndSpreadsheetFiles]);

  useEffect(() => {
    if (selectedSpreadsheetId && accessToken && !needsAuth) {
      fetchSpreadsheetMetadataAndTabs(selectedSpreadsheetId);
    }
  }, [
    selectedSpreadsheetId,
    accessToken,
    needsAuth,
    fetchSpreadsheetMetadataAndTabs,
  ]);

  // 1. Create a brand-new Google Sheet with all 6 Arka stories/campaigns (Requires confirmation)
  const handleCreateNewArkaSpreadsheet = (e: React.FormEvent) => {
    e.preventDefault();
    const sheetTitleToCreate =
      newSpreadsheetTitle.trim() || 'تقویم محتوا و کمپین اینستاگرام آرکا';

    setPendingConfirmation({
      type: 'append-sheet-row',
      title: 'تایید ایجاد فایل جدید در Google Sheets',
      description: `آیا مایل هستید فایل جدول جدید «${sheetTitleToCreate}» همراه با ۶ طرح پایه نرم‌افزار حسابداری آرکا در حساب Google Drive شما ساخته شود؟`,
      confirmLabel: 'بله، ساخت جدول در Google Drive',
      onConfirm: async () => {
        const token = accessToken || (await getAccessToken());
        if (!token) return;

        setIsLoading(true);
        setErrorMsg(null);
        try {
          const sheetTabName = 'کمپین_اینستاگرام_آرکا';
          const headerRow = [
            'کد طرح',
            'دسته‌بندی',
            'روتیتر (Eyebrow)',
            'تیتر اصلی',
            'کلمه کلیدی رنگی (Highlight)',
            'توضیح زیر تیتر (Lead Copy)',
            'شاخص کلیدی',
          ];

          const storyRows = allStories.map((st) => [
            st.id,
            st.categoryLabel,
            st.eyebrow,
            `${st.headlinePart1} ${st.headlinePart2}`.trim(),
            st.headlineHighlight,
            st.leadCopy,
            `${st.primaryStatValue || ''} - ${st.primaryStatLabel || ''}`,
          ]);

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
                  title: sheetTitleToCreate,
                },
                sheets: [
                  {
                    properties: {
                      title: sheetTabName,
                      rightToLeft: true,
                    },
                  },
                ],
              }),
            }
          );

          if (!createRes.ok) {
            throw new Error('خطا در ساخت فایل جدید Google Sheets.');
          }

          const createdSheet = await createRes.json();
          const newId = createdSheet.spreadsheetId;
          const actualTabTitle =
            createdSheet.sheets?.[0]?.properties?.title || sheetTabName;

          // Populate initial rows
          const encodedRange = encodeURIComponent(`'${actualTabTitle}'!A1:G7`);
          await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${newId}/values/${encodedRange}?valueInputOption=USER_ENTERED`,
            {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                values: [headerRow, ...storyRows],
              }),
            }
          );

          await fetchDriveAndSpreadsheetFiles();
          setSelectedSpreadsheetId(newId);
          showNotice(
            'فایل جدید Google Sheets با موفقیت در Google Drive شما ساخته شد و با ۶ طرح آرکا مقداردهی شد.'
          );
        } catch (err: any) {
          setErrorMsg(err?.message || 'خطا در ایجاد فایل Google Sheets.');
        } finally {
          setIsLoading(false);
        }
      },
    });
  };

  // 2. Append active StoryCanvas data to the selected Google Sheet (Requires explicit confirmation)
  const requestAppendActiveStoryToSheet = () => {
    if (!selectedSpreadsheetId || !selectedSheetTabTitle) return;
    const targetSheetFile = spreadsheetsList.find(
      (f) => f.id === selectedSpreadsheetId
    );

    setPendingConfirmation({
      type: 'append-sheet-row',
      title: 'تایید ثبت و بروزرسانی در Google Sheets',
      description: `آیا مطمئن هستید که می‌خواهید اطلاعات بوم فعلی («${activeStory.titleShort}») را به تب «${selectedSheetTabTitle}» در فایل «${targetSheetFile?.name || selectedSpreadsheetId}» اضافه کنید؟`,
      confirmLabel: 'بله، ثبت در Google Sheets',
      onConfirm: async () => {
        const token = accessToken || (await getAccessToken());
        if (!token) return;
        setIsLoading(true);
        try {
          const encodedRange = encodeURIComponent(
            `'${selectedSheetTabTitle}'!A:G`
          );
          const rowValues = [
            activeStory.id,
            activeStory.categoryLabel,
            activeStory.eyebrow,
            `${activeStory.headlinePart1} ${activeStory.headlinePart2}`.trim(),
            activeStory.headlineHighlight,
            activeStory.leadCopy,
            `${activeStory.primaryStatValue || ''} | ${activeStory.phoneNumber}`,
          ];

          const res = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${selectedSpreadsheetId}/values/${encodedRange}:append?valueInputOption=USER_ENTERED`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                values: [rowValues],
              }),
            }
          );

          if (!res.ok) {
            throw new Error('خطا در افزودن ردیف به Google Sheets.');
          }

          await fetchSheetTabValues(
            selectedSpreadsheetId,
            selectedSheetTabTitle,
            token
          );
          showNotice('محتوای بوم فعلی با موفقیت در Google Sheets ثبت شد.');
        } catch (err: any) {
          setErrorMsg(err?.message || 'خطا در بروزرسانی Google Sheets.');
        } finally {
          setIsLoading(false);
        }
      },
    });
  };

  // 3. Apply a row from Google Sheets (supports both 7-col standard & 12-col 30-day calendar) directly onto the live StoryCanvas
  const handleApplySheetRowToCanvas = (row: string[]) => {
    if (row.length >= 9) {
      // 12-column 30-day AI Campaign Calendar row
      const [
        dayLabel,
        launchPhase,
        productModule,
        ,
        categoryLabel,
        eyebrow,
        fullHeadline,
        highlight,
        leadCopy,
        statCombo,
      ] = row;
      onUpdateStory({
        ...activeStory,
        categoryLabel:
          categoryLabel || `${dayLabel} · ${productModule || 'آرکا'}`,
        headerMeta: `${launchPhase || 'تقویم ۳۰ روزه آرکا'} · arka-acc.ir`,
        eyebrow: eyebrow || activeStory.eyebrow,
        headlinePart1: fullHeadline || activeStory.headlinePart1,
        headlineHighlight: highlight || activeStory.headlineHighlight,
        headlinePart2: '',
        leadCopy: leadCopy || activeStory.leadCopy,
        primaryStatValue: statCombo
          ? statCombo.split('(')[0]?.trim() || activeStory.primaryStatValue
          : activeStory.primaryStatValue,
      });
      showNotice(
        `ردیف «${dayLabel}» از تقویم ۳۰ روزه Google Sheets روی بوم اعمال شد!`
      );
      return;
    }

    const [, categoryLabel, eyebrow, headlineMain, highlight, leadCopy, stat] =
      row;
    onUpdateStory({
      ...activeStory,
      categoryLabel: categoryLabel || activeStory.categoryLabel,
      eyebrow: eyebrow || activeStory.eyebrow,
      headlinePart1: headlineMain || activeStory.headlinePart1,
      headlineHighlight: highlight || activeStory.headlineHighlight,
      headlinePart2: '',
      leadCopy: leadCopy || activeStory.leadCopy,
      primaryStatValue: stat
        ? stat.split('-')[0]?.trim() || activeStory.primaryStatValue
        : activeStory.primaryStatValue,
    });
    showNotice('ردیف انتخاب‌شده از Google Sheets مستقیماً روی بوم اعمال شد!');
  };

  // 4. Upload rendered PNG of active StoryCanvas directly to user's Google Drive
  const handleUploadCurrentPngToDrive = async () => {
    const token = accessToken || (await getAccessToken());
    if (!token) return;

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const dataUrl = await onRenderCanvasToPngDataUrl();
      if (!dataUrl) {
        throw new Error('امکان رندر تصویر PNG از بوم فعلی وجود نداشت.');
      }

      const base64Data = dataUrl.split(',')[1];
      const fileName = `arka-${activeFormat.id}-${activeStory.order}-${activeFormat.width}x${activeFormat.height}.png`;

      const metadata = {
        name: fileName,
        mimeType: 'image/png',
        description: `طراحی‌شده در استودیو اینستاگرام نرم‌افزار حسابداری آرکا (https://arka-acc.ir) - ${activeStory.titleShort}`,
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
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartBody,
        }
      );

      if (!uploadRes.ok) {
        throw new Error('خطا در آپلود فایل PNG در Google Drive.');
      }

      await fetchDriveAndSpreadsheetFiles();
      showNotice(
        `تصویر PNG بوم فعلی (${fileName}) مستقیماً در Google Drive شما ذخیره شد!`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'خطا در ذخیره فایل در Google Drive.');
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Delete file from Google Drive (Requires explicit confirmation modal)
  const requestDeleteDriveFile = (file: DriveFileItem) => {
    setPendingConfirmation({
      type: 'delete-drive-file',
      title: 'تایید حذف فایل از Google Drive',
      description: `آیا از حذف دائمی فایل «${file.name}» از حساب Google Drive خود اطمینان دارید؟ این عملیات قابل بازگشت نیست.`,
      confirmLabel: 'بله، حذف فایل از Drive',
      onConfirm: async () => {
        const token = accessToken || (await getAccessToken());
        if (!token) return;
        setIsLoading(true);
        try {
          const delRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}`,
            {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            }
          );

          if (!delRes.ok) {
            throw new Error('خطا در حذف فایل از Google Drive.');
          }

          setDriveFiles((prev) => prev.filter((f) => f.id !== file.id));
          setSpreadsheetsList((prev) => prev.filter((f) => f.id !== file.id));
          if (selectedSpreadsheetId === file.id) {
            setSelectedSpreadsheetId('');
            setSheetRows([]);
          }
          showNotice(`فایل «${file.name}» از Google Drive حذف شد.`);
        } catch (err: any) {
          setErrorMsg(err?.message || 'خطا در حذف فایل.');
        } finally {
          setIsLoading(false);
        }
      },
    });
  };

  return (
    <aside className="w-full lg:w-[460px] shrink-0 bg-white border border-[#e3e9ed] rounded-[20px] shadow-sm flex flex-col overflow-hidden text-[#233b53] relative">
      {/* Header */}
      <div className="px-5 py-4 bg-[#062959] text-white flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-white">
            اتصال Google Sheets و Google Drive آرکا
          </h2>
          <p className="text-[11px] text-[#a4d2d1] mt-0.5">
            مدیریت تقویم محتوایی در Sheets و ذخیره مستقیم PNG در Drive
          </p>
        </div>
        {accessToken && !needsAuth && (
          <button
            type="button"
            disabled={isLoading}
            onClick={fetchDriveAndSpreadsheetFiles}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0b2b56] hover:bg-[#08cdbd] hover:text-[#062959] text-[11px] font-bold text-[#14dac3] border border-[#14dac3]/30 transition-colors cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
            />
            <span>بروزرسانی</span>
          </button>
        )}
      </div>

      {/* Sub-navigation between Google Sheets and Google Drive */}
      <div className="p-2 bg-[#f5f8fa] border-b border-[#e3e9ed] grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => setActiveSubTab('sheets')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-colors cursor-pointer min-h-[42px] ${
            activeSubTab === 'sheets'
              ? 'bg-[#062959] text-white shadow-xs'
              : 'text-[#233b53] hover:bg-white'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 shrink-0" />
          <span>بانک محتوا در Google Sheets</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('drive')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-colors cursor-pointer min-h-[42px] ${
            activeSubTab === 'drive'
              ? 'bg-[#062959] text-white shadow-xs'
              : 'text-[#233b53] hover:bg-white'
          }`}
        >
          <HardDrive className="w-4 h-4 shrink-0" />
          <span>ذخیره و مدیریت Google Drive</span>
        </button>
      </div>

      <div className="p-5 space-y-4 overflow-y-auto max-h-[700px]">
        {/* Show Official "Sign in with Google" button when token is unavailable */}
        {needsAuth || !accessToken ? (
          <div className="p-6 rounded-2xl bg-[#f5f8fa] border border-[#e3e9ed] text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#062959] text-[#08cdbd] flex items-center justify-center mx-auto">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-black text-[#062959]">
                اتصال به Google Drive و Google Sheets
              </h3>
              <p className="text-xs text-[#7e8c9b] leading-relaxed">
                {currentUser
                  ? 'برای فعال‌سازی دسترسی مستقیم به فایل‌های Google Sheets و ذخیره تصاویر استوری در Google Drive، یک بار دکمه زیر را بزنید:'
                  : 'با ورود از طریق حساب گوگل (Gmail)، می‌توانید تقویم کمپین‌های آرکا را در Google Sheets بسازید و خروجی‌های PNG را مستقیم در Google Drive ذخیره کنید.'}
              </p>
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                disabled={isSigningIn}
                onClick={onGoogleSignIn}
                className="gsi-material-button inline-flex items-center justify-center gap-3 px-5 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 shadow-xs text-sm font-bold text-slate-800 cursor-pointer transition-all min-h-[44px]"
              >
                <div className="gsi-material-button-state" />
                <div className="gsi-material-button-content-wrapper flex items-center gap-2.5">
                  <div className="gsi-material-button-icon w-5 h-5">
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
            </div>
          </div>
        ) : (
          <>
            {statusMsg && (
              <div className="p-3 rounded-xl bg-[#e5fbf9] border border-[#08cdbd] text-[#062959] text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#089f93] shrink-0" />
                <span>{statusMsg}</span>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* ==================== TAB 1: GOOGLE SHEETS ==================== */}
            {activeSubTab === 'sheets' && (
              <div className="space-y-4">
                {/* Create New Arka Campaign Spreadsheet */}
                <form
                  onSubmit={handleCreateNewArkaSpreadsheet}
                  className="p-4 rounded-xl bg-[#f5f8fa] border border-[#08cdbd] space-y-2.5"
                >
                  <label className="block text-xs font-black text-[#062959]">
                    ۱. ساخت فایل جدید تقویم کمپین آرکا در Google Sheets
                  </label>
                  <input
                    type="text"
                    required
                    value={newSpreadsheetTitle}
                    onChange={(e) => setNewSpreadsheetTitle(e.target.value)}
                    placeholder="نام فایل Google Sheets..."
                    className="w-full bg-white border border-[#e3e9ed] rounded-lg px-3 py-2 text-xs text-[#062959] outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2 px-3 rounded-lg bg-[#08cdbd] hover:bg-[#14dac3] text-[#062959] font-black text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    <span>
                      ایجاد جدول جدید در Google Sheets با ۶ طرح آرکا
                    </span>
                  </button>
                </form>

                {/* Select Existing Spreadsheet & Tab */}
                <div className="p-4 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] space-y-3">
                  <div>
                    <label className="block text-xs font-black text-[#062959] mb-1">
                      ۲. انتخاب فایل Google Sheets موجود در حساب شما
                    </label>
                    {spreadsheetsList.length === 0 ? (
                      <p className="text-xs text-[#7e8c9b]">
                        فایل Google Sheets یافت نشد. با دکمه بالا یک جدول جدید بسازید.
                      </p>
                    ) : (
                      <select
                        value={selectedSpreadsheetId}
                        onChange={(e) =>
                          setSelectedSpreadsheetId(e.target.value)
                        }
                        className="w-full bg-white border border-[#e3e9ed] rounded-lg px-3 py-2 text-xs font-bold text-[#062959] outline-none"
                      >
                        {spreadsheetsList.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {sheetTabs.length > 0 && (
                    <div>
                      <label className="block text-xs font-bold text-[#062959] mb-1">
                        انتخاب تب داخل شیت (واکشی پویا از متادیتا):
                      </label>
                      <select
                        value={selectedSheetTabTitle}
                        onChange={(e) => {
                          setSelectedSheetTabTitle(e.target.value);
                          fetchSheetTabValues(
                            selectedSpreadsheetId,
                            e.target.value
                          );
                        }}
                        className="w-full bg-white border border-[#e3e9ed] rounded-lg px-3 py-2 text-xs font-bold text-[#062959] outline-none"
                      >
                        {sheetTabs.map((t) => (
                          <option key={t.sheetId} value={t.title}>
                            {t.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {selectedSpreadsheetId && selectedSheetTabTitle && (
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={requestAppendActiveStoryToSheet}
                      className="w-full py-2 px-3 rounded-lg bg-[#062959] hover:bg-[#0b2b56] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]"
                    >
                      <Table className="w-3.5 h-3.5 text-[#14dac3]" />
                      <span>
                        افزودن متن بوم فعلی («{activeStory.titleShort}») به این شیت
                      </span>
                    </button>
                  )}
                </div>

                {/* Display Rows & 1-Click Canvas Injection */}
                {sheetRows.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-black text-[#062959]">
                      ردیف‌های خوانده‌شده از تب «{selectedSheetTabTitle}» (کلیک برای تزریق به بوم):
                    </div>
                    <div className="space-y-2 max-h-[260px] overflow-y-auto">
                      {sheetRows.slice(1).map((row, rIdx) => (
                        <div
                          key={rIdx}
                          className="p-3 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-bold text-[#089f93] truncate">
                              {row[1] || 'ردیف شیت'} · {row[2] || ''}
                            </div>
                            <div className="text-xs font-black text-[#062959] truncate">
                              {row[3]} {row[4]}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleApplySheetRowToCanvas(row)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#e3e9ed] hover:border-[#08cdbd] text-[11px] font-bold text-[#062959] shrink-0 cursor-pointer"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5 text-[#089f93]" />
                            <span>اعمال به بوم</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ==================== TAB 2: GOOGLE DRIVE ==================== */}
            {activeSubTab === 'drive' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-[#062959] text-white space-y-2.5">
                  <div className="text-xs font-bold text-[#14dac3]">
                    ذخیره مستقیم گرافیک آرکا در فضای ابری Google Drive
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    بوم فعلی («{activeStory.titleShort}») را با ابعاد استاندارد{' '}
                    <span className="font-bold text-[#14dac3] tabular-nums-fa">
                      {activeFormat.width}×{activeFormat.height}
                    </span>{' '}
                    به‌صورت فایل PNG مستقیم در Google Drive خود آپلود کنید.
                  </p>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={handleUploadCurrentPngToDrive}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#08cdbd] hover:bg-[#14dac3] text-[#062959] font-black text-xs inline-flex items-center justify-center gap-2 cursor-pointer min-h-[42px]"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UploadCloud className="w-4 h-4" />
                    )}
                    <span>
                      آپلود مستقیم PNG بوم فعلی در Google Drive
                    </span>
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-black text-[#062959]">
                    فایل‌های اخیر شما در Google Drive ({driveFiles.length}):
                  </div>

                  {driveFiles.length === 0 ? (
                    <div className="p-5 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] text-center text-xs text-[#7e8c9b]">
                      فایلی یافت نشد.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {driveFiles.map((file) => (
                        <div
                          key={file.id}
                          className="p-3 rounded-xl bg-[#f5f8fa] border border-[#e3e9ed] flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-black text-[#062959] truncate">
                              {file.name}
                            </div>
                            <div className="text-[11px] text-[#7e8c9b]">
                              {file.mimeType.includes('spreadsheet')
                                ? 'جدول Google Sheets'
                                : 'تصویر PNG استودیو آرکا'}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {file.webViewLink && (
                              <a
                                href={file.webViewLink}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 rounded-lg bg-white border border-[#e3e9ed] hover:border-[#08cdbd] text-[#062959]"
                                title="مشاهده در Google Drive"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => requestDeleteDriveFile(file)}
                              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 cursor-pointer"
                              title="حذف فایل از Google Drive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ==================== MANDATORY USER CONFIRMATION DIALOG ==================== */}
      {pendingConfirmation && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#e3e9ed] rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 text-right">
            <div className="flex items-center gap-2.5 text-[#062959]">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-black">
                {pendingConfirmation.title}
              </h3>
            </div>

            <p className="text-xs text-[#233b53] leading-relaxed">
              {pendingConfirmation.description}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e3e9ed]">
              <button
                type="button"
                onClick={() => setPendingConfirmation(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-[#233b53] cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={async () => {
                  const action = pendingConfirmation.onConfirm;
                  setPendingConfirmation(null);
                  await action();
                }}
                className={`px-4 py-2 rounded-xl text-xs font-black text-white cursor-pointer ${
                  pendingConfirmation.type === 'delete-drive-file'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-[#062959] hover:bg-[#0b2b56]'
                }`}
              >
                {pendingConfirmation.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
