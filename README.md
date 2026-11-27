# RABIA-CUN

Aplicación móvil híbrida de **vigilancia y alertas sanitarias geolocalizadas** para Cancún, Quintana Roo.
Permite consultar un mapa de incidentes con animales potencialmente transmisores de rabia, enviar reportes ciudadanos con fotografía, revisar y verificar reportes (administrador) y consultar alertas oficiales y medidas de prevención. Cualquier persona puede consultar el mapa, los reportes, las alertas y las estadísticas **sin cuenta**; para enviar reportes se necesita **iniciar sesión**.

> Proyecto integrador · Desarrollo de Aplicaciones Móviles Híbridas · Instituto Tecnológico de Cancún.
> Los datos incluidos son **de prueba**; la app no diagnostica ni sustituye a las autoridades sanitarias.

## Tecnologías

| Capa | Tecnología |
|---|---|
| Frontend | Ionic React 9 + React 19 + TypeScript, Vite, Tailwind CSS |
| App híbrida (APK) | Capacitor 8 · complementos `@capacitor/geolocation`, `@capacitor/camera`, `@capacitor/preferences` |
| Mapa | Leaflet + teselas de OpenStreetMap |
| Sensores | GPS (`@capacitor/geolocation`) y giroscopio/brújula (DeviceOrientation API) |
| Cámara | `@capacitor/camera` en la APK; `<input capture="environment">` en el navegador |
| Backend / API | Node.js + Express (JavaScript), API REST + Server-Sent Events |
| Autenticación | Contraseñas con hash bcrypt, sesiones con token JWT, roles ciudadano/administrador |
| Base de datos | PostgreSQL 16 (SQL) |
| Infraestructura | Docker Compose (BD + API + Adminer) |
| Pruebas de API | Postman (colección en `postman/`) |

## Estructura

```
GeoReport2/
├── docker-compose.yml          # PostgreSQL + API + Adminer
├── capacitor.config.ts         # Empaquetado híbrido (Capacitor)
├── android/                    # Proyecto Android generado por Capacitor
├── server/                     # Backend (API REST en JavaScript)
│   ├── Dockerfile
│   ├── db/init/01_schema.sql   # Tablas, llaves y relaciones
│   ├── db/init/02_seed.sql     # Datos de prueba
│   └── src/
│       ├── index.js            # Servidor Express
│       ├── auth.js             # Hash de contraseñas, tokens y permisos por rol
│       ├── db.js               # Conexión a PostgreSQL (pool)
│       ├── validation.js       # Validación de datos + geocerca
│       ├── realtime.js         # Notificaciones en tiempo real (SSE)
│       └── routes/             # auth, incidents, alerts, stats/photos/health
├── postman/RABIA-CUN.postman_collection.json
└── src/                        # Frontend
    ├── AuthGate.tsx            # Muestra el login o la app según la sesión
    ├── services/api.ts         # Peticiones asíncronas (fetch + Promises)
    ├── services/session.ts     # Sesión guardada con Web Storage (localStorage)
    ├── services/serverConfig.ts # Dirección del servidor configurable en la app
    ├── components/             # Mapa, formulario de reporte, vistas
    └── utils/                  # Geocerca, giroscopio
```

## Requisitos

- Node.js 20 o superior y npm
- Docker Desktop

## Cómo ejecutar

### 1. Backend (base de datos + API)

Primero crea el archivo `.env` (no se sube a GitHub) a partir de la plantilla:

```bash
cp .env.example .env
```

En `.env` llena `JWT_SECRET` (texto largo y aleatorio) y `ADMIN_PASSWORD` (mínimo 8 caracteres, **no uses una contraseña real**). Al arrancar, la API crea o actualiza la cuenta administradora `ADMIN_EMAIL` con esa contraseña. Así ninguna contraseña queda escrita en el código.

```bash
cd server
npm install          # dependencias de la API (también las usa la imagen de Docker)
cd ..
docker compose up -d --build
```

| Servicio | Dirección |
|---|---|
| API | http://localhost:4000/api (en la red local: `http://<IP-de-la-PC>:4000/api`) |
| Adminer (ver la BD) | http://localhost:8080 · Servidor `db`, usuario `rabiacun`, contraseña `rabiacun_dev`, BD `rabiacun` |
| PostgreSQL | `localhost:5432` (sólo desde esta PC) |

Comandos útiles:

```bash
docker compose logs -f api   # ver las peticiones que llegan a la API
docker compose down          # detener (los datos se conservan)
docker compose down -v       # detener y BORRAR la BD (se recrea con los datos de prueba)
```

La contraseña por defecto es sólo de desarrollo. Para cambiarla, crea un archivo `.env` junto a `docker-compose.yml` con `POSTGRES_PASSWORD=...` (no se sube al repositorio).

### 2. Frontend

```bash
npm install
npm run dev
```

