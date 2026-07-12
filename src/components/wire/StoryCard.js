'use client';

import Link from 'next/link';
import FlowChart from './FlowChart';
import SectorHeatmap from './SectorHeatmap';

// Map of narrative IDs to readable labels
const NARRATIVE_NAMES = {
  NAR_01: 'Institutional Accumulation',
  NAR_02: 'Retail FOMO',
  NAR_03: 'Regulatory Storm',
  NAR_04: 'AI/Tech Rotation',
  NAR_05: 'DeFi Renaissance',
  NAR_06: 'Risk-Off Flight',
  NAR_07: 'L2/Infra Cycle',
  NAR_08: 'Black Swan',
};

// Custom Markdown Parser to avoid dependency version mismatch errors
function parseMarkdown(text) {
  if (!text) return '';
  
  let html = text;
  
  // Normalize line endings
  html = html.replace(/\r\n/g, '\n');
  
  // 1. Tables (parse before other block elements)
  const lines = html.split('\n');
  let inTable = false;
  let tableRows = [];
  let processedLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      tableRows.push(line);
    } else {
      if (inTable) {
        processedLines.push(convertTableToHTML(tableRows));
        inTable = false;
      }
      processedLines.push(lines[i]);
    }
  }
  if (inTable) {
    processedLines.push(convertTableToHTML(tableRows));
  }
  
  html = processedLines.join('\n');
  
  // 2. Headings
  html = html.replace(/^#### (.*?)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
  
  // 3. Bold & Italic
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');
  
  // 4. Code blocks and inline code
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');
  
  // 5. Bullet Lists
  const listProcessedLines = [];
  let inList = false;
  const finalLines = html.split('\n');
  
  for (let i = 0; i < finalLines.length; i++) {
    const line = finalLines[i];
    const match = line.match(/^[-*]\s+(.*)$/);
    if (match) {
      if (!inList) {
        listProcessedLines.push('<ul>');
        inList = true;
      }
      listProcessedLines.push(`<li>${match[1]}</li>`);
    } else {
      if (inList) {
        listProcessedLines.push('</ul>');
        inList = false;
      }
      listProcessedLines.push(line);
    }
  }
  if (inList) {
    listProcessedLines.push('</ul>');
  }
  
  // 6. Paragraphs (wrap blocks of text that aren't block elements)
  const blocks = listProcessedLines.join('\n').split(/\n\n+/);
  const resultBlocks = blocks.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    if (
      trimmed.startsWith('<h') || 
      trimmed.startsWith('<ul') || 
      trimmed.startsWith('<table') || 
      trimmed.startsWith('<ol') || 
      trimmed.startsWith('<pre')
    ) {
      return trimmed;
    }
    return `<p>${trimmed.replace(/\n/g, '<br />')}</p>`;
  });
  
  return resultBlocks.join('\n');
}

function convertTableToHTML(rows) {
  if (rows.length < 2) return '';
  
  const parsedRows = rows.map(row => {
    const cells = row.split('|').map(c => c.trim());
    if (cells[0] === '') cells.shift();
    if (cells[cells.length - 1] === '') cells.pop();
    return cells;
  });
  
  const headers = parsedRows[0];
  const dataRows = parsedRows.slice(2); // Skip separator row
  
  let html = '<div class="table-container"><table><thead><tr>';
  headers.forEach(h => {
    html += `<th>${h}</th>`;
  });
  html += '</tr></thead><tbody>';
  
  dataRows.forEach(row => {
    html += '<tr>';
    for (let i = 0; i < headers.length; i++) {
      html += `<td>${row[i] || ''}</td>`;
    }
    html += '</tr>';
  });
  
  html += '</tbody></table></div>';
  return html;
}

