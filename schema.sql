-- Plan semanal TIC
-- Crea las tablas del programa.
-- Motor: SQLite. La base es el archivo data/plan.db
-- (en SQLite no hace falta un CREATE DATABASE: el archivo es la base).
-- El equivalente para MySQL está en schema_mysql.sql.
-- El programa ejecuta este script solo la primera vez y después
-- carga las hojas del Excel 2026.

PRAGMA foreign_keys = ON;

-- Personas del equipo. "Todos" y "Desarrollo" se conservan
-- como aparecen en el Excel cuando la tarea no es de una sola persona.
CREATE TABLE IF NOT EXISTS personal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL COLLATE NOCASE UNIQUE,
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1))
);

-- Una fila por hoja del Excel (semana ISO, lunes a domingo).
CREATE TABLE IF NOT EXISTS semanas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anio INTEGER NOT NULL,
    numero INTEGER NOT NULL CHECK (numero BETWEEN 1 AND 53),
    nombre_hoja TEXT,
    fecha_inicio TEXT,
    fecha_fin TEXT,
    es_copia INTEGER NOT NULL DEFAULT 0 CHECK (es_copia IN (0, 1)),
    UNIQUE (anio, numero)
);

-- Actividad 1 y Actividad 2, el foco de cada semana (filas superiores del Excel).
CREATE TABLE IF NOT EXISTS focos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    semana_id INTEGER NOT NULL REFERENCES semanas (id) ON DELETE CASCADE,
    orden INTEGER NOT NULL,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    estado TEXT NOT NULL DEFAULT 'Sin estado',
    detalle TEXT
);

-- Tareas de la semana.
-- seccion: prioritaria | extra  (ACTIVIDADES PRIORITARIAS / ACTIVIDADES EXTRAS)
-- semana_prioridad: columna "PRIORIDAD / SEMANA" del Excel
-- fecha_entrega: fecha ISO (2026-10-26) o el texto libre que venía en la hoja
-- tiempo_minutos: tiempo de ejecución; el Excel no lo traía, se registra aquí
CREATE TABLE IF NOT EXISTS tareas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    semana_id INTEGER NOT NULL REFERENCES semanas (id) ON DELETE CASCADE,
    seccion TEXT NOT NULL CHECK (seccion IN ('prioritaria', 'extra')),
    orden INTEGER NOT NULL,
    descripcion TEXT NOT NULL,
    semana_prioridad INTEGER,
    fecha_entrega TEXT,
    estado TEXT NOT NULL DEFAULT 'Sin estado',
    gestion TEXT,
    tiempo_minutos INTEGER CHECK (tiempo_minutos IS NULL OR (tiempo_minutos >= 0 AND tiempo_minutos <= 12000)),
    creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Una tarea puede tener varios responsables ("Juan Carreño y Brayan Gomez").
CREATE TABLE IF NOT EXISTS tarea_responsable (
    tarea_id INTEGER NOT NULL REFERENCES tareas (id) ON DELETE CASCADE,
    personal_id INTEGER NOT NULL REFERENCES personal (id),
    PRIMARY KEY (tarea_id, personal_id)
);

-- Dato de la importación (archivo y fecha).
CREATE TABLE IF NOT EXISTS meta (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tareas_semana ON tareas (semana_id, seccion, orden);
CREATE INDEX IF NOT EXISTS idx_tareas_estado ON tareas (estado);
CREATE INDEX IF NOT EXISTS idx_focos_semana ON focos (semana_id, orden);
CREATE INDEX IF NOT EXISTS idx_resp_persona ON tarea_responsable (personal_id);

-- Vista lista para consultar el plan sin recorrer las relaciones.
CREATE VIEW IF NOT EXISTS v_plan AS
SELECT
    s.anio,
    s.numero AS semana,
    s.fecha_inicio,
    s.fecha_fin,
    CASE t.seccion
        WHEN 'prioritaria' THEN 'Actividades prioritarias'
        ELSE 'Actividades extras'
    END AS seccion,
    t.descripcion AS actividad,
    t.semana_prioridad,
    t.fecha_entrega,
    t.estado,
    t.tiempo_minutos,
    t.gestion,
    (
        SELECT GROUP_CONCAT(p.nombre, ', ')
        FROM tarea_responsable tr
        JOIN personal p ON p.id = tr.personal_id
        WHERE tr.tarea_id = t.id
    ) AS responsables
FROM tareas t
JOIN semanas s ON s.id = t.semana_id;

-- Ejemplos de consulta:
-- SELECT * FROM v_plan WHERE semana = 44;
-- SELECT responsables, COUNT(*) AS tareas,
--        ROUND(SUM(COALESCE(tiempo_minutos, 0)) / 60.0, 1) AS horas
-- FROM v_plan
-- WHERE semana = 44
-- GROUP BY responsables
-- ORDER BY tareas DESC;
