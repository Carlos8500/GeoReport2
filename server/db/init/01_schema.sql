-- =====================================================================
-- RABIA-CUN · Esquema de base de datos (PostgreSQL 16)
-- Se ejecuta automáticamente la PRIMERA vez que se crea el volumen de
-- Docker (docker-entrypoint-initdb.d). Para recrearlo:
--   docker compose down -v && docker compose up -d
-- =====================================================================

SET client_encoding = 'UTF8';
SET timezone = 'America/Cancun';

-- ---------------------------------------------------------------------
-- Catálogos
-- ---------------------------------------------------------------------
CREATE TABLE catalogo_eventos (
  clave   VARCHAR(30) PRIMARY KEY,
  nombre  VARCHAR(60) NOT NULL
);

CREATE TABLE catalogo_especies (
  clave   VARCHAR(30) PRIMARY KEY,
  nombre  VARCHAR(60) NOT NULL
);

-- ---------------------------------------------------------------------
-- Usuarios (ciudadanos y personal administrador que verifica reportes)
-- La contraseña NUNCA se guarda: sólo su hash bcrypt.
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
  id               SERIAL PRIMARY KEY,
  nombre           VARCHAR(120) NOT NULL,
  correo           VARCHAR(160) NOT NULL UNIQUE,
  password_hash    VARCHAR(100),
  rol              VARCHAR(20)  NOT NULL DEFAULT 'ciudadano'
                   CHECK (rol IN ('ciudadano', 'admin')),
  activo           BOOLEAN      NOT NULL DEFAULT true,
  ultimo_acceso    TIMESTAMPTZ,
  creado_en        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Reportes de incidentes (ubicación pública aproximada, nunca la exacta)
-- ---------------------------------------------------------------------
CREATE TABLE reportes (
  id                   SERIAL PRIMARY KEY,
  folio                VARCHAR(30)  UNIQUE,
  titulo               VARCHAR(200) NOT NULL,
  tipo_evento          VARCHAR(30)  NOT NULL REFERENCES catalogo_eventos (clave),
  especie              VARCHAR(30)  NOT NULL REFERENCES catalogo_especies (clave),
  estado               VARCHAR(30)  NOT NULL DEFAULT 'reporte_ciudadano'
                       CHECK (estado IN ('verificado_oficial', 'en_revision',
                                         'reporte_ciudadano', 'rechazado')),
  lat                  NUMERIC(8, 5) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng                  NUMERIC(8, 5) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  radio_privacidad_m   INTEGER      NOT NULL DEFAULT 150 CHECK (radio_privacidad_m > 0),
  zona                 VARCHAR(120) NOT NULL,
  referencia           VARCHAR(200),
  descripcion          TEXT         NOT NULL,
  fecha_reporte        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  fuente_oficial       VARCHAR(200),
  nota_evidencia       TEXT,
  gps_verificado       BOOLEAN      NOT NULL DEFAULT false,
  distancia_pin_m      INTEGER,
  modo_gps             VARCHAR(20)  CHECK (modo_gps IN ('hardware_gps', 'demo_academico')),
  giroscopio           JSONB,
  recomendaciones      TEXT[]       NOT NULL DEFAULT '{}',
  usuario_id           INTEGER      REFERENCES usuarios (id) ON DELETE SET NULL,
  creado_en            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actualizado_en       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_reportes_estado ON reportes (estado);
CREATE INDEX idx_reportes_fecha  ON reportes (fecha_reporte DESC);

-- Folio legible generado a partir del id: CUN-2026-0001
CREATE FUNCTION asignar_folio() RETURNS trigger AS $$
BEGIN
  IF NEW.folio IS NULL THEN
    NEW.folio := 'CUN-' || to_char(NEW.fecha_reporte, 'YYYY') || '-' || lpad(NEW.id::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reportes_folio
  BEFORE INSERT ON reportes
  FOR EACH ROW EXECUTE FUNCTION asignar_folio();

-- Marca de última modificación
CREATE FUNCTION tocar_actualizado_en() RETURNS trigger AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reportes_actualizado
  BEFORE UPDATE ON reportes
  FOR EACH ROW EXECUTE FUNCTION tocar_actualizado_en();

-- ---------------------------------------------------------------------
-- Fotografías de evidencia (1 reporte : N fotos)
-- ---------------------------------------------------------------------
CREATE TABLE reporte_fotos (
  id              SERIAL PRIMARY KEY,
  reporte_id      INTEGER      NOT NULL REFERENCES reportes (id) ON DELETE CASCADE,
  nombre_archivo  VARCHAR(200),
  mime            VARCHAR(60)  NOT NULL,
  datos           BYTEA        NOT NULL,
  creado_en       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_fotos_reporte ON reporte_fotos (reporte_id);

-- ---------------------------------------------------------------------
-- Historial de verificación (cada cambio de estado hecho por un admin)
-- ---------------------------------------------------------------------
CREATE TABLE verificaciones (
  id               SERIAL PRIMARY KEY,
  reporte_id       INTEGER     NOT NULL REFERENCES reportes (id) ON DELETE CASCADE,
  admin_id         INTEGER     REFERENCES usuarios (id) ON DELETE SET NULL,
  estado_anterior  VARCHAR(30) NOT NULL,
  estado_nuevo     VARCHAR(30) NOT NULL,
  fuente           VARCHAR(200),
  nota             TEXT,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_verificaciones_reporte ON verificaciones (reporte_id);

-- ---------------------------------------------------------------------
-- Alertas sanitarias oficiales
-- ---------------------------------------------------------------------
CREATE TABLE alertas (
  id               SERIAL PRIMARY KEY,
  folio            VARCHAR(40)  NOT NULL UNIQUE,
  titulo           VARCHAR(200) NOT NULL,
  emitida          DATE         NOT NULL,
  vigente_hasta    DATE         NOT NULL,
  zona             VARCHAR(250) NOT NULL,
  fuente           VARCHAR(200) NOT NULL,
  url_fuente       VARCHAR(400),
  severidad        VARCHAR(20)  NOT NULL
                   CHECK (severidad IN ('alta', 'preventiva', 'informativa')),
  resumen          TEXT         NOT NULL,
  recomendaciones  TEXT[]       NOT NULL DEFAULT '{}',
  creado_en        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (vigente_hasta >= emitida)
);
