(function () {
  function getLockLabel() {
    return (window.APP_MAINTENANCE && window.APP_MAINTENANCE.LOCK_LABEL) || "Bloqueado por Migración";
  }

  function isMigrationLockEnabled() {
    return Boolean(window.APP_MAINTENANCE && window.APP_MAINTENANCE.MIGRATION_LOCK_ENABLED);
  }

  function renderBannerBySelector(selector) {
    const nodes = document.querySelectorAll(selector);
    nodes.forEach((node) => {
      const projectName = (node.dataset.projectName || "este proyecto").trim();
      node.innerHTML = `
        <div class="maintenance-banner" role="status" aria-live="polite">
          <p class="maintenance-banner__title">Mantenimiento de Inventario</p>
          <p class="maintenance-banner__text">Mantenimiento de Inventario: El registro de datos para ${projectName} se reanudará en breve.</p>
        </div>
      `;
    });
  }

  function lockFormSubmission(formOrSelector, options = {}) {
    const form = typeof formOrSelector === "string" ? document.querySelector(formOrSelector) : formOrSelector;
    if (!form) return;

    const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      if (submitBtn.tagName === "BUTTON") {
        submitBtn.textContent = getLockLabel();
      } else {
        submitBtn.value = getLockLabel();
      }
      submitBtn.classList.add("maintenance-submit-locked");
    }

    let statusEl = null;
    if (options.statusTargetSelector) {
      statusEl = document.querySelector(options.statusTargetSelector);
    }
    if (!statusEl) {
      statusEl = form.querySelector(".maintenance-lock-status");
    }
    if (!statusEl) {
      statusEl = document.createElement("p");
      statusEl.className = "maintenance-lock-status";
      form.appendChild(statusEl);
    }
    statusEl.textContent = getLockLabel();

    form.addEventListener(
      "submit",
      (event) => {
        if (!isMigrationLockEnabled()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true
    );
  }

  window.MaintenanceUI = {
    isMigrationLockEnabled,
    renderBannerBySelector,
    lockFormSubmission
  };
})();