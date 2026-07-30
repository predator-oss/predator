import React, { useMemo, useState } from 'react';

// Lag per partition is a magnitude, not an identity: dozens of partitions as
// coloured lines is unreadable spaghetti with a legend the size of the chart.
// A heatmap — rows grouped by topic, columns by time, cell shade by lag —
// scales to any partition count.
//
// Colour is anchored to ABSOLUTE lag, never to the run's own maximum. Shading
// by relative max would paint the worst cell of a perfectly healthy run — three
// messages behind — in the same alarming colour as one that is 200k behind, so
// the chart would cry wolf on every green run and mean nothing across runs.
// With fixed thresholds a red cell always means the same thing, and two reports
// can be compared side by side.
//
// Bands use the reserved status ramp (held → strain → breach), and each band
// still shades light→dark inside itself so magnitude stays readable. Lightness
// is monotonic across the whole scale, which keeps it legible for colour-vision
// deficiency; the band name is also printed in the legend and every tooltip, so
// status is never carried by colour alone.
const STRAIN_THRESHOLD = 1000;   // messages behind: consumer is falling behind
const BREACH_THRESHOLD = 10000;  // messages behind: consumer cannot keep up

const BANDS = [
  { name: 'holding', hue: 'var(--held-500)', min: 0, max: STRAIN_THRESHOLD },
  { name: 'straining', hue: 'var(--strain-500)', min: STRAIN_THRESHOLD, max: BREACH_THRESHOLD },
  { name: 'breached', hue: 'var(--breach-500)', min: BREACH_THRESHOLD, max: Infinity }
];

const bandOf = (value) => BANDS.find((b) => value < b.max) || BANDS[BANDS.length - 1];

const cellColor = (value, max) => {
  const band = bandOf(value);
  // Depth within the band: linear up to the band ceiling, and for the open-ended
  // breach band relative to the run's worst cell so a runaway still shows shape.
  const ceiling = band.max === Infinity ? Math.max(max, BREACH_THRESHOLD * 2) : band.max;
  const span = ceiling - band.min || 1;
  const depth = Math.min(1, Math.max(0, (value - band.min) / span));
  return `color-mix(in oklab, ${band.hue} ${Math.round(20 + 75 * depth)}%, var(--plot-surface))`;
};

const ROW_HEIGHT = 16;
const LABEL_WIDTH = 64;

const parseRows = (keys) => {
  const groups = new Map();
  keys.forEach((key) => {
    const m = key.match(/^(.*)\[(\d+)\]$/);
    const topic = m ? m[1] : key;
    const partition = m ? Number(m[2]) : 0;
    if (!groups.has(topic)) groups.set(topic, []);
    groups.get(topic).push({ key, partition });
  });
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([topic, rows]) => ({ topic, rows: rows.sort((a, b) => a.partition - b.partition) }));
};

const ConsumerLagHeatmap = ({ data = [], keys = [] }) => {
  const [tooltip, setTooltip] = useState(null);

  const { groups, columns, max } = useMemo(() => {
    const columns = data.filter((point) => keys.some((k) => point[k] !== undefined));
    let max = 0;
    columns.forEach((point) => keys.forEach((k) => { max = Math.max(max, point[k] || 0); }));
    return { groups: parseRows(keys), columns, max: max || 1 };
  }, [data, keys]);

  if (!columns.length) return null;

  // dedup: with < 3 columns the three anchors collide (duplicate react keys)
  const tickIndexes = [...new Set([0, Math.floor((columns.length - 1) / 2), columns.length - 1])];

  return (
    <div data-heatmap style={{ position: 'relative', width: '100%', padding: '4px 30px 0 0' }}>
      {groups.map(({ topic, rows }) => (
        <div key={topic} style={{ marginBottom: '14px' }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--fg-secondary)',
            margin: '0 0 6px 0'
          }}>{topic}</div>
          {rows.map(({ key, partition }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', marginBottom: '2px' }}>
              <span style={{
                width: `${LABEL_WIDTH}px`,
                flex: '0 0 auto',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: 'var(--fg-secondary)',
                textAlign: 'right',
                paddingRight: '8px'
              }}>p{partition}</span>
              <div style={{ display: 'flex', flex: 1, gap: '2px', height: `${ROW_HEIGHT}px` }}>
                {columns.map((point, i) => {
                  const value = point[key];
                  return (
                    <div
                      key={i}
                      onMouseEnter={(e) => {
                        const cell = e.currentTarget.getBoundingClientRect();
                        const container = e.currentTarget.closest('[data-heatmap]').getBoundingClientRect();
                        setTooltip({
                          x: cell.left - container.left + cell.width / 2,
                          y: cell.top - container.top,
                          text: `${topic}[${partition}] — ${value === undefined ? 'no data' : `${value.toLocaleString()} messages behind (${bandOf(value).name})`} @ ${point.name}`
                        });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      style={{
                        flex: 1,
                        borderRadius: '2px',
                        background: value === undefined
                          ? 'transparent'
                          : cellColor(value, max),
                        boxShadow: value === undefined ? 'inset 0 0 0 1px var(--plot-grid)' : 'none'
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}

      <div style={{ display: 'flex', marginLeft: `${LABEL_WIDTH}px`, justifyContent: 'space-between' }}>
        {tickIndexes.map((i) => (
          <span key={i} style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--plot-tick)'
          }}>{columns[i].name}</span>
        ))}
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px',
        marginTop: '12px',
        marginLeft: `${LABEL_WIDTH}px`,
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        color: 'var(--fg-secondary)'
      }}>
        {BANDS.map((band) => (
          <span key={band.name} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{
              width: '22px',
              height: '8px',
              borderRadius: '2px',
              background: `linear-gradient(to right, ${cellColor(band.min, max)}, ${cellColor(band.max === Infinity ? Math.max(max, BREACH_THRESHOLD * 2) : band.max - 1, max)})`
            }} />
            {band.name} {band.max === Infinity
              ? `≥ ${BREACH_THRESHOLD.toLocaleString()}`
              : `< ${band.max.toLocaleString()}`}
          </span>
        ))}
        <span>peak {max.toLocaleString()} messages behind</span>
      </div>

      {tooltip && (
        <div style={{
          position: 'absolute',
          left: `${tooltip.x}px`,
          top: `${tooltip.y - 34}px`,
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          background: 'var(--bg-surface-raised)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-md)',
          padding: '4px 8px',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--fg-primary)',
          zIndex: 2
        }}>{tooltip.text}</div>
      )}
    </div>
  );
};

export default ConsumerLagHeatmap;
