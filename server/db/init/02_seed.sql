-- =====================================================================
-- RABIA-CUN · Datos de prueba (NO son datos reales de personas)
-- =====================================================================
SET client_encoding = 'UTF8';
SET timezone = 'America/Cancun';

INSERT INTO catalogo_eventos (clave, nombre) VALUES
  ('avistamiento', 'Avistamiento'),
  ('mordedura', 'Mordedura'),
  ('aranazo', 'Arañazo'),
  ('comportamiento_erratico', 'Conducta errática');

INSERT INTO catalogo_especies (clave, nombre) VALUES
  ('zorra_gris', 'Zorra gris'),
  ('perro', 'Perro sin dueño'),
  ('gato', 'Gato sin dueño'),
  ('coati_mapache', 'Coatí / Mapache'),
  ('murcielago', 'Murciélago');

INSERT INTO usuarios (nombre, correo, rol) VALUES
  ('Administrador de prueba', 'admin@rabiacun.test', 'admin'),
  ('Ciudadano de prueba', 'ciudadano@rabiacun.test', 'ciudadano');

INSERT INTO reportes (folio, titulo, tipo_evento, especie, estado, lat, lng, radio_privacidad_m, zona, referencia, descripcion, fecha_reporte, fuente_oficial, nota_evidencia, gps_verificado, distancia_pin_m, recomendaciones, usuario_id) VALUES (
  'CUN-2026-0104', 'Zorra gris con desorientación diurna en lindero sur de reserva', 'comportamiento_erratico', 'zorra_gris', 'verificado_oficial',
  21.1392, -86.8358, 150, 'Parque Ecológico Kabah', 'Lindero Av. Nichupté con Av. Rodrigo Gómez (Kabah)',
  'Ejemplar de zorra gris (Urocyon cinereoargenteus) observado caminando en círculos a plena luz del día cerca del área de trote sur, sin temor ante transeúntes. Personal de guardaparques acordonó el sendero.',
  '2026-11-02 08:40', 'SESA Quintana Roo / Dirección de Ecología Cancún · Comunicado Preventivo 11/2026', 'Verificado por brigada de zoonosis municipal tras reporte de corredores matutinos.', false, NULL,
  ARRAY['No acercarse ni intentar alimentar o capturar a fauna silvestre dentro ni fuera del Parque Kabah.', 'Mantener perros con correa al transitar por Av. Nichupté y Av. Rodrigo Gómez.', 'Si tuvo contacto físico o lamedura sobre piel lesionada, acudir de inmediato al IMSS HGR No. 17.']::TEXT[], 2);

INSERT INTO reportes (folio, titulo, tipo_evento, especie, estado, lat, lng, radio_privacidad_m, zona, referencia, descripcion, fecha_reporte, fuente_oficial, nota_evidencia, gps_verificado, distancia_pin_m, recomendaciones, usuario_id) VALUES (
  'CUN-2026-0108', 'Mordedura superficial de gato sin dueño en andador habitacional', 'mordedura', 'gato', 'verificado_oficial',
  21.1328, -86.8412, 150, 'SM 51', 'Entorno Av. Nichupté Sur y calle cerrada SM 51',
  'Gato adulto sin collar agredió sin provocación a un residente que intentaba retirarlo de su cochera. El felino presentaba salivación excesiva y se ocultó hacia el área arbolada.',
  '2026-11-03 17:15', 'Jurisdicción Sanitaria No. 2 Cancún · Seguimiento Profiláctico Activo', 'Paciente atendido en IMSS HGR No. 17 con lavado quirúrgico e inicio de esquema profiláctico post-exposición.', false, NULL,
  ARRAY['Evitar manipular gatos o perros ferales o sin dueño aunque parezcan heridos o dóciles.', 'Verificar vigencia del certificado de vacunación antirrábica de mascotas domésticas en SM 51 y Paraíso Villas.']::TEXT[], 2);

INSERT INTO reportes (folio, titulo, tipo_evento, especie, estado, lat, lng, radio_privacidad_m, zona, referencia, descripcion, fecha_reporte, fuente_oficial, nota_evidencia, gps_verificado, distancia_pin_m, recomendaciones, usuario_id) VALUES (
  'CUN-2026-0112', 'Avistamiento de coatí con marcha errática cruzando hacia zona escolar', 'avistamiento', 'coati_mapache', 'en_revision',
  21.1424, -86.8418, 150, 'SM 48', 'Cruce Av. Kohunlich cerca de Korat Cocina Oriental',
  'Vecinos reportan un coatí solitario desplazándose con dificultad sobre la banqueta de Av. Kohunlich en dirección a SM 48, saliendo del perímetro arbolado.',
  '2026-11-04 09:20', NULL, 'En revisión por brigada de Protección y Bienestar Animal para inspección ocular en el cuadrante.', false, NULL,
  ARRAY['Mantener botes de basura cerrados herméticamente para no atraer fauna silvestre del Parque Kabah a los domicilios.', 'Reportar cualquier agresión de inmediato sin intervenir directamente.']::TEXT[], 2);

