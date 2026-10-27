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
    return 'history-channel--other';
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
            <p>Consulta los cortes confirmados registrados por el sistema.</p>
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
              <button class="history-filter-button" id="historyDateButton" type="button" aria-label="Seleccionar fecha">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 5h16l-6.4 7.2v5.3l-3.2 1.7v-7L4 5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path>
                </svg>
              </button>
              <input class="history-date-native" id="historyDateNative" type="date" tabindex="-1" aria-hidden="true" />
            </div>
            <div class="history-search-help" id="historySearchHelp">Escribe una fecha completa o usa el selector.</div>
          </div>

          <button class="history-refresh" id="historyRefresh" type="button">Actualizar historial</button>
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
  const dateInput = view.querySelector('#historyDateNative');
  const dateButton = view.querySelector('#historyDateButton');
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
        status: String(row.status || row.estado || 'COMPLETED').toUpperCase()
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
                  <span class="history-channel ${channelClass(row.tipo)}">
                    <span class="history-channel__dot" aria-hidden="true"></span>
                    ${escapeHtml(row.tipo || '—')}
                  </span>
                </td>
                <td>${escapeHtml(row.distrito)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async function requestHistory() {
    if (!CONFIG.gatewayWebhook) {
      throw new Error('No está configurado el gateway de n8n.');
    }

    const payload = {
      accion: 'historial',
      page,
      limit: PAGE_SIZE
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

  async function loadHistory({ force = false } = {}) {
    const requestKey = `${page}|${PAGE_SIZE}|${activeDate}`;
    if (loading || (!force && requestKey === lastRequestKey)) return;

    loading = true;
    refreshButton.disabled = true;
    refreshButton.textContent = 'Actualizando...';
    prevButton.disabled = true;
    nextButton.disabled = true;
    tableShell.innerHTML = '<div class="history-loading">Consultando cortes...</div>';

    try {
      const data = await requestHistory();
      applyPayload(data);
      lastRequestKey = `${page}|${PAGE_SIZE}|${activeDate}`;
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
    dateInput.value = parsed || '';
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

  dateButton.addEventListener('click', () => {
    if (typeof dateInput.showPicker === 'function') {
      dateInput.showPicker();
    } else {
      dateInput.focus();
      dateInput.click();
    }
  });

  dateInput.addEventListener('change', () => {
    activeDate = dateInput.value || '';
    searchInput.value = isoToDisplay(activeDate);
    setSearchState();
    page = 1;
    lastRequestKey = '';
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
