

function initMasonryGrid() {
  document.querySelectorAll('[data-masonry-list]').forEach(container => {
    const shuffle = container.dataset.masonryShuffle !== 'false';
    let cols, gapPx, colHeights;

    // Take columns and gaps from CSS
    const getVars = () => {
      const cs = getComputedStyle(container);
      cols = parseInt(cs.getPropertyValue('--masonry-col'));
      const rawGap = cs.getPropertyValue('--masonry-gap').trim();
      if (rawGap.endsWith('px')) {
        gapPx = parseFloat(rawGap);
      } else if (rawGap.endsWith('em')) {
        gapPx = parseFloat(rawGap) * parseFloat(cs.fontSize);
      } else if (rawGap.endsWith('rem')) {
        gapPx = parseFloat(rawGap) * parseFloat(getComputedStyle(document.documentElement).fontSize);
      } else {
        gapPx = parseFloat(rawGap);
      }
    };
    
    // Set the layout
    const layout = () => {
      getVars();
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

    // Debounce function to use on resize
    const debounce = (fn, delay) => {
      let t;
      return () => {
        clearTimeout(t);
        t = setTimeout(fn, delay);
      };
    };

    const onResize = debounce(layout, 100);
    window.addEventListener('resize', onResize);

    // Return promise if images are loaded (improved: resolve also on error and consider cached images)
    const imgLoad = () => {
      const imgs = container.querySelectorAll('img');
      if (!imgs.length) return Promise.resolve();
      return Promise.all(Array.from(imgs).map(img => new Promise(r => {
        if (img.complete && typeof img.naturalWidth !== 'undefined') {
          // naturalWidth === 0 indicates image failed to load
          return r();
        }
        const onFinish = () => {
          img.removeEventListener('load', onFinish);
          img.removeEventListener('error', onFinish);
          r();
        };
        img.addEventListener('load', onFinish);
        img.addEventListener('error', onFinish);
      })));
    };

    // When images are ready, set the layout
    imgLoad().then(layout).catch(err => {
      console.error('masonry imgLoad error', err);
      // Still attempt layout even if something went wrong
      try { layout(); } catch (e) { console.error(e); }
    });

    // Constructor with destroy and recalc function
    container._masonry = {
      recalc: () => imgLoad().then(layout),
      destroy: () => {
        window.removeEventListener('resize', onResize);
        const items = Array.from(container.children);
        items.forEach(el => {
          el.style.position =
          el.style.width =
          el.style.top =
          el.style.left = '';
        });
        container.style.position =
        container.style.height = '';
      }
    };
  });
}

// Helper: wait for all images inside provided containers to finish loading (or error)
function waitForImagesInContainers(containers) {
  const list = Array.from(containers || []);
  if (!list.length) return Promise.resolve();
  return Promise.all(list.map(container => {
    const imgs = Array.from(container.querySelectorAll('img'));
    if (!imgs.length) return Promise.resolve();
    return Promise.all(imgs.map(img => new Promise(res => {
      if (img.complete && typeof img.naturalWidth !== 'undefined') return res();
      const done = () => { img.removeEventListener('load', done); img.removeEventListener('error', done); res(); };
      img.addEventListener('load', done);
      img.addEventListener('error', done);
    })));
  }));
}

// Run initMasonryGrid() only when the gallery tab pane becomes active and AFTER its images have loaded
(function () {
  const scriptEl = document.currentScript;
  const pane = scriptEl ? scriptEl.closest('.w-tab-pane') : document.querySelector('[data-w-tab="Tab 3"]');

  const scheduleInit = () => {
    try {
      const containers = pane ? pane.querySelectorAll('[data-masonry-list]') : document.querySelectorAll('[data-masonry-list]');
      waitForImagesInContainers(containers).then(() => {
        requestAnimationFrame(() => {
          initMasonryGrid();
        });
      }).catch(err => {
        console.error('waitForImagesInContainers error', err);
        requestAnimationFrame(() => initMasonryGrid());
      });
    } catch (e) {
      console.error('initMasonryGrid error:', e);
    }
  };

  // Wait for the Webflow tab CSS transition to finish before measuring — the MutationObserver
  // fires at transition START (opacity 0→1), so measuring before this resolves gives wrong heights.
  const afterTransition = (cb) => {
    let fired = false;
    const run = () => {
      if (fired) return;
      fired = true;
      pane.removeEventListener('transitionend', run);
      cb();
    };
    pane.addEventListener('transitionend', run, { once: true });
    setTimeout(run, 400); // fallback if transitionend never fires
  };

  if (!pane) {
    document.addEventListener('DOMContentLoaded', scheduleInit);
    return;
  }

  // Pane already active on page load — no transition to wait for
  if (pane.classList.contains('w--tab-active')) {
    document.addEventListener('DOMContentLoaded', scheduleInit);
    return;
  }

  const mo = new MutationObserver((mutations, obs) => {
    if (pane.classList.contains('w--tab-active')) {
      obs.disconnect();
      afterTransition(scheduleInit);
    }
  });
  mo.observe(pane, { attributes: true, attributeFilter: ['class'] });

  // Fallback: listen for clicks on the tab menu (in case Webflow changes structure)
  const tabsRoot = pane.closest('.tour_tabs') || document.querySelector('.tour_tabs');
  if (tabsRoot) {
    const clickHandler = () => {
      if (pane.classList.contains('w--tab-active')) {
        afterTransition(scheduleInit);
        try { mo.disconnect(); } catch (e) {}
        tabsRoot.removeEventListener('click', clickHandler);
      }
    };
    tabsRoot.addEventListener('click', clickHandler, { passive: true });
  }
})();
