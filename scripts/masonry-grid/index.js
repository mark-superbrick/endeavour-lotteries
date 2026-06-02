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

// Symbol key avoids collision with other scripts on the DOM element.
const MASONRY_KEY = Symbol('masonry');

function initMasonryGrid(root) {
  const scope = root || document;

  // Support passing the container element directly (not just a parent scope).
  const containers = scope instanceof Element && scope.matches('[data-masonry-list]')
    ? [scope]
    : Array.from(scope.querySelectorAll('[data-masonry-list]'));

  containers.forEach(container => {
    if (container[MASONRY_KEY]) return; // idempotent

    const shuffle = container.dataset.masonryShuffle !== 'false';
    let cols, gapPx, colHeights;
    let destroyed = false;

    // Snapshot inline styles so destroy() can restore exactly what was there before.
    const origContainer = {
      position: container.style.position,
      height: container.style.height,
      opacity: container.style.opacity,
      transition: container.style.transition,
    };
    const origChildren = new Map();
    Array.from(container.children).forEach(el => {
      origChildren.set(el, {
        position: el.style.position,
        width: el.style.width,
        top: el.style.top,
        left: el.style.left,
      });
    });

    const getVars = () => {
      const cs = getComputedStyle(container);

      // Strict integer validation — rejects decimals, negatives, and partial parses.
      const rawCol = cs.getPropertyValue('--masonry-col').trim();
      cols = Number(rawCol);
      if (!Number.isInteger(cols) || cols < 1) cols = NaN;

      // Resolve gap to pixels via a probe element; supports any CSS length unit
      // (px, rem, em, vw, calc, clamp, etc.) without manual unit conversion.
      const rawGap = cs.getPropertyValue('--masonry-gap').trim();
      if (!rawGap) {
        gapPx = NaN;
      } else {
        const probe = document.createElement('div');
        probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;width:${rawGap};height:0;`;
        container.appendChild(probe);
        gapPx = probe.getBoundingClientRect().width;
        container.removeChild(probe);
      }
    };

    const layout = () => {
      getVars();
      if (!cols || isNaN(cols) || isNaN(gapPx)) {
        console.warn('masonry: missing or invalid --masonry-col / --masonry-gap on', container);
        return;
      }
      const wCalc = `(100% - ${cols - 1}*var(--masonry-gap)) / ${cols}`;
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

      // Subtract the trailing gap so container height matches content exactly.
      const maxH = Math.max(...colHeights);
      container.style.height = `${items.length && maxH > 0 ? maxH - gapPx : maxH}px`;
    };

    const debounce = (fn, delay) => {
      let t;
      const wrapped = () => { clearTimeout(t); t = setTimeout(fn, delay); };
      wrapped.cancel = () => clearTimeout(t);
      return wrapped;
    };

    const fadeIn = () => {
      requestAnimationFrame(() => {
        if (destroyed) return;
        container.style.transition = 'opacity 0.4s ease';
        container.style.opacity = '1';
      });
    };

    const onResize = debounce(() => { if (!destroyed) layout(); }, 100);
    window.addEventListener('resize', onResize);

    container.style.opacity = '0';

    // Safari won't fetch loading="lazy" images outside the viewport, causing
    // waitForImages to hang indefinitely. Force eager to start the fetch now.
    container.querySelectorAll('img[loading="lazy"]').forEach(img => { img.loading = 'eager'; });

    waitForImages([container]).then(() => requestAnimationFrame(() => {
      if (destroyed) return;
      try { layout(); } catch (e) { console.error('masonry layout error', e); } finally { fadeIn(); }
    })).catch(err => {
      console.error('masonry waitForImages error', err);
      requestAnimationFrame(() => {
        if (destroyed) return;
        try { layout(); } catch (e) { console.error(e); } finally { fadeIn(); }
      });
    });

    // Call recalc() to re-measure and re-layout after external content changes
    // (new children, font swaps, image src changes). Not auto-observed.
    const recalc = () => waitForImages([container]).then(layout);

    const destroy = () => {
      destroyed = true;
      onResize.cancel();
      window.removeEventListener('resize', onResize);

      Array.from(container.children).forEach(el => {
        const orig = origChildren.get(el);
        if (orig) {
          el.style.position = orig.position;
          el.style.width    = orig.width;
          el.style.top      = orig.top;
          el.style.left     = orig.left;
        } else {
          el.style.position = el.style.width = el.style.top = el.style.left = '';
        }
      });

      container.style.position   = origContainer.position;
      container.style.height     = origContainer.height;
      container.style.opacity    = origContainer.opacity;
      container.style.transition = origContainer.transition;

      delete container[MASONRY_KEY];
    };

    container[MASONRY_KEY] = { recalc, destroy };
  });
}

// For each masonry container: if it lives inside a Webflow tab pane, init when
// that pane becomes active; otherwise init on DOM ready.
(function () {
  const initContainer = (container) => {
    const pane = container.closest('.w-tab-pane');

    if (!pane) {
      // Pass container directly — avoids rescanning siblings in the parent scope.
      initMasonryGrid(container);
      return;
    }

    if (pane.classList.contains('w--tab-active')) {
      initMasonryGrid(container);
      return;
    }

    const mo = new MutationObserver((_, obs) => {
      if (pane.classList.contains('w--tab-active')) {
        initMasonryGrid(container);
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
