/* Puerta mensual de cortes: la autorizacion real vive en FastAPI.
   No guardar el estado ni secretos en localStorage ni en el navegador. */
(() => {
  'use strict';

  const cfg = window.ENVIO_APP_CONFIG || {};
  const generator = document.querySelector('[data-view="generator"]');
  const history = document.querySelector('[data-view="history"]');
  const blacklists = document.querySelector('[data-view="blacklists"]');
  const mount = document.querySelector('#lnCutsGateMount');
  if (!generator || !history || !blacklists || !mount) return;

  const ROOT = '/api/gateway/cortes';
  const panel = document.createElement('section');
  panel.className = 'ln-cuts-gate';
  panel.setAttribute('aria-label', 'Autorización mensual de cortes');
  panel.innerHTML = [
    '<div class="ln-cuts-gate-copy">',
    '<div class="ln-cuts-gate-kicker">CONTROL MENSUAL DE CORTES</div>',
    '<h3 id="lnCutsGateTitle">Cortes bloqueados</h3>',
    '<p id="lnCutsGateMessage" role="status" aria-live="polite">Verificando la autorización del mes...</p>',
    '</div>',
    '<button type="button" id="lnAllowCuts" class="ln-allow-cuts" disabled>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
    '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    '</svg><span>Permitir Cortes</span>',
    '</button>'
  ].join('');
  mount.appendChild(panel);

  const title = panel.querySelector('#lnCutsGateTitle');
  const message = panel.querySelector('#lnCutsGateMessage');
  const allowButton = panel.querySelector('#lnAllowCuts');
  let allowed = false;
  let period = null;
  let canAllow = false;
  let busy = false;
  let requestVersion = 0;
  let authenticated = false;
  let processing = false;
  let flow2Ready = false;

  function periodLabel(code) {
    if (!/^\d{6}$/.test(String(code))) return 'mes actual';
    const year = Number(code.slice(0, 4));
    const month = Number(code.slice(4, 6));
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(
      'es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' }
    );
  }

  function switchToBlacklists() {
    if (document.body.classList.contains('is-credentials-view')) return;
    if (!document.body.classList.contains('is-blacklists-view')) {
      blacklists.click();
    }
  }

  function applyLock(locked) {
    document.body.classList.toggle('cuts-gate-locked', locked);
    generator.disabled = locked;
    history.disabled = locked;
    generator.setAttribute('aria-disabled', String(locked));
    history.setAttribute('aria-disabled', String(locked));
    if (locked) switchToBlacklists();
  }

  function showBlocked(messageText) {
    allowed = false;
    canAllow = false;
    applyLock(true);
    panel.classList.remove('is-allowed');
    title.textContent = 'Cortes bloqueados';
    message.textContent = messageText;
    allowButton.disabled = true;
  }

  function applyStatus(data) {
    if (!data || !/^\\d{6}$/.test(String(data.periodo)) ||
        data.zona_horaria !== 'America/Lima' ||
        typeof data.permitido !== 'boolean') {
      throw new Error('Respuesta de autorización mensual inválida.');
    }

    period = data.periodo;
    flow2Ready = data.contrato === 'cortes_gate_v2' &&
      ['bloqueado', 'procesando', 'fallido', 'habilitado'].includes(data.estado) &&
      typeof data.puede_iniciar === 'boolean';

    // El contrato anterior permitía aprobar sin procesar el histórico.
    // Nunca habilitar cortes con esa aprobación antigua.
    allowed = flow2Ready && data.estado === 'habilitado' && data.permitido === true;
    processing = flow2Ready && data.estado === 'procesando';
    canAllow = flow2Ready && data.puede_iniciar && !processing && !allowed;

    applyLock(!allowed);
    panel.classList.toggle('is-allowed', allowed);
    const label = periodLabel(period);

    if (!flow2Ready) {
      title.textContent = 'Cortes bloqueados';
      message.textContent = 'El cruce y publicación del histórico aún no están conectados. La autorización directa no habilita cortes.';
    } else if (allowed) {
      title.textContent = 'Cortes habilitados';
      message.textContent = 'Histórico depurado y verificado para ' + label + '. Generar corte e Historial están disponibles.';
    } else if (processing) {
      title.textContent = 'Procesando listas negras';
      message.textContent = 'Cruzando el histórico y verificando la subida a Google Drive. Los cortes seguirán bloqueados.';
    } else if (data.estado === 'fallido') {
      title.textContent = 'No se completó el proceso';
      message.textContent = 'La actualización del histórico no se confirmó. Los cortes siguen bloqueados. Revisa el resultado del flujo.';
    } else {
      title.textContent = 'Cortes bloqueados';
      message.textContent = 'El histórico debe procesarse y publicarse para habilitar los cortes de ' + label + '.';
    }
    allowButton.disabled = !canAllow || busy;
    allowButton.querySelector('span').textContent = allowed
      ? 'Cortes permitidos'
      : processing ? 'Procesando...' : 'Permitir Cortes';
  }

  async function api(path, options) {
    const response = await fetch(ROOT + path, {
      method: options?.method || 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json', ...(options?.headers || {}) },
      ...(options?.body ? { body: options.body } : {})
    });
    let data = null;
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) {
      if (response.status === 401) throw new Error('Inicia sesión para consultar la autorización.');
      if (response.status === 403) throw new Error('Tu usuario no tiene permisos para permitir cortes.');
      if (response.status === 409) throw new Error('Cambió el período. Actualiza el estado e inténtalo nuevamente.');
      throw new Error(typeof data?.detail === 'string' ? data.detail :
        'No se pudo consultar la autorización mensual (HTTP ' + response.status + ').');
    }
    return data;
  }

  async function refreshStatus() {
    if (!cfg.authEnabled) {
      showBlocked('El permiso mensual se consulta desde el servidor de producción.');
      return;
    }
    const myRequest = ++requestVersion;
    try {
      const data = await api('/estado');
      if (myRequest !== requestVersion) return;
      authenticated = true;
      applyStatus(data);
    } catch (error) {
      if (myRequest !== requestVersion) return;
      showBlocked(error.message || 'No se pudo consultar el control mensual.');
    }
  }

  allowButton.addEventListener('click', async () => {
    if (busy || !authenticated || allowed || !canAllow || processing || !period) return;
    const label = periodLabel(period);
    const confirmed = window.confirm(
      '¿Iniciar el cruce de listas negras y la actualización del histórico para ' + label + '? ' +
      'Generar corte e Historial seguirán bloqueados hasta verificar la subida completa a Google Drive.'
    );
    if (!confirmed) return;
    busy = true;
    allowButton.disabled = true;
    allowButton.querySelector('span').textContent = 'Iniciando proceso...';
    const myRequest = ++requestVersion;
    try {
      await api('/iniciar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodo: period })
      });
      if (myRequest === requestVersion) {
        processing = true;
        applyLock(true);
        title.textContent = 'Procesando listas negras';
        message.textContent = 'El flujo 2 está en ejecución. Los cortes permanecen bloqueados hasta la publicación verificada.';
      }
      await refreshStatus();
    } catch (error) {
      if (myRequest === requestVersion) {
        showBlocked(error.message || 'No se pudo iniciar el cruce del histórico.');
        await refreshStatus();
      }
    } finally {
      busy = false;
      allowButton.querySelector('span').textContent = allowed
        ? 'Cortes permitidos' : processing ? 'Procesando...' : 'Permitir Cortes';
      allowButton.disabled = !canAllow;
    }
  });

  // Captura eventos antes de los controladores existentes (historial/generación).
  document.addEventListener('click', event => {
    if (!allowed && (generator.contains(event.target) || history.contains(event.target))) {
      event.preventDefault();
      event.stopImmediatePropagation();
      switchToBlacklists();
    }
  }, true);

  // La autorización se consulta desde FastAPI, nunca desde localStorage.
  window.TOGA_CUTS_GATE = Object.freeze({
    get allowed() { return allowed; },
    refresh() { return refreshStatus(); }
  });

  if (!cfg.authEnabled) {
    // No interrumpir el modo local de desarrollo sin autenticación/API.
    allowed = true;
    applyLock(false);
    title.textContent = 'Control mensual en producción';
    message.textContent = 'El bloqueo mensual se aplica al iniciar sesión en el servidor productivo.';
    allowButton.disabled = true;
  } else {
    applyLock(true);
    document.addEventListener('toga:session-ready', () => {
      authenticated = true;
      // Al entrar con sesión se repite también la consulta de métricas.
      if (document.body.classList.contains('is-blacklists-view')) blacklists.click();
      void refreshStatus();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && authenticated) void refreshStatus();
    });
    window.addEventListener('focus', () => {
      if (authenticated) void refreshStatus();
    });
    window.setInterval(() => {
      if (authenticated && processing) void refreshStatus();
    }, 10000);
    window.setInterval(() => {
      if (authenticated && !processing) void refreshStatus();
    }, 60000);
  }
})();
