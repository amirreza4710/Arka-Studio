import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  collection,
  setDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  ArkaBrandProfile,
  DEFAULT_ARKA_BRAND_PROFILE,
} from './config/arkaCore';

// Immediately purge any legacy plaintext API keys from browser storage on startup
try {
  if (typeof window !== 'undefined') {
    window.localStorage?.removeItem('arka_custom_byok_v1');
    window.sessionStorage?.removeItem('arka_custom_byok_v1');
  }
} catch {
  // Ignore storage access errors
}

const app = initializeApp(firebaseConfig);
const firestoreDbId =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  'ai-studio-477b1a91-56e7-4038-8d3f-ce085b681973';
export const db = getFirestore(app, firestoreDbId);
export const auth = getAuth(app);

export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.activity',
  'https://www.googleapis.com/auth/drive.activity.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.apps.readonly',
  'https://www.googleapis.com/auth/drive.install',
  'https://www.googleapis.com/auth/drive.meet.readonly',
  'https://www.googleapis.com/auth/drive.metadata',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.photos.readonly',
  'https://www.googleapis.com/auth/drive.scripts',
];

const googleProvider = new GoogleAuthProvider();
SCOPES.forEach((scope) => googleProvider.addScope(scope));

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.warn('Please check your Firebase configuration.');
    }
  }
}
testConnection();

let isSigningInFlow = false;
// Cache the Workspace OAuth access token in memory ONLY (never stored in localStorage/sessionStorage).
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: (user: User | null) => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningInFlow) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure(user);
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure(null);
    }
  });
};

export interface GmailSignInResult {
  ok: boolean;
  user?: User;
  accessToken?: string;
  errorCode?: string;
  errorMessageFa?: string;
}

function mapFirebaseAuthErrorToFa(code: string, fallbackMessage?: string): string {
  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'پنجره ورود گوگل قبل از تکمیل بسته شد.';
    case 'auth/cancelled-popup-request':
      return 'درخواست هم‌زمان ورود لغو شد. لطفاً یک بار دیگر تلاش کنید.';
    case 'auth/popup-blocked':
      return 'پنجره ورود (Popup) توسط مرورگر مسدود شد. لطفاً اجازه باز شدن Popup را در مرورگر فعال کنید.';
    case 'auth/unauthorized-domain':
      return 'این دامنه در فهرست دامنه‌های مجاز Firebase Authentication ثبت نشده است.';
    case 'auth/operation-not-allowed':
      return 'ورود با Google در تنظیمات Firebase Authentication فعال نیست.';
    case 'auth/network-request-failed':
      return 'خطای ارتباط شبکه هنگام اتصال به سرور احراز هویت گوگل.';
    default:
      return fallbackMessage || 'ورود با حساب گوگل انجام نشد. لطفاً دوباره تلاش کنید.';
  }
}

export const signInWithGmail = async (): Promise<GmailSignInResult> => {
  try {
    isSigningInFlow = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken || '';
    cachedAccessToken = token || null;
    return { ok: true, user: result.user, accessToken: token };
  } catch (error: any) {
    const code = String(error?.code || 'auth/unknown');
    return {
      ok: false,
      errorCode: code,
      errorMessageFa: mapFirebaseAuthErrorToFa(code, error?.message),
    };
  } finally {
    isSigningInFlow = false;
  }
};

export const signOutGmail = async (): Promise<void> => {
  await auth.signOut();
  cachedAccessToken = null;
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const getFirebaseIdToken = async (): Promise<string | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
};

export const subscribeToAuthChanges = (
  callback: (user: User | null, token: string | null) => void
) => {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedAccessToken = null;
    }
    callback(user, cachedAccessToken);
  });
};

export type AiGenMode =
  | 'canvas-slide'
  | 'carousel-deck'
  | 'reels-script'
  | 'campaign-plan'
  | 'campaign-calendar-30'
  | 'seo-article';

export interface SavedAiGenerationItem {
  id: string;
  userId: string;
  mode: AiGenMode;
  productId: string;
  title: string;
  contentJson: string;
  createdAtLabel: string;
}

