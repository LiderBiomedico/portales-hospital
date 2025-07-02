// firebase-data.js
// Gestor de datos para reemplazar localStorage con Firebase Firestore

import { db } from './firebase-config.js';
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  serverTimestamp,
  enableNetwork,
  disableNetwork
} from 'firebase/firestore';

// ===== CONFIGURACIÓN DE COLECCIONES =====
const COLLECTIONS = {
  SOLICITUDES: 'solicitudes_mantenimiento',
  ACCESS_REQUESTS: 'solicitudes_acceso',
  APPROVED_USERS: 'usuarios_aprobados',
  TECHNICIANS: 'tecnicos',
  REJECTED_USERS: 'usuarios_rechazados',
  SYSTEM_CONFIG: 'configuracion_sistema'
};

// ===== CLASE PRINCIPAL DEL GESTOR DE DATOS =====
class FirebaseDataManager {
  constructor() {
    this.isOnline = true;
    this.cache = new Map();
    this.listeners = new Map();
    this.retryAttempts = 3;
    this.retryDelay = 1000;
    
    this.monitorConnection();
  }

  // ===== MONITOREO DE CONEXIÓN =====
  monitorConnection() {
    window.addEventListener('online', () => {
      console.log("🌐 Conexión restaurada, habilitando Firebase");
      this.isOnline = true;
      enableNetwork(db);
      this.syncOfflineChanges();
    });

    window.addEventListener('offline', () => {
      console.log("📴 Sin conexión, modo offline activado");
      this.isOnline = false;
      disableNetwork(db);
    });
  }

  // ===== OPERACIONES BÁSICAS =====
  
  /**
   * Guardar documento en Firestore
   */
  async saveDocument(collectionName, docId, data) {
    try {
      const docData = {
        ...data,
        lastUpdated: serverTimestamp(),
        version: (data.version || 0) + 1
      };

      if (docId) {
        await setDoc(doc(db, collectionName, docId), docData);
      } else {
        const docRef = await addDoc(collection(db, collectionName), docData);
        docId = docRef.id;
      }

      // Actualizar cache local
      this.updateCache(collectionName, docId, docData);
      
      console.log(`✅ Documento guardado en ${collectionName}:`, docId);
      return { id: docId, ...docData };

    } catch (error) {
      console.error(`❌ Error guardando en ${collectionName}:`, error);
      
      // Fallback: guardar en cache para sincronizar después
      if (!this.isOnline) {
        this.saveToOfflineCache(collectionName, docId, data);
        return { id: docId || Date.now().toString(), ...data };
      }
      
      throw error;
    }
  }

