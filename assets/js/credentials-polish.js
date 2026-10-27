(() => {
  'use strict';

  const FORM_SELECTOR = '#createUserForm';
  const ROLE_SELECT_SELECTOR = '#newUserRole';

  let openCombobox = null;

  function clearAdminCreateFields(form) {
    const name = form.querySelector('#newUserName');
    const email = form.querySelector('#newUserEmail');
    const password = form.querySelector('#newUserPassword');

    if (!name || !email || !password) return;

    form.setAttribute('autocomplete', 'off');

    name.setAttribute('autocomplete', 'off');
    name.setAttribute('data-lpignore', 'true');
    name.setAttribute('data-1p-ignore', 'true');

    email.setAttribute('autocomplete', 'off');
    email.setAttribute('data-lpignore', 'true');
    email.setAttribute('data-1p-ignore', 'true');

    password.setAttribute('autocomplete', 'new-password');
    password.setAttribute('data-lpignore', 'true');
    password.setAttribute('data-1p-ignore', 'true');

    let userStartedTyping = false;
    const markUserInteraction = () => { userStartedTyping = true; };

    form.addEventListener('keydown', markUserInteraction, { once: true, capture: true });
    form.addEventListener('pointerdown', markUserInteraction, { once: true, capture: true });

    const clear = () => {
      if (userStartedTyping || !form.isConnected) return;
      name.value = '';
      email.value = '';
      password.value = '';
    };

    clear();
    window.requestAnimationFrame(clear);
    window.setTimeout(clear, 120);
    window.setTimeout(clear, 420);
  }

  function closeRoleCombobox(combobox, { focusTrigger = false } = {}) {
    if (!combobox) return;
    const trigger = combobox.querySelector('.role-combobox__trigger');
    const menu = combobox.querySelector('.role-combobox__menu');
    if (!trigger || !menu) return;

    combobox.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    menu.hidden = true;
    if (openCombobox === combobox) openCombobox = null;
    if (focusTrigger) trigger.focus({ preventScroll: true });
  }

  function openRoleCombobox(combobox) {
    if (!combobox) return;
    if (openCombobox && openCombobox !== combobox) closeRoleCombobox(openCombobox);

    const trigger = combobox.querySelector('.role-combobox__trigger');
    const menu = combobox.querySelector('.role-combobox__menu');
    if (!trigger || !menu) return;

    combobox.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    menu.hidden = false;
    openCombobox = combobox;

    const selected = menu.querySelector('.role-combobox__option.is-selected') || menu.querySelector('.role-combobox__option');
    selected?.focus({ preventScroll: true });
  }

  function syncRoleVisual(select, combobox) {
    const triggerLabel = combobox.querySelector('[data-role-label]');
    const options = combobox.querySelectorAll('.role-combobox__option');
    const selectedOption = select.options[select.selectedIndex];
    const label = selectedOption?.textContent || 'Usuario';

    if (triggerLabel) triggerLabel.textContent = label;

    options.forEach(option => {
      const selected = option.dataset.roleValue === select.value;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
  }

  function enhanceRoleSelect(select) {
    if (!(select instanceof HTMLSelectElement)) return;
    if (select.dataset.roleComboboxReady === 'true') return;

    select.dataset.roleComboboxReady = 'true';
    select.classList.add('role-select-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    select.setAttribute('autocomplete', 'off');

    const combobox = document.createElement('div');
    combobox.className = 'role-combobox';
    combobox.innerHTML = `
      <button
        class="role-combobox__trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded="false"
        aria-controls="newUserRoleMenu"
      >
        <span data-role-label>Usuario</span>
        <svg class="role-combobox__chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m7 10 5 5 5-5" />
        </svg>
      </button>
      <div class="role-combobox__menu" id="newUserRoleMenu" role="listbox" aria-label="Rol" hidden>
        <button class="role-combobox__option" type="button" role="option" data-role-value="USER">Usuario</button>
        <button class="role-combobox__option" type="button" role="option" data-role-value="ADMIN">Administrador</button>
      </div>`;

    select.insertAdjacentElement('afterend', combobox);
    syncRoleVisual(select, combobox);

    const trigger = combobox.querySelector('.role-combobox__trigger');
    const menu = combobox.querySelector('.role-combobox__menu');

    trigger?.addEventListener('click', () => {
      if (combobox.classList.contains('is-open')) {
        closeRoleCombobox(combobox);
      } else {
        openRoleCombobox(combobox);
      }
    });

    menu?.querySelectorAll('.role-combobox__option').forEach(option => {
      option.addEventListener('click', () => {
        select.value = option.dataset.roleValue || 'USER';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        syncRoleVisual(select, combobox);
        closeRoleCombobox(combobox, { focusTrigger: true });
      });

      option.addEventListener('keydown', event => {
        const options = Array.from(menu.querySelectorAll('.role-combobox__option'));
        const index = options.indexOf(option);

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          options[(index + 1) % options.length]?.focus();
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          options[(index - 1 + options.length) % options.length]?.focus();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          closeRoleCombobox(combobox, { focusTrigger: true });
        }
      });
    });

    select.addEventListener('change', () => syncRoleVisual(select, combobox));
  }

  function enhanceForm(form) {
    if (!(form instanceof HTMLFormElement)) return;
    if (form.dataset.credentialsPolishReady === 'true') return;

    form.dataset.credentialsPolishReady = 'true';
    clearAdminCreateFields(form);

    const select = form.querySelector(ROLE_SELECT_SELECTOR);
    if (select) enhanceRoleSelect(select);
  }

  function scan(root = document) {
    if (root instanceof Element && root.matches(FORM_SELECTOR)) {
      enhanceForm(root);
      return;
    }

    if (!(root instanceof Document || root instanceof Element || root instanceof DocumentFragment)) return;
    root.querySelectorAll(FORM_SELECTOR).forEach(enhanceForm);
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

    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('click', event => {
      if (!openCombobox) return;
      if (openCombobox.contains(event.target)) return;
      closeRoleCombobox(openCombobox);
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && openCombobox) {
        closeRoleCombobox(openCombobox, { focusTrigger: true });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
