import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAQjVfBYY7wdTTRABdYYIBsg-tiTCnzgmI",
  authDomain: "attendance-management-aaafc.firebaseapp.com",
  projectId: "attendance-management-aaafc",
  storageBucket: "attendance-management-aaafc.firebasestorage.app",
  messagingSenderId: "304240929184",
  appId: "1:304240929184:web:59d73599fdd28e45f31cc5",
  measurementId: "G-FBVV2RZJYQ"
};

const app = initializeApp(firebaseConfig);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
const db = getFirestore(app);

// Dynamic Initialization for Private Admin Firestore projects
const getAdminFirestore = (config) => {
  if (!config || !config.apiKey || !config.projectId) {
    return db; // Fallback to master DB if no valid config
  }
  
  // Return the Firestore instance for the specified project. 
  // We use the projectId as the unique app name to avoid re-initialization errors.
  try {
    const existingApp = (typeof window !== 'undefined' && window.firebaseApps?.[config.projectId]) 
      || initializeApp(config, config.projectId);
    
    // Store in a global cache to avoid "duplicate app" errors on re-renders
    if (typeof window !== 'undefined') {
       window.firebaseApps = window.firebaseApps || {};
       window.firebaseApps[config.projectId] = existingApp;
    }
    
    return getFirestore(existingApp);
  } catch (error) {
    console.error("Firebase Initialization Error:", error);
    return db;
  }
};

export { app, analytics, db, getAdminFirestore };