INSERT INTO reportes (folio, titulo, tipo_evento, especie, estado, lat, lng, radio_privacidad_m, zona, referencia, descripcion, fecha_reporte, fuente_oficial, nota_evidencia, gps_verificado, distancia_pin_m, recomendaciones, usuario_id) VALUES (
  'CUN-2026-0115', 'Perro sin dueño agresivo en corredor peatonal hacia hospital', 'aranazo', 'perro', 'reporte_ciudadano',
  21.1286, -86.8495, 150, 'SM 523 / SM 516', 'Corredor Av. Cancún (Las Torres) próximo a Ultrasonido Itza e IMSS 17',
  'Canino mediano color miel sin placa lanzó mordida y provocó rasguño en pantorrilla a peatón cerca del paradero de Av. Cancún. No se ha confirmado diagnóstico.',
  '2026-11-04 13:05', NULL, NULL, false, NULL,
  ARRAY['Este registro es un reporte ciudadano pendiente de verificación oficial.', 'Ante cualquier rasguño o mordedura, lavar con abundante agua y jabón durante 15 minutos y acudir a valoración médica.']::TEXT[], 2);

INSERT INTO reportes (folio, titulo, tipo_evento, especie, estado, lat, lng, radio_privacidad_m, zona, referencia, descripcion, fecha_reporte, fuente_oficial, nota_evidencia, gps_verificado, distancia_pin_m, recomendaciones, usuario_id) VALUES (
  'CUN-2026-0118', 'Avistamiento nocturno de zorra gris en camellón residencial', 'avistamiento', 'zorra_gris', 'en_revision',
  21.1289, -86.8325, 150, 'SM 56 · Paraíso Villas', 'Intersección Av. Rodrigo Gómez (Kabah) con Av. Cancún',
  'Conductor reporta avistamiento de ejemplar silvestre tipo zorra gris cruzando desde el extremo sur de Av. Rodrigo Gómez hacia los condominios de Paraíso Villas.',
  '2026-11-04 06:50', NULL, 'En proceso de cotejo con cámaras vecinales y personal de Ecología.', true, 42,
  ARRAY['No dejar alimento para mascotas en patios abiertos o cocheras durante la noche.', 'Supervisar a mascotas al salir a pasear en horarios crepusculares.']::TEXT[], 2);

INSERT INTO alertas (folio, titulo, emitida, vigente_hasta, zona, fuente, url_fuente, severidad, resumen, recomendaciones) VALUES (
  'SESA-QROO-2026-10', 'Vigilancia epidemiológica por fauna silvestre positiva a rabia en Benito Juárez', '2026-10-12', '2026-12-31', 'Cancún · Corredor Parque Ecológico Kabah (SM 48, 50, 51, 56, 516, 523) y SM 248', 'Secretaría de Salud de Quintana Roo (SESA) / Ayuntamiento de Cancún', 'https://cgc.qroo.gob.mx/se-fortalece-estrategia-de-prevencion-y-campana-antirrabica-en-quintana-roo/', 'alta',
  'Derivado del antecedente de alerta sanitaria en octubre de 2026 por contacto con zorra gris positiva a rabia en Cancún y el caso confirmado en 2024 por exposición a felino sin dueño, se mantiene vigilancia preventiva en zonas colindantes con reservas urbanas como el Parque Ecológico Kabah.',
  ARRAY['Si tuviste contacto directo, mordedura, arañazo o lamedura de una zorra gris, coatí, mapache, murciélago o perro/gato desconocido, acude hoy mismo al IMSS HGR No. 17 o tu Centro de Salud.', 'No manipules animales silvestres que luzcan dóciles, desorientados o heridos en banquetas o parques.', 'Mantén al día la vacunación antirrábica anual de perros y gatos (gratuita en campañas de SESA).']::TEXT[]);

INSERT INTO alertas (folio, titulo, emitida, vigente_hasta, zona, fuente, url_fuente, severidad, resumen, recomendaciones) VALUES (
  'BIENESTAR-CUN-2026-11', 'Jornada de Vacunación Antirrábica Canina y Felina en Perímetro Kabah', '2026-11-01', '2026-11-30', 'SM 48, SM 50, SM 51 y acceso Av. Nichupté del Parque Ecológico Kabah', 'Dirección de Protección y Bienestar Animal de Benito Juárez', 'https://rcacancun.gob.mx/', 'preventiva',
  'Instalación de módulos preventivos de vacunación antirrábica gratuita para perros y gatos domésticos a partir de 1 mes de edad para crear una barrera inmunológica alrededor del Parque Urbano Kabah.',
  ARRAY['Llevar perros con correa (y bozal si son reactivos) y gatos en transportadora segura.', 'Conservar el comprobante oficial de vacunación para cualquier reporte o seguimiento sanitario.']::TEXT[]);

-- Historial de verificación de los reportes oficiales de ejemplo
INSERT INTO verificaciones (reporte_id, admin_id, estado_anterior, estado_nuevo, fuente, nota)
SELECT id, 1, 'reporte_ciudadano', estado, fuente_oficial, nota_evidencia
FROM reportes WHERE estado <> 'reporte_ciudadano';
