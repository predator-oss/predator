import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';

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
const EDGE_GAP = 4;
const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
const LABEL_WIDTH = 64;

// Rows are grouped by consumer group and topic. Without meta the label is one
// unreadable run of dots (both group ids and topic names contain them), so the
// selector hands over the parsed parts and they are shown as separate fields.
const parseRows = (keys, meta = {}) => {
  const groups = new Map();
  keys.forEach((key) => {
    const info = meta[key];
    const m = key.match(/^(.*)\[(\d+)\]$/);
    const heading = info
      ? { group: info.group, topic: info.topic }
      : { group: undefined, topic: m ? m[1] : key };
    const partition = info ? Number(info.partition) : (m ? Number(m[2]) : 0);
    const id = `${heading.group || ''}\u0000${heading.topic}`;
    if (!groups.has(id)) groups.set(id, { heading, rows: [] });
    groups.get(id).rows.push({ key, partition });
  });
  return [...groups.values()]
    .sort((a, b) => `${a.heading.group}${a.heading.topic}`.localeCompare(`${b.heading.group}${b.heading.topic}`))
    .map(({ heading, rows }) => ({ heading, rows: rows.sort((a, b) => a.partition - b.partition) }));
};

const ConsumerLagHeatmap = ({ data = [], keys = [], meta = {} }) => {
  const [tooltip, setTooltip] = useState(null);
  // The tooltip is positioned against the heatmap box, so a cell near either
  // edge would render half outside it and get clipped. Measure the rendered
  // tooltip and clamp it back inside instead of letting it overflow.
  const tipRef = useRef(null);
  const [tipSize, setTipSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    if (tooltip && tipRef.current) {
      setTipSize({ width: tipRef.current.offsetWidth, height: tipRef.current.offsetHeight });
    }
  }, [tooltip]);

  const { groups, columns, max } = useMemo(() => {
    const columns = data.filter((point) => keys.some((k) => point[k] !== undefined));
    let max = 0;
    columns.forEach((point) => keys.forEach((k) => { max = Math.max(max, point[k] || 0); }));
    return { groups: parseRows(keys, meta), columns, max: max || 1 };
  }, [data, keys, meta]);

  if (!columns.length) return null;

  // dedup: with < 3 columns the three anchors collide (duplicate react keys)
  const tickIndexes = [...new Set([0, Math.floor((columns.length - 1) / 2), columns.length - 1])];

  return (
    <div data-heatmap style={{ position: 'relative', width: '100%', padding: '4px 30px 0 0' }}>
      {groups.map(({ heading, rows }) => (
        <div key={`${heading.group || ''}-${heading.topic}`} style={{ marginBottom: '14px' }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--fg-secondary)',
            margin: '0 0 6px 0',
            display: 'flex',
            alignItems: 'baseline',
            gap: '6px',
            flexWrap: 'wrap'
          }}>
            {heading.group &&
              <span style={{ color: 'var(--fg-muted)' }}>
                {heading.group}
                <span style={{ padding: '0 4px' }}>&rarr;</span>
              </span>}
            <span style={{ color: 'var(--fg-primary)' }}>{heading.topic}</span>
          </div>
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
                          containerWidth: container.width,
                          text: value === undefined
                            ? `${heading.topic} p${partition} — no data @ ${point.name}`
                            : `${heading.topic} p${partition} · ${value.toLocaleString()} messages behind (${bandOf(value).name}) @ ${point.name}`
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
        <div ref={tipRef} style={{
          position: 'absolute',
          // Clamp horizontally so the box always sits fully inside the heatmap,
          // and flip below the cell when there is no room above it.
          left: `${clamp(tooltip.x, tipSize.width / 2 + EDGE_GAP, tooltip.containerWidth - tipSize.width / 2 - EDGE_GAP)}px`,
          top: `${tooltip.y - tipSize.height - 6 < 0 ? tooltip.y + ROW_HEIGHT + 6 : tooltip.y - tipSize.height - 6}px`,
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
          maxWidth: `${Math.max(160, tooltip.containerWidth - EDGE_GAP * 2)}px`,
          whiteSpace: 'normal',
          textAlign: 'center',
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
