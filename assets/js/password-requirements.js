(() => {
  'use strict';

  const TARGET_IDS = new Set([
    'newPassword',
    'confirmPassword',
    'newUserPassword'
  ]);

  const PLACEHOLDER = '10 caracteres como mínimo';
  const MIN_LENGTH = 10;
  let activeInput = null;
  let popover = null;

  function isTarget(input) {
    return input instanceof HTMLInputElement && TARGET_IDS.has(input.id);
  }

  function ensurePopover() {
    if (popover?.isConnected) return popover;

    popover = document.createElement('div');
    popover.className = 'password-requirement-popover';
    popover.id = 'passwordRequirementPopover';
    popover.setAttribute('role', 'alert');
    popover.hidden = true;
    popover.innerHTML = `
      <div class="password-requirement-popover__icon" aria-hidden="true">!</div>
      <div class="password-requirement-popover__copy">
        <strong>Mínimo 10 caracteres</strong>
        <span>La contraseña debe tener al menos 10 caracteres.</span>
      </div>`;
    document.body.appendChild(popover);
    return popover;
  }

  function positionPopover(input) {
    const node = ensurePopover();
    const rect = input.getBoundingClientRect();
    const margin = 14;
    const maxLeft = Math.max(margin, window.innerWidth - node.offsetWidth - margin);
    const left = Math.min(Math.max(rect.left, margin), maxLeft);

    node.classList.remove('is-above');
    node.style.left = `${left}px`;
    node.style.top = `${rect.bottom + 10}px`;

    const popRect = node.getBoundingClientRect();
    if (popRect.bottom > window.innerHeight - 10 && rect.top > popRect.height + 18) {
      node.classList.add('is-above');
      node.style.top = `${Math.max(10, rect.top - popRect.height - 10)}px`;
    }
  }

  function messageFor(input) {
    const missing = Math.max(0, MIN_LENGTH - input.value.length);
    if (missing === 1) return 'Te falta 1 carácter para cumplir el requisito.';
    return `Te faltan ${missing} caracteres para cumplir el requisito.`;
  }

  function clearInputState(input) {
    if (!input) return;
    input.classList.remove('password-requirement-invalid');
    input.removeAttribute('aria-invalid');
    if (input.getAttribute('aria-describedby') === 'passwordRequirementPopover') {
      input.removeAttribute('aria-describedby');
    }
  }

  function showRequirement(input) {
    const length = input.value.length;

    // El aviso solo existe para valores parciales: 1 a 9 caracteres.
    if (length === 0 || length >= MIN_LENGTH) {
      hideRequirement(input);
      return;
    }

    if (activeInput && activeInput !== input) {
      clearInputState(activeInput);
    }

    activeInput = input;
    const node = ensurePopover();
    const message = node.querySelector('.password-requirement-popover__copy span');
    if (message) message.textContent = messageFor(input);

    input.classList.add('password-requirement-invalid');
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', node.id);
    node.hidden = false;
    positionPopover(input);
  }

  function hideRequirement(input = activeInput) {
    clearInputState(input);

    if (popover) popover.hidden = true;

    if (!input || input === activeInput) {
      activeInput = null;
    }
  }

  function configureInput(input) {
    if (!isTarget(input)) return;
    input.placeholder = PLACEHOLDER;
    input.minLength = MIN_LENGTH;
    input.autocomplete = 'new-password';
  }

  function configureAll(root = document) {
    TARGET_IDS.forEach(id => {
      const input = root.querySelector?.(`#${id}`);
      if (input) configureInput(input);
    });
  }

  document.addEventListener('invalid', event => {
    const input = event.target;
    if (!isTarget(input)) return;

    event.preventDefault();

    // Si está vacío no mostramos el aviso de longitud mínima.
    if (input.value.length === 0) {
      hideRequirement(input);
      return;
    }

    if (input.value.length < MIN_LENGTH) {
      showRequirement(input);
    } else {
      hideRequirement(input);
    }
  }, true);

  document.addEventListener('input', event => {
    const input = event.target;
    if (!isTarget(input)) return;

    configureInput(input);
    const length = input.value.length;

    // Vacío o condición cumplida: ocultar de inmediato.
    if (length === 0 || length >= MIN_LENGTH) {
      hideRequirement(input);
      return;
    }

    // Mientras exista texto insuficiente, mostramos feedback en tiempo real.
    showRequirement(input);
  }, true);

  document.addEventListener('blur', event => {
    const input = event.target;
    if (!isTarget(input)) return;

    const length = input.value.length;
    if (length === 0 || length >= MIN_LENGTH) {
      hideRequirement(input);
      return;
    }

    showRequirement(input);
  }, true);

  document.addEventListener('focus', event => {
    const input = event.target;
    if (!isTarget(input)) return;

    configureInput(input);
    const length = input.value.length;
    if (length === 0 || length >= MIN_LENGTH) {
      hideRequirement(input);
      return;
    }

    showRequirement(input);
  }, true);

  window.addEventListener('resize', () => {
    if (activeInput && popover && !popover.hidden) positionPopover(activeInput);
  });

  window.addEventListener('scroll', () => {
    if (activeInput && popover && !popover.hidden) positionPopover(activeInput);
  }, true);

  const observer = new MutationObserver(() => configureAll());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  configureAll();
})();
