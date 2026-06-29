# Polla Mundialista FIFA 2026

App estática para quiniela de 8 amigos. Corre en GitHub Pages; usa Supabase como base de datos.

---

## Paso 1 — Crear proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) y crea una cuenta gratuita.
2. Crea un nuevo proyecto (elige cualquier región, guarda la contraseña de BD).
3. En el panel del proyecto, ve a **SQL Editor** y ejecuta en orden:
   - `supabase-setup.sql` (crea las tablas y habilita RLS permisivo)
   - `initial-data.sql` (carga el bracket vacío de 32 partidos)
4. Ve a **Project Settings → API** y copia:
   - **Project URL** → `SUPABASE_URL`
   - **anon / public key** → `SUPABASE_ANON_KEY`
   - **NUNCA copies la `service_role` key al frontend.**

---

## Paso 2 — Configurar el proyecto

Abre `config.js` y reemplaza los placeholders:

```js
const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbG..."; // clave anon/public
```

---

## Paso 3 — Publicar en GitHub Pages

1. Crea un repositorio en GitHub (puede ser público o privado).
2. Sube todos los archivos del proyecto:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `config.js` (ya con tus valores reales)
3. Ve a **Settings → Pages** en tu repo.
4. En **Source**, selecciona la rama `main` y carpeta `/root`.
5. Guarda. En 1-2 minutos tendrás una URL tipo `https://tu-usuario.github.io/nombre-repo/`.
6. Comparte esa URL con los 8 jugadores.

---

## Flujo de uso

### Admin (`admin` / `Admin#Polla2026!`)
1. Ingresa al sitio y loguéate como admin.
2. En cada ronda, ingresa los equipos y la fecha/hora de cada partido (en hora Ecuador).
3. Cuando termina un partido, ve al admin panel y carga el resultado oficial.
   - Si fue a penales, aparece el campo de penales automáticamente.
   - Confirma el modal de resumen.
4. El sistema automáticamente: marca el partido como finalizado, avanza el bracket y recalcula puntos.

### Jugadores
1. Ingresa con tu usuario y contraseña.
2. Ve a la ronda correspondiente.
3. Ingresa tu pronóstico (goles local – goles visitante).
   - Si pronosticas empate, aparece el campo de penales.
4. Guarda tu pronóstico. Puedes editarlo hasta 5 minutos antes del partido.
5. Una vez cerrado el partido, se revelan los pronósticos de todos.
6. Revisa la **Tabla de posiciones** para ver el ranking.

---

## Estructura de archivos

```
/
├── index.html          # HTML principal
├── styles.css          # Estilos (mobile-first, dark theme)
├── app.js              # Lógica completa de la app
├── config.js           # URL y clave anon de Supabase (EDITARLO antes de publicar)
├── supabase-setup.sql  # SQL: creación de tablas
├── initial-data.sql    # SQL: bracket inicial vacío (32 partidos)
└── README.md           # Este archivo
```

---

## Sistema de puntaje

| Regla | Puntos |
|---|---|
| Gol acertado por equipo (`min(pred, real)` goles coincidentes) | 0.5 por gol |
| Ganador acertado (partido sin empate) | +1 |
| Empate acertado (partido fue a penales) | +1 |
| Marcador de penales exacto | +1 |

Los puntos se acumulan. Máximo teórico por partido: depende del marcador.

### Ejemplos
- Real **3-1**, pred **3-1** → goles: 4×0.5=2.0 + ganador +1 = **3.0 pts**
- Real **1-1 (pen 4-3)**, pred **1-1 (pen 4-3)** → goles: 2×0.5=1.0 + empate +1 + penales +1 = **3.0 pts**
- Real **2-0**, pred **1-0** → goles: min(1,2)+min(0,0)=1×0.5=0.5 + ganador +1 = **1.5 pts**

---

## Seguridad

Esta app es para uso casual entre amigos. Las credenciales están en el JS del frontend (visible en el código fuente). Para un grupo de 8 personas de confianza esto es suficiente. **No uses esta app para apuestas reales ni con datos sensibles.**
