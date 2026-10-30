'use client';

import '../../styles/narrative-panel.css';

function utcTime(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')} UTC`;
}

/**
 * Live narrative temperatures, hottest first. Pass the result of useNarrative().
 * @param {{narrative: Object, as?: string, titleId?: string}} props
 */
export default function NarrativePanel({ narrative, as: Tag = 'aside', titleId = 'temps-title' }) {
  const { status, rows, readAt } = narrative;

  return (
    <Tag className="temp-panel" aria-labelledby={titleId}>
      <h2 id={titleId} className="temp-panel-title">Narrative temperature</h2>
      <p className="temp-panel-caption">
        How hard the market is trading each story right now, from 0 to 100.
      </p>

      {status === 'loading' && (
        <div className="temp-rows" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="temp-row">
              <div className="temp-skeleton" style={{ gridArea: 'name', width: `${70 - i * 5}%` }} />
            </div>
          ))}
        </div>
      )}

      {status === 'ready' && (
        <>
          <ol className="temp-rows">
            {rows.map((row, index) => (
              <li key={row.id} className={`temp-row${index === 0 ? ' is-leader' : ''}`}>
                <span className="temp-row-name">{row.name}</span>
                <span className="temp-row-value">{row.temperature}°</span>
                <span
                  className={`temp-row-delta${row.change > 0 ? ' is-up' : ''}${row.change < 0 ? ' is-down' : ''}`}
                  aria-label={row.change ? `${row.change > 0 ? 'up' : 'down'} ${Math.abs(row.change)} degrees since the last reading` : undefined}
                >
                  {row.change ? `${row.change > 0 ? '+' : '−'}${Math.abs(row.change)}` : ''}
                </span>
                <span className="temp-row-track" aria-hidden="true">
                  <span
                    className="temp-row-fill"
                    style={{ width: `${Math.max(2, Math.min(100, row.temperature))}%`, animationDelay: `${index * 45}ms` }}
                  />
                </span>
              </li>
            ))}
          </ol>
          {readAt && (
            <p className="temp-panel-footer">
              Last reading {utcTime(readAt)}. Changes are against the reading before.
            </p>
          )}
        </>
      )}

      {status === 'empty' && (
        <p className="temp-panel-empty">
          The first reading appears after Cinder&apos;s next hourly check.
        </p>
      )}

      {status === 'error' && (
        <p className="temp-panel-empty">
          Live readings could not be loaded. Refresh the page to try again.
        </p>
      )}
    </Tag>
  );
}
