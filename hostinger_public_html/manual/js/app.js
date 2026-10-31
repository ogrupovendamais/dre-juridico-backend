/**
 * DRE Jurídico — Main Application Script
 * Venda+ Tech
 */
document.addEventListener('DOMContentLoaded', () => {
  // 1. Reading Progress Bar
  window.addEventListener('scroll', () => {
    const winScroll = document.documentElement.scrollTop || document.body.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrolled = (winScroll / height) * 100;
    const bar = document.getElementById('progressBar');
    if (bar) bar.style.width = scrolled + '%';
  });

  // 2. Mobile Drawer Navigation Logic
  const mobileNavToggle = document.getElementById('mobileNavToggle');
  const sidebarNav = document.getElementById('sidebarNav');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const drawerCloseBtn = document.getElementById('drawerCloseBtn');

  function openMobileDrawer() {
    if (sidebarNav && sidebarBackdrop) {
      sidebarNav.classList.add('active');
      sidebarBackdrop.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeMobileDrawer() {
    if (sidebarNav && sidebarBackdrop) {
      sidebarNav.classList.remove('active');
      sidebarBackdrop.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  if (mobileNavToggle) mobileNavToggle.addEventListener('click', openMobileDrawer);
  if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeMobileDrawer);
  if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeMobileDrawer);

  // Auto-close drawer on mobile when any navigation link is clicked
  document.querySelectorAll('.nav-item a').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 900) {
        closeMobileDrawer();
      }
    });
  });

  // 3. Quick Search Filters (Desktop & Mobile Drawer)
  function applyFilter(query) {
    const val = query.toLowerCase().trim();
    const sections = document.querySelectorAll('section.module-section');
    sections.forEach(sec => {
      if (!val || sec.innerText.toLowerCase().includes(val)) {
        sec.style.display = 'block';
      } else {
        sec.style.display = 'none';
      }
    });

    document.querySelectorAll('.nav-item').forEach(item => {
      if (!val || item.innerText.toLowerCase().includes(val)) {
        item.style.display = 'block';
      } else {
        item.style.display = 'none';
      }
    });
  }

  const quickSearch = document.getElementById('quickSearch');
  if (quickSearch) {
    quickSearch.addEventListener('input', (e) => applyFilter(e.target.value));
  }

  const mobileDrawerSearch = document.getElementById('mobileDrawerSearch');
  if (mobileDrawerSearch) {
    mobileDrawerSearch.addEventListener('input', (e) => applyFilter(e.target.value));
  }

  // 4. Active Sidebar Highlight on Scroll
  const sections = document.querySelectorAll('section.module-section');
  const navLinks = document.querySelectorAll('.nav-item a');
  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(s => {
      const top = s.offsetTop - 120;
      if (window.scrollY >= top) current = s.getAttribute('id');
    });
    navLinks.forEach(a => {
      if (a.getAttribute('href') === '#' + current) {
        a.classList.add('active');
      } else {
        a.classList.remove('active');
      }
    });
  });

  // 6. ESC Key Close Handlers
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMobileDrawer();
    }
  });
});

// Interactive Checklist Checkbox Helper
function toggleCheck(el) {
  const input = el.querySelector('input[type="checkbox"]');
  if (input && event.target !== input) {
    input.checked = !input.checked;
  }
  if (input) {
    el.classList.toggle('checked', input.checked);
  }
}
