// Firebase client SDK initialization. Keys here are PUBLIC client config (not secrets).
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported as analyticsSupported, type Analytics } from "firebase/analytics";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MSG_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export let persistentFirestoreCache = true;
export let db: Firestore;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch (error) {
  persistentFirestoreCache = false;
  console.error("Persistent Firestore cache is unavailable; offline inventory reads may not work.", error);
  db = getFirestore(app);
}
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// Analytics: only init in browser when supported (skips SSR / unsupported envs).
export let analytics: Analytics | null = null;
if (typeof window !== "undefined" && firebaseConfig.measurementId) {
  analyticsSupported()
    .then((ok) => { if (ok) analytics = getAnalytics(app); })
    .catch(() => { /* silently ignore analytics init errors */ });
}
