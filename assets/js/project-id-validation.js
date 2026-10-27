(() => {
  'use strict';

  const form = document.querySelector('#requestForm');
  const inputs = [
    document.querySelector('#projectId1'),
    document.querySelector('#projectId2'),
    document.querySelector('#projectId3')
  ].filter(Boolean);
  const rule = document.querySelector('#projectIdRule');
  const utmInput = document.querySelector('#utmCampaign');
  const distritoInput = document.querySelector('#distrito');
  const toast = document.querySelector('#toast');

  if (!form || inputs.length !== 3) return;

  let utmRule = document.querySelector('#utmCampaignRule');
  if (utmInput && !utmRule) {
    utmRule = document.createElement('small');
    utmRule.id = 'utmCampaignRule';
    utmRule.className = 'utm-campaign-rule';
    utmInput.insertAdjacentElement('afterend', utmRule);
  }

  function isWhatsapp() {
    return document.querySelector('input[name="canal"]:checked')?.value === 'WHATSAPP';
  }

  function sanitize(input) {
    const cleaned = String(input.value || '').replace(/\D/g, '').slice(0, 4);
    if (input.value !== cleaned) input.value = cleaned;
  }

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 3200);
  }

  function clearState() {
    inputs.forEach(input => input.classList.remove('is-project-id-invalid'));
    if (rule) {
      rule.classList.remove('is-error', 'is-valid');
      rule.textContent = 'Cada Project ID debe tener 3 o 4 dígitos y los tres deben ser diferentes.';
    }
  }

  function validateProjectIds({ report = false } = {}) {
    if (!isWhatsapp()) {
      clearState();
      return { valid: true, message: '', firstInvalid: null };
    }

    const values = inputs.map(input => input.value.trim());
    const invalidLengthIndexes = values
      .map((value, index) => (/^\d{3,4}$/.test(value) ? -1 : index))
      .filter(index => index >= 0);

    const counts = values.reduce((map, value) => {
      if (value) map.set(value, (map.get(value) || 0) + 1);
      return map;
    }, new Map());

    const duplicateIndexes = values
      .map((value, index) => (value && counts.get(value) > 1 ? index : -1))
      .filter(index => index >= 0);

    const invalidIndexes = new Set([...invalidLengthIndexes, ...duplicateIndexes]);

    inputs.forEach((input, index) => {
      const shouldMark = invalidIndexes.has(index) && (report || input.value.length >= 3);
      input.classList.toggle('is-project-id-invalid', shouldMark);
    });

    let message = '';
    if (invalidLengthIndexes.length) {
      message = 'Los 3 Project IDs deben tener exactamente 3 o 4 dígitos.';
    } else if (duplicateIndexes.length) {
      message = 'Los 3 Project IDs deben ser diferentes entre sí.';
    }

    if (rule) {
      rule.classList.toggle('is-error', Boolean(message) && report);
      rule.classList.toggle('is-valid', !message && values.every(Boolean));
      rule.textContent = message && report
        ? message
        : 'Cada Project ID debe tener 3 o 4 dígitos y los tres deben ser diferentes.';
    }

    return {
      valid: !message,
      message,
      firstInvalid: invalidIndexes.size ? inputs[[...invalidIndexes][0]] : null
    };
  }

  function districtPrefix() {
    const raw = String(distritoInput?.value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    // El valor del select usa slugs como BRENA, JESUS_MARIA o LIMA_NORTE.
    // Para campaña se estandarizan sin tildes, espacios ni separadores internos.
    return raw.replace(/[^a-z]/g, '');
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function currentUtmDate() {
    const now = new Date();
    const day = pad2(now.getDate());
    const month = pad2(now.getMonth() + 1);
    const year = pad2(now.getFullYear() % 100);
    return `${day}${month}${year}`;
  }

  function extractUtmDigits(value) {
    const raw = String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    const suffix = raw.includes('_') ? raw.slice(raw.lastIndexOf('_') + 1) : raw;
    return suffix.replace(/\D/g, '').slice(0, 6);
  }

  function isValidUtmDate(digits) {
    if (!/^\d{6}$/.test(digits)) return false;

    const day = Number(digits.slice(0, 2));
    const month = Number(digits.slice(2, 4));
    const year = 2000 + Number(digits.slice(4, 6));
    const date = new Date(year, month - 1, day);

    return (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    );
  }

  function utmExample() {
    const prefix = districtPrefix() || 'distrito';
    return `${prefix}_${currentUtmDate()}`;
  }

  function updateUtmHint({ error = false, valid = false, message = '' } = {}) {
    if (!utmRule) return;

    utmRule.classList.toggle('is-error', error);
    utmRule.classList.toggle('is-valid', valid);
    utmRule.textContent = message || `Se completa automáticamente con la fecha en formato DDMMYY: ${utmExample()}. Puedes modificarla.`;
  }

  function syncUtm({ forcePrefix = false, preserveDigits = true, fillDate = false } = {}) {
    if (!utmInput) return;

    const prefix = districtPrefix();
    if (!prefix) return;

    let digits = preserveDigits ? extractUtmDigits(utmInput.value) : '';

    if (!digits && fillDate) {
      digits = currentUtmDate();
    }

    if (digits) {
      utmInput.value = `${prefix}_${digits}`;
    } else if (forcePrefix) {
      utmInput.value = `${prefix}_`;
    } else if (utmInput.value && utmInput.value !== `${prefix}_`) {
      utmInput.value = `${prefix}_`;
    }

    utmInput.placeholder = `Ej. ${utmExample()}`;
    updateUtmHint();
  }

  function validateUtm({ report = false } = {}) {
    if (!utmInput || !isWhatsapp()) {
      utmInput?.classList.remove('is-utm-invalid');
      utmInput?.removeAttribute('aria-invalid');
      updateUtmHint();
      return { valid: true, message: '', firstInvalid: null };
    }

    const prefix = districtPrefix();
    const value = String(utmInput.value || '').trim().toLowerCase();
    const digits = extractUtmDigits(value);
    const expected = new RegExp(`^${prefix}_\\d{6}$`);
    const valid = Boolean(prefix) && expected.test(value) && isValidUtmDate(digits);
    const message = valid
      ? ''
      : `UTM Campaign debe usar el formato ${prefix || 'distrito'}_${currentUtmDate()} (DDMMYY) con una fecha válida.`;

    utmInput.classList.toggle('is-utm-invalid', !valid && report);
    if (!valid && report) utmInput.setAttribute('aria-invalid', 'true');
    else utmInput.removeAttribute('aria-invalid');

    updateUtmHint({
      error: !valid && report,
      valid,
      message: !valid && report ? message : ''
    });

    return {
      valid,
      message,
      firstInvalid: valid ? null : utmInput
    };
  }

  inputs.forEach(input => {
    input.setAttribute('maxlength', '4');
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('pattern', '[0-9]{3,4}');
    input.setAttribute('autocomplete', 'off');

    input.addEventListener('input', () => {
      sanitize(input);
      validateProjectIds({ report: false });
    });

    input.addEventListener('blur', () => {
      if (input.value) validateProjectIds({ report: true });
    });
  });

  if (utmInput) {
    utmInput.setAttribute('autocomplete', 'off');
    utmInput.setAttribute('spellcheck', 'false');
    utmInput.setAttribute('autocapitalize', 'none');

    utmInput.addEventListener('focus', () => {
      if (!extractUtmDigits(utmInput.value)) {
        syncUtm({ forcePrefix: true, preserveDigits: true, fillDate: true });
      }
    });

    utmInput.addEventListener('input', () => {
      syncUtm({ forcePrefix: true, preserveDigits: true, fillDate: false });
      validateUtm({ report: false });
    });

    utmInput.addEventListener('blur', () => {
      validateUtm({ report: Boolean(utmInput.value) });
    });
  }

  distritoInput?.addEventListener('change', () => {
    syncUtm({ forcePrefix: true, preserveDigits: true, fillDate: true });
    validateUtm({ report: false });
  });

  document.querySelectorAll('input[name="canal"]').forEach(input => {
    input.addEventListener('change', () => {
      validateProjectIds({ report: false });
      syncUtm({
        forcePrefix: isWhatsapp(),
        preserveDigits: true,
        fillDate: isWhatsapp()
      });
      validateUtm({ report: false });
    });
  });

  form.addEventListener('reset', () => {
    window.setTimeout(() => {
      clearState();
      if (utmInput) {
        utmInput.classList.remove('is-utm-invalid');
        utmInput.removeAttribute('aria-invalid');
        syncUtm({
          forcePrefix: isWhatsapp(),
          preserveDigits: false,
          fillDate: isWhatsapp()
        });
      }
    }, 0);
  });

  // Captura el submit antes que app.js para impedir cualquier consulta inválida.
  form.addEventListener('submit', event => {
    const projectResult = validateProjectIds({ report: true });
    if (!projectResult.valid) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showToast(projectResult.message);
      projectResult.firstInvalid?.focus();
      return;
    }

    const utmResult = validateUtm({ report: true });
    if (!utmResult.valid) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showToast(utmResult.message);
      utmResult.firstInvalid?.focus();
    }
  }, true);

  syncUtm({
    forcePrefix: isWhatsapp(),
    preserveDigits: true,
    fillDate: isWhatsapp()
  });
})();

(() => {
  'use strict';

  const periodo = document.querySelector('#periodo');
  const environmentPill = document.querySelector('#environmentPill');
  const sidebarMessage = document.querySelector('.sidebar-footer p');

  if (periodo) {
    periodo.readOnly = true;
    periodo.setAttribute('aria-readonly', 'true');
    periodo.setAttribute('title', 'Periodo operativo definido automáticamente por CONTROL DE CIERRES');
  }

  if (sidebarMessage) {
    sidebarMessage.remove();
  }

  // app.js escribe el estado durante init(); lo dejamos limpio al terminar de cargar.
  window.addEventListener('load', () => {
    if (!environmentPill) return;
    environmentPill.textContent = 'n8n conectado';
    environmentPill.setAttribute('title', 'Conexión con automatización n8n activa');
  });
})();
