(() => {
  'use strict';

  const CONFIG = window.ENVIO_APP_CONFIG || {};

  const DISTRICTS = [
    ['JESUS_MARIA', 'Jesús María'],
    ['SAN_MIGUEL', 'San Miguel'],
    ['PUEBLO_LIBRE', 'Pueblo Libre'],
    ['SURQUILLO', 'Surquillo'],
    ['LINCE', 'Lince'],
    ['MAGDALENA_DEL_MAR', 'Magdalena del Mar'],
    ['MIRAFLORES', 'Miraflores'],
    ['SANTIAGO_DE_SURCO', 'Santiago de Surco'],
    ['SAN_ISIDRO', 'San Isidro'],
    ['SAN_BORJA', 'San Borja'],
    ['BARRANCO', 'Barranco'],
    ['CERCADO_DE_LIMA', 'Cercado de Lima'],
    ['LA_VICTORIA', 'La Victoria'],
    ['BRENA', 'Breña'],
    ['ATE', 'Ate'],
    ['LIMA_NORTE', 'Lima Norte · grupo virtual'],
    ['BELLAVISTA', 'Bellavista'],
    ['MULTIDISTRITO', 'Multidistrito · grupo virtual']
  ];

  const els = {
    html: document.documentElement,
    form: document.querySelector('#requestForm'),
    periodo: document.querySelector('#periodo'),
    distrito: document.querySelector('#distrito'),
    cantidad: document.querySelector('#cantidad'),
    whatsappFields: document.querySelector('#whatsappFields'),
    projectIds: [
      document.querySelector('#projectId1'),
      document.querySelector('#projectId2'),
      document.querySelector('#projectId3')
    ],
    utmCampaign: document.querySelector('#utmCampaign'),
    themeToggle: document.querySelector('#themeToggle'),
    themeIcon: document.querySelector('#themeIcon'),
    themeLabel: document.querySelector('#themeLabel'),
    environmentPill: document.querySelector('#environmentPill'),
    availabilityButton: document.querySelector('#availabilityButton'),
    resetButton: document.querySelector('#resetButton'),
    availabilityPanel: document.querySelector('#availabilityPanel'),
    availabilityState: document.querySelector('#availabilityState'),
    availabilityMessage: document.querySelector('#availabilityMessage'),
    metricTotal: document.querySelector('#metricTotal'),
    metricUsed: document.querySelector('#metricUsed'),
    metricAvailable: document.querySelector('#metricAvailable'),
    metricRequested: document.querySelector('#metricRequested'),
    metricMissing: document.querySelector('#metricMissing'),
    reusePanel: document.querySelector('#reusePanel'),
    lotsList: document.querySelector('#lotsList'),
    generateButton: document.querySelector('#generateButton'),
    expectedResult: document.querySelector('#expectedResult'),
    successPanel: document.querySelector('#successPanel'),
    successMessage: document.querySelector('#successMessage'),
    successDetails: document.querySelector('#successDetails'),
    toast: document.querySelector('#toast'),
    summaryPeriodo: document.querySelector('#summaryPeriodo'),
    summaryCanal: document.querySelector('#summaryCanal'),
    summaryDistrito: document.querySelector('#summaryDistrito'),
    summaryCantidad: document.querySelector('#summaryCantidad')
  };

  let availability = null;
  let lots = [];
  let currentRequestId = null;
  let phase = 'form';

  function requestControls() {
    return [
      els.periodo,
      els.distrito,
      els.cantidad,
      ...document.querySelectorAll('input[name="canal"]'),
      ...els.projectIds,
      els.utmCampaign
    ];
  }

  function setRequestControlsLocked(locked) {
    requestControls().forEach(control => {
      if (control) control.disabled = locked;
    });
  }

  function setPhase(nextPhase) {
    phase = nextPhase;

    // Fase 1 es la única en la que se permite cambiar la solicitud.
    // Después de consultar, 'Limpiar' es la vía para volver a empezar.
    setRequestControlsLocked(nextPhase !== 'form');

    // 'Limpiar' nunca se bloquea.
    if (els.resetButton) els.resetButton.disabled = false;

    els.availabilityButton.disabled = nextPhase !== 'form';
    const availabilityLabel = els.availabilityButton.querySelector('span:first-child');
    if (availabilityLabel) {
      availabilityLabel.textContent = nextPhase === 'querying'
        ? 'Consultando...'
        : 'Consultar disponibilidad';
    }

    if (nextPhase !== 'availability') {
      els.generateButton.disabled = true;
    }
  }

  function getCanal() {
    return document.querySelector('input[name="canal"]:checked')?.value || 'WHATSAPP';
  }

  function number(value) {
    return new Intl.NumberFormat('es-PE').format(Number(value || 0));
  }

  function setStep(step) {
    document.querySelectorAll('.step').forEach(node => {
      node.classList.toggle('is-active', Number(node.dataset.step) === step);
    });
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => els.toast.classList.remove('is-visible'), 2800);
  }

  function applyTheme(theme) {
    const safeTheme = theme === 'dark' ? 'dark' : 'light';
    els.html.dataset.theme = safeTheme;
    els.themeIcon.textContent = safeTheme === 'dark' ? '☀' : '☾';
    els.themeLabel.textContent = safeTheme === 'dark' ? 'Claro' : 'Oscuro';
    localStorage.setItem(CONFIG.themeStorageKey || 'envios-data-theme', safeTheme);
  }

  function initTheme() {
    const saved = localStorage.getItem(CONFIG.themeStorageKey || 'envios-data-theme');
    const preferred = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyTheme(saved || preferred || 'light');
  }

  function buildDistrictOptions() {
    els.distrito.innerHTML = DISTRICTS
      .map(([value, label]) => `<option value="${value}">${label}</option>`)
      .join('');
  }

  function updateConditionalFields() {
    const whatsapp = getCanal() === 'WHATSAPP';
    els.whatsappFields.classList.toggle('is-hidden', !whatsapp);
    els.projectIds.forEach(input => input.required = whatsapp);
    els.utmCampaign.required = whatsapp;
    updateSummary();
  }

  function updateSummary() {
    els.summaryPeriodo.textContent = els.periodo.value || '—';
    els.summaryCanal.textContent = getCanal();
    const selected = els.distrito.options[els.distrito.selectedIndex];
    els.summaryDistrito.textContent = selected ? selected.textContent : '—';
    els.summaryCantidad.textContent = els.cantidad.value ? number(els.cantidad.value) : '—';
  }

  function validateRequest() {
    const periodo = els.periodo.value.trim();
    const cantidad = Number(els.cantidad.value);
    const canal = getCanal();

    if (!/^\d{6}$/.test(periodo)) throw new Error('El periodo debe tener formato YYYYMM.');
    if (!Number.isInteger(cantidad) || cantidad <= 0) throw new Error('La cantidad debe ser un entero mayor a 0.');

    if (canal === 'WHATSAPP') {
      const projectIds = els.projectIds.map(input => input.value.trim());
      if (projectIds.some(value => !/^\d+$/.test(value))) throw new Error('Completa los 3 Project IDs con valores numéricos.');
      if (!els.utmCampaign.value.trim()) throw new Error('Ingresa la UTM Campaign.');
    }
  }

  function ensureRequestId() {
    if (!currentRequestId) {
      const suffix = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      currentRequestId = `FRONT-${suffix}`;
    }
    return currentRequestId;
  }

  function requestPayload(extra = {}) {
    const canal = getCanal();
    const payload = {
      request_id: extra.request_id || ensureRequestId(),
      canal,
      distrito: els.distrito.value,
      cantidad: Number(els.cantidad.value)
    };

    if (canal === 'WHATSAPP') {
      payload.project_ids = els.projectIds.map(input => input.value.trim());
      payload.utm_campaign = els.utmCampaign.value.trim();
    }

    return { ...payload, ...extra };
  }

  // MOCK únicamente para construir y validar UX local sin consumir data real.
  // Se reemplaza por los webhooks de consulta n8n antes de producción.
  async function mockAvailability(payload) {
    await new Promise(resolve => setTimeout(resolve, 420));

    const fixtures = {
      MULTIDISTRITO: { total: 121707, used: 1751 },
      LIMA_NORTE: { total: 33252, used: 0 },
      BARRANCO: { total: 4389, used: 0 },
      JESUS_MARIA: { total: 31266, used: 0 }
    };

    const fixture = fixtures[payload.distrito] || { total: 18540, used: 2680 };
    const available = Math.max(0, fixture.total - fixture.used);

    return {
      periodo: els.periodo.value,
      canal: payload.canal,
      distrito: payload.distrito,
      total_elegibles: fixture.total,
      usados: fixture.used,
      disponibles: available,
      rows_target: fixture.total
    };
  }

  async function mockLots() {
    await new Promise(resolve => setTimeout(resolve, 160));
    return [
      { batch_id: 'demo-batch-001', sequence: 1, generados: 2500, fecha: '31/08/2026', status: 'COMPLETED' },
      { batch_id: 'demo-batch-002', sequence: 2, generados: 1500, fecha: '31/08/2026', status: 'COMPLETED' },
      { batch_id: 'demo-batch-003', sequence: 3, generados: 1000, fecha: '31/08/2026', status: 'COMPLETED' }
    ];
  }

  async function parseJsonResponse(response, context) {
    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      throw new Error(`${context}: n8n devolvió una respuesta no JSON.`);
    }

    if (!response.ok) {
      const detail = data?.message || data?.detail || data?.error || `${response.status} ${response.statusText}`;
      throw new Error(`${context}: ${detail}`);
    }

    if (data?.ok === false) {
      throw new Error(data.message || data.detail || data.error || `${context}: operación rechazada.`);
    }

    return data;
  }

  async function callGateway(payload, accion) {
    if (!CONFIG.gatewayWebhook) {
      throw new Error('Falta configurar gatewayWebhook en assets/js/config.js.');
    }

    const response = await fetch(CONFIG.gatewayWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, accion })
    });

    return parseJsonResponse(response, `Acción ${accion}`);
  }

  async function queryAvailability(payload) {
    if (CONFIG.mode === 'mock') return mockAvailability(payload);
    return callGateway(payload, 'consultar');
  }

  async function queryLots(payload) {
    if (CONFIG.mode === 'mock') return mockLots(payload);

    const result = await callGateway(payload, 'lotes');
    const rawLots = Array.isArray(result)
      ? result
      : (result.lotes || result.items || result.batches || result.data || []);

    if (!Array.isArray(rawLots)) {
      throw new Error('La consulta de lotes no devolvió una lista válida.');
    }

    return rawLots.map((lot, index) => ({
      batch_id: lot.batch_id || lot.id || '',
      sequence: Number(lot.sequence ?? lot.lote ?? lot.numero_lote ?? (index + 1)),
      generados: Number(lot.generados ?? lot.cantidad_generada ?? lot.solicitados ?? lot.cantidad ?? 0),
      fecha: lot.fecha_corte || lot.created_at || lot.fecha || '',
      status: lot.status || lot.estado || 'COMPLETED'
    })).filter(lot => lot.batch_id);
  }

  async function generateCut(payload) {
    if (CONFIG.mode === 'mock') {
      await new Promise(resolve => setTimeout(resolve, 680));
      const missing = Math.max(0, payload.cantidad - Number(availability.disponibles || 0));
      return {
        status: 'COMPLETED',
        batch_id: `demo-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
        sequence: 4,
        generados: payload.cantidad,
        nuevos: payload.cantidad - missing,
        reutilizados: missing
      };
    }

    const result = await callGateway(payload, 'generar');
    return result.result || result;
  }

  function renderLots() {
    els.lotsList.innerHTML = lots.map(lot => `
      <label class="lot-card">
        <input type="checkbox" value="${lot.batch_id}" data-count="${lot.generados}" />
        <span class="lot-main">
          <strong>Lote ${String(lot.sequence).padStart(3, '0')}</strong>
          <span>${lot.fecha || ''} · ${lot.status || 'COMPLETED'}</span>
        </span>
        <span class="lot-count">
          <strong>${number(lot.generados)}</strong>
          <span>registros</span>
        </span>
      </label>
    `).join('');

    els.lotsList.querySelectorAll('input[type="checkbox"]').forEach(input => {
      input.addEventListener('change', updateGenerateState);
    });
  }

  function selectedLotInputs() {
    return [...els.lotsList.querySelectorAll('input[type="checkbox"]:checked')];
  }

  function selectedLotIds() {
    return selectedLotInputs().map(input => input.value);
  }

  function selectedLotCapacity() {
    return selectedLotInputs().reduce((sum, input) => {
      return sum + Number(input.dataset.count || 0);
    }, 0);
  }

  function updateGenerateState() {
    if (phase !== 'availability' || !availability) {
      els.generateButton.disabled = true;
      return;
    }

    const requested = Number(els.cantidad.value);
    const available = Number(availability.disponibles || 0);
    const missing = Math.max(0, requested - available);
    const selected = selectedLotIds();
    const selectedCapacity = selectedLotCapacity();

    if (missing === 0) {
      els.generateButton.disabled = false;
      els.expectedResult.textContent = `${number(requested)} nuevos · 0 reutilizados`;
      return;
    }

    const enoughSelected = selected.length > 0 && selectedCapacity >= missing;
    els.generateButton.disabled = !enoughSelected;

    if (selected.length === 0) {
      els.expectedResult.textContent = `Selecciona lote(s) para completar ${number(missing)}`;
    } else if (!enoughSelected) {
      els.expectedResult.textContent = `Seleccionados ${number(selectedCapacity)} · aún faltan ${number(missing - selectedCapacity)}`;
    } else {
      els.expectedResult.textContent = `${number(available)} nuevos + ${number(missing)} reutilizados`;
    }
  }

  async function renderAvailability(result) {
    availability = result;

    if (result.periodo) {
      els.periodo.value = String(result.periodo);
      updateSummary();
    }
    const requested = Number(els.cantidad.value);
    const available = Number(result.disponibles || 0);
    const missing = Math.max(0, requested - available);

    els.metricTotal.textContent = number(result.total_elegibles);
    els.metricUsed.textContent = number(result.usados);
    els.metricAvailable.textContent = number(available);
    els.metricRequested.textContent = number(requested);
    els.metricMissing.textContent = number(missing);

    els.availabilityPanel.classList.remove('is-hidden');
    els.successPanel.classList.add('is-hidden');

    if (missing === 0) {
      els.availabilityState.textContent = 'Data suficiente';
      els.availabilityState.classList.remove('is-warning');
      els.availabilityMessage.classList.remove('is-warning');
      els.availabilityMessage.innerHTML = `<strong>Todo listo.</strong> Hay ${number(available)} registros nuevos disponibles para cubrir la solicitud.`;
      els.reusePanel.classList.add('is-hidden');
      lots = [];
      renderLots();
      setStep(2);
    } else {
      els.availabilityState.textContent = 'Requiere reutilización';
      els.availabilityState.classList.add('is-warning');
      els.availabilityMessage.classList.add('is-warning');
      els.availabilityMessage.innerHTML = `Hay <strong>${number(available)}</strong> registros nuevos. Faltan <strong>${number(missing)}</strong> para completar la solicitud.`;
      lots = await queryLots(requestPayload());
      renderLots();
      els.reusePanel.classList.remove('is-hidden');
      setStep(3);
    }

    setPhase('availability');
    updateGenerateState();
    els.availabilityPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function onSubmit(event) {
    event.preventDefault();

    if (phase !== 'form') return;

    try {
      validateRequest();
      currentRequestId = null;
      const payload = requestPayload();
      setPhase('querying');
      const result = await queryAvailability(payload);
      await renderAvailability(result);
      // renderAvailability deja la interfaz bloqueada en fase de disponibilidad.
    } catch (error) {
      // Si la consulta falla, vuelve a fase 1 para permitir reintentar.
      setPhase('form');
      toast(error.message || 'No se pudo consultar la disponibilidad.');
    }
  }

  function animateSuccessPanel() {
    if (!els.successPanel?.animate) return;

    els.successPanel.animate([
      { opacity: 0, transform: 'translateY(18px) scale(.985)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' }
    ], {
      duration: 520,
      easing: 'cubic-bezier(.2,.8,.2,1)',
      fill: 'both'
    });

    const icon = els.successPanel.querySelector('.success-icon');
    if (icon?.animate) {
      icon.animate([
        { transform: 'scale(.55) rotate(-10deg)', opacity: .25 },
        { transform: 'scale(1.12) rotate(3deg)', opacity: 1, offset: .7 },
        { transform: 'scale(1) rotate(0deg)', opacity: 1 }
      ], {
        duration: 620,
        easing: 'cubic-bezier(.2,.8,.2,1)'
      });
    }
  }

  function clearRequestAfterSuccess() {
    // Conserva periodo, canal y distrito para facilitar solicitudes consecutivas,
    // pero limpia los valores propios del corte que acaba de completarse.
    els.cantidad.value = '';
    els.projectIds.forEach(input => {
      input.value = '';
    });
    els.utmCampaign.value = '';

    els.availabilityPanel.classList.add('is-hidden');
    els.reusePanel.classList.add('is-hidden');
    els.lotsList.innerHTML = '';
    els.expectedResult.textContent = '—';

    availability = null;
    lots = [];
    currentRequestId = null;

    // El formulario queda listo para una nueva consulta,
    // mientras el mensaje del último corte permanece visible.
    setPhase('form');
    updateConditionalFields();
    updateSummary();
  }

  async function onGenerate() {
    if (phase !== 'availability') return;

    try {
      validateRequest();
      setPhase('generating');
      els.generateButton.textContent = 'Generando...';

      const available = Number(availability?.disponibles || 0);
      const requested = Number(els.cantidad.value);
      const reuse = requested > available;
      const selected = selectedLotIds();

      if (reuse && selected.length === 0) throw new Error('Selecciona al menos un lote reutilizable.');

      const payload = requestPayload({
        reutilizar: reuse,
        lotes_reutilizables: reuse ? selected : []
      });

      const result = await generateCut(payload);
      const selectedDistrict = els.distrito.options[els.distrito.selectedIndex]?.textContent || result.distrito || '—';
      const successPeriod = result.periodo || els.periodo.value || '—';
      const successChannel = result.canal || getCanal();

      els.successMessage.textContent = `Lote ${String(result.sequence || '').padStart(3, '0')} generado y confirmado.`;
      els.successDetails.innerHTML = `
        <div><span>Periodo</span><strong>${successPeriod}</strong></div>
        <div><span>Canal</span><strong>${successChannel}</strong></div>
        <div><span>Distrito</span><strong>${selectedDistrict}</strong></div>
        <div><span>Batch ID</span><strong>${result.batch_id || '—'}</strong></div>
        <div><span>Generados</span><strong>${number(result.generados)}</strong></div>
        <div><span>Nuevos</span><strong>${number(result.nuevos)}</strong></div>
        <div><span>Reutilizados</span><strong>${number(result.reutilizados)}</strong></div>
      `;

      els.successPanel.classList.remove('is-hidden');
      setStep(4);
      clearRequestAfterSuccess();
      animateSuccessPanel();
      els.successPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      // Si falla la generación, se mantiene la consulta y se permite reintentar.
      setPhase('availability');
      toast(error.message || 'No se pudo generar el corte.');
    } finally {
      els.generateButton.textContent = 'Generar corte';
      updateGenerateState();
    }
  }

  function resetState() {
    window.setTimeout(() => {
      els.periodo.value = CONFIG.defaultPeriod || '202607';
      document.querySelector('input[name="canal"][value="WHATSAPP"]').checked = true;
      els.distrito.value = 'JESUS_MARIA';
      els.availabilityPanel.classList.add('is-hidden');
      els.successPanel.classList.add('is-hidden');
      availability = null;
      lots = [];
      currentRequestId = null;
      setPhase('form');
      updateConditionalFields();
      updateSummary();
      setStep(1);
    }, 0);
  }

  function bind() {
    els.themeToggle.addEventListener('click', () => {
      applyTheme(els.html.dataset.theme === 'dark' ? 'light' : 'dark');
    });

    document.querySelectorAll('input[name="canal"]').forEach(input => input.addEventListener('change', updateConditionalFields));
    [els.periodo, els.distrito, els.cantidad, ...els.projectIds, els.utmCampaign].forEach(input => {
      input.addEventListener('input', updateSummary);
      input.addEventListener('change', updateSummary);
    });

    els.form.addEventListener('submit', onSubmit);
    els.form.addEventListener('reset', resetState);
    els.generateButton.addEventListener('click', onGenerate);
  }

  function init() {
    buildDistrictOptions();
    els.periodo.value = CONFIG.defaultPeriod || '202607';
    els.environmentPill.textContent = CONFIG.mode === 'mock' ? 'Modo local · MOCK' : 'Local · n8n conectado';
    initTheme();
    bind();
    setPhase('form');
    updateConditionalFields();
    updateSummary();
  }

  init();
})();