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
    { id: 'email', title: 'EMAIL', sub: 'Correos únicos con evento registrado' },
    { id: 'whatsapp_100212', title: 'WSP Nexo INMOBILIARIA', sub: 'Celulares peruanos únicos con channel_error' },
    { id: 'whatsapp_100327', title: 'WSP NEXO MKT Y SERVICIOS', sub: 'Celulares peruanos únicos con channel_error' }
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
    '<div class="ln-period-controls" role="group" aria-label="Filtrar gráficos por meses">',
    '<button id="lnMonthFromBtn" class="ln-period-btn" type="button" aria-haspopup="dialog" aria-controls="lnMonthPicker" aria-expanded="false" disabled><span class="ln-period-btn-label">Desde</span><span class="ln-period-btn-icon" aria-hidden="true">▦</span></button>',
    '<button id="lnMonthToBtn" class="ln-period-btn" type="button" aria-haspopup="dialog" aria-controls="lnMonthPicker" aria-expanded="false" disabled><span class="ln-period-btn-label">Hasta</span><span class="ln-period-btn-icon" aria-hidden="true">▦</span></button>',
    '</div>',
    '<div class="ln-download-wrap">',
    '<button id="lnDownloadToggle" class="ln-download-toggle" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="lnDownloadMenu">',
    '<span class="ln-download-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m-5-5 5 5 5-5M5 19h14"/></svg></span>',
    '<span class="ln-download-label">Descarga</span>',
    '<span class="ln-download-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span>',
    '</button>',
    '<div id="lnDownloadMenu" class="ln-download-menu" hidden role="group" aria-label="Opciones de descarga CSV">',
    '<button type="button" class="ln-download-option" data-canal="email">Descargar .CSV de Email</button>',
    '<button type="button" class="ln-download-option" data-canal="whatsapp_100212">Descargar .CSV de WSP Nexo Inmobiliaria</button>',
    '<button type="button" class="ln-download-option" data-canal="whatsapp_100327">Descargar .CSV de WSP Nexo MKT y Servicios</button>',
    '</div></div>',
    '<button id="lnRefresh" class="ln-refresh" type="button">Actualizar métricas</button>',
    '</div></div>',
    '<div id="lnState" class="ln-state" role="status" aria-live="polite">Abre esta pestaña para consultar las métricas.</div>',
    '<div id="lnMetadata" class="ln-metadata" aria-label="Estado de los datos"></div>',
    '<div id="lnCharts" class="ln-charts"></div>',
    '<div id="lnCutsGateMount" class="ln-cuts-gate-mount"></div>',
    '</div>'
  ].join('');
  main.appendChild(section);

  const state = section.querySelector('#lnState');
  const metadata = section.querySelector('#lnMetadata');
  const charts = section.querySelector('#lnCharts');
  const refresh = section.querySelector('#lnRefresh');
  const monthFromBtn = section.querySelector('#lnMonthFromBtn');
  const monthToBtn = section.querySelector('#lnMonthToBtn');
  const downloadToggle = section.querySelector('#lnDownloadToggle');
  const downloadMenu = section.querySelector('#lnDownloadMenu');
  const downloadWrap = section.querySelector('.ln-download-wrap');
  let inFlight = false;
  let downloadInProgress = false;
  let lastPayload = null;
  let filterFrom = '202507';
  let filterTo = null;
  let lastMaximum = null;
  let firstAvailable = '202507';
  let pickerTarget = null;
  let pickerYear = 2025;

  const MONTHS_SHORT = ['Ene.', 'Feb.', 'Mar.', 'Abr.', 'May.', 'Jun.', 'Jul.', 'Ago.', 'Set.', 'Oct.', 'Nov.', 'Dic.'];
  const MONTHS_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  // Selector de meses visual: se monta fuera de los contenedores con overflow.
  const monthPicker = document.createElement('div');
  monthPicker.id = 'lnMonthPicker';
  monthPicker.className = 'ln-month-picker';
  monthPicker.hidden = true;
  monthPicker.setAttribute('role', 'dialog');
  monthPicker.setAttribute('aria-modal', 'false');
  monthPicker.setAttribute('aria-label', 'Seleccionar mes para filtrar');
  monthPicker.innerHTML = [
    '<div class="ln-month-picker-card">',
    '<div class="ln-month-picker-head">',
    '<button class="ln-picker-nav" data-move="-1" type="button" aria-label="Año anterior">←</button>',
    '<strong class="ln-picker-year" aria-live="polite"></strong>',
    '<button class="ln-picker-nav" data-move="1" type="button" aria-label="Año siguiente">→</button>',
    '</div>',
    '<div class="ln-month-grid" role="group" aria-label="Meses del año"></div>',
    '<div class="ln-month-picker-foot">',
    '<button class="ln-picker-clear" type="button">Limpiar</button>',
    '<button class="ln-picker-today" type="button" title="Mes actual, limitado a los datos disponibles">Hoy</button>',
    '</div></div>'
  ].join('');
  document.body.appendChild(monthPicker);
  const pickerYearLabel = monthPicker.querySelector('.ln-picker-year');
  const pickerGrid = monthPicker.querySelector('.ln-month-grid');
  const pickerNavs = [...monthPicker.querySelectorAll('.ln-picker-nav')];

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

  function fullPeriodLabel(period) {
    if (!validPeriod(period)) return 'Seleccionar mes';
    return MONTHS_FULL[Number(period.slice(4, 6)) - 1] + ' ' + period.slice(0, 4);
  }

  function buildPeriod(year, month) {
    return String(year) + String(month).padStart(2, '0');
  }

  function updatePickerButtons() {
    monthFromBtn.querySelector('.ln-period-btn-label').textContent = 'Desde · ' + fullPeriodLabel(filterFrom);
    monthToBtn.querySelector('.ln-period-btn-label').textContent = 'Hasta · ' + fullPeriodLabel(filterTo);
    const ready = Boolean(lastPayload);
    monthFromBtn.disabled = !ready;
    monthToBtn.disabled = !ready;
  }

  function positionPicker() {
    if (!pickerTarget || monthPicker.hidden) return;
    const btn = pickerTarget === 'from' ? monthFromBtn : monthToBtn;
    const a = btn.getBoundingClientRect();
    const b = monthPicker.getBoundingClientRect();
    const x = Math.max(8, Math.min(a.left, window.innerWidth - b.width - 8));
    const roomBelow = window.innerHeight - a.bottom;
    const y = roomBelow >= b.height + 8 || a.top < b.height + 8
      ? a.bottom + 8
      : a.top - b.height - 8;
    monthPicker.style.left = Math.round(x) + 'px';
    monthPicker.style.top = Math.round(Math.max(8, Math.min(y, window.innerHeight - b.height - 8))) + 'px';
  }

  function renderMonthPicker() {
    if (!pickerTarget) return;
    const minYear = Number(firstAvailable.slice(0, 4));
    const maxYear = Number(lastMaximum.slice(0, 4));
    pickerYear = Math.min(maxYear, Math.max(minYear, pickerYear));
    pickerYearLabel.textContent = String(pickerYear);
    pickerNavs.forEach(btn => {
      const direction = Number(btn.dataset.move);
      btn.disabled = pickerYear + direction < minYear || pickerYear + direction > maxYear;
    });
    pickerGrid.replaceChildren();
    const selected = pickerTarget === 'from' ? filterFrom : filterTo;
    for (let month = 1; month <= 12; month++) {
      const value = buildPeriod(pickerYear, month);
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.className = 'ln-month-chip';
      choice.textContent = MONTHS_SHORT[month - 1];
      choice.dataset.period = value;
      choice.disabled = value < firstAvailable || value > lastMaximum;
      choice.classList.toggle('is-selected', selected === value);
      choice.setAttribute('aria-pressed', String(selected === value));
      choice.setAttribute('aria-label', fullPeriodLabel(value));
      pickerGrid.appendChild(choice);
    }
  }

  function closeMonthPicker(restoreFocus) {
    if (!pickerTarget) return;
    const trigger = pickerTarget === 'from' ? monthFromBtn : monthToBtn;
    pickerTarget = null;
    monthPicker.hidden = true;
    monthFromBtn.setAttribute('aria-expanded', 'false');
    monthToBtn.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  }

  function openMonthPicker(target) {
    if (!lastPayload) return;
    if (pickerTarget === target) {
      closeMonthPicker(true);
      return;
    }
    const button = target === 'from' ? monthFromBtn : monthToBtn;
    pickerTarget = target;
    pickerYear = Number((target === 'from' ? filterFrom : filterTo).slice(0, 4));
    monthPicker.setAttribute('aria-label', target === 'from' ? 'Seleccionar mes inicial' : 'Seleccionar mes final');
    monthPicker.hidden = false;
    monthFromBtn.setAttribute('aria-expanded', String(target === 'from'));
    monthToBtn.setAttribute('aria-expanded', String(target === 'to'));
    renderMonthPicker();
    positionPicker();
    const focused = pickerGrid.querySelector('.is-selected:not(:disabled)')
      || pickerGrid.querySelector('button:not(:disabled)');
    if (focused) focused.focus();
    else button.focus();
  }

  function chooseMonth(value) {
    if (!pickerTarget || !validPeriod(value) || value < firstAvailable || value > lastMaximum) return;
    if (pickerTarget === 'from') {
      filterFrom = value;
      if (filterFrom > filterTo) filterTo = filterFrom;
    } else {
      filterTo = value;
      if (filterTo < filterFrom) filterFrom = filterTo;
    }
    closeMonthPicker(true);
    if (lastPayload) render(lastPayload);
  }


  // El menú de descargas es visual por ahora. Nunca solicita CSV ni expone datos.
  function closeDownloadMenu(restoreFocus = false) {
    const wasOpen = !downloadMenu.hidden;
    downloadMenu.hidden = true;
    downloadToggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus && wasOpen) downloadToggle.focus();
  }

  downloadToggle.addEventListener('click', () => {
    const open = downloadMenu.hidden;
    if (open) closeMonthPicker(false);
    downloadMenu.hidden = !open;
    downloadToggle.setAttribute('aria-expanded', String(open));
  });

  const exportButtons = [...downloadMenu.querySelectorAll('.ln-download-option')];

  async function exportFilteredCsv(canal) {
    if (downloadInProgress) return;
    if (!lastPayload || !lastMaximum) {
      setState('Las métricas aún no se han cargado.', 'error');
      return;
    }
    if (!channels.some(channel => channel.id === canal) ||
        !validPeriod(filterFrom) || !validPeriod(filterTo) ||
        filterFrom > filterTo || filterTo > lastMaximum) {
      setState('Selecciona un rango válido de meses.', 'error');
      return;
    }

    // Congelar el filtro para que el archivo conserve el rango elegido
    // aunque el usuario cambie los meses durante la descarga.
    const desde = filterFrom;
    const hasta = filterTo;
    downloadInProgress = true;
    downloadToggle.disabled = true;
    exportButtons.forEach(button => { button.disabled = true; });
    closeDownloadMenu(false);
    setState('Preparando el CSV de ' + desde + ' a ' + hasta + '...', 'neutral');

    try {
      const params = new URLSearchParams({ canal, desde, hasta });
      const response = await fetch(
        '/api/gateway/listas-negras/exportar?' + params.toString(),
        {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers: { Accept: 'text/csv' }
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
        }
        if (response.status === 403) {
          throw new Error('Tu usuario no tiene permiso para descargar estos datos.');
        }
        if (response.status === 409) {
          throw new Error('Hay meses sin importar dentro del rango solicitado.');
        }
        throw new Error('No se pudo generar el CSV (HTTP ' + response.status + ').');
      }

      const mime = (response.headers.get('content-type') || '').toLowerCase();
      if (!mime.includes('text/csv')) {
        throw new Error('El servidor no devolvió un archivo CSV válido.');
      }

      const blob = await response.blob();
      if (blob.size === 0) throw new Error('El CSV descargado está vacío.');
      const name = 'lista_negra_' + canal + '_' + desde + '_' + hasta + '.csv';
      const objectUrl = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = name;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
      }
      setState('CSV generado para ' + desde + ' a ' + hasta + '.', 'success');
    } catch (error) {
      setState(error.message || 'No se pudo completar la descarga.', 'error');
    } finally {
      downloadInProgress = false;
      downloadToggle.disabled = false;
      exportButtons.forEach(button => { button.disabled = false; });
    }
  }

  exportButtons.forEach(button => {
    button.addEventListener('click', () => {
      void exportFilteredCsv(button.dataset.canal);
    });
  });

  document.addEventListener('pointerdown', event => {
    if (!downloadMenu.hidden && !downloadWrap.contains(event.target)) {
      closeDownloadMenu(false);
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !downloadMenu.hidden) {
      event.preventDefault();
      closeDownloadMenu(true);
    }
  });

  monthFromBtn.addEventListener('click', () => {
    closeDownloadMenu(false);
    openMonthPicker('from');
  });
  monthToBtn.addEventListener('click', () => {
    closeDownloadMenu(false);
    openMonthPicker('to');
  });
  pickerGrid.addEventListener('click', event => {
    const button = event.target.closest('button[data-period]');
    if (button && !button.disabled) chooseMonth(button.dataset.period);
  });
  pickerNavs.forEach(button => {
    button.addEventListener('click', () => {
      if (button.disabled || !pickerTarget) return;
      pickerYear += Number(button.dataset.move);
      renderMonthPicker();
      button.focus();
    });
  });
  monthPicker.querySelector('.ln-picker-clear').addEventListener('click', () => {
    if (!pickerTarget) return;
    chooseMonth(pickerTarget === 'from' ? firstAvailable : lastMaximum);
  });
  monthPicker.querySelector('.ln-picker-today').addEventListener('click', () => {
    if (!pickerTarget) return;
    const now = new Date();
    const current = buildPeriod(now.getFullYear(), now.getMonth() + 1);
    chooseMonth(current < firstAvailable ? firstAvailable : current > lastMaximum ? lastMaximum : current);
  });
  document.addEventListener('pointerdown', event => {
    if (!pickerTarget) return;
    if (monthPicker.contains(event.target) ||
        monthFromBtn.contains(event.target) || monthToBtn.contains(event.target)) return;
    closeMonthPicker(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && pickerTarget) {
      event.preventDefault();
      closeMonthPicker(true);
    }
  });
  window.addEventListener('resize', () => { if (pickerTarget) positionPicker(); }, { passive: true });
  window.addEventListener('scroll', () => { if (pickerTarget) closeMonthPicker(false); }, { passive: true, capture: true });

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
    firstAvailable = minimum;
    lastMaximum = maximum;
    updatePickerButtons();
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
      updatePickerButtons();
      closeMonthPicker(false);
      setState(error.message || 'No se pudieron consultar las métricas.', 'error');
    } finally {
      inFlight = false;
      refresh.disabled = false;
    }
  }

  renderUnavailable();

  nav.addEventListener('click', () => {
    closeDownloadMenu(false);
    closeMonthPicker(false);
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
      closeDownloadMenu(false);
      closeMonthPicker(false);
      document.body.classList.remove('is-blacklists-view');
      nav.classList.remove('is-active');
    }
  }, true);

  refresh.addEventListener('click', () => {
    closeDownloadMenu(false);
    void load(true);
  });
})();
