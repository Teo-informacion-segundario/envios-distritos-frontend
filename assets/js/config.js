/**
 * Configuración V2.
 *
 * Desarrollo local:
 * - conserva el flujo actual directo a n8n para no romper BrowserSync.
 * - autenticación desactivada porque localhost no publica /api.
 *
 * Producción/dominio:
 * - activa autenticación con cookie HttpOnly.
 * - todas las acciones pasan por FastAPI en /api/gateway/envios-distritos.
 * - el navegador deja de conocer/utilizar directamente el webhook de n8n.
 */
(() => {
  'use strict';

  const hostname = String(window.location.hostname || '').toLowerCase();
  const isLocal = (
    window.location.protocol === 'file:' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1'
  );

  window.ENVIO_APP_CONFIG = {
    mode: 'live', // 'mock' | 'live'

    gatewayWebhook: isLocal
      ? 'https://paneln8n.toga.pe/webhook/envios-distritos/solicitud'
      : '/api/gateway/envios-distritos',

    authEnabled: !isLocal,
    apiBase: '/api',
    defaultPeriod: '202607',
    themeStorageKey: 'envios-data-theme'
  };

  const LOGO_PATH = 'assets/img/toga-globe.svg';
  const BRAND_CSS_PATH = 'assets/css/brand-layout-fixes.css';
  const AUTH_CSS_PATH = 'assets/css/auth-ui.css';
  const LOGIN_SPLIT_CSS_PATH = 'assets/css/login-split.css';
  const PASSWORD_TOGGLE_CSS_PATH = 'assets/css/password-toggle.css';
  const PASSWORD_REQUIREMENTS_CSS_PATH = 'assets/css/password-requirements.css';
  const CREDENTIALS_POLISH_CSS_PATH = 'assets/css/credentials-polish.css';

  const AUTH_JS_PATH = 'assets/js/auth.js';
  const PASSWORD_TOGGLE_JS_PATH = 'assets/js/password-toggle.js';
  const PASSWORD_REQUIREMENTS_JS_PATH = 'assets/js/password-requirements.js';
  const CREDENTIALS_POLISH_JS_PATH = 'assets/js/credentials-polish.js';

  function ensureStylesheet(path, datasetKey) {
    return new Promise(resolve => {
      const selector = `link[data-${datasetKey}]`;
      const existing = document.querySelector(selector);

      if (existing) {
        if (existing.sheet) {
          resolve();
          return;
        }
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', resolve, { once: true });
        return;
      }

      const styles = document.createElement('link');
      styles.rel = 'stylesheet';
      styles.href = path;
      styles.setAttribute(`data-${datasetKey}`, 'true');
      styles.addEventListener('load', resolve, { once: true });
      styles.addEventListener('error', resolve, { once: true });
      document.head.appendChild(styles);
    });
  }

  function addStylesheet(path, datasetKey) {
    void ensureStylesheet(path, datasetKey);
  }

  function addScript(path, datasetKey) {
    if (document.querySelector(`script[data-${datasetKey}]`)) return;
    const script = document.createElement('script');
    script.src = path;
    script.async = false;
    script.setAttribute(`data-${datasetKey}`, 'true');
    document.body.appendChild(script);
  }

  function applyBranding() {
    addStylesheet(BRAND_CSS_PATH, 'toga-brand-styles');

    if (!document.querySelector('link[data-toga-favicon]')) {
      const favicon = document.createElement('link');
      favicon.rel = 'icon';
      favicon.type = 'image/svg+xml';
      favicon.href = LOGO_PATH;
      favicon.dataset.togaFavicon = 'true';
      document.head.appendChild(favicon);
    }

    const brandMark = document.querySelector('.brand-mark');
    if (brandMark && !brandMark.querySelector('.brand-logo')) {
      brandMark.innerHTML = `
        <img
          class="brand-logo"
          src="${LOGO_PATH}"
          alt=""
          width="42"
          height="42"
          aria-hidden="true"
        />
      `;
    }
  }

  async function loadAuthUi() {
    if (!window.ENVIO_APP_CONFIG.authEnabled) return;

    /*
     * La pantalla autenticada permanece cubierta por auth-boot-pending
     * hasta que TODOS los estilos del login estén listos. Esto evita
     * el frame intermedio morado / logo sobredimensionado en una carga fría.
     */
    await Promise.all([
      ensureStylesheet(AUTH_CSS_PATH, 'toga-auth-styles'),
      ensureStylesheet(PASSWORD_TOGGLE_CSS_PATH, 'toga-password-toggle-styles'),
      ensureStylesheet(PASSWORD_REQUIREMENTS_CSS_PATH, 'toga-password-requirements-styles'),
      ensureStylesheet(LOGIN_SPLIT_CSS_PATH, 'toga-login-split-styles'),
      ensureStylesheet(CREDENTIALS_POLISH_CSS_PATH, 'toga-credentials-polish-styles')
    ]);

    addScript(AUTH_JS_PATH, 'toga-auth-script');
    addScript(PASSWORD_TOGGLE_JS_PATH, 'toga-password-toggle-script');
    addScript(PASSWORD_REQUIREMENTS_JS_PATH, 'toga-password-requirements-script');
    addScript(CREDENTIALS_POLISH_JS_PATH, 'toga-credentials-polish-script');
  }

  function init() {
    applyBranding();
    void loadAuthUi();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
