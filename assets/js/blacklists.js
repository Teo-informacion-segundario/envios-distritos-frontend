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
    '</div><button id="lnRefresh" class="ln-refresh" type="button">Actualizar métricas</button></div>',
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
  let inFlight = false;
  let lastPayload = null;

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

  function renderMetadata(data) {
    metadata.replaceChildren();
    const values = [
      'Último período: ' + data.periodo_maximo,
      'Zona horaria: America/Lima',
      'No aprobado · Solo revisión',
      'Versión: ' + data.version_prepublicacion.slice(0, 12)
    ];
    for (const value of values) metadata.appendChild(textElement('span', '', value));
  }

  function renderSeries(spec, source) {
    const points = source.puntos.slice().sort((a, b) => a.periodo.localeCompare(b.periodo));
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
    for (const p of points) {
      const col = document.createElement('div');
      col.className = 'ln-bar-unit';
      const bar = document.createElement('div');
      const missing = p.unicos_mes === null;
      bar.className = 'ln-bar' + (missing ? ' is-missing' : p.unicos_mes === 0 ? ' is-zero' : '');
      bar.style.height = missing ? '5px' : String(Math.max(0.2, p.unicos_mes / ymax * 100)) + '%';
      const displayed = missing ? 'sin dato' : formatter.format(p.unicos_mes) + ' contactos únicos';
      bar.title = p.periodo + ': ' + displayed + ' · ' + p.estado;
      bar.setAttribute('aria-label', bar.title);
      col.appendChild(bar);
      track.appendChild(col);
      labels.appendChild(textElement('span', 'ln-label', monthLabel(p.periodo)));
    }
    plot.appendChild(track);
    plot.appendChild(labels);
    scroll.appendChild(plot);
    card.appendChild(scroll);

    const details = document.createElement('details');
    details.appendChild(textElement('summary', '', 'Ver tabla mensual accesible'));
    const table = document.createElement('table');
    const header = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Período', 'Contactos únicos', 'Estado'].forEach(x => headerRow.appendChild(textElement('th', '', x)));
    header.appendChild(headerRow);
    table.appendChild(header);
    const body = document.createElement('tbody');
    for (const p of points) {
      const tr = document.createElement('tr');
      const cells = [p.periodo, p.unicos_mes === null ? '—' : formatter.format(p.unicos_mes), p.estado];
      cells.forEach(x => tr.appendChild(textElement('td', '', x)));
      body.appendChild(tr);
    }
    table.appendChild(body);
    details.appendChild(table);
    card.appendChild(details);
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
    lastPayload = data;
    renderMetadata(data);
    charts.replaceChildren();
    channels.forEach(spec => {
      charts.appendChild(renderSeries(spec, data.series.find(s => s.id === spec.id)));
    });
    setState('Tres series cargadas correctamente. Valores ausentes mostrados como “—”.', 'success');
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
