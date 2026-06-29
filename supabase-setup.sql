-- ============================================================
-- POLLA MUNDIALISTA FIFA 2026
-- Script de creación de tablas en Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- Tabla de partidos
CREATE TABLE IF NOT EXISTS matches (
  id              text PRIMARY KEY,           -- 'R32-1'..'R32-16', 'R16-1'..'R16-8', 'QF-1'..'QF-4', 'SF-1', 'SF-2', 'TP', 'FINAL'
  round           text NOT NULL,              -- 'dieciseisavos','octavos','cuartos','semifinal','tercer_puesto','final'
  order_index     int  NOT NULL,              -- orden de visualización dentro de la ronda
  team_home       text DEFAULT '',
  team_away       text DEFAULT '',
  kickoff_at      timestamptz,                -- el admin la fija; se guarda en UTC, se muestra en hora Ecuador
  status          text DEFAULT 'proximo',     -- 'proximo' | 'cerrado' | 'finalizado'
  result_home     int,
  result_away     int,
  is_draw         boolean DEFAULT false,
  pen_home        int,
  pen_away        int,
  winner          text DEFAULT '',
  next_match_id   text,                       -- FK lógica a matches.id (no FK real para simplificar)
  next_slot       text                        -- 'home' | 'away'
);

-- Tabla de pronósticos
CREATE TABLE IF NOT EXISTS predictions (
  id              bigserial PRIMARY KEY,
  "user"          text NOT NULL,
  match_id        text NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  pred_home       int  NOT NULL DEFAULT 0,
  pred_away       int  NOT NULL DEFAULT 0,
  pred_is_draw    boolean GENERATED ALWAYS AS (pred_home = pred_away) STORED,
  pred_pen_home   int,
  pred_pen_away   int,
  points          numeric DEFAULT 0,
  updated_at      timestamptz DEFAULT now(),
  CONSTRAINT uq_user_match UNIQUE ("user", match_id)
);

-- ============================================================
-- ROW LEVEL SECURITY (modo permisivo para clave anon)
-- ============================================================

ALTER TABLE matches    ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;

-- Permitir todo a la clave anon (la lógica de ocultamiento está en el frontend)
CREATE POLICY "anon_all_matches"     ON matches     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_predictions" ON predictions FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_predictions_user     ON predictions("user");
CREATE INDEX IF NOT EXISTS idx_predictions_match_id ON predictions(match_id);
