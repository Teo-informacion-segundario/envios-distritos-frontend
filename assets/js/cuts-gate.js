/* Puerta mensual de cortes. FastAPI es la unica fuente de autorizacion. */
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
      '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
      '<span>Permitir Cortes</span>',
    '</button>'
  ].join('');
  mount.appendChild(panel);

  const title = panel.querySelector('#lnCutsGateTitle');
  const message = panel.querySelector('#lnCutsGateMessage');
  const allowButton = panel.querySelector('#lnAllowCuts');

  // Dialogo propio: reemplaza confirm() por una interfaz consistente con TOGA.
  const overlay = document.createElement('div');
  overlay.className = 'ln-flow2-overlay';
  overlay.hidden = true;
  overlay.innerHTML = [
    '<section class="ln-flow2-dialog" role="dialog" aria-modal="true" aria-labelledby="lnFlow2Heading" aria-describedby="lnFlow2Description" tabindex="-1">',
      '<div class="ln-flow2-emblem" aria-hidden="true"><span class="ln-flow2-spinner"></span><span class="ln-flow2-mark">?</span></div>',
      '<div class="ln-flow2-eyebrow">CONTROL MENSUAL · LISTAS NEGRAS</div>',
      '<h2 id="lnFlow2Heading"></h2>',
      '<p id="lnFlow2Description"></p>',
      '<div class="ln-flow2-details">',
        '<div><span>Período a cruzar</span><strong id="lnFlow2CrossPeriod"></strong></div>',
        '<div><span>Autorización</span><strong id="lnFlow2AuthPeriod"></strong></div>',
      '</div>',
      '<div class="ln-flow2-note" id="lnFlow2Note" role="status" aria-live="polite"></div>',
      '<div class="ln-flow2-actions">',
        '<button type="button" class="ln-flow2-action ln-flow2-action--secondary" id="lnFlow2Cancel">Cancelar</button>',
        '<button type="button" class="ln-flow2-action ln-flow2-action--primary" id="lnFlow2Confirm">Iniciar cruce</button>',
        '<button type="button" class="ln-flow2-action ln-flow2-action--secondary" id="lnFlow2Hide" hidden>Continuar en la página</button>',
        '<button type="button" class="ln-flow2-action ln-flow2-action--primary" id="lnFlow2Finish" hidden>Ir a Generar corte</button>',
        '<button type="button" class="ln-flow2-action ln-flow2-action--primary" id="lnFlow2Dismiss" hidden>Entendido</button>',
      '</div>',
    '</section>'
  ].join('');
  document.body.appendChild(overlay);

  const dialog = overlay.querySelector('.ln-flow2-dialog');
  const modalHeading = overlay.querySelector('#lnFlow2Heading');
  const modalDescription = overlay.querySelector('#lnFlow2Description');
  const modalNote = overlay.querySelector('#lnFlow2Note');
  const crossPeriod = overlay.querySelector('#lnFlow2CrossPeriod');
  const authPeriod = overlay.querySelector('#lnFlow2AuthPeriod');
  const emblemMark = overlay.querySelector('.ln-flow2-mark');
  const cancelButton = overlay.querySelector('#lnFlow2Cancel');
  const confirmButton = overlay.querySelector('#lnFlow2Confirm');
  const hideButton = overlay.querySelector('#lnFlow2Hide');
  const finishButton = overlay.querySelector('#lnFlow2Finish');
  const dismissButton = overlay.querySelector('#lnFlow2Dismiss');

  let allowed = false;
  let period = null;
  let canAllow = false;
  let busy = false;
  let requestVersion = 0;
  let authenticated = false;
  let processing = false;
  let flow2Ready = false;
  let modalPhase = 'closed';
  let requestedPeriod = null;
  let pendingRunId = null;
  let focusBeforeModal = null;

  function periodLabel(code) {
    if (!/^\d{6}$/.test(String(code))) return 'mes actual';
    const year = Number(code.slice(0, 4));
    const month = Number(code.slice(4, 6));
    if (month < 1 || month > 12) return 'mes actual';
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(
      'es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' }
    );
  }

  function previousPeriod(code) {
    if (!/^\d{6}$/.test(String(code))) return null;
    const year = Number(code.slice(0, 4));
    const month = Number(code.slice(4, 6));
    if (month < 1 || month > 12) return null;
    const prev = new Date(Date.UTC(year, month - 2, 1));
    return String(prev.getUTCFullYear()) + String(prev.getUTCMonth() + 1).padStart(2, '0');
  }

  function switchToBlacklists() {
    if (document.body.classList.contains('is-credentials-view')) return;
    if (!document.body.classList.contains('is-blacklists-view')) blacklists.click();
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

  function setModal(phase, errorMessage) {
    if (phase === 'closed') {
      overlay.hidden = true;
      document.body.classList.remove('ln-flow2-modal-open');
      modalPhase = 'closed';
      if (focusBeforeModal && typeof focusBeforeModal.focus === 'function') {
        focusBeforeModal.focus();
      }
      focusBeforeModal = null;
      return;
    }

    const wasClosed = modalPhase === 'closed';
    if (wasClosed) focusBeforeModal = document.activeElement;
    modalPhase = phase;
    overlay.hidden = false;
    overlay.dataset.phase = phase;
    document.body.classList.add('ln-flow2-modal-open');

    const code = requestedPeriod || period;
    authPeriod.textContent = periodLabel(code);
    crossPeriod.textContent = periodLabel(previousPeriod(code));

    cancelButton.hidden = phase !== 'confirm';
    confirmButton.hidden = phase !== 'confirm';
    hideButton.hidden = phase !== 'processing';
    finishButton.hidden = phase !== 'success';
    dismissButton.hidden = phase !== 'error';
    emblemMark.textContent = phase === 'success' ? '✓' : phase === 'error' ? '!' : '↗';

    if (phase === 'confirm') {
      modalHeading.textContent = '¿Iniciar el cruce mensual?';
      modalDescription.textContent = 'Se actualizará el histórico con las listas negras de ' +
        crossPeriod.textContent + '. Generar corte e Historial permanecerán bloqueados hasta verificar la publicación.';
      modalNote.textContent = 'El proceso se ejecutará una sola vez mediante n8n.';
    } else if (phase === 'starting') {
      modalHeading.textContent = 'Conectando con n8n';
      modalDescription.textContent = 'Estamos solicitando el inicio del flujo mensual. No cierres ni vuelvas a pulsar el botón.';
      modalNote.textContent = 'Validando la solicitud con FastAPI...';
    } else if (phase === 'processing') {
      modalHeading.textContent = 'Actualizando el histórico';
      modalDescription.textContent = 'n8n está cruzando las listas negras y verificando el archivo definitivo en Google Drive.';
      modalNote.textContent = 'Comprobando el resultado automáticamente. Los cortes continúan bloqueados.';
    } else if (phase === 'success') {
      modalHeading.textContent = '¡Data lista para enviar!';
      modalDescription.textContent = 'Cruce realizado con éxito. La publicación fue confirmada y ya puedes utilizar Generar corte e Historial.';
      modalNote.textContent = 'Autorización verificada por FastAPI para ' + authPeriod.textContent + '.';
    } else {
      modalHeading.textContent = 'No se pudo confirmar el proceso';
      modalDescription.textContent = errorMessage || 'El flujo no terminó correctamente. Revisa el estado antes de volver a intentarlo.';
      modalNote.textContent = 'Generar corte e Historial solo se habilitan cuando FastAPI confirma la publicación.';
    }

    if (wasClosed) {
      const initial = phase === 'confirm' ? cancelButton : dialog;
      initial.focus();
    }
    if (phase === 'success') finishButton.focus();
    if (phase === 'error') dismissButton.focus();
  }

  function applyStatus(data) {
    if (!data || !/^\d{6}$/.test(String(data.periodo)) ||
        data.zona_horaria !== 'America/Lima' ||
        typeof data.permitido !== 'boolean') {
      throw new Error('Respuesta de autorización mensual inválida.');
    }

    period = data.periodo;
    flow2Ready = data.contrato === 'cortes_gate_v2' &&
      ['bloqueado', 'procesando', 'fallido', 'habilitado'].includes(data.estado) &&
      typeof data.puede_iniciar === 'boolean';

    // Nunca usar aprobaciones antiguas ni estados del navegador como autorizacion.
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

    // Solo mostrar exito de la ejecucion que inicio esta pagina.
    if (pendingRunId && data.run_id === pendingRunId && modalPhase !== 'closed') {
      if (allowed && modalPhase !== 'success') {
        setModal('success');
      } else if (data.estado === 'fallido' && modalPhase !== 'error') {
        setModal('error', 'FastAPI informó que no se completó el proceso. Revisa la ejecución en n8n.');
      } else if (processing && modalPhase === 'starting') {
        setModal('processing');
      }
    }
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
      if (response.status === 409) throw new Error('Cambió el período o ya existe una ejecución. Actualiza el estado antes de reintentar.');
      throw new Error(typeof data?.detail === 'string' ? data.detail :
        'No se pudo consultar la autorización mensual (HTTP ' + response.status + ').');
    }
    return data;
  }

  async function refreshStatus() {
    if (!cfg.authEnabled) {
      showBlocked('El permiso mensual se consulta desde el servidor de producción.');
      return null;
    }
    const myRequest = ++requestVersion;
    try {
      const data = await api('/estado');
      if (myRequest !== requestVersion) return null;
      authenticated = true;
      applyStatus(data);
      return data;
    } catch (error) {
      if (myRequest !== requestVersion) return null;
      showBlocked(error.message || 'No se pudo consultar el control mensual.');
      // Un error temporal de red no es confirmacion de fallo del cruce.
      if (modalPhase === 'processing') {
        modalNote.textContent = 'Esperando conexión con FastAPI. La verificación continuará automáticamente.';
      }
      return null;
    }
  }

  allowButton.addEventListener('click', () => {
    if (busy || !authenticated || allowed || !canAllow || processing || !period) return;
    requestedPeriod = period;
    pendingRunId = null;
    setModal('confirm');
  });

  cancelButton.addEventListener('click', () => setModal('closed'));
  hideButton.addEventListener('click', () => setModal('closed'));
  dismissButton.addEventListener('click', () => {
    pendingRunId = null;
    setModal('closed');
  });
  finishButton.addEventListener('click', () => {
    const canNavigate = allowed === true;
    pendingRunId = null;
    setModal('closed');
    if (canNavigate) generator.click();
  });

  confirmButton.addEventListener('click', async () => {
    if (modalPhase !== 'confirm' || busy || !authenticated || allowed || !canAllow ||
        processing || !requestedPeriod) return;

    const operationPeriod = requestedPeriod;
    busy = true;
    allowButton.disabled = true;
    setModal('starting');

    try {
      const result = await api('/iniciar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodo: operationPeriod })
      });
      if (!result || result.ok !== true || result.estado !== 'procesando' ||
          result.periodo !== operationPeriod ||
          typeof result.run_id !== 'string' || !result.run_id) {
        throw new Error('FastAPI no devolvió una confirmación válida de inicio. Comprueba el estado antes de reintentar.');
      }
      pendingRunId = result.run_id;
      processing = true;
      canAllow = false;
      applyLock(true);
      title.textContent = 'Procesando listas negras';
      message.textContent = 'El flujo 2 está en ejecución. Los cortes siguen bloqueados hasta verificar la publicación.';
      setModal('processing');
      await refreshStatus();
    } catch (error) {
      setModal('error', (error.message || 'No se pudo iniciar el cruce.') +
        ' Si la solicitud llegó a n8n, no la repitas sin revisar su ejecución.');
      await refreshStatus();
    } finally {
      busy = false;
      allowButton.disabled = !canAllow || processing || allowed;
    }
  });

  overlay.addEventListener('click', event => {
    if (event.target === overlay && ['confirm', 'success', 'error'].includes(modalPhase)) {
      if (modalPhase !== 'confirm') pendingRunId = null;
      setModal('closed');
    }
  });

  document.addEventListener('keydown', event => {
    if (modalPhase === 'closed') return;
    if (event.key === 'Escape' && modalPhase !== 'starting') {
      event.preventDefault();
      if (modalPhase === 'success' || modalPhase === 'error') pendingRunId = null;
      setModal('closed');
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialog.querySelectorAll('button:not([hidden]):not(:disabled)'));
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  });

  // Evita abrir vistas bloqueadas, incluso si otros scripts intentan navegarlas.
  document.addEventListener('click', event => {
    if (!allowed && (generator.contains(event.target) || history.contains(event.target))) {
      event.preventDefault();
      event.stopImmediatePropagation();
      switchToBlacklists();
    }
  }, true);

  window.TOGA_CUTS_GATE = Object.freeze({
    get allowed() { return allowed; },
    refresh() { return refreshStatus(); }
  });

  if (!cfg.authEnabled) {
    allowed = true;
    applyLock(false);
    title.textContent = 'Control mensual en producción';
    message.textContent = 'El bloqueo mensual se aplica al iniciar sesión en el servidor productivo.';
    allowButton.disabled = true;
  } else {
    applyLock(true);
    document.addEventListener('toga:session-ready', () => {
      authenticated = true;
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
      if (authenticated && (processing || pendingRunId)) void refreshStatus();
    }, 10000);
    window.setInterval(() => {
      if (authenticated && !processing && !pendingRunId) void refreshStatus();
    }, 60000);
  }
})();
