const APP_CONFIG = {
  EMPAQUETADO_URL: "https://script.google.com/macros/s/AKfycbxm5G6Xq-LU3o-IOUtrWpGO0a4a6832UPC0AcBTFAAwmlEh84goMwVnfs95SRzMG4Vu9A/exec",
  MERMA_URL: "https://script.google.com/macros/s/AKfycbxm5G6Xq-LU3o-IOUtrWpGO0a4a6832UPC0AcBTFAAwmlEh84goMwVnfs95SRzMG4Vu9A/exec",
  ALMACEN09_URL: "https://script.google.com/macros/s/AKfycbw8EBBRr7ymIK1JXtscQf8yIRmJj1MahtAhnIH9yg0I65zjdB-zmvcxz6XzpNd-yPzf/exec"
};

window.APP_CONFIG = Object.freeze({ ...APP_CONFIG });

window.getConfigUrl = function getConfigUrl(configKey, fallback = "") {
  const config = window.APP_CONFIG || {};
  const value = String(config[configKey] || "").trim();
  if (value && value !== "NUEVA_URL_AQUI") {
    return value;
  }
  return String(fallback || "").trim();
};

window.isValidAppsScriptExecUrl = function isValidAppsScriptExecUrl(url) {
  const value = String(url || "").trim();
  return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/i.test(value);
};

window.getResolvedWebAppUrl = function getResolvedWebAppUrl(configKey, fallback = "") {
  const stored = typeof localStorage !== "undefined"
    ? String(localStorage.getItem("WEB_APP_URL_DYNAMIC") || "").trim()
    : "";

  if (window.isValidAppsScriptExecUrl(stored)) {
    return stored;
  }

  return window.getConfigUrl(configKey, fallback);
};
