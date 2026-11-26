import { createRoot } from 'react-dom/client';
import { IonApp, setupIonicReact } from '@ionic/react';
// Estilos base de Ionic (necesarios para sus componentes)
import '@ionic/react/css/core.css';
import '@ionic/react/css/structure.css';
import AuthGate from './AuthGate.tsx';
import { loadServerUrl } from './services/serverConfig';
import './index.css';

// Ionic con estilo Material Design (Android) en todas las plataformas
setupIonicReact({ mode: 'md' });

// La dirección del servidor guardada en el dispositivo se lee antes de mostrar la app
loadServerUrl().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <IonApp>
      <AuthGate />
    </IonApp>
  );
});
