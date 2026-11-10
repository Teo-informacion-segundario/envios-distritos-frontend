/* Dashboard mensual de Listas Negras. Nunca recibe correos, telefonos ni X-LN-Token. */
(() => {
  'use strict';

  const config = window.ENVIO_APP_CONFIG || {};
  const nav = document.querySelector('[data-view="blacklists"]');
  const main = document.querySelector('.main-content');
  const title = document.querySelector('.topbar h1');
  if (!nav || !main) return;

  const ENDPOINT = '/api/gateway/listas-negras/indicadores?desde=202507';
  const channels = [
    { id: 'email', title: 'Email · 100212', sub: 'Correos únicos con evento registrado' },
    { id: 'whatsapp_100212', title: 'WhatsApp · 100212', sub: 'Celulares peruanos únicos con channel_error' },
    { id: 'whatsapp_100327', title: 'WhatsApp · 100327', sub: 'Celulares peruanos únicos con channel_error' }
  ];
  const formatter = new Intl.NumberFormat('es-PE');

  const section = document.createElement('section');
  section.className = 'blacklists-view';
  section.id = 'blacklistsView';
  section.setAttribute('aria-label', 'Estadísticas de listas negras');
  section.innerHTML = [
    '<div class="ln-panel">',
    '<div class="ln-title-row"><div>',
    '<span class="ln-eyebrow">DATOS MENSUALES · INDIGITALL</span>',
    '<h2>Listas Negras</h2>',
    '<p class="ln-description">Contactos únicos por mes y canal.</p>',
    '</div><div class="ln-toolbar">',
    '<div class="ln-month-filters" role="group" aria-label="Filtrar gráficos por meses">',
    '<label class="ln-month-field" for="lnMonthFrom"><span>Desde</span><input id="lnMonthFrom" type="month" min="2025-07" disabled /></label>',
    '<label class="ln-month-field" for="lnMonthTo"><span>Hasta</span><input id="lnMonthTo" type="month" min="2025-07" disabled /></label>',
    '</div><button id="lnRefresh" class="ln-refresh" type="button">Actualizar métricas</button>',
    '</div></div>',
    '<div id="lnState" class="ln-state" role="status" aria-live="polite">Abre esta pestaña para consultar las métricas.</div>',
    '<div id="lnMetadata" class="ln-metadata" aria-label="Estado de los datos"></div>',
    '<div id="lnCharts" class="ln-charts"></div>',
    '</div>'
  ].join('');
  main.appendChild(section);

  const state = section.querySelector('#lnState');
  const metadata = section.querySelector('#lnMetadata');
  const charts = section.querySelector('#lnCharts');
  const refresh = section.querySelector('#lnRefresh');
  const monthFrom = section.querySelector('#lnMonthFrom');
  const monthTo = section.querySelector('#lnMonthTo');
  let inFlight = false;
  let lastPayload = null;
  let filterFrom = '202507';
  let filterTo = null;
  let lastMaximum = null;

  // El tooltip se sitúa sobre la barra y no se recorta en gráficos desplazables.
  const tooltip = document.createElement('div');
  tooltip.className = 'ln-tooltip';
  tooltip.hidden = true;
  tooltip.setAttribute('role', 'tooltip');
  tooltip.innerHTML = '<span class="ln-tooltip-month"></span><span class="ln-tooltip-row"><i aria-hidden="true"></i><strong class="ln-tooltip-total"></strong></span>';
  document.body.appendChild(tooltip);
  let activeColumn = null;

  function hideTooltip() {
    tooltip.hidden = true;
    activeColumn = null;
  }

  function showTooltip(point, bar, column, spec) {
    activeColumn = column;
    tooltip.dataset.channel = spec.id;
    tooltip.querySelector('.ln-tooltip-month').textContent = monthFullLabel(point.periodo);
    tooltip.querySelector('.ln-tooltip-total').textContent = point.unicos_mes === null
      ? 'Sin dato disponible'
      : formatter.format(point.unicos_mes) + ' contactos únicos';
    tooltip.hidden = false;
    const anchor = bar.getBoundingClientRect();
    const rect = tooltip.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - rect.width - 8,
      anchor.left + anchor.width / 2 - rect.width / 2));
    const above = anchor.top - rect.height - 10;
    const top = above >= 8 ? above : Math.min(window.innerHeight - rect.height - 8, anchor.bottom + 10);
    tooltip.style.left = left + 'px';
    tooltip.style.top = Math.max(8, top) + 'px';
  }

  window.addEventListener('resize', hideTooltip, { passive: true });
  window.addEventListener('scroll', hideTooltip, { passive: true, capture: true });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') hideTooltip();
  });
  document.addEventListener('pointerdown', event => {
    if (activeColumn && !activeColumn.contains(event.target)) hideTooltip();
  });

  function textElement(tag, className, value) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = String(value);
    return el;
  }

  function setState(message, kind) {
    state.textContent = message;
    state.dataset.kind = kind || 'neutral';
  }

  function monthLabel(period) {
    const year = Number(period.slice(0, 4));
    const month = Number(period.slice(4, 6));
    return new Date(Date.UTC(year, month - 1, 1))
      .toLocaleDateString('es-PE', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  }

  function monthFullLabel(period) {
    const year = Number(period.slice(0, 4));
    const month = Number(period.slice(4, 6));
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(
      'es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  function periodToInput(period) {
    return period.slice(0, 4) + '-' + period.slice(4, 6);
  }

  function inputToPeriod(value) {
    return /^\d{4}-\d{2}$/.test(value) ? value.replace('-', '') : null;
  }

  function validPeriod(value) {
    if (!/^\d{6}$/.test(String(value))) return false;
    const month = Number(String(value).slice(4, 6));
    return month >= 1 && month <= 12;
  }

  function validate(data) {
    if (!data || data.contrato !== 'ln_graficos_v1' ||
        data.aprobado !== false || data.autorizado_para_envios !== false ||
        data.zona_horaria !== 'America/Lima' ||
        !validPeriod(data.periodo_maximo) ||
        !/^[a-f0-9]{64}$/.test(String(data.version_prepublicacion)) ||
        !Array.isArray(data.series) || data.series.length !== 3) {
      throw new Error('El servidor devolvió un contrato de métricas inesperado.');
    }

    const ids = data.series.map(series => series.id);
    if (new Set(ids).size !== 3 || channels.some(ch => !ids.includes(ch.id))) {
      throw new Error('Se esperaban tres series independientes.');
    }

    for (const series of data.series) {
      if (!Array.isArray(series.puntos) || series.puntos.length > 180) {
        throw new Error('Cantidad de meses inesperada.');
      }
      const seen = new Set();
      for (const item of series.puntos) {
        const value = item.unicos_mes;
        if (!validPeriod(item.periodo) || item.periodo < '202507' ||
            item.periodo > data.periodo_maximo || seen.has(item.periodo) ||
            typeof item.estado !== 'string' ||
            !(value === null || (Number.isSafeInteger(value) && value >= 0))) {
          throw new Error('Datos mensuales inválidos o repetidos.');
        }
        seen.add(item.periodo);
      }
    }
    return data;
  }

  function updateMonthFilters(data) {
    const previousMaximum = lastMaximum;
    const firstMonth = data.series
      .flatMap(series => series.puntos.map(point => point.periodo))
      .sort()[0] || '202507';
    const minimum = firstMonth < '202507' ? '202507' : firstMonth;
    const maximum = data.periodo_maximo;

    if (filterTo === null || filterTo === previousMaximum) filterTo = maximum;
    if (filterFrom < minimum) filterFrom = minimum;
    if (filterFrom > maximum) filterFrom = maximum;
    if (filterTo > maximum) filterTo = maximum;
    if (filterTo < filterFrom) filterTo = filterFrom;
    lastMaximum = maximum;

    monthFrom.min = monthTo.min = periodToInput(minimum);
    monthFrom.max = monthTo.max = periodToInput(maximum);
    monthFrom.value = periodToInput(filterFrom);
    monthTo.value = periodToInput(filterTo);
    monthFrom.disabled = false;
    monthTo.disabled = false;
  }

  function renderMetadata(data) {
    metadata.replaceChildren();
    metadata.appendChild(textElement('span', '', 'Último período: ' + data.periodo_maximo));
  }

  function renderSeries(spec, source) {
    const points = source.puntos
      .filter(p => p.periodo >= filterFrom && p.periodo <= filterTo)
      .slice()
      .sort((a, b) => a.periodo.localeCompare(b.periodo));
    const card = document.createElement('article');
    card.className = 'ln-chart-card';
    card.dataset.channel = spec.id;
    card.setAttribute('aria-label', spec.title + ', contactos únicos por mes');

    const head = document.createElement('div');
    head.className = 'ln-chart-head';
    const copy = document.createElement('div');
    copy.appendChild(textElement('h3', '', spec.title));
    copy.appendChild(textElement('p', '', spec.sub));
    head.appendChild(copy);

    const latest = points[points.length - 1];
    const lastNumber = latest && latest.unicos_mes !== null ? formatter.format(latest.unicos_mes) : '—';
    const metric = document.createElement('div');
    metric.className = 'ln-chart-value';
    metric.appendChild(textElement('strong', '', lastNumber));
    metric.appendChild(textElement('small', '', latest ? 'Contactos únicos · ' + latest.periodo : 'Sin períodos'));
    head.appendChild(metric);
    card.appendChild(head);

    if (!points.length) {
      card.appendChild(textElement('p', 'ln-no-results', 'No hay datos para los meses seleccionados.'));
      return card;
    }

    const scroll = document.createElement('div');
    scroll.className = 'ln-plot-scroll';
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('tabindex', '0');
    scroll.setAttribute('aria-label', 'Desplazar gráfico de ' + spec.title);
    const plot = document.createElement('div');
    plot.className = 'ln-plot';
    const valid = points.filter(p => p.unicos_mes !== null).map(p => p.unicos_mes);
    const max = Math.max(1, ...valid);
    const step = Math.pow(10, Math.floor(Math.log10(max)));
    const ymax = Math.ceil(max / step) * step;
    const ticks = document.createElement('div');
    ticks.className = 'ln-plot-upper';
    ticks.appendChild(textElement('span', '', formatter.format(0)));
    ticks.appendChild(textElement('span', '', 'Escala hasta ' + formatter.format(ymax)));
    plot.appendChild(ticks);

    const track = document.createElement('div');
    track.className = 'ln-bar-track';
    const labels = document.createElement('div');
    labels.className = 'ln-labels';
    for (const point of points) {
      const col = document.createElement('div');
      col.className = 'ln-bar-unit';
      const bar = document.createElement('div');
      const missing = point.unicos_mes === null;
      bar.className = 'ln-bar' + (missing ? ' is-missing' : point.unicos_mes === 0 ? ' is-zero' : '');
      bar.style.height = missing ? '5px' : String(Math.max(0.2, point.unicos_mes / ymax * 100)) + '%';
      bar.setAttribute('aria-hidden', 'true');

      const displayed = missing ? 'Sin dato disponible' : formatter.format(point.unicos_mes) + ' contactos únicos';
      col.setAttribute('role', 'img');
      col.tabIndex = 0;
      col.setAttribute('aria-label', monthFullLabel(point.periodo) + ': ' + displayed);
      col.appendChild(bar);
      col.addEventListener('pointerenter', () => showTooltip(point, bar, col, spec));
      col.addEventListener('pointerleave', hideTooltip);
      col.addEventListener('focus', () => showTooltip(point, bar, col, spec));
      col.addEventListener('blur', hideTooltip);
      col.addEventListener('click', () => showTooltip(point, bar, col, spec));
      track.appendChild(col);
      labels.appendChild(textElement('span', 'ln-label', monthLabel(point.periodo)));
    }
    plot.appendChild(track);
    plot.appendChild(labels);
    scroll.appendChild(plot);
    card.appendChild(scroll);

    return card;
  }

  function renderUnavailable() {
    charts.replaceChildren();
    for (const spec of channels) {
      const card = document.createElement('article');
      card.className = 'ln-chart-card';
      card.dataset.channel = spec.id;
      const head = document.createElement('div');
      head.className = 'ln-chart-head';
      const copy = document.createElement('div');
      copy.appendChild(textElement('h3', '', spec.title));
      copy.appendChild(textElement('p', '', spec.sub));
      head.appendChild(copy);
      const metric = document.createElement('div');
      metric.className = 'ln-chart-value';
      metric.appendChild(textElement('strong', '', '—'));
      metric.appendChild(textElement('small', '', 'Sin datos consultados'));
      head.appendChild(metric);
      card.appendChild(head);
      const empty = textElement('div', 'ln-chart-empty',
        'Los valores mensuales aparecerán aquí al conectar el backend autenticado.');
      empty.setAttribute('role', 'status');
      card.appendChild(empty);
      charts.appendChild(card);
    }
  }

  function render(data) {
    hideTooltip();
    lastPayload = data;
    updateMonthFilters(data);
    renderMetadata(data);
    charts.replaceChildren();
    channels.forEach(spec => {
      charts.appendChild(renderSeries(spec, data.series.find(s => s.id === spec.id)));
    });
    setState('Métricas actualizadas.', 'success');
  }

  async function load(force) {
    if (inFlight || (lastPayload && !force)) return;
    if (window.location.protocol === 'file:') {
      renderUnavailable();
      setState('Las métricas requieren acceso al backend autenticado. La vista local no consulta datos reales.', 'error');
      return;
    }

    inFlight = true;
    refresh.disabled = true;
    setState('Consultando estadísticas agregadas...', 'neutral');
    try {
      const response = await fetch(ENDPOINT, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Tu sesión no autoriza la consulta de métricas.');
        }
        throw new Error('El gateway autenticado no está disponible (HTTP ' + response.status + ').');
      }
      const payload = validate(await response.json());
      render(payload);
    } catch (error) {
      renderUnavailable();
      metadata.replaceChildren();
      lastPayload = null;
      setState(error.message || 'No se pudieron consultar las métricas.', 'error');
    } finally {
      inFlight = false;
      refresh.disabled = false;
    }
  }

  function applyMonthFilter(changed) {
    if (!lastPayload) return;
    const from = inputToPeriod(monthFrom.value);
    const to = inputToPeriod(monthTo.value);
    if (!validPeriod(from) || !validPeriod(to)) {
      setState('Selecciona meses válidos para filtrar.', 'error');
      return;
    }
    filterFrom = from;
    filterTo = to;
    if (filterFrom > filterTo) {
      if (changed === 'from') filterTo = filterFrom;
      else filterFrom = filterTo;
    }
    render(lastPayload);
  }

  monthFrom.addEventListener('change', () => applyMonthFilter('from'));
  monthTo.addEventListener('change', () => applyMonthFilter('to'));

  renderUnavailable();

  nav.addEventListener('click', () => {
    document.body.classList.remove('is-history-view', 'is-credentials-view');
    document.body.classList.add('is-blacklists-view');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('is-active'));
    nav.classList.add('is-active');
    if (title) title.textContent = 'Listas Negras';
    void load(false);
  });

  // Compatible con los cambios de vista existentes, incluso Credenciales.
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-view]');
    if (target && target !== nav) {
      document.body.classList.remove('is-blacklists-view');
      nav.classList.remove('is-active');
    }
  }, true);

  refresh.addEventListener('click', () => { void load(true); });
})();
