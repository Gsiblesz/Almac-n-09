CREATE TABLE IF NOT EXISTS lotes (
  id SERIAL PRIMARY KEY,
  codigo_lote VARCHAR(20) UNIQUE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lote_productos (
  id SERIAL PRIMARY KEY,
  lote_id INTEGER NOT NULL REFERENCES lotes(id) ON DELETE CASCADE,
  codigo VARCHAR(50) NOT NULL,
  descripcion VARCHAR(255),
  lote_producto VARCHAR(30),
  paquetes INTEGER,
  sobre_piso INTEGER,
  cestas_calculadas INTEGER,
  cantidad INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conteo_errores (
  id SERIAL PRIMARY KEY,
  codigo_lote VARCHAR(20),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
