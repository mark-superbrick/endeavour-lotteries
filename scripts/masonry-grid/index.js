// Wait for all images inside the given containers to finish loading (or error).
function waitForImages(containers) {
  const list = Array.from(containers || []);
  if (!list.length) return Promise.resolve();
  return Promise.all(list.map(container => {
    const imgs = Array.from(container.querySelectorAll('img'));
    if (!imgs.length) return Promise.resolve();
    return Promise.all(imgs.map(img => new Promise(res => {
      if (img.complete && typeof img.naturalWidth !== 'undefined') return res();
      const done = () => {
        img.removeEventListener('load', done);
        img.removeEventListener('error', done);
        res();
      };
      img.addEventListener('load', done);
      img.addEventListener('error', done);
    })));
  }));
}

function initMasonryGrid(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-masonry-list]').forEach(container => {
    if (container._masonry) return; // idempotent

    const shuffle = container.dataset.masonryShuffle !== 'false';
    let cols, gapPx, colHeights;

    const getVars = () => {
      const cs = getComputedStyle(container);
      cols = parseInt(cs.getPropertyValue('--masonry-col'), 10);
      const rawGap = cs.getPropertyValue('--masonry-gap').trim();
      if (rawGap.endsWith('em')) {
        gapPx = parseFloat(rawGap) * parseFloat(cs.fontSize);
      } else if (rawGap.endsWith('rem')) {
        gapPx = parseFloat(rawGap) * parseFloat(getComputedStyle(document.documentElement).fontSize);
      } else {
        gapPx = parseFloat(rawGap);
      }
    };

    const layout = () => {
      getVars();
      if (!cols || isNaN(cols) || isNaN(gapPx)) {
        console.warn('masonry: missing or invalid --masonry-col / --masonry-gap on', container);
        return;
      }
      const wCalc = `(100% - ${(cols - 1)}*var(--masonry-gap)) / ${cols}`;
      colHeights = Array(cols).fill(0);
      container.style.position = 'relative';
      const items = Array.from(container.children);

      items.forEach(el => {
        el.style.position = 'absolute';
        el.style.width = `calc(${wCalc})`;
      });

      items.forEach((el, i) => {
        const h = el.offsetHeight;
        const idx = shuffle
          ? colHeights.indexOf(Math.min(...colHeights))
          : (i % cols);
        el.style.top  = `${colHeights[idx]}px`;
        el.style.left = `calc(${wCalc}*${idx} + var(--masonry-gap)*${idx})`;
        colHeights[idx] += h + gapPx;
      });

      container.style.height = `${Math.max(...colHeights)}px`;
    };

    const debounce = (fn, delay) => {
      let t;
      return () => { clearTimeout(t); t = setTimeout(fn, delay); };
    };

    const onResize = debounce(layout, 100);
    window.addEventListener('resize', onResize);

    waitForImages([container]).then(() => requestAnimationFrame(layout)).catch(err => {
      console.error('masonry waitForImages error', err);
      requestAnimationFrame(() => { try { layout(); } catch (e) { console.error(e); } });
    });

    container._masonry = {
      recalc: () => waitForImages([container]).then(layout),
      destroy: () => {
        window.removeEventListener('resize', onResize);
        Array.from(container.children).forEach(el => {
          el.style.position = el.style.width = el.style.top = el.style.left = '';
        });
        container.style.position = container.style.height = '';
        delete container._masonry;
      }
    };
  });
}

// For each masonry container: if it lives inside a Webflow tab pane, init when
// that pane becomes active; otherwise init on DOM ready.
(function () {
  const initContainer = (container) => {
    const pane = container.closest('.w-tab-pane');

    if (!pane) {
      initMasonryGrid(container.parentElement || document);
      return;
    }

    if (pane.classList.contains('w--tab-active')) {
      initMasonryGrid(pane);
      return;
    }

    const mo = new MutationObserver((_, obs) => {
      if (pane.classList.contains('w--tab-active')) {
        initMasonryGrid(pane);
        obs.disconnect();
      }
    });
    mo.observe(pane, { attributes: true, attributeFilter: ['class'] });
  };

  const run = () => {
    document.querySelectorAll('[data-masonry-list]').forEach(initContainer);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
