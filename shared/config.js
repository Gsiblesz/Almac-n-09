const APP_CONFIG = {
  EMPAQUETADO_URL: "NUEVA_URL_AQUI",
  MERMA_URL: "NUEVA_URL_AQUI",
  ALMACEN09_URL: "NUEVA_URL_AQUI"
};

const APP_MAINTENANCE = {
  MIGRATION_LOCK_ENABLED: true,
  LOCK_LABEL: "Bloqueado por Migración"
};

window.APP_CONFIG = Object.freeze({ ...APP_CONFIG });
window.APP_MAINTENANCE = Object.freeze({ ...APP_MAINTENANCE });

window.getConfigUrl = function getConfigUrl(configKey, fallback = "") {
  const config = window.APP_CONFIG || {};
  const value = String(config[configKey] || "").trim();
  if (value && value !== "NUEVA_URL_AQUI") {
    return value;
  }
  return String(fallback || "").trim();
};