// firebase-config.js
// Configuración de Firebase para el Hospital Susana López de Valencia

// TODO: Reemplaza con tu configuración real de Firebase
const firebaseConfig = {
  apiKey: "Gestion-de-solicitudes",
  authDomain: "gestion-de-solicitudes-25a93.firebaseapp.com",
  projectId: "gestion-de-solicitudes",
  storageBucket: "gestion-de-solicitudes.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

// Inicializar Firebase
import { initializeApp } from 'firebase/app';
import { getFirestore, enableNetwork, disableNetwork } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Configurar persistencia offline
enableNetwork(db).catch((error) => {
  console.log("Error habilitando red:", error);
});

console.log("🔥 Firebase inicializado correctamente");

// Función para verificar conectividad
export function checkFirebaseConnection() {
  return new Promise((resolve) => {
    // Intenta una operación simple para verificar conectividad
    import { doc, getDoc } from 'firebase/firestore';
    
    const testDoc = doc(db, 'system', 'health-check');
    getDoc(testDoc)
      .then(() => {
        console.log("✅ Conexión a Firebase establecida");
        resolve(true);
      })
      .catch((error) => {
        console.log("❌ Sin conexión a Firebase, usando modo offline:", error);
        resolve(false);
      });
  });
}

// Función para manejar errores de red
export function handleNetworkError(error, fallbackData = null) {
  console.warn("⚠️ Error de red detectado:", error);
  
  if (fallbackData) {
    console.log("📦 Usando datos de respaldo");
    return fallbackData;
  }
  
  throw new Error("Sin conexión a internet y sin datos de respaldo disponibles");
}