/**
 * Formatting helpers for stories: HTML stripping, XSS-safe markdown rendering, relative times and labels.
 * Shared by StoryArticle, StoryReader, the feed and the story page.
 */

// Strip HTML tags from raw API content
export function stripHtml(text) {
  if (!text) return '';
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// Escape HTML special characters to prevent XSS
export function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getTruncatedSummary(text, maxLength = 120) {
  if (!text) return '';
  const clean = stripHtml(text);
  if (clean.length <= maxLength) return clean;
  return clean.substring(0, maxLength) + '...';
}

// Custom Markdown Parser
export function parseMarkdown(text) {
  if (!text) return '';
  
  // Strip any raw HTML tags first (SoSoValue news often contains HTML)
  let html = stripHtml(text);
  // Escape HTML entities to prevent XSS from markdown content
  html = escapeHtml(html);
  html = html.replace(/\r\n/g, '\n');
  
  // Tables
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
  
  // Headings
  html = html.replace(/^#### (.*?)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
  
  // Bold & Italic
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');
  
  // Inline Code
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');
  
  // Lists
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
  const headers = rows[0]
    .split('|')
    .slice(1, -1)
    .map(h => h.trim());
    
  let html = '<div style="overflow-x:auto; margin: 15px 0;"><table class="data-table"><thead><tr>';
  headers.forEach(header => {
    html += `<th>${header}</th>`;
  });
  html += '</tr></thead><tbody>';
  
  const dataRows = rows.slice(2);
  dataRows.forEach(rowStr => {
    const row = rowStr
      .split('|')
      .slice(1, -1)
      .map(c => c.trim());
      
    html += '<tr>';
    for (let i = 0; i < headers.length; i++) {
      html += `<td>${row[i] || ''}</td>`;
    }
    html += '</tr>';
  });
  
  html += '</tbody></table></div>';
  return html;
}

export function getRelativeTimeString(dateString) {
  if (!dateString) return '';
  const minutes = Math.floor((Date.now() - new Date(dateString).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function getTypeBadgeLabel(type) {
  switch (type) {
    case 'breaking': return 'Breaking';
    case 'deep_dive': return 'Deep dive';
    case 'pulse': return 'Market pulse';
    case 'news': return 'News';
    default: return 'Story';
  }
}
