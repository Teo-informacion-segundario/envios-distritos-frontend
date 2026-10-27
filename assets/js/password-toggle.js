(() => {
  'use strict';

  const ICON_SHOW = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2.8 12s3.4-5.2 9.2-5.2S21.2 12 21.2 12 17.8 17.2 12 17.2 2.8 12 2.8 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>`;

  const ICON_HIDE = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 3 21 21" />
      <path d="M10.6 6.9c.5-.1.9-.1 1.4-.1 5.8 0 9.2 5.2 9.2 5.2a16.5 16.5 0 0 1-3.1 3.5" />
      <path d="M13.9 14a2.8 2.8 0 0 1-3.9-3.9" />
      <path d="M6.2 6.2C4 7.7 2.8 10 2.8 12c0 0 3.4 5.2 9.2 5.2 1.5 0 2.8-.3 4-.8" />
    </svg>`;

  let generatedId = 0;

  function updateButton(button, input, visible) {
    button.classList.toggle('is-visible', visible);
    button.setAttribute('aria-pressed', visible ? 'true' : 'false');
    button.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
    button.title = visible ? 'Ocultar contraseña' : 'Mostrar contraseña';
    button.innerHTML = visible ? ICON_HIDE : ICON_SHOW;
    input.type = visible ? 'text' : 'password';
  }

  function enhancePasswordInput(input) {
    if (!(input instanceof HTMLInputElement)) return;
    if (input.dataset.passwordToggleReady === 'true') return;
    if (input.type !== 'password') return;

    if (!input.id) {
      generatedId += 1;
      input.id = `passwordField${generatedId}`;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'auth-password-control';

    input.parentNode?.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const button = document.createElement('button');
    button.className = 'auth-password-toggle';
    button.type = 'button';
    button.dataset.passwordToggle = 'true';
    button.setAttribute('aria-controls', input.id);

    input.dataset.passwordToggleReady = 'true';
    wrapper.appendChild(button);
    updateButton(button, input, false);

    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const visible = input.type !== 'password';
      updateButton(button, input, !visible);
      input.focus({ preventScroll: true });
      const length = input.value.length;
      try { input.setSelectionRange(length, length); } catch (_) {}
    });
  }

  function scan(root = document) {
    if (root instanceof HTMLInputElement && root.type === 'password') {
      enhancePasswordInput(root);
      return;
    }

    if (!(root instanceof Document || root instanceof Element || root instanceof DocumentFragment)) return;
    root.querySelectorAll('input[type="password"]').forEach(enhancePasswordInput);
  }

  function start() {
    scan(document);

    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node instanceof Element || node instanceof DocumentFragment) scan(node);
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