- Computadora: http://localhost:3000
- Celular o tableta en la misma Wi-Fi: `https://<IP-de-la-PC>:3443`. Hay que aceptar el aviso del certificado. El GPS y el giroscopio sólo funcionan con HTTPS.

Vite reenvía las peticiones `/api` al contenedor de la API (`vite.config.ts`). Para compilar una versión que apunte a otro servidor (por ejemplo, la APK), define `VITE_API_URL`:

```bash
VITE_API_URL=http://192.168.1.50:4000 npm run build
```

### 3. App Android (APK)

Requisitos: [Android Studio](https://developer.android.com/studio) (instala el SDK de Android) y un **JDK 21** ([Eclipse Temurin 21](https://adoptium.net/)). Android Studio 2026 trae Java 25, que la versión de Gradle de Capacitor (8.14) no admite.

```powershell
powershell -ExecutionPolicy Bypass -File scriptsuild-apk.ps1
```

El script busca el JDK 21, escribe `android/local.properties` con la ruta del SDK, compila la app web, la copia al proyecto Android (`npx cap sync android`) y ejecuta `gradlew assembleDebug`. La APK queda en `android/app/build/outputs/apk/debug/app-debug.apk` (unos 9 MB).

Para instalarla: copia la APK al celular, ábrela y permite «Instalar apps desconocidas». También se puede abrir el proyecto en Android Studio con `npm run android:open`.

**Conexión con el servidor.** La primera vez que se abre la APK pide la dirección del servidor (también se cambia desde el engrane ⚙ junto a «Servidor en línea»). Se guarda en el teléfono, así que no hay que recompilar al cambiar de red:

| Situación | Dirección |
|---|---|
| Celular en la misma Wi-Fi que la PC | `http://<IP-de-la-PC>:4000` (en la PC: `ipconfig` → Dirección IPv4) |
| Celular en otra red o con datos | La dirección `https://….trycloudflare.com` que muestra `scripts	unnel.ps1` (ver abajo) |

La APK se sirve como `http://localhost` (`androidScheme: 'http'`) y permite tráfico HTTP (`usesCleartextTraffic`), por eso puede llamar a la API en la red local. El túnel rápido de Cloudflare no transmite el tiempo real (SSE): la app sigue actualizándose cada 15 s.

### 4. Acceso desde cualquier red (Cloudflare Tunnel)

Recomendado para la demostración: el celular no necesita estar en la misma Wi-Fi, no hay que abrir puertos del módem ni del Firewall y la conexión es HTTPS.

1. Descarga `cloudflared-windows-amd64.exe` de las [versiones oficiales](https://github.com/cloudflare/cloudflared/releases) y guárdalo como `%USERPROFILE%\.tools\cloudflared\cloudflared.exe` (o ponlo en el PATH). No requiere instalación ni cuenta.
2. Con Docker encendido:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts	unnel.ps1
   ```

3. El script comprueba la API, abre el túnel, espera a que responda y copia la dirección `https://….trycloudflare.com` al portapapeles. Pásala al celular (por ejemplo, por WhatsApp) y pégala en la app: engrane ⚙ › Servidor › Guardar.
4. Deja la ventana abierta mientras se use la app; `Ctrl+C` cierra el túnel.

Limitaciones del túnel rápido ([documentación de Cloudflare](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)): la dirección cambia en cada inicio, no transmite Server-Sent Events (la app se actualiza cada 15 s), admite hasta 200 peticiones simultáneas y no tiene garantía de disponibilidad. Para una dirección fija se necesita una cuenta de Cloudflare y un dominio propio (túnel con nombre).

### Pruebas

```bash
npm test    # pruebas de la geocerca y de los filtros por fecha/zona
```

Para la API, importa `postman/RABIA-CUN.postman_collection.json` en Postman. En las **Variables** de la colección escribe `adminPassword`, la misma que pusiste en `.env`, y usa **Run collection**. Son 37 peticiones con 60 pruebas automáticas: acceso de visitante, registro, login, CRUD de reportes y alertas, permisos por rol y errores 400/401/403/404/409. La colección crea un ciudadano de prueba y lo elimina al terminar.

## Usuarios y permisos

| Acción | Sin sesión | Ciudadano | Administrador |
|---|---|---|---|
| Registrarse / iniciar sesión | ✅ | — | — |
| Ver mapa, reportes, alertas y estadísticas | ✅ | ✅ | ✅ |
| Ver reportes descartados | ❌ | ✅ | ✅ |
| Ver fotos de evidencia | ❌ | ✅ | ✅ |
| Enviar reportes | ❌ | ✅ | ✅ |
| Editar / eliminar un reporte | ❌ | Sólo los suyos | Todos |
| Verificar o descartar reportes | ❌ | ❌ | ✅ |
| Crear, editar o eliminar alertas | ❌ | ❌ | ✅ |

- La información preventiva es pública a propósito: el objetivo de la app es que cualquier persona en Cancún pueda consultarla.
- Las fotos de evidencia requieren sesión porque pueden mostrar personas, casas o placas, y el brief prohíbe publicar datos sensibles.
- Nadie puede registrarse como administrador: la cuenta administradora se configura sólo desde `.env`.
- La app guarda la sesión (token) en el dispositivo con `localStorage`; nunca guarda la contraseña. El token dura 7 días; al vencer, la app regresa al inicio de sesión.
- La API revisa el rol en cada petición. Ocultar botones en la app no basta: un ciudadano que llame a la API directamente recibe 403.

## API REST

Las consultas (`GET` de reportes, alertas, estadísticas y catálogos) son públicas. Registrar, editar, eliminar, ver fotos, el historial y `mine=true` requieren el encabezado `Authorization: Bearer <token>`; verificar y gestionar alertas requiere además rol de administrador.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Estado del servidor y de la BD (público) |
| POST | `/api/auth/register` | Crear cuenta de ciudadano (devuelve token) |
| POST | `/api/auth/login` | Iniciar sesión (devuelve token) |
| GET | `/api/auth/me` | Datos del usuario de la sesión |
| PUT | `/api/auth/me` | Cambiar nombre o contraseña |
| DELETE | `/api/auth/me` | Eliminar mi cuenta (sus reportes quedan anónimos) |
| GET | `/api/catalogs` | Especies y tipos de evento válidos |
| GET | `/api/incidents` | Lista de reportes. Filtros: `status`, `species`, `eventType`, `from`, `to`, `mine=true` |
| GET | `/api/incidents/:id` | Un reporte |
| POST | `/api/incidents` | Registrar un reporte ciudadano (foto opcional en `photoDataUrl`) |
| PUT | `/api/incidents/:id` | Editar título, evento, especie, referencia y descripción (autor o admin) |
| PATCH | `/api/incidents/:id/verification` | Cambiar el estado de verificación (sólo admin) |
| GET | `/api/incidents/:id/verifications` | Historial de verificación |
| DELETE | `/api/incidents/:id` | Eliminar un reporte, sus fotos e historial (autor o admin) |
| GET | `/api/photos/:id` | Imagen de evidencia (requiere sesión) |
| GET/POST | `/api/alerts` | Consultar alertas; registrar sólo admin |
| GET/PUT/DELETE | `/api/alerts/:id` | Consultar una alerta; editar o eliminar sólo admin |
| GET | `/api/stats` | Estadísticas descriptivas (`from`, `to`) |
| GET | `/api/events` | Avisos en tiempo real (Server-Sent Events) |

Los errores se responden en JSON: `{ "error": "mensaje", "details": { "campo": "motivo" } }`.

## Base de datos

Tablas: `usuarios`, `catalogo_eventos`, `catalogo_especies`, `reportes`, `reporte_fotos`, `verificaciones` y `alertas`. El detalle de campos, llaves y relaciones está en [`server/db/init/01_schema.sql`](server/db/init/01_schema.sql).

- `usuarios` guarda nombre, correo, rol y el **hash** de la contraseña (nunca la contraseña).
- Un reporte pertenece a un tipo de evento, a una especie y al usuario que lo envió.
- Un reporte tiene 0..N fotos y 0..N verificaciones; ambas se borran en cascada con el reporte.
- Cada verificación registra el estado anterior, el nuevo, la fuente y el administrador.
- El folio (`CUN-AAAA-0001`) lo genera un *trigger* de PostgreSQL.

## Problemas conocidos

- **Antivirus con "análisis HTTPS"** (por ejemplo AVG o Avast): intercepta las descargas dentro de Docker y `npm install` falla en la imagen. Por eso el `Dockerfile` reutiliza `server/node_modules`: ejecuta `npm install` en `server/` antes de `docker compose up --build`.
- El mismo antivirus bloquea las descargas de Gradle/Java. `scripts/build-apk.ps1` hace que Java use los certificados de Windows (`-Djavax.net.ssl.trustStoreType=Windows-ROOT`).
- El celular debe estar en la **misma red** que la PC, y el Firewall de Windows debe permitir los puertos 3000, 3443 y 4000.

## Créditos y recursos externos

- Mapas © colaboradores de [OpenStreetMap](https://www.openstreetmap.org/copyright), mostrados con [Leaflet](https://leafletjs.com/).
- Íconos: [Lucide](https://lucide.dev/).
- Herramientas de IA utilizadas como apoyo: Google AI Studio (prototipo inicial de la interfaz) y Claude (asistencia en el desarrollo del mapa, backend y Docker). El equipo revisó y es responsable del código.

## Integrantes

- Trujillo Tobias Jorge Antonio
- Leon Cupul Juan Miguel
- Carlos Manuel Ortiz Mejía
