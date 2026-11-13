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
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

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
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

// In-memory access token cache (never stored in localStorage)
let cachedGoogleAccessToken: string | null = null;

export const signInWithGmail = async (): Promise<{
  user: User;
  accessToken: string | null;
}> => {
  const result = await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  cachedGoogleAccessToken = credential?.accessToken || null;
  return { user: result.user, accessToken: cachedGoogleAccessToken };
};

export const signOutGmail = async (): Promise<void> => {
  cachedGoogleAccessToken = null;
  await auth.signOut();
};

export const getCachedGoogleAccessToken = (): string | null => {
  return cachedGoogleAccessToken;
};

export const subscribeToAuthChanges = (
  callback: (user: User | null) => void
) => {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedGoogleAccessToken = null;
    }
    callback(user);
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
