
export const firebaseConfig = {
  apiKey: "AIzaSyDhauGu-uICwYM8CFfHuvLPH6yZDgk9ryA",
  authDomain: "random-210e7.firebaseapp.com",
  projectId: "random-210e7",
  storageBucket: "random-210e7.firebasestorage.app",
  messagingSenderId: "637536228608",
  appId: "1:637536228608:web:a0da4794153e332cd6cfe5",
  measurementId: "G-SQF9ZGM08J"
};

const isReal = v => v && !String(v).startsWith("REPLACE_WITH");

export const isFirebaseConfigured =
  isReal(firebaseConfig.apiKey) &&
  isReal(firebaseConfig.projectId) &&
  isReal(firebaseConfig.appId);
