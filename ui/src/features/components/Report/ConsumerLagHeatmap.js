import React, { useMemo, useState } from 'react';

// Lag per partition is a magnitude, not an identity: dozens of partitions as
// coloured lines is unreadable spaghetti with a legend the size of the chart.
// A heatmap — rows grouped by topic, columns by time, cell shade by lag —
// scales to any partition count with no legend at all. Shade is a sequential
// single-hue ramp mixed against the plot surface, so it is theme-aware for free.
const cellColor = (ratio) =>
  `color-mix(in oklab, var(--series-1) ${Math.round(8 + 92 * ratio)}%, var(--plot-surface))`;

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
                          text: `${topic}[${partition}] — ${value === undefined ? 'no data' : `${value} messages`} @ ${point.name}`
                        });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      style={{
                        flex: 1,
                        borderRadius: '2px',
                        background: value === undefined
                          ? 'transparent'
                          : cellColor(value / max),
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
        gap: '8px',
        marginTop: '12px',
        marginLeft: `${LABEL_WIDTH}px`,
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        color: 'var(--fg-secondary)'
      }}>
        <span>0</span>
        <div style={{
          width: '120px',
          height: '8px',
          borderRadius: '4px',
          background: `linear-gradient(to right, ${cellColor(0)}, ${cellColor(1)})`
        }} />
        <span>{max.toLocaleString()} messages</span>
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
