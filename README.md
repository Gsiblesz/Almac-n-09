# Formulario de Lotes

Proyecto con frontend HTML/JS y backend Node.js/Express conectado a PostgreSQL (Neon) para generar y guardar códigos de lote.

## Estructura
- frontend: formulario HTML/JS
- backend: API Express y conexión a PostgreSQL

## Configuración rápida
1. Copia [backend/.env.example](backend/.env.example) a .env y completa DATABASE_URL.
2. Crea las tablas ejecutando el SQL de [backend/db/schema.sql](backend/db/schema.sql) en tu base Neon.
3. Instala dependencias en backend:
   - npm install
4. Inicia el backend:
   - npm start
5. Abre [frontend/index.html](frontend/index.html) o sirve el frontend desde el backend.

## Endpoints
- POST /nuevo-lote
  - Body: { "productos": [ { "codigo": "p1", "cantidad": 10 } ] }
  - Respuesta: { "codigo_lote": "BCddmmyyXX" }

## Render/Neon (resumen)
- Configura variables de entorno en Render: DATABASE_URL y PGSSLMODE=require.
- Si quieres servir el frontend desde el backend, define FRONTEND_DIR apuntando a la carpeta frontend.
