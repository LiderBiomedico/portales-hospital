// firebase-integration.js
// Script para integrar Firebase en los portales existentes

import { solicitudesManager, technicosManager, usuariosManager } from './firebase-data.js';

// ===== CLASE PRINCIPAL DE INTEGRACIÓN =====
class FirebasePortalIntegration {
  constructor() {
    this.isInitialized = false;
    this.offlineMode = false;
    this.syncInProgress = false;
    
    this.init();
  }

  async init() {
    try {
      console.log("🔥 Iniciando integración con Firebase...");
      
      // Verificar conexión
      await this.checkConnection();
      
      // Migrar datos existentes de localStorage a Firebase
      await this.migrateLocalStorageData();
      
      // Configurar listeners en tiempo real
      this.setupRealtimeSync();
      
      // Reemplazar funciones de localStorage
      this.replaceLocalStorageFunctions();
      
      this.isInitialized = true;
      console.log("✅ Integración con Firebase completada");
      
    } catch (error) {
      console.error("❌ Error inicializando Firebase:", error);
      this.enableOfflineMode();
    }
  }

  async checkConnection() {
    try {
      await solicitudesManager.healthCheck();
      this.offlineMode = false;
      console.log("🌐 Conexión con Firebase establecida");
    } catch (error) {
      this.offlineMode = true;
      console.log("📴 Modo offline activado");
      throw error;
    }
  }

  async migrateLocalStorageData() {
    console.log("📦 Migrando datos de localStorage a Firebase...");
    
    try {
      // Migrar solicitudes
      const solicitudes = this.getLocalStorageData('hospital_solicitudes');
      if (solicitudes.length > 0) {
        for (const solicitud of solicitudes) {
          await solicitudesManager.guardarSolicitud(solicitud);
        }
        console.log(`✅ Migradas ${solicitudes.length} solicitudes`);
      }

      // Migrar técnicos
      const tecnicos = this.getLocalStorageData('hospital_technicians');
      if (tecnicos && typeof tecnicos === 'object') {
        for (const [area, tecnicosArea] of Object.entries(tecnicos)) {
          for (const tecnico of tecnicosArea) {
            tecnico.area = area;
            await technicosManager.guardarTecnico(tecnico);
          }
        }
        console.log("✅ Técnicos migrados");
      }

      // Migrar solicitudes de acceso
      const accessRequests = this.getLocalStorageData('hospital_access_requests');
      if (accessRequests.length > 0) {
        for (const request of accessRequests) {
          await usuariosManager.guardarSolicitudAcceso(request);
        }
        console.log(`✅ Migradas ${accessRequests.length} solicitudes de acceso`);
      }

      // Migrar usuarios aprobados
      const approvedUsers = this.getLocalStorageData('hospital_approved_users');
      if (approvedUsers.length > 0) {
        for (const user of approvedUsers) {
          await usuariosManager.aprobarUsuario(user);
        }
        console.log(`✅ Migrados ${approvedUsers.length} usuarios aprobados`);
      }

    } catch (error) {
      console.error("❌ Error en migración:", error);
    }
  }