export async function saveUserAiGeneration(params: {
  mode: AiGenMode;
  productId: string;
  title: string;
  contentObj: unknown;
}): Promise<SavedAiGenerationItem | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;

  const genId = `gen_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)
    .replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const path = `users/${currentUser.uid}/aiGenerations/${genId}`;

  const safeTitle = (params.title || 'محتوای هوشمند آرکا').slice(0, 290);
  const serialized = JSON.stringify(params.contentObj).slice(0, 58000);
  const safeProductId = (params.productId || 'arka-comprehensive').slice(0, 95);

  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'aiGenerations', genId), {
      userId: currentUser.uid,
      mode: params.mode,
      productId: safeProductId,
      title: safeTitle,
      contentJson: serialized,
      createdAt: serverTimestamp(),
    });

    return {
      id: genId,
      userId: currentUser.uid,
      mode: params.mode,
      productId: safeProductId,
      title: safeTitle,
      contentJson: serialized,
      createdAtLabel: new Intl.DateTimeFormat('fa-IR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date()),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function fetchUserAiGenerations(): Promise<
  SavedAiGenerationItem[]
> {
  const currentUser = auth.currentUser;
  if (!currentUser) return [];

  const path = `users/${currentUser.uid}/aiGenerations`;
  try {
    const q = query(
      collection(db, 'users', currentUser.uid, 'aiGenerations'),
      where('userId', '==', currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      let createdAtLabel = 'امروز';
      if (data.createdAt instanceof Timestamp) {
        createdAtLabel = new Intl.DateTimeFormat('fa-IR', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(data.createdAt.toDate());
      }
      return {
        id: d.id,
        userId: String(data.userId || currentUser.uid),
        mode: (data.mode as AiGenMode) || 'canvas-slide',
        productId: String(data.productId || 'arka-comprehensive'),
        title: String(data.title || 'محتوای آرکا'),
        contentJson: String(data.contentJson || '{}'),
        createdAtLabel,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function deleteUserAiGeneration(genId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  const path = `users/${currentUser.uid}/aiGenerations/${genId}`;
  try {
    await deleteDoc(doc(db, 'users', currentUser.uid, 'aiGenerations', genId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export interface UserStudioPreferences {
  darkMode: boolean;
  preferredConnectionMode:
    | 'gmail-authenticated'
    | 'custom-byok'
    | 'studio-creator-core';
}

export async function saveUserStudioPreferences(
  prefs: UserStudioPreferences
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  const path = `users/${currentUser.uid}/settings/preferences`;
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'settings', 'preferences'), {
      userId: currentUser.uid,
      darkMode: Boolean(prefs.darkMode),
      preferredConnectionMode: prefs.preferredConnectionMode,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchUserStudioPreferences(): Promise<UserStudioPreferences | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;

  const path = `users/${currentUser.uid}/settings/preferences`;
  try {
    const snap = await getDoc(
      doc(db, 'users', currentUser.uid, 'settings', 'preferences')
    );
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      darkMode: Boolean(data.darkMode),
      preferredConnectionMode:
        data.preferredConnectionMode === 'gmail-authenticated'
          ? 'gmail-authenticated'
          : data.preferredConnectionMode === 'custom-byok'
          ? 'custom-byok'
          : 'studio-creator-core',
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveUserBrandProfile(
  profile: ArkaBrandProfile
): Promise<ArkaBrandProfile> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return {
      ...DEFAULT_ARKA_BRAND_PROFILE,
      ...profile,
      orgId: 'arka_org',
    };
  }

  const orgPath = 'organizations/arka_org/settings/brandProfile';
  const nextVersion = Math.max(1, Number(profile.version || 1) + 1);
  const updatedProfile: ArkaBrandProfile = {
    ...DEFAULT_ARKA_BRAND_PROFILE,
    ...profile,
    orgId: 'arka_org',
    version: nextVersion,
    updatedByEmail: currentUser.email || 'admin@arka-acc.ir',
    updatedAt: new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date()),
  };
  const serialized = JSON.stringify(updatedProfile).slice(0, 24000);

  try {
    await setDoc(doc(db, 'organizations', 'arka_org', 'settings', 'brandProfile'), {
      orgId: 'arka_org',
      version: nextVersion,
      updatedByUid: currentUser.uid,
      updatedByEmail: String(currentUser.email || 'admin@arka-acc.ir').slice(0, 195),
      profileJson: serialized,
      updatedAt: serverTimestamp(),
    });
    return updatedProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, orgPath);
  }
}

export async function fetchUserBrandProfile(): Promise<ArkaBrandProfile | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;

  const orgPath = 'organizations/arka_org/settings/brandProfile';
  try {
    const orgSnap = await getDoc(
      doc(db, 'organizations', 'arka_org', 'settings', 'brandProfile')
    );
    if (orgSnap.exists()) {
      const data = orgSnap.data();
      if (data?.profileJson) {
        const parsed = JSON.parse(String(data.profileJson));
        return {
          ...DEFAULT_ARKA_BRAND_PROFILE,
          ...parsed,
          orgId: 'arka_org',
          version: Number(data.version || parsed.version || 1),
          updatedByEmail: String(data.updatedByEmail || parsed.updatedByEmail || ''),
        };
      }
    }

    // Safe, non-destructive backward-compatible fallback: inspect legacy /users/{uid}/settings/brandProfile
    const legacySnap = await getDoc(
      doc(db, 'users', currentUser.uid, 'settings', 'brandProfile')
    );
    if (!legacySnap.exists()) return null;
    const legacyData = legacySnap.data();
    if (!legacyData?.profileJson) return null;
    const parsedLegacy = JSON.parse(String(legacyData.profileJson));
    return {
      ...DEFAULT_ARKA_BRAND_PROFILE,
      ...parsedLegacy,
      orgId: 'arka_org',
      version: Number(parsedLegacy.version || 1),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, orgPath);
  }
}

