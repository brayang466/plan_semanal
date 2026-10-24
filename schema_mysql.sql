-- Plan semanal TIC
-- Crea la base y las tablas en MySQL 8.
-- Equivale a schema.sql (el programa en local usa SQLite).
--
--   mysql -u root -p < schema_mysql.sql

CREATE DATABASE IF NOT EXISTS plan_semanal
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE plan_semanal;

-- Personas del equipo. "Todos" y "Desarrollo" se conservan
-- como aparecen en el Excel cuando la tarea no es de una sola persona.
CREATE TABLE IF NOT EXISTS personal (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    CONSTRAINT uq_personal_nombre UNIQUE (nombre),
    CONSTRAINT chk_personal_activo CHECK (activo IN (0, 1))
) ENGINE=InnoDB;

-- Una fila por hoja del Excel (semana ISO, lunes a domingo).
CREATE TABLE IF NOT EXISTS semanas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    anio INT NOT NULL,
    numero INT NOT NULL,
    nombre_hoja VARCHAR(120) NULL,
    fecha_inicio DATE NULL,
    fecha_fin DATE NULL,
    es_copia TINYINT(1) NOT NULL DEFAULT 0,
    CONSTRAINT uq_semana UNIQUE (anio, numero),
    CONSTRAINT chk_semana_numero CHECK (numero BETWEEN 1 AND 53),
    CONSTRAINT chk_semana_copia CHECK (es_copia IN (0, 1))
) ENGINE=InnoDB;

-- Actividad 1 y Actividad 2, el foco de cada semana.
CREATE TABLE IF NOT EXISTS focos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    semana_id INT NOT NULL,
    orden INT NOT NULL,
    titulo VARCHAR(80) NOT NULL,
    descripcion VARCHAR(500) NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'Sin estado',
    detalle VARCHAR(1000) NULL,
    CONSTRAINT fk_focos_semana FOREIGN KEY (semana_id) REFERENCES semanas (id) ON DELETE CASCADE,
    CONSTRAINT chk_focos_estado CHECK (estado IN ('Sin estado', 'Pendiente', 'En curso', 'Notificado', 'Realizado'))
) ENGINE=InnoDB;

-- Tareas de la semana.
-- seccion: prioritaria | extra
-- semana_prioridad: columna "PRIORIDAD / SEMANA" del Excel
-- fecha_entrega: fecha (2026-10-26) o el texto libre que venía en la hoja
-- tiempo_minutos: tiempo de ejecución, hasta 200 horas (12000 minutos)
CREATE TABLE IF NOT EXISTS tareas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    semana_id INT NOT NULL,
    seccion VARCHAR(20) NOT NULL,
    orden INT NOT NULL,
    descripcion VARCHAR(2000) NOT NULL,
    semana_prioridad INT NULL,
    fecha_entrega VARCHAR(80) NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'Sin estado',
    gestion TEXT NULL,
    tiempo_minutos INT NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tareas_semana FOREIGN KEY (semana_id) REFERENCES semanas (id) ON DELETE CASCADE,
    CONSTRAINT chk_tareas_seccion CHECK (seccion IN ('prioritaria', 'extra')),
    CONSTRAINT chk_tareas_estado CHECK (estado IN ('Sin estado', 'Pendiente', 'En curso', 'Notificado', 'Realizado')),
    CONSTRAINT chk_tareas_prioridad CHECK (semana_prioridad IS NULL OR semana_prioridad BETWEEN 1 AND 53),
    CONSTRAINT chk_tareas_tiempo CHECK (tiempo_minutos IS NULL OR tiempo_minutos BETWEEN 0 AND 12000)
) ENGINE=InnoDB;

-- Una tarea puede tener varios responsables.
CREATE TABLE IF NOT EXISTS tarea_responsable (
    tarea_id INT NOT NULL,
    personal_id INT NOT NULL,
    PRIMARY KEY (tarea_id, personal_id),
    CONSTRAINT fk_resp_tarea FOREIGN KEY (tarea_id) REFERENCES tareas (id) ON DELETE CASCADE,
    CONSTRAINT fk_resp_persona FOREIGN KEY (personal_id) REFERENCES personal (id)
) ENGINE=InnoDB;

-- Dato de la importación (archivo y fecha).
CREATE TABLE IF NOT EXISTS meta (
    clave VARCHAR(40) PRIMARY KEY,
    valor VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

CREATE INDEX idx_tareas_semana ON tareas (semana_id, seccion, orden);
CREATE INDEX idx_tareas_estado ON tareas (estado);
CREATE INDEX idx_focos_semana ON focos (semana_id, orden);
CREATE INDEX idx_resp_persona ON tarea_responsable (personal_id);

-- Vista lista para consultar el plan sin recorrer las relaciones.
CREATE OR REPLACE VIEW v_plan AS
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
        SELECT GROUP_CONCAT(p.nombre ORDER BY p.nombre SEPARATOR ', ')
        FROM tarea_responsable tr
        JOIN personal p ON p.id = tr.personal_id
        WHERE tr.tarea_id = t.id
    ) AS responsables
FROM tareas t
JOIN semanas s ON s.id = t.semana_id;

-- Ejemplos:
-- SELECT * FROM v_plan WHERE semana = 44;
-- SELECT responsables, COUNT(*) AS tareas,
--        ROUND(SUM(COALESCE(tiempo_minutos, 0)) / 60, 1) AS horas
-- FROM v_plan
-- WHERE semana = 44
-- GROUP BY responsables
-- ORDER BY tareas DESC;