  getLocalStorageData(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : (key === 'hospital_technicians' ? {} : []);
    } catch (error) {
      console.error(`Error obteniendo ${key}:`, error);
      return key === 'hospital_technicians' ? {} : [];
    }
  }

  setupRealtimeSync() {
    console.log("🔄 Configurando sincronización en tiempo real...");

    // Sync solicitudes
    solicitudesManager.configurarListenerSolicitudes((changes) => {
      this.handleSolicitudesChanges(changes);
    });

    // Sync técnicos
    technicosManager.configurarListenerTecnicos((changes) => {
      this.handleTecnicosChanges(changes);
    });

    // Sync accesos
    usuariosManager.configurarListenerAccesos((changes) => {
      this.handleAccesosChanges(changes);
    });
  }

  handleSolicitudesChanges(changes) {
    console.log("🔄 Cambios en solicitudes detectados:", changes);
    
    // Actualizar interfaz si las funciones existen
    if (typeof updateAllCounters === 'function') {
      updateAllCounters();
    }
    if (typeof updateRequestsDisplay === 'function') {
      updateRequestsDisplay();
    }
    if (typeof checkForCriticalRequests === 'function') {
      checkForCriticalRequests();
    }
    
    // Disparar evento personalizado
    window.dispatchEvent(new CustomEvent('solicitudesChanged', { detail: changes }));
  }

  handleTecnicosChanges(changes) {
    console.log("🔄 Cambios en técnicos detectados:", changes);
    
    if (typeof updateTechniciansDisplay === 'function') {
      updateTechniciansDisplay();
    }
    
    window.dispatchEvent(new CustomEvent('tecnicosChanged', { detail: changes }));
  }

  handleAccesosChanges(changes) {
    console.log("🔄 Cambios en accesos detectados:", changes);
    
    if (typeof updateAccessDisplay === 'function') {
      updateAccessDisplay();
    }
    if (typeof checkForPendingAccess === 'function') {
      checkForPendingAccess();
    }
    
    window.dispatchEvent(new CustomEvent('accesosChanged', { detail: changes }));
  }

  replaceLocalStorageFunctions() {
    console.log("🔄 Reemplazando funciones de localStorage...");

    // Crear wrapper global para Firebase
    window.FirebaseData = {
      // Solicitudes
      async guardarSolicitud(solicitud) {
        return await solicitudesManager.guardarSolicitud(solicitud);
      },

      async obtenerSolicitudes() {
        return await solicitudesManager.getCollection('solicitudes_mantenimiento');
      },

      async obtenerSolicitudesPorArea(area) {
        return await solicitudesManager.obtenerSolicitudesPorArea(area);
      },

      async obtenerSolicitudesPorUsuario(email) {
        return await solicitudesManager.obtenerSolicitudesPorUsuario(email);
      },

      async asignarTecnico(numeroSolicitud, tecnicoData) {
        return await solicitudesManager.asignarTecnico(numeroSolicitud, tecnicoData);
      },

      // Técnicos
      async guardarTecnico(tecnico) {
        return await technicosManager.guardarTecnico(tecnico);
      },

      async obtenerTecnicos() {
        return await technicosManager.getCollection('tecnicos');
      },

      async obtenerTecnicosPorArea(area) {
        return await technicosManager.obtenerTecnicosPorArea(area);
      },

      async cambiarEstadoTecnico(tecnicoId, estado) {
        return await technicosManager.cambiarEstadoTecnico(tecnicoId, estado);
      },

      // Usuarios y accesos
      async guardarSolicitudAcceso(solicitud) {
        return await usuariosManager.guardarSolicitudAcceso(solicitud);
      },

      async aprobarUsuario(usuario) {
        return await usuariosManager.aprobarUsuario(usuario);
      },

      async obtenerUsuarioPorEmail(email) {
        return await usuariosManager.obtenerUsuarioPorEmail(email);
      },

      async obtenerSolicitudesAccesoPendientes() {
        return await usuariosManager.obtenerSolicitudesPendientes();
      }
    };

    // Reemplazar localStorage con Firebase (para compatibilidad)
    this.wrapLocalStorageWithFirebase();
  }

  wrapLocalStorageWithFirebase() {
    const originalSetItem = localStorage.setItem.bind(localStorage);
    const originalGetItem = localStorage.getItem.bind(localStorage);

    // Interceptar setItem para sincronizar con Firebase
    localStorage.setItem = async (key, value) => {
      originalSetItem(key, value);
      
      if (!this.offlineMode && this.isFirebaseKey(key)) {
        try {
          await this.syncToFirebase(key, value);
        } catch (error) {
          console.error(`Error sincronizando ${key} con Firebase:`, error);
        }
      }
    };

    // Interceptar getItem para obtener de Firebase si está disponible
    localStorage.getItem = async (key) => {
      if (!this.offlineMode && this.isFirebaseKey(key)) {
        try {
          const firebaseData = await this.getFromFirebase(key);
          if (firebaseData) {
            originalSetItem(key, JSON.stringify(firebaseData));
            return JSON.stringify(firebaseData);
          }
        } catch (error) {
          console.error(`Error obteniendo ${key} de Firebase:`, error);
        }
      }
      
      return originalGetItem(key);
    };
  }

  isFirebaseKey(key) {
    const firebaseKeys = [
      'hospital_solicitudes',
      'hospital_technicians',
      'hospital_access_requests',
      'hospital_approved_users',
      'hospital_rejected_users'
    ];
    return firebaseKeys.includes(key);
  }

  async syncToFirebase(key, value) {
    try {
      const data = JSON.parse(value);
      
      switch (key) {
        case 'hospital_solicitudes':
          for (const solicitud of data) {
            await solicitudesManager.guardarSolicitud(solicitud);
          }
          break;
          
        case 'hospital_technicians':
          for (const [area, tecnicos] of Object.entries(data)) {
            for (const tecnico of tecnicos) {
              tecnico.area = area;
              await technicosManager.guardarTecnico(tecnico);
            }
          }
          break;
          
        case 'hospital_access_requests':
          for (const request of data) {
            await usuariosManager.guardarSolicitudAcceso(request);
          }
          break;
          
        case 'hospital_approved_users':
          for (const user of data) {
            await usuariosManager.aprobarUsuario(user);
          }
          break;
      }
    } catch (error) {
      console.error(`Error sincronizando ${key}:`, error);
    }
  }

  async getFromFirebase(key) {
    try {
      switch (key) {
        case 'hospital_solicitudes':
          return await solicitudesManager.getCollection('solicitudes_mantenimiento');
          
        case 'hospital_technicians':
          const tecnicos = await technicosManager.getCollection('tecnicos');
          const tecnicosPorArea = {};
          for (const tecnico of tecnicos) {
            if (!tecnicosPorArea[tecnico.area]) {
              tecnicosPorArea[tecnico.area] = [];
            }
            tecnicosPorArea[tecnico.area].push(tecnico);
          }
          return tecnicosPorArea;
          
        case 'hospital_access_requests':
          return await usuariosManager.getCollection('solicitudes_acceso');
          
        case 'hospital_approved_users':
          return await usuariosManager.getCollection('usuarios_aprobados');
          
        default:
          return null;
      }
    } catch (error) {
      console.error(`Error obteniendo ${key} de Firebase:`, error);
      return null;
    }
  }

  enableOfflineMode() {
    this.offlineMode = true;
    console.log("📴 Modo offline activado - usando localStorage como respaldo");
    
    // Mostrar notificación al usuario
    this.showOfflineNotification();
  }

  showOfflineNotification() {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #f59e0b;
      color: white;
      padding: 1rem;
      border-radius: 0.5rem;
      z-index: 10000;
      font-family: system-ui;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;
    notification.innerHTML = `
      📴 <strong>Modo Offline</strong><br>
      Los datos se guardan localmente y se sincronizarán cuando se restaure la conexión.
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);
  }

  // Métodos públicos para uso en los portales
  async forceSyncToFirebase() {
    if (this.offlineMode) return false;
    
    this.syncInProgress = true;
    console.log("🔄 Sincronización forzada iniciada...");
    
    try {
      await this.migrateLocalStorageData();
      console.log("✅ Sincronización forzada completada");
      return true;
    } catch (error) {
      console.error("❌ Error en sincronización forzada:", error);
      return false;
    } finally {
      this.syncInProgress = false;
    }
  }

  getConnectionStatus() {
    return {
      isOnline: !this.offlineMode,
      isInitialized: this.isInitialized,
      isSyncing: this.syncInProgress
    };
  }
}

// ===== FUNCIONES AUXILIARES GLOBALES =====

/**
 * Función para verificar si Firebase está disponible
 */
window.checkFirebaseStatus = function() {
  const status = firebaseIntegration.getConnectionStatus();
  
  const statusMessage = `🔥 Estado de Firebase:
  
🌐 Conexión: ${status.isOnline ? '✅ En línea' : '📴 Offline'}
🔧 Inicializado: ${status.isInitialized ? '✅ Sí' : '❌ No'}
🔄 Sincronizando: ${status.isSyncing ? '⏳ Sí' : '✅ No'}

${status.isOnline ? 
  '✅ Todos los datos se guardan en la nube automáticamente' : 
  '⚠️ Los datos se guardan localmente y se sincronizarán cuando se restaure la conexión'
}`;

  alert(statusMessage);
  return status;
};

/**
 * Función para forzar sincronización
 */
window.forceSyncFirebase = async function() {
  const success = await firebaseIntegration.forceSyncToFirebase();
  
  if (success) {
    alert("✅ Sincronización con Firebase completada exitosamente");
  } else {
    alert("❌ Error en la sincronización. Verifique su conexión a internet.");
  }
  
  return success;
};

/**
 * Función para obtener estadísticas
 */
window.getFirebaseStats = async function() {
  try {
    const stats = await solicitudesManager.getSystemStats();
    
    const statsMessage = `📊 Estadísticas del Sistema:

📋 Total Solicitudes: ${stats.totalSolicitudes}
👥 Total Técnicos: ${stats.totalTechnicians}
🔐 Total Usuarios: ${stats.totalUsers}
📅 Última Sincronización: ${stats.lastSync.toLocaleString('es-CO')}

🔥 Datos almacenados en Firebase Cloud Firestore`;

    alert(statsMessage);
    return stats;
  } catch (error) {
    alert("❌ Error obteniendo estadísticas");
    return null;
  }
};

// ===== INICIALIZACIÓN AUTOMÁTICA =====
let firebaseIntegration;

document.addEventListener('DOMContentLoaded', async function() {
  console.log("🚀 Iniciando integración Firebase...");
  
  firebaseIntegration = new FirebasePortalIntegration();
  
  // Agregar botones de debug al portal de gestión (si existe)
  if (document.title.includes('Portal Gestión')) {
    addFirebaseDebugButtons();
  }
});

function addFirebaseDebugButtons() {
  // Buscar un lugar apropiado para agregar los botones
  const headerContent = document.querySelector('.header-content');
  if (headerContent) {
    const debugContainer = document.createElement('div');
    debugContainer.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      display: flex;
      gap: 0.5rem;
      z-index: 1000;
    `;
    
    debugContainer.innerHTML = `
      <button onclick="checkFirebaseStatus()" 
              style="background: #2563eb; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.375rem; font-size: 0.75rem; cursor: pointer;">
        🔥 Estado Firebase
      </button>
      <button onclick="forceSyncFirebase()" 
              style="background: #059669; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.375rem; font-size: 0.75rem; cursor: pointer;">
        🔄 Sincronizar
      </button>
      <button onclick="getFirebaseStats()" 
              style="background: #7c3aed; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.375rem; font-size: 0.75rem; cursor: pointer;">
        📊 Estadísticas
      </button>
    `;
    
    document.body.appendChild(debugContainer);
  }
}

export { firebaseIntegration };
console.log("🔥 Firebase Integration cargado y listo");