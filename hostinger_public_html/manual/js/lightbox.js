/**
 * DRE Jurídico — Lightbox & HD Image Viewer
 * Venda+ Tech
 */
let currentZoom = 1;

function openLightbox(src, caption) {
  if (!src) return;
  const modal = document.getElementById('lightboxModal');
  const img = document.getElementById('lightboxImg');
  const cap = document.getElementById('lightboxCaption');
  
  currentZoom = 1;
  img.style.transform = `scale(1)`;
  img.src = src;
  cap.textContent = caption || 'Visualização em Alta Definição';
  
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  const modal = document.getElementById('lightboxModal');
  if (modal) modal.classList.remove('active');
  document.body.style.overflow = '';
  currentZoom = 1;
  const img = document.getElementById('lightboxImg');
  if (img) img.style.transform = `scale(1)`;
}

function handleLightboxBackdrop(e) {
  if (e.target.id === 'lightboxModal' || e.target.id === 'lightboxBox') {
    closeLightbox();
  }
}

function zoomIn() {
  currentZoom = Math.min(currentZoom + 0.25, 3);
  const img = document.getElementById('lightboxImg');
  if (img) img.style.transform = `scale(${currentZoom})`;
}

function zoomOut() {
  currentZoom = Math.max(currentZoom - 0.25, 0.5);
  const img = document.getElementById('lightboxImg');
  if (img) img.style.transform = `scale(${currentZoom})`;
}

function zoomReset() {
  currentZoom = 1;
  const img = document.getElementById('lightboxImg');
  if (img) img.style.transform = `scale(1)`;
}

// Keyboard shortcuts for Lightbox
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLightbox();
  if (e.key === '+' || e.key === '=') zoomIn();
  if (e.key === '-') zoomOut();
});

// Auto-attach click listeners to all screenshot containers
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.screen-img-container').forEach(container => {
    container.addEventListener('click', function() {
      const img = this.querySelector('img');
      if (img) {
        const parentCard = this.closest('.screenshot-card') || this.parentElement;
        const captionEl = parentCard ? parentCard.querySelector('.screenshot-caption') : null;
        const caption = captionEl ? captionEl.innerText.trim() : (img.alt || 'Visualização da Tela');
        const activeSrc = img.currentSrc || img.src;
        openLightbox(activeSrc, caption);
      }
    });
  });
});