export default function StoryCard({ story, isDetail = false }) {
  const { id, type, title, body, summary, chart_data, narrative_state, published_at } = story;

  // Format Date (No raw system fallbacks, using clean format)
  const dateFormatted = new Date(published_at).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short'
  });

  // Render markdown body alongside inline charts (Only for details view)
  const renderBodyContent = () => {
    if (!body) return null;

    const parts = body.split(/(\[ETF Flow Trend Chart\]|\[Sector Heatmap\])/g);

    return parts.map((part, index) => {
      if (part === '[ETF Flow Trend Chart]') {
        return (
          <div key={index} className="clay-glass chart-container-card">
            <FlowChart data={chart_data?.etf_flows || []} />
          </div>
        );
      }
      if (part === '[Sector Heatmap]') {
        return (
          <div key={index} className="clay-glass chart-container-card">
            <SectorHeatmap sectors={chart_data?.sectors || []} />
          </div>
        );
      }

      const parsedHtml = parseMarkdown(part);
      return (
        <div 
          key={index} 
          className="story-markdown-body" 
          dangerouslySetInnerHTML={{ __html: parsedHtml }} 
        />
      );
    });
  };

  // Render narrative state tags if available
  const renderNarrativeTags = () => {
    if (!narrative_state) return null;

    const parsedState = typeof narrative_state === 'string' 
      ? JSON.parse(narrative_state) 
      : narrative_state;

    return (
      <div className="narrative-tags-container">
        {Object.entries(parsedState).map(([narId, temp]) => {
          const tempVal = parseFloat(temp);
          return (
            <span key={narId} className="narrative-tag">
              {NARRATIVE_NAMES[narId] || narId} {tempVal.toFixed(1)}°
            </span>
          );
        })}
      </div>
    );
  };

  const cardClasses = `story-card clay-glass ${type === 'breaking' ? 'story-breaking' : ''}`;

  if (isDetail) {
    return (
      <article className="story-detail-wrapper">
        <header className="story-detail-header">
          <div className="story-meta-left">
            <span className={`story-type-badge ${type}`}>
              {type === 'breaking' && 'BREAKING'}
              {type === 'deep_dive' && 'DEEP DIVE'}
              {type === 'pulse' && 'MARKET PULSE'}
            </span>
            <time className="story-date">{dateFormatted}</time>
          </div>
          <h1 className="story-detail-title">{title}</h1>
          {summary && <p className="story-detail-subhead">{summary}</p>}
        </header>

        {type === 'breaking' && chart_data?.execution && (
          <div className="clay-glass breaking-execution-banner">
            <div className="execution-banner-title">EXECUTION DETAILS</div>
            <div className="execution-details-grid">
              <div>
                <span className="execution-detail-label">Asset Pair:</span>{' '}
                <span className="execution-detail-value">{chart_data.execution.pair}</span>
              </div>
              <div>
                <span className="execution-detail-label">Side:</span>{' '}
                <span className="execution-detail-value">{chart_data.execution.side}</span>
              </div>
              <div>
                <span className="execution-detail-label">Quantity:</span>{' '}
                <span className="execution-detail-value">{chart_data.execution.qty}</span>
              </div>
              <div>
                <span className="execution-detail-label">Price:</span>{' '}
                <span className="execution-detail-value">${parseFloat(chart_data.execution.price || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        <hr className="story-divider" />

        <div className="story-body-content">
          {renderBodyContent()}
        </div>
      </article>
    );
  }

  return (
    <article className={cardClasses}>
      <div>
        <header className="story-card-header">
          <div className="story-meta-left">
            <span className={`story-type-badge ${type}`}>
              {type === 'breaking' && 'BREAKING'}
              {type === 'deep_dive' && 'DEEP DIVE'}
              {type === 'pulse' && 'MARKET PULSE'}
            </span>
          </div>
          <time className="story-date">{dateFormatted}</time>
        </header>

        <div className="story-card-content">
          <Link href={`/story/${id}`}>
            <h2 className="story-title" style={{ cursor: 'pointer' }}>{title}</h2>
          </Link>
          {summary && <p className="story-summary-text">{summary}</p>}
        </div>
      </div>

      <div className="story-card-footer">
        {renderNarrativeTags()}
      </div>
    </article>
  );
}