  /**
   * Obtener documento de Firestore
   */
  async getDocument(collectionName, docId) {
    try {
      const docRef = doc(db, collectionName, docId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() };
        this.updateCache(collectionName, docId, data);
        return data;
      } else {
        console.log(`📄 Documento no encontrado: ${collectionName}/${docId}`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Error obteniendo documento ${collectionName}/${docId}:`, error);
      
      // Fallback: buscar en cache
      return this.getFromCache(collectionName, docId);
    }
  }

  /**
   * Obtener todos los documentos de una colección
   */
  async getCollection(collectionName, filters = []) {
    try {
      let q = collection(db, collectionName);
      
      // Aplicar filtros si existen
      for (const filter of filters) {
        q = query(q, where(filter.field, filter.operator, filter.value));
      }
      
      // Ordenar por fecha de actualización
      q = query(q, orderBy('lastUpdated', 'desc'));
      
      const querySnapshot = await getDocs(q);
      const documents = [];
      
      querySnapshot.forEach((doc) => {
        const data = { id: doc.id, ...doc.data() };
        documents.push(data);
        this.updateCache(collectionName, doc.id, data);
      });
      
      console.log(`📚 Obtenidos ${documents.length} documentos de ${collectionName}`);
      return documents;
      
    } catch (error) {
      console.error(`❌ Error obteniendo colección ${collectionName}:`, error);
      
      // Fallback: devolver cache
      return this.getCachedCollection(collectionName);
    }
  }

  /**
   * Actualizar documento
   */
  async updateDocument(collectionName, docId, updates) {
    try {
      const docRef = doc(db, collectionName, docId);
      const updateData = {
        ...updates,
        lastUpdated: serverTimestamp(),
        version: (updates.version || 0) + 1
      };
      
      await updateDoc(docRef, updateData);
      
      // Actualizar cache
      const cachedDoc = this.getFromCache(collectionName, docId) || {};
      this.updateCache(collectionName, docId, { ...cachedDoc, ...updateData });
      
      console.log(`🔄 Documento actualizado: ${collectionName}/${docId}`);
      return { id: docId, ...cachedDoc, ...updateData };
      
    } catch (error) {
      console.error(`❌ Error actualizando ${collectionName}/${docId}:`, error);
      throw error;
    }
  }

  /**
   * Eliminar documento
   */
  async deleteDocument(collectionName, docId) {
    try {
      await deleteDoc(doc(db, collectionName, docId));
      this.removeFromCache(collectionName, docId);
      console.log(`🗑️ Documento eliminado: ${collectionName}/${docId}`);
      return true;
    } catch (error) {
      console.error(`❌ Error eliminando ${collectionName}/${docId}:`, error);
      throw error;
    }
  }

  // ===== LISTENERS EN TIEMPO REAL =====
  
  /**
   * Escuchar cambios en tiempo real
   */
  setupRealtimeListener(collectionName, callback, filters = []) {
    try {
      let q = collection(db, collectionName);
      
      // Aplicar filtros
      for (const filter of filters) {
        q = query(q, where(filter.field, filter.operator, filter.value));
      }
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const changes = {
          added: [],
          modified: [],
          removed: []
        };
        
        snapshot.docChanges().forEach((change) => {
          const data = { id: change.doc.id, ...change.doc.data() };
          
          if (change.type === 'added') {
            changes.added.push(data);
          } else if (change.type === 'modified') {
            changes.modified.push(data);
          } else if (change.type === 'removed') {
            changes.removed.push(data);
          }
          
          // Actualizar cache
          if (change.type !== 'removed') {
            this.updateCache(collectionName, change.doc.id, data);
          } else {
            this.removeFromCache(collectionName, change.doc.id);
          }
        });
        
        console.log(`🔄 Cambios en tiempo real detectados en ${collectionName}:`, changes);
        callback(changes);
      }, (error) => {
        console.error(`❌ Error en listener de ${collectionName}:`, error);
      });
      
      // Guardar referencia del listener
      this.listeners.set(collectionName, unsubscribe);
      
      return unsubscribe;
    } catch (error) {
      console.error(`❌ Error configurando listener para ${collectionName}:`, error);
      return null;
    }
  }

  /**
   * Detener listener
   */
  stopListener(collectionName) {
    const unsubscribe = this.listeners.get(collectionName);
    if (unsubscribe) {
      unsubscribe();
      this.listeners.delete(collectionName);
      console.log(`🔇 Listener detenido para ${collectionName}`);
    }
  }

  // ===== GESTIÓN DE CACHE =====
  
  updateCache(collectionName, docId, data) {
    if (!this.cache.has(collectionName)) {
      this.cache.set(collectionName, new Map());
    }
    this.cache.get(collectionName).set(docId, data);
  }

  getFromCache(collectionName, docId) {
    const collectionCache = this.cache.get(collectionName);
    return collectionCache ? collectionCache.get(docId) : null;
  }

  getCachedCollection(collectionName) {
    const collectionCache = this.cache.get(collectionName);
    return collectionCache ? Array.from(collectionCache.values()) : [];
  }

  removeFromCache(collectionName, docId) {
    const collectionCache = this.cache.get(collectionName);
    if (collectionCache) {
      collectionCache.delete(docId);
    }
  }

  // ===== GESTIÓN OFFLINE =====
  
  saveToOfflineCache(collectionName, docId, data) {
    const offlineKey = `offline_${collectionName}_${docId || Date.now()}`;
    localStorage.setItem(offlineKey, JSON.stringify({
      collectionName,
      docId,
      data,
      timestamp: Date.now(),
      operation: 'save'
    }));
  }

  async syncOfflineChanges() {
    console.log("🔄 Sincronizando cambios offline...");
    
    const offlineKeys = Object.keys(localStorage).filter(key => key.startsWith('offline_'));
    
    for (const key of offlineKeys) {
      try {
        const offlineChange = JSON.parse(localStorage.getItem(key));
        
        await this.saveDocument(
          offlineChange.collectionName, 
          offlineChange.docId, 
          offlineChange.data
        );
        
        localStorage.removeItem(key);
        console.log(`✅ Cambio offline sincronizado: ${key}`);
      } catch (error) {
        console.error(`❌ Error sincronizando ${key}:`, error);
      }
    }
  }

  // ===== MÉTODOS DE UTILIDAD =====
  
  /**
   * Obtener estadísticas de uso
   */
  async getSystemStats() {
    try {
      const stats = {
        totalSolicitudes: 0,
        totalTechnicians: 0,
        totalUsers: 0,
        lastSync: new Date()
      };

      const collections = [
        COLLECTIONS.SOLICITUDES,
        COLLECTIONS.TECHNICIANS,
        COLLECTIONS.APPROVED_USERS
      ];

      for (const collectionName of collections) {
        const docs = await this.getCollection(collectionName);
        
        if (collectionName === COLLECTIONS.SOLICITUDES) {
          stats.totalSolicitudes = docs.length;
        } else if (collectionName === COLLECTIONS.TECHNICIANS) {
          stats.totalTechnicians = docs.length;
        } else if (collectionName === COLLECTIONS.APPROVED_USERS) {
          stats.totalUsers = docs.length;
        }
      }

      return stats;
    } catch (error) {
      console.error("❌ Error obteniendo estadísticas:", error);
      return null;
    }
  }

  /**
   * Limpiar cache
   */
  clearCache() {
    this.cache.clear();
    console.log("🧹 Cache limpiado");
  }

  /**
   * Verificar salud del sistema
   */
  async healthCheck() {
    try {
      const healthDoc = await this.getDocument(COLLECTIONS.SYSTEM_CONFIG, 'health');
      
      if (!healthDoc) {
        // Crear documento de salud si no existe
        await this.saveDocument(COLLECTIONS.SYSTEM_CONFIG, 'health', {
          status: 'active',
          lastCheck: serverTimestamp(),
          version: '1.0.0'
        });
      }

      console.log("💚 Sistema saludable");
      return true;
    } catch (error) {
      console.error("💔 Error en health check:", error);
      return false;
    }
  }
}

// ===== FUNCIONES ESPECÍFICAS PARA EL HOSPITAL =====

/**
 * Gestor especializado para solicitudes de mantenimiento
 */
export class SolicitudesManager extends FirebaseDataManager {
  
  async guardarSolicitud(solicitud) {
    const solicitudData = {
      ...solicitud,
      fechaCreacionISO: new Date().toISOString(),
      fechaCreacion: new Date().toLocaleString('es-CO'),
      estado: 'PENDIENTE',
      estadoGestion: 'PENDIENTE'
    };
    
    return await this.saveDocument(COLLECTIONS.SOLICITUDES, solicitud.numero, solicitudData);
  }

  async obtenerSolicitudesPorArea(area) {
    return await this.getCollection(COLLECTIONS.SOLICITUDES, [
      { field: 'servicioIngenieria', operator: '==', value: area }
    ]);
  }

  async obtenerSolicitudesPorUsuario(email) {
    return await this.getCollection(COLLECTIONS.SOLICITUDES, [
      { field: 'emailSolicitante', operator: '==', value: email }
    ]);
  }

  async asignarTecnico(numeroSolicitud, tecnicoData) {
    return await this.updateDocument(COLLECTIONS.SOLICITUDES, numeroSolicitud, {
      tecnicoAsignado: tecnicoData.nombre,
      tecnicoAsignadoId: tecnicoData.id,
      estadoGestion: 'ASIGNADA',
      fechaAsignacion: new Date().toLocaleString('es-CO')
    });
  }

  configurarListenerSolicitudes(callback) {
    return this.setupRealtimeListener(COLLECTIONS.SOLICITUDES, callback);
  }
}

/**
 * Gestor para técnicos
 */
export class TechnicosManager extends FirebaseDataManager {
  
  async guardarTecnico(tecnico) {
    return await this.saveDocument(COLLECTIONS.TECHNICIANS, tecnico.id, tecnico);
  }

  async obtenerTecnicosPorArea(area) {
    return await this.getCollection(COLLECTIONS.TECHNICIANS, [
      { field: 'area', operator: '==', value: area }
    ]);
  }

  async obtenerTecnicosDisponibles() {
    return await this.getCollection(COLLECTIONS.TECHNICIANS, [
      { field: 'estado', operator: '==', value: 'disponible' }
    ]);
  }

  async cambiarEstadoTecnico(tecnicoId, nuevoEstado) {
    return await this.updateDocument(COLLECTIONS.TECHNICIANS, tecnicoId, {
      estado: nuevoEstado,
      disponible: nuevoEstado === 'disponible'
    });
  }

  configurarListenerTecnicos(callback) {
    return this.setupRealtimeListener(COLLECTIONS.TECHNICIANS, callback);
  }
}

/**
 * Gestor para usuarios y accesos
 */
export class UsuariosManager extends FirebaseDataManager {
  
  async guardarSolicitudAcceso(solicitud) {
    return await this.saveDocument(COLLECTIONS.ACCESS_REQUESTS, solicitud.id, solicitud);
  }

  async aprobarUsuario(usuario) {
    // Guardar en usuarios aprobados
    const approvedUser = await this.saveDocument(COLLECTIONS.APPROVED_USERS, usuario.id, usuario);
    
    // Actualizar estado de la solicitud
    await this.updateDocument(COLLECTIONS.ACCESS_REQUESTS, usuario.id, {
      estado: 'APROBADO',
      fechaAprobacion: new Date().toISOString()
    });
    
    return approvedUser;
  }

  async obtenerUsuarioPorEmail(email) {
    const usuarios = await this.getCollection(COLLECTIONS.APPROVED_USERS, [
      { field: 'email', operator: '==', value: email }
    ]);
    return usuarios.length > 0 ? usuarios[0] : null;
  }

  async obtenerSolicitudesPendientes() {
    return await this.getCollection(COLLECTIONS.ACCESS_REQUESTS, [
      { field: 'estado', operator: '==', value: 'PENDIENTE' }
    ]);
  }

  configurarListenerAccesos(callback) {
    return this.setupRealtimeListener(COLLECTIONS.ACCESS_REQUESTS, callback);
  }
}

// ===== INSTANCIAS GLOBALES =====
export const solicitudesManager = new SolicitudesManager();
export const technicosManager = new TechnicosManager();
export const usuariosManager = new UsuariosManager();

// Instancia general
export const dataManager = new FirebaseDataManager();

// Inicializar health check al cargar
dataManager.healthCheck();

console.log("🔥 Firebase Data Manager inicializado");
console.log("📚 Colecciones configuradas:", COLLECTIONS);