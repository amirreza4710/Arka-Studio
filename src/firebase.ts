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

// Validate connection to Firestore on boot
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

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningInFlow = false;
// Cache the access token in memory ONLY (never stored in localStorage/sessionStorage).
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

export const signInWithGmail = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    isSigningInFlow = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken || '';
    cachedAccessToken = token || null;
    return { user: result.user, accessToken: token };
  } catch (error: any) {
    const code = error?.code || '';
    if (
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/cancelled-popup-request' ||
      code === 'auth/popup-blocked'
    ) {
      return null;
    }
    return null;
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
  | 'campaign-plan';

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
  const serialized = JSON.stringify(params.contentObj).slice(0, 24500);
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
      limit(15)
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
