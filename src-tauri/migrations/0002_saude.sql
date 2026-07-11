-- Saúde: Treino + Dieta + Peso corporal
-- Convenção idêntica ao 0001: id TEXT (uuid), timestamps ISO 8601 Z.

------------------------------------------------------------------ TREINO

-- Plano de treino versionado. Ao "atualizar treino", encerra-se o atual
-- (ended_at + is_active=0) e cria-se uma nova linha — histórico grátis.
CREATE TABLE IF NOT EXISTS workout_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  period_weeks INTEGER,               -- duração planejada do ciclo
  freq_target INTEGER NOT NULL DEFAULT 3, -- treinos/semana alvo
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ended_at TEXT,                      -- null = ainda ativo
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_wplans_active ON workout_plans(is_active);

-- Sessões do plano (A, B, C, ...).
CREATE TABLE IF NOT EXISTS workout_sessions (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  label TEXT NOT NULL,                -- "A", "B", "Peito & Tríceps"
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_wsessions_plan ON workout_sessions(plan_id);

-- Exercícios planejados de cada sessão.
CREATE TABLE IF NOT EXISTS workout_exercises (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  target_sets INTEGER,
  target_reps TEXT,                   -- "8-12" ou "10"
  target_weight REAL,                 -- carga planejada (opcional)
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_wexercises_session ON workout_exercises(session_id);

-- Atribuição dia-da-semana -> sessão (0=domingo .. 6=sábado).
CREATE TABLE IF NOT EXISTS workout_schedule (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  weekday INTEGER NOT NULL,
  session_id TEXT,                    -- null = descanso
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wschedule_plan_wd ON workout_schedule(plan_id, weekday);

-- Registro de um dia treinado. performance dirige a cor do mapa de calor.
CREATE TABLE IF NOT EXISTS workout_logs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  plan_id TEXT,
  session_id TEXT,                    -- qual sessão foi feita (null = livre)
  performance TEXT NOT NULL DEFAULT 'same', -- 'up' | 'same' | 'down' | 'partial'
  completed INTEGER NOT NULL DEFAULT 0,     -- fez todos os exercícios?
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_wlogs_date ON workout_logs(date);

-- Séries registradas (carga/reps) de cada exercício num dia.
CREATE TABLE IF NOT EXISTS workout_set_logs (
  id TEXT PRIMARY KEY,
  log_id TEXT NOT NULL,
  exercise_id TEXT,                   -- FK ao exercício planejado (pode ser null p/ extra)
  exercise_name TEXT NOT NULL,        -- snapshot do nome
  weight REAL NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  set_index INTEGER NOT NULL DEFAULT 0,
  is_pr INTEGER NOT NULL DEFAULT 0,   -- recorde pessoal marcado neste registro
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_wsetlogs_log ON workout_set_logs(log_id);
CREATE INDEX IF NOT EXISTS idx_wsetlogs_ex ON workout_set_logs(exercise_id);

-- Peso corporal: check-in mensal, todo valor guardado no histórico.
CREATE TABLE IF NOT EXISTS body_weight_logs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  weight REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_bweight_date ON body_weight_logs(date);

------------------------------------------------------------------ DIETA

CREATE TABLE IF NOT EXISTS diet_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ended_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_dplans_active ON diet_plans(is_active);

-- Variantes de cardápio (A, B, C, D).
CREATE TABLE IF NOT EXISTS diet_variants (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  label TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_dvariants_plan ON diet_variants(plan_id);

-- Pratos + quantidades de cada variante.
CREATE TABLE IF NOT EXISTS diet_dishes (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity TEXT,                      -- texto livre: "180g", "1 concha"
  meal TEXT,                          -- rótulo da refeição: "Café", "Almoço"
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ddishes_variant ON diet_dishes(variant_id);

-- Atribuição dia-da-semana -> variante.
CREATE TABLE IF NOT EXISTS diet_schedule (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  weekday INTEGER NOT NULL,
  variant_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dschedule_plan_wd ON diet_schedule(plan_id, weekday);

-- Sobrescrita de variante num dia específico.
CREATE TABLE IF NOT EXISTS diet_overrides (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  variant_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Check-in diário da dieta.
CREATE TABLE IF NOT EXISTS diet_logs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  variant_id TEXT,
  status TEXT NOT NULL DEFAULT 'followed', -- 'followed' | 'partial' | 'off'
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_dlogs_date ON diet_logs(date);
