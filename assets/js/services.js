(() => {
  'use strict';

  const CONFIG = window.ENVIO_APP_CONFIG || {};

  const PHYSICAL_SOURCES = {
    LIMA_NORTE: [
      'LOS_OLIVOS',
      'CARABAYLLO',
      'COMAS',
      'INDEPENDENCIA',
      'PUENTE_PIEDRA',
      'SAN_MARTIN_DE_PORRES'
    ],
    MULTIDISTRITO: [
      'JESUS_MARIA',
      'SAN_MIGUEL',
      'PUEBLO_LIBRE',
      'SURQUILLO',
      'LINCE',
      'MAGDALENA_DEL_MAR'
    ]
  };

  const els = {
    form: document.querySelector('#requestForm'),
    periodo: document.querySelector('#periodo'),
    standardFields: document.querySelector('#standardRequestFields'),
    serviceFields: document.querySelector('#serviceFields'),
    serviceCode: document.querySelector('#serviceCode'),
    serviceDistrict1: document.querySelector('#serviceDistrict1'),
    serviceDistrict2: document.querySelector('#serviceDistrict2'),
    serviceQuantity1: document.querySelector('#serviceQuantity1'),
    serviceQuantity2: document.querySelector('#serviceQuantity2'),
    serviceTotal: document.querySelector('#serviceTotal'),
    serviceExportEstimate: document.querySelector('#serviceExportEstimate'),
    availabilityButton: document.querySelector('#availabilityButton'),
    availabilityPanel: document.querySelector('#availabilityPanel'),
    availabilityState: document.querySelector('#availabilityState'),
    availabilityMessage: document.querySelector('#availabilityMessage'),
    reusePanel: document.querySelector('#reusePanel'),
    serviceReusePanel: document.querySelector('#serviceReusePanel'),
    serviceAllowReuse: document.querySelector('#serviceAllowReuse'),
    serviceReuseHelp: document.querySelector('#serviceReuseHelp'),
    generateButton: document.querySelector('#generateButton'),
    expectedResult: document.querySelector('#expectedResult'),
    successPanel: document.querySelector('#successPanel'),
    successMessage: document.querySelector('#successMessage'),
    successDetails: document.querySelector('#successDetails'),
    toast: document.querySelector('#toast'),
    summaryPeriodo: document.querySelector('#summaryPeriodo'),
    summaryCanal: document.querySelector('#summaryCanal'),
    summaryDistrito: document.querySelector('#summaryDistrito'),
    summaryCantidad: document.querySelector('#summaryCantidad'),
    summaryServiceCodeRow: document.querySelector('#summaryServiceCodeRow'),
    summaryServiceCode: document.querySelector('#summaryServiceCode'),
    metricTotal: document.querySelector('#metricTotal'),
    metricUsed: document.querySelector('#metricUsed'),
    metricAvailable: document.querySelector('#metricAvailable'),
    metricRequested: document.querySelector('#metricRequested'),
    metricTotalLabel: document.querySelector('#metricTotalLabel'),
    metricUsedLabel: document.querySelector('#metricUsedLabel'),
    metricAvailableLabel: document.querySelector('#metricAvailableLabel'),
    metricRequestedLabel: document.querySelector('#metricRequestedLabel')
  };

  if (!els.form || !els.serviceFields) return;

  let serviceAvailability = null;
  let serviceRequestId = null;
  let serviceBusy = false;

  function isServices() {
    return document.querySelector('input[name="canal"]:checked')?.value === 'SERVICIOS';
  }

  function getServiceType() {
    return document.querySelector('input[name="serviceType"]:checked')?.value || 'EMAIL';
  }

  function number(value) {
    return new Intl.NumberFormat('es-PE').format(Number(value || 0));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function notify(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => {
      els.toast.classList.remove('is-visible');
    }, 3600);
  }

  function setStep(step) {
    document.querySelectorAll('.step').forEach(node => {
      node.classList.toggle('is-active', Number(node.dataset.step) === Number(step));
    });
  }

  function serviceTypeLabel(value) {
    if (value === 'EMAIL_Y_WHATSAPP') return 'EMAIL Y WHATSAPP';
    return value;
  }

  function buildDistrictOptions() {
    const source = document.querySelector('#distrito');
    if (!source) return;

    const options = [...source.options].map(option => ({
      value: option.value,
      label: option.textContent
    }));

    els.serviceDistrict1.innerHTML = options
      .map(option => '<option value="' + escapeHtml(option.value) + '">' + escapeHtml(option.label) + '</option>')
      .join('');

    els.serviceDistrict2.innerHTML = '<option value="">Sin segundo distrito</option>' + options
      .map(option => '<option value="' + escapeHtml(option.value) + '">' + escapeHtml(option.label) + '</option>')
      .join('');
  }

  function districtLabel(select) {
    const option = select?.options?.[select.selectedIndex];
    return option ? option.textContent : '';
  }

  function physicalSources(district) {
    return PHYSICAL_SOURCES[district] || [district];
  }

  function districtRequests() {
    const requests = [];

    const quantity1 = Number(els.serviceQuantity1.value);
    if (els.serviceDistrict1.value) {
      requests.push({
        distrito: els.serviceDistrict1.value,
        cantidad: quantity1
      });
    }

    const district2 = els.serviceDistrict2.value;
    const quantity2 = Number(els.serviceQuantity2.value);
    if (district2) {
      requests.push({
        distrito: district2,
        cantidad: quantity2
      });
    }

    return requests;
  }

  function totalRequested() {
    return districtRequests().reduce((sum, item) => {
      return sum + (Number.isFinite(item.cantidad) ? item.cantidad : 0);
    }, 0);
  }

  function validateServiceRequest() {
    const code = els.serviceCode.value.trim();
    if (!code) {
      throw new Error('Ingresa el código de servicio.');
    }

    if (!/^[A-Za-z0-9_-]+$/.test(code)) {
      throw new Error('El código de servicio solo puede usar letras, números, guion y guion bajo.');
    }

    const requests = districtRequests();

    if (requests.length < 1 || requests.length > 2) {
      throw new Error('Selecciona uno o dos distritos.');
    }

    for (const item of requests) {
      if (!Number.isInteger(item.cantidad) || item.cantidad <= 0) {
        throw new Error('Cada cantidad debe ser un entero mayor a 0.');
      }
    }

    if (requests.length === 2) {
      const first = requests[0].distrito;
      const second = requests[1].distrito;

      if (first === second) {
        throw new Error('Los dos distritos no pueden ser iguales.');
      }

      const firstSources = new Set(physicalSources(first));
      const overlap = physicalSources(second).filter(source => firstSources.has(source));

      if (overlap.length > 0) {
        throw new Error('Los distritos seleccionados comparten fuentes físicas: ' + overlap.join(', ') + '.');
      }
    }

    return {
      codigoServicio: code,
      tipo: getServiceType(),
      distritos: requests
    };
  }

  function ensureServiceRequestId() {
    if (!serviceRequestId) {
      const suffix = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
      serviceRequestId = 'SERV-' + suffix;
    }
    return serviceRequestId;
  }

  function updateSecondDistrictState() {
    const enabled = Boolean(els.serviceDistrict2.value);
    els.serviceQuantity2.disabled = !enabled || serviceBusy;
    if (!enabled) els.serviceQuantity2.value = '';
  }

  function updateServiceSummary() {
    if (!isServices()) return;

    const districtNames = [districtLabel(els.serviceDistrict1)];
    if (els.serviceDistrict2.value) districtNames.push(districtLabel(els.serviceDistrict2));

    const total = totalRequested();
    const type = getServiceType();

    els.summaryPeriodo.textContent = serviceAvailability?.periodo || 'Automático';
    els.summaryCanal.textContent = 'SERVICIOS · ' + serviceTypeLabel(type);
    els.summaryDistrito.textContent = districtNames.filter(Boolean).join(' + ') || '—';
    els.summaryCantidad.textContent = total > 0 ? number(total) : '—';
    els.summaryServiceCode.textContent = els.serviceCode.value.trim() || '—';

    els.serviceTotal.textContent = number(total);

    if (!serviceAvailability) {
      els.serviceExportEstimate.textContent = type === 'EMAIL_Y_WHATSAPP'
        ? number(total * 2) + ' filas estimadas: mismo grupo para EMAIL y WHATSAPP.'
        : number(total) + ' filas estimadas para ' + serviceTypeLabel(type) + '.';
    }
  }

  function restoreMetricLabels() {
    if (els.metricTotalLabel) els.metricTotalLabel.textContent = 'Total elegibles';
    if (els.metricUsedLabel) els.metricUsedLabel.textContent = 'Usados';
    if (els.metricAvailableLabel) els.metricAvailableLabel.textContent = 'Disponibles';
    if (els.metricRequestedLabel) els.metricRequestedLabel.textContent = 'Solicitados';
  }

  function setServiceMetricLabels() {
    if (els.metricTotalLabel) els.metricTotalLabel.textContent = 'Total elegibles';
    if (els.metricUsedLabel) els.metricUsedLabel.textContent = 'Nuevos disponibles';
    if (els.metricAvailableLabel) els.metricAvailableLabel.textContent = 'Reutilizables';
    if (els.metricRequestedLabel) els.metricRequestedLabel.textContent = 'Solicitados';
  }

  function setServiceControlsLocked(locked) {
    serviceBusy = locked;

    [
      els.serviceCode,
      els.serviceDistrict1,
      els.serviceDistrict2,
      els.serviceQuantity1,
      ...document.querySelectorAll('input[name="serviceType"]'),
      ...document.querySelectorAll('input[name="canal"]')
    ].forEach(control => {
      if (control) control.disabled = locked;
    });

    els.periodo.disabled = true;
    updateSecondDistrictState();
    els.availabilityButton.disabled = locked;
  }

  function clearServiceAvailability() {
    serviceAvailability = null;
    serviceRequestId = null;
    els.serviceAllowReuse.checked = false;
    els.serviceReusePanel.classList.add('is-hidden');
    els.reusePanel.classList.add('is-hidden');
    els.availabilityPanel.classList.add('is-hidden');
    els.expectedResult.textContent = '—';
    els.generateButton.disabled = true;
  }

  function syncMode() {
    const active = isServices();

    els.standardFields.classList.toggle('is-hidden', active);
    els.serviceFields.classList.toggle('is-hidden', !active);
    els.summaryServiceCodeRow.classList.toggle('is-hidden', !active);

    if (active) {
      els.periodo.disabled = true;
      clearServiceAvailability();
      updateSecondDistrictState();
      updateServiceSummary();
      setStep(1);
    } else {
      els.periodo.disabled = false;
      els.serviceReusePanel.classList.add('is-hidden');
      restoreMetricLabels();
    }
  }

  async function parseResponse(response, context) {
    const text = await response.text();
    let data = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      throw new Error(context + ': el servidor devolvió una respuesta no JSON.');
    }

    if (!response.ok || data?.ok === false) {
      let detail = data?.message || data?.error || data?.detail || (response.status + ' ' + response.statusText);

      if (detail && typeof detail === 'object') {
        detail = detail.message || detail.status || JSON.stringify(detail);
      }

      throw new Error(context + ': ' + detail);
    }

    return data;
  }

  async function callServices(payload) {
    if (!CONFIG.servicesGateway) {
      throw new Error('SERVICIOS está disponible desde el dominio productivo.');
    }

    const response = await fetch(CONFIG.servicesGateway, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    return parseResponse(response, 'SERVICIOS');
  }

  function districtResultRows(result) {
    return (result.distritos || []).map(item => {
      return '<div class="service-result-row">' +
        '<strong>' + escapeHtml(item.distrito_nombre || item.distrito) + '</strong>' +
        '<span class="service-result-stat"><span>Solicitado</span><b>' + number(item.solicitado) + '</b></span>' +
        '<span class="service-result-stat"><span>Nuevos</span><b>' + number(item.nuevo_disponible) + '</b></span>' +
        '<span class="service-result-stat"><span>Reutilizables</span><b>' + number(item.reutilizable) + '</b></span>' +
      '</div>';
    }).join('');
  }

  function updateServiceGenerateState() {
    if (!isServices() || !serviceAvailability) {
      els.generateButton.disabled = true;
      return;
    }

    const canComplete = Boolean(serviceAvailability.puede_completar);
    const requiresReuse = Boolean(serviceAvailability.requiere_reutilizacion);
    const reuseAccepted = !requiresReuse || els.serviceAllowReuse.checked;

    els.generateButton.disabled = serviceBusy || !canComplete || !reuseAccepted;

    if (!canComplete) {
      els.expectedResult.textContent = 'No hay data suficiente para completar la solicitud.';
      return;
    }

    if (requiresReuse && !els.serviceAllowReuse.checked) {
      els.expectedResult.textContent = 'Confirma la reutilización para poder generar.';
      return;
    }

    const total = Number(serviceAvailability.total_por_tipo || totalRequested());
    const exported = Number(serviceAvailability.total_filas_exportadas_estimadas || total);

    els.expectedResult.textContent = getServiceType() === 'EMAIL_Y_WHATSAPP'
      ? number(total) + ' personas · ' + number(exported) + ' filas exportadas'
      : number(total) + ' registros listos para generar';
  }

  function renderServiceAvailability(result) {
    serviceAvailability = result;
    setServiceMetricLabels();

    const districts = Array.isArray(result.distritos) ? result.distritos : [];
    const totalEligible = districts.reduce((sum, item) => sum + Number(item.total_elegibles || 0), 0);
    const newAvailable = districts.reduce((sum, item) => sum + Number(item.nuevo_disponible || 0), 0);
    const reusable = districts.reduce((sum, item) => sum + Number(item.reutilizable || 0), 0);
    const requested = Number(result.total_por_tipo || totalRequested());

    els.metricTotal.textContent = number(totalEligible);
    els.metricUsed.textContent = number(newAvailable);
    els.metricAvailable.textContent = number(reusable);
    els.metricRequested.textContent = number(requested);

    els.availabilityPanel.classList.remove('is-hidden');
    els.successPanel.classList.add('is-hidden');
    els.reusePanel.classList.add('is-hidden');

    const canComplete = Boolean(result.puede_completar);
    const requiresReuse = Boolean(result.requiere_reutilizacion);

    if (!canComplete) {
      els.availabilityState.textContent = 'Data insuficiente';
      els.availabilityState.classList.add('is-warning');
      els.availabilityMessage.classList.add('is-warning');
      els.availabilityMessage.innerHTML =
        '<strong>No se puede completar la solicitud.</strong>' +
        '<div class="service-result-list">' + districtResultRows(result) + '</div>';
      els.serviceReusePanel.classList.add('is-hidden');
      setStep(2);
    } else if (requiresReuse) {
      els.availabilityState.textContent = 'Requiere reutilización';
      els.availabilityState.classList.add('is-warning');
      els.availabilityMessage.classList.add('is-warning');
      els.availabilityMessage.innerHTML =
        '<strong>Hay data suficiente combinando registros nuevos y reutilizables.</strong>' +
        '<div class="service-result-list">' + districtResultRows(result) + '</div>';
      els.serviceReuseHelp.textContent = 'La solicitud requiere reutilización. Al continuar, se usarán primero todos los registros nuevos disponibles y solo luego los reutilizables necesarios.';
      els.serviceReusePanel.classList.remove('is-hidden');
      setStep(3);
    } else {
      els.availabilityState.textContent = 'Data suficiente';
      els.availabilityState.classList.remove('is-warning');
      els.availabilityMessage.classList.remove('is-warning');
      els.availabilityMessage.innerHTML =
        '<strong>Todo listo.</strong> La solicitud puede completarse únicamente con data nueva.' +
        '<div class="service-result-list">' + districtResultRows(result) + '</div>';
      els.serviceReusePanel.classList.add('is-hidden');
      setStep(2);
    }

    els.serviceExportEstimate.textContent =
      number(result.total_filas_exportadas_estimadas || requested) +
      ' filas estimadas para ' +
      (Array.isArray(result.tipos_generados) ? result.tipos_generados.join(' + ') : serviceTypeLabel(result.tipo || getServiceType())) +
      '.';

    updateServiceSummary();
    updateServiceGenerateState();
    els.availabilityPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function queryServiceAvailability() {
    const request = validateServiceRequest();

    serviceRequestId = null;
    setServiceControlsLocked(true);

    const label = els.availabilityButton.querySelector('span:first-child');
    if (label) label.textContent = 'Consultando...';

    try {
      const result = await callServices({
        accion: 'consultar',
        codigoServicio: request.codigoServicio,
        tipo: request.tipo,
        distritos: request.distritos
      });

      renderServiceAvailability(result);
    } catch (error) {
      setServiceControlsLocked(false);
      notify(error.message || 'No se pudo consultar SERVICIOS.');
    } finally {
      if (label) label.textContent = 'Consultar disponibilidad';
      if (serviceAvailability) {
        els.availabilityButton.disabled = true;
      }
    }
  }

  function renderServiceSuccess(result) {
    const districts = Array.isArray(result.distritos) ? result.distritos : [];
    const generated = districts.reduce((sum, item) => sum + Number(item.generado || 0), 0);
    const fresh = districts.reduce((sum, item) => sum + Number(item.nuevos || 0), 0);
    const reused = districts.reduce((sum, item) => sum + Number(item.reutilizados || 0), 0);
    const type = result.tipo || getServiceType();
    const exported = Number(result.total_filas_exportadas || (type === 'EMAIL_Y_WHATSAPP' ? generated * 2 : generated));

    els.successMessage.textContent =
      'Servicio ' + (result.codigo_servicio || els.serviceCode.value.trim()) + ' generado y confirmado.';

    els.successDetails.innerHTML =
      '<div><span>Periodo</span><strong>' + escapeHtml(result.periodo || '—') + '</strong></div>' +
      '<div><span>Código</span><strong>' + escapeHtml(result.codigo_servicio || '—') + '</strong></div>' +
      '<div><span>Tipo</span><strong>' + escapeHtml(serviceTypeLabel(type)) + '</strong></div>' +
      '<div><span>Batch ID</span><strong>' + escapeHtml(result.batch_id || '—') + '</strong></div>' +
      '<div><span>Generados</span><strong>' + number(generated) + '</strong></div>' +
      '<div><span>Nuevos</span><strong>' + number(fresh) + '</strong></div>' +
      '<div><span>Reutilizados</span><strong>' + number(reused) + '</strong></div>' +
      '<div><span>Filas exportadas</span><strong>' + number(exported) + '</strong></div>';

    els.successPanel.classList.remove('is-hidden');
    els.availabilityPanel.classList.add('is-hidden');
    els.serviceReusePanel.classList.add('is-hidden');
    setStep(4);

    serviceAvailability = null;
    serviceRequestId = null;
    els.serviceCode.value = '';
    els.serviceQuantity1.value = '';
    els.serviceDistrict2.value = '';
    els.serviceQuantity2.value = '';
    els.serviceAllowReuse.checked = false;

    setServiceControlsLocked(false);
    updateSecondDistrictState();
    updateServiceSummary();

    els.successPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function generateService() {
    if (!serviceAvailability) return;

    try {
      const request = validateServiceRequest();

      if (!serviceAvailability.puede_completar) {
        throw new Error('La solicitud no puede completarse con la data disponible.');
      }

      const requiresReuse = Boolean(serviceAvailability.requiere_reutilizacion);
      if (requiresReuse && !els.serviceAllowReuse.checked) {
        throw new Error('Confirma la reutilización antes de generar.');
      }

      serviceBusy = true;
      els.generateButton.disabled = true;
      els.generateButton.textContent = 'Generando...';

      const result = await callServices({
        accion: 'generar',
        codigoServicio: request.codigoServicio,
        tipo: request.tipo,
        requestId: ensureServiceRequestId(),
        reutilizar: requiresReuse && els.serviceAllowReuse.checked,
        distritos: request.distritos
      });

      if (String(result.estado || '').toUpperCase() !== 'COMPLETED') {
        throw new Error('El servicio no terminó en estado COMPLETED.');
      }

      renderServiceSuccess(result);
    } catch (error) {
      serviceBusy = false;
      notify(error.message || 'No se pudo generar SERVICIOS.');
      updateServiceGenerateState();
    } finally {
      els.generateButton.textContent = 'Generar corte';
    }
  }

  function resetServiceUi() {
    serviceAvailability = null;
    serviceRequestId = null;
    serviceBusy = false;

    els.serviceCode.value = '';
    els.serviceQuantity1.value = '';
    els.serviceDistrict2.value = '';
    els.serviceQuantity2.value = '';
    els.serviceAllowReuse.checked = false;
    els.serviceExportEstimate.textContent = 'La estimación final se mostrará al consultar disponibilidad.';
    els.serviceReusePanel.classList.add('is-hidden');

    restoreMetricLabels();
    syncMode();
  }

  function bind() {
    document.querySelectorAll('input[name="canal"]').forEach(input => {
      input.addEventListener('change', syncMode);
    });

    [
      els.serviceCode,
      els.serviceDistrict1,
      els.serviceDistrict2,
      els.serviceQuantity1,
      els.serviceQuantity2,
      ...document.querySelectorAll('input[name="serviceType"]')
    ].forEach(input => {
      input?.addEventListener('input', updateServiceSummary);
      input?.addEventListener('change', () => {
        updateSecondDistrictState();
        updateServiceSummary();
      });
    });

    els.serviceAllowReuse.addEventListener('change', updateServiceGenerateState);

    els.form.addEventListener('submit', event => {
      if (!isServices()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void queryServiceAvailability();
    }, true);

    els.generateButton.addEventListener('click', event => {
      if (!isServices()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void generateService();
    }, true);

    els.form.addEventListener('reset', () => {
      window.setTimeout(resetServiceUi, 0);
    });
  }

  buildDistrictOptions();
  bind();
  syncMode();
})();
