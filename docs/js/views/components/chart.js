/**
 * The only module that knows Chart.js (spec §11). Views ask for semantic charts; colours
 * come from the design tokens. Swapping the chart library touches this file only.
 */

const CHART_SRC = 'vendor/chart.js/4.5.1/chart.umd.min.js';
const DENSE_POINTS = 20;

let library = null;

/**
 * Injects the vendored UMD build once.
 * @returns {Promise<any>} resolves to globalThis.Chart
 */
export function loadChartLibrary() {
  library ??= new Promise((resolve, reject) => {
    if (globalThis.Chart) {
      resolve(globalThis.Chart);
      return;
    }
    const script = document.createElement('script');
    script.src = CHART_SRC;
    script.onload = () => resolve(globalThis.Chart);
    script.onerror = () => {
      library = null;
      script.remove();
      reject(new Error(`Could not load ${CHART_SRC}`));
    };
    document.head.append(script);
  });
  return library;
}

/** Default series colours (token names without '--'): one series → accent, more → team A, team B, … */
const defaultTones = (count) => (count === 1 ? ['accent'] : ['team-a', 'team-b', 'accent', 'text-muted']);

/**
 * Line chart with one line per series over the union of their x values.
 * @param {HTMLElement} container sets the height (the chart fills it)
 * @param {{ series: { name: string, points: { x: string, y: number }[] }[],
 *   tones?: string[], formatX?: (x: string) => string }} options
 *   tones: token names per series ('team-a', 'team-b', 'accent', …); formatX: axis/tooltip label of an x value
 * @returns {{ destroy(): void }}
 */
export function renderLineChart(container, { series, tones = defaultTones(series.length), formatX = String }) {
  const canvas = document.createElement('canvas');
  container.replaceChildren(canvas);
  let chart = null;
  let destroyed = false;

  loadChartLibrary().then((Chart) => {
    if (destroyed) return;
    const style = getComputedStyle(container);
    const token = (name) => style.getPropertyValue(`--${name}`).trim();
    const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort();
    const muted = token('text-muted');
    const grid = token('border');
    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: xs.map(formatX),
        datasets: series.map((s, i) => {
          const ys = new Map(s.points.map((p) => [p.x, p.y]));
          const colour = token(tones[i % tones.length]);
          return {
            label: s.name,
            data: xs.map((x) => ys.get(x) ?? null),
            borderColor: colour,
            backgroundColor: colour,
            borderWidth: 2,
            tension: 0.25,
            spanGaps: true,
            pointRadius: s.points.length > DENSE_POINTS ? 0 : 3,
            pointHitRadius: 12,
          };
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { ticks: { color: muted, maxRotation: 0, autoSkipPadding: 12 }, grid: { color: grid } },
          y: { ticks: { color: muted }, grid: { color: grid } },
        },
        plugins: {
          legend: { display: series.length > 1, labels: { color: muted, boxWidth: 12 } },
          tooltip: { enabled: true },
        },
      },
    });
  }).catch(() => {
    // Chart missing (e.g. offline before the file was cached): leave the empty container.
  });

  return {
    destroy() {
      destroyed = true;
      chart?.destroy();
      chart = null;
    },
  };
}
