(() => {
  'use strict';

  const CONFIG = window.ENVIO_APP_CONFIG || {};
  const main = document.querySelector('.main-content');
  const topbarTitle = document.querySelector('.topbar h1');
  const generatorNav = document.querySelector('[data-view="generator"]');
  const historyNav = document.querySelector('[data-view="history"]');

  if (!main || !generatorNav || !historyNav) return;

  const PAGE_SIZE = 10;
  const originalTitle = topbarTitle?.textContent || 'Generación de cortes';

  let loading = false;
  let rows = [];
  let page = 1;
  let total = 0;
  let pages = 1;
  let activeDate = '';
  let activeType = 'TODOS';
  let calendarCursor = new Date();
  let lastRequestKey = '';
  let searchTimer = null;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function number(value) {
    return new Intl.NumberFormat('es-PE').format(Number(value || 0));
  }

  function channelClass(value) {
    const channel = String(value || '').toUpperCase();
    if (channel === 'EMAIL') return 'history-channel--email';
    if (channel === 'WHATSAPP') return 'history-channel--whatsapp';
    if (channel === 'SERVICIOS') return 'history-channel--services';
    return 'history-channel--other';
  }

  function serviceTypeLabel(value) {
    const type = String(value || '').toUpperCase();

    if (type === 'EMAIL_Y_WHATSAPP') {
      return 'EMAIL + WHATSAPP';
    }

    if (type === 'EMAIL') return 'EMAIL';
    if (type === 'WHATSAPP') return 'WHATSAPP';

    return type || '—';
  }

  function historyTypeLabel(row) {
    if (row.origen === 'SERVICIOS' || row.tipo === 'SERVICIOS') {
      return 'SERVICIOS · ' + serviceTypeLabel(row.tipoServicio);
    }

    return row.tipo || '—';
  }

  function parseDate(value) {
    if (!value) return null;
    const raw = String(value).trim();
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;

    const ddmmyyyy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (ddmmyyyy) {
      const [, d, m, y] = ddmmyyyy;
      const date = new Date(Number(y), Number(m) - 1, Number(d));
      if (!Number.isNaN(date.getTime())) return date;
    }

    return null;
  }

  function formatDate(value) {
    const date = parseDate(value);
    if (!date) return value ? String(value) : '—';

    return new Intl.DateTimeFormat('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function searchDateToIso(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const [, y, m, d] = match;
      const date = new Date(Number(y), Number(m) - 1, Number(d));
      if (
        date.getFullYear() === Number(y) &&
        date.getMonth() === Number(m) - 1 &&
        date.getDate() === Number(d)
      ) return `${y}-${m}-${d}`;
    }

    match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (match) {
      const [, dRaw, mRaw, y] = match;
      const d = dRaw.padStart(2, '0');
      const m = mRaw.padStart(2, '0');
      const date = new Date(Number(y), Number(m) - 1, Number(d));
      if (
        date.getFullYear() === Number(y) &&
        date.getMonth() === Number(m) - 1 &&
        date.getDate() === Number(d)
      ) return `${y}-${m}-${d}`;
    }

    return null;
  }

  function isoToDisplay(value) {
    if (!value) return '';
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return value;
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  function typeMatches(row, type = activeType) {
    if (type === 'TODOS') return true;
    if (type === 'SERVICIOS') return row.origen === 'SERVICIOS' || row.tipo === 'SERVICIOS';
    return row.origen !== 'SERVICIOS' && row.tipo === type;
  }

  function dateToIso(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function isSameDay(a, b) {
    return a &&
      b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  function renderCalendar() {
    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    const monthDate = new Date(year, month, 1);

    calendarTitle.textContent = new Intl.DateTimeFormat('es-PE', {
      month: 'long',
      year: 'numeric'
    }).format(monthDate);

    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - startOffset);
    const selected = activeDate ? new Date(activeDate + 'T12:00:00') : null;
    const today = new Date();

    const cells = [];

    for (let i = 0; i < 42; i += 1) {
      const current = new Date(gridStart);
      current.setDate(gridStart.getDate() + i);

      const outside = current.getMonth() !== month;
      const selectedDay = selected && isSameDay(current, selected);
      const todayDay = isSameDay(current, today);

      cells.push(`
        <button
          type="button"
          class="history-calendar__day${outside ? ' is-outside' : ''}${selectedDay ? ' is-selected' : ''}${todayDay ? ' is-today' : ''}"
          data-date="${dateToIso(current)}"
          aria-label="${escapeHtml(new Intl.DateTimeFormat('es-PE', { dateStyle: 'full' }).format(current))}"
          ${selectedDay ? 'aria-current="date"' : ''}
        >${current.getDate()}</button>
      `);
    }

    calendarDays.innerHTML = cells.join('');
  }

  function openCalendar() {
    if (activeDate) {
      const selected = new Date(activeDate + 'T12:00:00');
      if (!Number.isNaN(selected.getTime())) {
        calendarCursor = new Date(selected.getFullYear(), selected.getMonth(), 1);
      }
    }

    renderCalendar();
    calendar.hidden = false;
    dateButton.setAttribute('aria-expanded', 'true');
    window.requestAnimationFrame(() => calendar.classList.add('is-open'));
  }

  function closeCalendar() {
    calendar.classList.remove('is-open');
    dateButton.setAttribute('aria-expanded', 'false');
    window.setTimeout(() => {
      if (!calendar.classList.contains('is-open')) calendar.hidden = true;
    }, 180);
  }

  function toggleCalendar() {
    if (calendar.hidden) {
      openCalendar();
    } else {
      closeCalendar();
    }
  }

  function createView() {
    const section = document.createElement('section');
    section.className = 'history-view';
    section.id = 'historyView';
    section.setAttribute('aria-live', 'polite');
    section.innerHTML = `
      <div class="history-grid-bg" aria-hidden="true"></div>
      <div class="history-content">
        <div class="history-head">
          <div class="history-title-wrap">
            <span class="section-number">HISTORIAL</span>
            <h2>Cortes realizados</h2>
            <p>Consulta los cortes confirmados de envíos y servicios registrados por el sistema.</p>
          </div>
          <div class="history-count" aria-label="Cantidad de cortes">
            <span class="history-count__glow" aria-hidden="true"></span>
            <strong id="historyCount">0</strong>
            <span class="history-count__label">cortes</span>
          </div>
        </div>

        <div class="history-search-row">
          <div>
            <div class="history-search" id="historySearchBox">
              <span class="history-search__glow" aria-hidden="true"></span>
              <span class="history-search__border" aria-hidden="true"></span>
              <span class="history-search__inner-border" aria-hidden="true"></span>
              <svg class="history-search__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"></circle>
                <path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
              </svg>
              <input
                class="history-search__input"
                id="historySearch"
                type="text"
                autocomplete="off"
                placeholder="Buscar por fecha: 10/09/2026"
                aria-label="Buscar cortes por fecha"
              />
              <button class="history-filter-button" id="historyDateButton" type="button" aria-label="Abrir calendario" aria-expanded="false">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M7 3v3M17 3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
                </svg>
              </button>

              <div class="history-calendar" id="historyCalendar" hidden>
                <div class="history-calendar__head">
                  <button class="history-calendar__nav" id="historyCalendarPrev" type="button" aria-label="Mes anterior">←</button>
                  <strong id="historyCalendarTitle"></strong>
                  <button class="history-calendar__nav" id="historyCalendarNext" type="button" aria-label="Mes siguiente">→</button>
                </div>
                <div class="history-calendar__weekdays" aria-hidden="true">
                  <span>LU</span><span>MA</span><span>MI</span><span>JU</span><span>VI</span><span>SÁ</span><span>DO</span>
                </div>
                <div class="history-calendar__days" id="historyCalendarDays"></div>
                <div class="history-calendar__footer">
                  <button type="button" id="historyCalendarClear">Limpiar</button>
                  <button type="button" id="historyCalendarToday">Hoy</button>
                </div>
              </div>
            </div>
            <div class="history-search-help" id="historySearchHelp">Escribe una fecha completa o usa el calendario.</div>
          </div>

          <button class="history-refresh" id="historyRefresh" type="button">Actualizar historial</button>
        </div>

        <div class="history-type-filter" id="historyTypeFilter" role="group" aria-label="Filtrar por tipo de corte">
          <button type="button" class="history-type-filter__button is-active" data-history-type="TODOS">Todos</button>
          <button type="button" class="history-type-filter__button" data-history-type="EMAIL">EMAIL</button>
          <button type="button" class="history-type-filter__button" data-history-type="WHATSAPP">WHATSAPP</button>
          <button type="button" class="history-type-filter__button" data-history-type="SERVICIOS">SERVICIOS</button>
        </div>

        <div class="history-table-shell" id="historyTableShell">
          <div class="history-loading">Consultando cortes...</div>
        </div>

        <div class="history-pagination" id="historyPagination" hidden>
          <div class="history-pagination__meta" id="historyPaginationMeta"></div>
          <div class="history-pagination__controls">
            <button class="history-page-button" id="historyPrev" type="button">← Anterior</button>
            <span class="history-page-indicator" id="historyPageIndicator">Página 1 de 1</span>
            <button class="history-page-button" id="historyNext" type="button">Siguiente →</button>
          </div>
        </div>
      </div>
    `;

    main.appendChild(section);
    return section;
  }

  const view = createView();
  const searchInput = view.querySelector('#historySearch');
  const searchBox = view.querySelector('#historySearchBox');
  const searchHelp = view.querySelector('#historySearchHelp');
  const dateButton = view.querySelector('#historyDateButton');
  const calendar = view.querySelector('#historyCalendar');
  const calendarTitle = view.querySelector('#historyCalendarTitle');
  const calendarDays = view.querySelector('#historyCalendarDays');
  const calendarPrev = view.querySelector('#historyCalendarPrev');
  const calendarNext = view.querySelector('#historyCalendarNext');
  const calendarClear = view.querySelector('#historyCalendarClear');
  const calendarToday = view.querySelector('#historyCalendarToday');
  const typeFilter = view.querySelector('#historyTypeFilter');
  const refreshButton = view.querySelector('#historyRefresh');
  const tableShell = view.querySelector('#historyTableShell');
  const countEl = view.querySelector('#historyCount');
  const pagination = view.querySelector('#historyPagination');
  const paginationMeta = view.querySelector('#historyPaginationMeta');
  const pageIndicator = view.querySelector('#historyPageIndicator');
  const prevButton = view.querySelector('#historyPrev');
  const nextButton = view.querySelector('#historyNext');

  function normalizeRows(payload) {
    const source = Array.isArray(payload)
      ? payload
      : (payload?.items || payload?.historial || payload?.lotes || payload?.batches || payload?.data || payload?.result || []);

    if (!Array.isArray(source)) return [];

    return source
      .map((row, index) => ({
        id: row.batch_id || row.id || `${index}`,
        fecha: row.fecha_corte || row.confirmed_at || row.completed_at || row.created_at || row.fecha || '',
        cantidad: Number(row.generados ?? row.cantidad ?? row.solicitados ?? row.total ?? 0),
        tipo: String(row.canal || row.tipo || '').toUpperCase(),
        distrito: row.distrito_nombre || row.distrito || '—',
        status: String(row.status || row.estado || 'COMPLETED').toUpperCase(),
        origen: String(row.origen || '').toUpperCase(),
        codigoServicio: row.codigo_servicio || row.codigoServicio || '',
        tipoServicio: String(row.tipo_servicio || row.tipoServicio || '').toUpperCase()
      }))
      .filter(row => !row.status || row.status === 'COMPLETED')
      .sort((a, b) => {
        const aTime = parseDate(a.fecha)?.getTime() || 0;
        const bTime = parseDate(b.fecha)?.getTime() || 0;
        return bTime - aTime;
      });
  }

  function rowIsoDate(row) {
    const raw = String(row.fecha || '');
    const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];

    const parsed = parseDate(raw);
    if (!parsed) return '';
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function applyPayload(payload) {
    const normalized = normalizeRows(payload);
    const hasServerPaging = Number.isInteger(Number(payload?.page)) && Number.isInteger(Number(payload?.limit));

    if (hasServerPaging) {
      rows = normalized;
      total = Math.max(0, Number(payload.total || 0));
      page = Math.max(1, Number(payload.page || 1));
      pages = Math.max(1, Number(payload.pages || Math.ceil(total / PAGE_SIZE) || 1));
      return;
    }

    // Compatibilidad temporal mientras n8n/VPS todavía devuelven todo el historial.
    let filtered = normalized;
    if (activeDate) {
      filtered = filtered.filter(row => rowIsoDate(row) === activeDate);
    }

    total = filtered.length;
    pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (page > pages) page = pages;
    const start = (page - 1) * PAGE_SIZE;
    rows = filtered.slice(start, start + PAGE_SIZE);
  }

  function renderPagination() {
    countEl.textContent = number(total);

    const start = total ? ((page - 1) * PAGE_SIZE) + 1 : 0;
    const end = total ? Math.min(page * PAGE_SIZE, total) : 0;

    pagination.hidden = total === 0;
    paginationMeta.textContent = total
      ? `Mostrando ${number(start)}–${number(end)} de ${number(total)} cortes`
      : '';
    pageIndicator.textContent = `Página ${number(page)} de ${number(pages)}`;
    prevButton.disabled = loading || page <= 1;
    nextButton.disabled = loading || page >= pages;
  }

  function render() {
    renderPagination();

    if (!rows.length) {
      tableShell.innerHTML = `
        <div class="history-empty">
          <div>
            <strong>No se encontraron cortes</strong>
            <span>${activeDate ? `No hay cortes para ${escapeHtml(isoToDisplay(activeDate))}.` : 'Todavía no hay cortes confirmados para mostrar.'}</span>
          </div>
        </div>
      `;
      return;
    }

    tableShell.innerHTML = `
      <div class="history-table-wrap">
        <table class="history-table">
          <thead>
            <tr>
              <th scope="col">Fecha del corte</th>
              <th scope="col">Cantidad</th>
              <th scope="col">Tipo</th>
              <th scope="col">Distrito</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row, index) => `
              <tr style="animation-delay:${Math.min(index * 32, 320)}ms">
                <td>${escapeHtml(formatDate(row.fecha))}</td>
                <td><strong>${number(row.cantidad)}</strong></td>
                <td>
                  <div class="history-type-cell">
                    <span class="history-channel ${channelClass(row.tipo)}">
                      <span class="history-channel__dot" aria-hidden="true"></span>
                      ${escapeHtml(historyTypeLabel(row))}
                    </span>
                    ${row.codigoServicio ? `
                      <span class="history-service-code" title="${escapeHtml(row.codigoServicio)}">
                        ${escapeHtml(row.codigoServicio)}
                      </span>
                    ` : ''}
                  </div>
                </td>
                <td>${escapeHtml(row.distrito)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async function requestHistoryPage(requestPage, requestLimit) {
    if (!CONFIG.gatewayWebhook) {
      throw new Error('No está configurado el gateway de n8n.');
    }

    const payload = {
      accion: 'historial',
      page: requestPage,
      limit: requestLimit
    };

    if (activeDate) payload.fecha = activeDate;

    const response = await fetch(CONFIG.gatewayWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    let data;

    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      throw new Error('n8n devolvió una respuesta no JSON para el historial.');
    }

    if (!response.ok || data?.ok === false) {
      const detail = data?.message || data?.detail || data?.error || `${response.status} ${response.statusText}`;
      throw new Error(detail);
    }

    return data;
  }

  async function requestHistory() {
    if (activeType === 'TODOS') {
      return requestHistoryPage(page, PAGE_SIZE);
    }

    const serverLimit = 100;
    const first = await requestHistoryPage(1, serverLimit);
    const serverPages = Math.max(1, Number(first?.pages || 1));
    const payloads = [first];

    if (serverPages > 1) {
      const requests = [];

      for (let current = 2; current <= serverPages; current += 1) {
        requests.push(requestHistoryPage(current, serverLimit));
      }

      payloads.push(...await Promise.all(requests));
    }

    const allRows = payloads.flatMap(payload => normalizeRows(payload));
    const filtered = allRows.filter(row => typeMatches(row));

    total = filtered.length;
    pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    if (page > pages) page = pages;

    const start = (page - 1) * PAGE_SIZE;
    rows = filtered.slice(start, start + PAGE_SIZE);

    return {
      __filteredLocally: true
    };
  }

  async function loadHistory({ force = false } = {}) {
    const requestKey = `${page}|${PAGE_SIZE}|${activeDate}|${activeType}`;
    if (loading || (!force && requestKey === lastRequestKey)) return;

    loading = true;
    refreshButton.disabled = true;
    refreshButton.textContent = 'Actualizando...';
    prevButton.disabled = true;
    nextButton.disabled = true;
    tableShell.innerHTML = '<div class="history-loading">Consultando cortes...</div>';

    try {
      const data = await requestHistory();
      if (!data?.__filteredLocally) {
        applyPayload(data);
      }
      lastRequestKey = `${page}|${PAGE_SIZE}|${activeDate}|${activeType}`;
      render();
    } catch (error) {
      pagination.hidden = true;
      tableShell.innerHTML = `
        <div class="history-error">
          <div>
            <strong>No se pudo cargar el historial</strong>
            <span>${escapeHtml(error.message || 'No se pudo consultar el historial.')}</span>
            <br />
            <button class="history-refresh" id="historyRetry" type="button">Reintentar</button>
          </div>
        </div>
      `;
      tableShell.querySelector('#historyRetry')?.addEventListener('click', () => loadHistory({ force: true }));
    } finally {
      loading = false;
      refreshButton.disabled = false;
      refreshButton.textContent = 'Actualizar historial';
      renderPagination();
    }
  }

  function setSearchState({ invalid = false, message = '' } = {}) {
    searchBox.classList.toggle('is-invalid', invalid);
    searchHelp.classList.toggle('is-error', invalid);
    searchHelp.textContent = message || 'Escribe una fecha completa o usa el selector.';
  }

  function applySearchValue(value, { immediate = false } = {}) {
    const parsed = searchDateToIso(value);

    if (parsed === null) {
      setSearchState({
        invalid: true,
        message: 'Usa una fecha completa con formato DD/MM/AAAA.'
      });
      return;
    }

    setSearchState();
    activeDate = parsed;
    if (parsed) {
      const selected = new Date(parsed + 'T12:00:00');
      calendarCursor = new Date(selected.getFullYear(), selected.getMonth(), 1);
    }
    page = 1;
    lastRequestKey = '';

    if (immediate) {
      loadHistory({ force: true });
      return;
    }

    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => loadHistory({ force: true }), 380);
  }

  function openHistory() {
    document.body.classList.add('is-history-view');
    generatorNav.classList.remove('is-active');
    historyNav.classList.add('is-active');
    if (topbarTitle) topbarTitle.textContent = 'Historial de cortes';
    loadHistory();
  }

  function openGenerator() {
    document.body.classList.remove('is-history-view');
    historyNav.classList.remove('is-active');
    generatorNav.classList.add('is-active');
    if (topbarTitle) topbarTitle.textContent = originalTitle;
  }

  historyNav.disabled = false;
  historyNav.removeAttribute('disabled');
  historyNav.querySelector('.nav-badge')?.remove();

  typeFilter.querySelectorAll('[data-history-type]').forEach(item => {
    item.setAttribute('aria-pressed', item.dataset.historyType === activeType ? 'true' : 'false');
  });

  historyNav.addEventListener('click', openHistory);
  generatorNav.addEventListener('click', openGenerator);
  refreshButton.addEventListener('click', () => loadHistory({ force: true }));

  searchInput.addEventListener('input', () => {
    const value = searchInput.value.trim();
    if (!value) {
      applySearchValue('', { immediate: false });
      return;
    }

    const parsed = searchDateToIso(value);
    if (parsed) {
      applySearchValue(value, { immediate: false });
    } else {
      setSearchState({
        invalid: false,
        message: 'Completa la fecha DD/MM/AAAA para buscar.'
      });
    }
  });

  searchInput.addEventListener('blur', () => {
    const value = searchInput.value.trim();
    if (value && !searchDateToIso(value)) applySearchValue(value);
  });

  dateButton.addEventListener('click', event => {
    event.stopPropagation();
    toggleCalendar();
  });

  calendar.addEventListener('click', event => {
    event.stopPropagation();

    const dayButton = event.target.closest('[data-date]');
    if (!dayButton) return;

    activeDate = dayButton.dataset.date || '';
    searchInput.value = isoToDisplay(activeDate);
    setSearchState();
    page = 1;
    lastRequestKey = '';
    closeCalendar();
    loadHistory({ force: true });
  });

  calendarPrev.addEventListener('click', event => {
    event.stopPropagation();
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
    renderCalendar();
  });

  calendarNext.addEventListener('click', event => {
    event.stopPropagation();
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
    renderCalendar();
  });

  calendarClear.addEventListener('click', event => {
    event.stopPropagation();
    activeDate = '';
    searchInput.value = '';
    setSearchState();
    page = 1;
    lastRequestKey = '';
    closeCalendar();
    loadHistory({ force: true });
  });

  calendarToday.addEventListener('click', event => {
    event.stopPropagation();
    const today = new Date();
    activeDate = dateToIso(today);
    searchInput.value = isoToDisplay(activeDate);
    calendarCursor = new Date(today.getFullYear(), today.getMonth(), 1);
    setSearchState();
    page = 1;
    lastRequestKey = '';
    closeCalendar();
    loadHistory({ force: true });
  });

  document.addEventListener('click', event => {
    if (!calendar.hidden && !calendar.contains(event.target) && !dateButton.contains(event.target)) {
      closeCalendar();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !calendar.hidden) {
      closeCalendar();
      dateButton.focus({ preventScroll: true });
    }
  });

  typeFilter.addEventListener('click', event => {
    const button = event.target.closest('[data-history-type]');
    if (!button) return;

    const nextType = button.dataset.historyType || 'TODOS';
    if (nextType === activeType) return;

    activeType = nextType;
    page = 1;
    lastRequestKey = '';

    typeFilter.querySelectorAll('[data-history-type]').forEach(item => {
      const active = item.dataset.historyType === activeType;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    loadHistory({ force: true });
  });

  prevButton.addEventListener('click', () => {
    if (loading || page <= 1) return;
    page -= 1;
    lastRequestKey = '';
    loadHistory({ force: true });
  });

  nextButton.addEventListener('click', () => {
    if (loading || page >= pages) return;
    page += 1;
    lastRequestKey = '';
    loadHistory({ force: true });
  });
})();
