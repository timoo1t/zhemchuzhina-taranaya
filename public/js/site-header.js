(async function initSiteHeader() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) applyConfig(await res.json());
  } catch {}
  initBurger();
})();

function applyConfig(config) {
  document.querySelectorAll('[data-site-name]').forEach((el) => {
    if (el.classList.contains('logo__main')) {
      el.textContent = (config.siteName.split('-')[0] || config.siteName).trim().toUpperCase();
    } else {
      el.textContent = config.siteName;
    }
  });

  const phoneEl = document.querySelector('[data-site-phone]');
  if (phoneEl && config.sitePhone) {
    phoneEl.textContent = config.sitePhone;
    phoneEl.href = `tel:${config.sitePhone.replace(/\s/g, '')}`;
  }

  const phone2El = document.querySelector('[data-site-phone-secondary]');
  const phone2Line = document.querySelector('[data-site-phone-secondary-line]');
  if (phone2El) {
    if (config.sitePhoneSecondary) {
      phone2El.textContent = config.sitePhoneSecondary;
      phone2El.href = `tel:${config.sitePhoneSecondary.replace(/[^\d+]/g, '')}`;
      if (phone2Line) phone2Line.hidden = false;
    } else if (phone2Line) {
      phone2Line.hidden = true;
    }
  }

  const emailEl = document.querySelector('[data-site-email]');
  if (emailEl && config.siteEmail) {
    emailEl.textContent = config.siteEmail;
    emailEl.href = `mailto:${config.siteEmail}`;
  }

  document.querySelectorAll('[data-site-max]').forEach((el) => {
    if (config.maxChannelUrl) {
      el.href = config.maxChannelUrl;
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
    }
  });
}

function initBurger() {
  const burger = document.getElementById('burger');
  const header = document.querySelector('.header');
  if (!burger || !header) return;
  burger.addEventListener('click', () => {
    header.classList.toggle('nav-open');
  });
}
