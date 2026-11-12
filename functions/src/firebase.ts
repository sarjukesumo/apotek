// Firebase Admin singleton + Firestore helpers.
import { getAuth } from "firebase-admin/auth";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) initializeApp();

export const db = getFirestore();
export { FieldValue, Timestamp };
export const auth = getAuth();
