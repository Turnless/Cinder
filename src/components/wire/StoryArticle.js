'use client';

import { Suspense, lazy } from 'react';
import SectorHeatmap from './SectorHeatmap';
import { NARRATIVE_NAMES } from '../../lib/narratives';
import { getTruncatedSummary, parseMarkdown, getRelativeTimeString, getTypeBadgeLabel } from './story-format';
import '../../styles/reader.css';

const FlowChart = lazy(() => import('./FlowChart'));

function parseNarrativeState(narrativeState) {
  if (!narrativeState) return null;
  try {
    const parsed = typeof narrativeState === 'string' ? JSON.parse(narrativeState) : narrativeState;
    return parsed && Object.keys(parsed).length ? parsed : null;
  } catch {
    return null;
  }
}

// Stories are written with the headline as their first markdown line ("# Headline"), which the
// engine also stores as the title; drop that line so the headline isn't shown twice
function withoutLeadingTitle(body, title) {
  const lines = body.split('\n');
  const first = lines.findIndex(line => line.trim());
  if (first !== -1 && /^#{1,6}\s/.test(lines[first].trim())
    && lines[first].trim().replace(/^#+\s*/, '') === String(title || '').trim()) {
    lines.splice(first, 1);
  }
  return lines.join('\n');
}

/**
 * The full text of one story: headline, standfirst, trade, body with charts and the
 * narrative temperatures at publication. Used by the reader pop-up and the story page.
 * @param {{story: Object, titleId?: string, showMeta?: boolean}} props
 */
export default function StoryArticle({ story, titleId = 'article-title', showMeta = false }) {
  const { type, title, body, summary, chart_data, narrative_state, published_at } = story;
  const narratives = parseNarrativeState(narrative_state);

  const dateFormatted = new Date(published_at).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
    timeZoneName: 'short'
  });

  const renderBody = () => {
    if (!body) return null;
    return withoutLeadingTitle(body, title).split(/(\[ETF Flow Trend Chart\]|\[Sector Heatmap\])/g).map((part, index) => {
      if (part === '[ETF Flow Trend Chart]') {
        return (
          <div key={index} className="reader-chart">
            <Suspense fallback={<div className="reader-chart-loading">Loading chart</div>}>
              <FlowChart data={chart_data?.etf_flows || []} />
            </Suspense>
          </div>
        );
      }
      if (part === '[Sector Heatmap]') {
        return (
          <div key={index} className="reader-chart">
            <SectorHeatmap sectors={chart_data?.sectors || []} />
          </div>
        );
      }
      // parseMarkdown strips raw HTML and escapes the rest before adding markup
      return <div key={index} className="story-markdown-body" dangerouslySetInnerHTML={{ __html: parseMarkdown(part) }} />;
    });
  };

  return (
    <article className="article">
      {showMeta && (
        <p className="article-meta">
          <span className={type === 'breaking' ? 'reader-kind is-breaking' : 'reader-kind'}>
            {getTypeBadgeLabel(type)}{type === 'news' ? '' : ' by Cinder'}
          </span>
          <time dateTime={published_at} title={getRelativeTimeString(published_at)}>{dateFormatted}</time>
        </p>
      )}

      <h1 id={titleId} className="article-title">{title}</h1>
      {/* News items carry their summary as the body, so only Cinder's own stories get a standfirst */}
      {type !== 'news' && summary && summary !== title && (
        <p className="article-standfirst">{getTruncatedSummary(summary, 300)}</p>
      )}

      {type === 'breaking' && chart_data?.execution && (
        <dl className="reader-trade">
          <dt>Trade placed</dt>
          <dd>
            {chart_data.execution.side} {chart_data.execution.qty} {chart_data.execution.pair} at ${parseFloat(chart_data.execution.price || 0).toFixed(2)}
          </dd>
        </dl>
      )}

      <div className="reader-body">
        {renderBody()}
      </div>

      {narratives && (
        <div className="reader-narratives">
          <h2>Narrative temperatures when this was published</h2>
          <ul>
            {Object.entries(narratives)
              .sort((a, b) => parseFloat(b[1]) - parseFloat(a[1]))
              .map(([id, temp]) => (
                <li key={id}>
                  <span>{NARRATIVE_NAMES[id] || id}</span>
                  <span className="reader-narrative-value">{parseFloat(temp).toFixed(0)}°</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </article>
  );
}
