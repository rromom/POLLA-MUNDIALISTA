-- ============================================================
-- POLLA MUNDIALISTA FIFA 2026
-- Carga inicial del bracket completo (32 partidos)
-- Ejecutar DESPUÉS de supabase-setup.sql
-- ============================================================

-- Limpiar datos existentes (si se necesita reiniciar)
-- TRUNCATE predictions, matches RESTART IDENTITY CASCADE;

-- ============================================================
-- DIECISEISAVOS DE FINAL (R32-1 a R32-16)
-- Equipos: el admin los completa en la app.
-- kickoff_at: el admin lo fija en la app (se deja NULL por ahora).
-- next_match_id / next_slot: mapeo estándar FIFA 2026
-- ============================================================

INSERT INTO matches (id, round, order_index, team_home, team_away, next_match_id, next_slot) VALUES
  ('R32-1',  'dieciseisavos', 1,  '', '', 'R16-1', 'home'),
  ('R32-2',  'dieciseisavos', 2,  '', '', 'R16-1', 'away'),
  ('R32-3',  'dieciseisavos', 3,  '', '', 'R16-2', 'home'),
  ('R32-4',  'dieciseisavos', 4,  '', '', 'R16-2', 'away'),
  ('R32-5',  'dieciseisavos', 5,  '', '', 'R16-3', 'home'),
  ('R32-6',  'dieciseisavos', 6,  '', '', 'R16-3', 'away'),
  ('R32-7',  'dieciseisavos', 7,  '', '', 'R16-4', 'home'),
  ('R32-8',  'dieciseisavos', 8,  '', '', 'R16-4', 'away'),
  ('R32-9',  'dieciseisavos', 9,  '', '', 'R16-5', 'home'),
  ('R32-10', 'dieciseisavos', 10, '', '', 'R16-5', 'away'),
  ('R32-11', 'dieciseisavos', 11, '', '', 'R16-6', 'home'),
  ('R32-12', 'dieciseisavos', 12, '', '', 'R16-6', 'away'),
  ('R32-13', 'dieciseisavos', 13, '', '', 'R16-7', 'home'),
  ('R32-14', 'dieciseisavos', 14, '', '', 'R16-7', 'away'),
  ('R32-15', 'dieciseisavos', 15, '', '', 'R16-8', 'home'),
  ('R32-16', 'dieciseisavos', 16, '', '', 'R16-8', 'away')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- OCTAVOS DE FINAL (R16-1 a R16-8)
-- ============================================================

INSERT INTO matches (id, round, order_index, team_home, team_away, next_match_id, next_slot) VALUES
  ('R16-1', 'octavos', 1, '', '', 'QF-1', 'home'),
  ('R16-2', 'octavos', 2, '', '', 'QF-1', 'away'),
  ('R16-3', 'octavos', 3, '', '', 'QF-2', 'home'),
  ('R16-4', 'octavos', 4, '', '', 'QF-2', 'away'),
  ('R16-5', 'octavos', 5, '', '', 'QF-3', 'home'),
  ('R16-6', 'octavos', 6, '', '', 'QF-3', 'away'),
  ('R16-7', 'octavos', 7, '', '', 'QF-4', 'home'),
  ('R16-8', 'octavos', 8, '', '', 'QF-4', 'away')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- CUARTOS DE FINAL (QF-1 a QF-4)
-- ============================================================

INSERT INTO matches (id, round, order_index, team_home, team_away, next_match_id, next_slot) VALUES
  ('QF-1', 'cuartos', 1, '', '', 'SF-1', 'home'),
  ('QF-2', 'cuartos', 2, '', '', 'SF-1', 'away'),
  ('QF-3', 'cuartos', 3, '', '', 'SF-2', 'home'),
  ('QF-4', 'cuartos', 4, '', '', 'SF-2', 'away')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- SEMIFINALES (SF-1, SF-2)
-- El ganador va a FINAL; el perdedor va al tercer puesto (TP)
-- next_match_id apunta al FINAL (ganadores); los perdedores
-- se manejan en la lógica del app (van a TP).
-- ============================================================

INSERT INTO matches (id, round, order_index, team_home, team_away, next_match_id, next_slot) VALUES
  ('SF-1', 'semifinal', 1, '', '', 'FINAL', 'home'),
  ('SF-2', 'semifinal', 2, '', '', 'FINAL', 'away')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- TERCER PUESTO (TP) — perdedores de SF-1 y SF-2
-- ============================================================

INSERT INTO matches (id, round, order_index, team_home, team_away, next_match_id, next_slot) VALUES
  ('TP', 'tercer_puesto', 1, '', '', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- FINAL
-- ============================================================

INSERT INTO matches (id, round, order_index, team_home, team_away, next_match_id, next_slot) VALUES
  ('FINAL', 'final', 1, '', '', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- VERIFICACIÓN (opcional: ejecutar para ver el bracket)
-- ============================================================
-- SELECT id, round, order_index, next_match_id, next_slot
-- FROM matches ORDER BY round, order_index;
