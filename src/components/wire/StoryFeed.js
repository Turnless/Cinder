'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import StoryReader from './StoryReader';
import { getTruncatedSummary, getRelativeTimeString, getTypeBadgeLabel } from './story-format';

const PAGE_SIZE = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

// Each filter is applied by the stories API (type=...), so every filter pages through its own results
const FILTERS = [
  { id: 'all', label: 'All', none: 'No stories yet. The first ones appear after Cinder’s next hourly check.', match: () => true },
  { id: 'cinder', label: 'Cinder stories', none: 'Cinder hasn’t published any stories yet.', match: s => s.type !== 'news' },
  { id: 'breaking', label: 'Breaking', none: 'No breaking stories yet. Cinder publishes one when it detects a narrative shift.', match: s => s.type === 'breaking' },
  { id: 'pulse', label: 'Market pulse', none: 'No market pulse yet. Cinder publishes one every four hours.', match: s => s.type === 'pulse' },
  { id: 'deep_dive', label: 'Deep dives', none: 'No deep dive yet. Cinder publishes one daily at 08:00 UTC.', match: s => s.type === 'deep_dive' },
  { id: 'news', label: 'News', none: 'No news items yet.', match: s => s.type === 'news' }
];

const apiType = (filterId) => (filterId === 'all' ? '' : `&type=${filterId}`);

// Breaking stories from the last day stay on top; everything else is newest first
function sortStories(stories) {
  const now = Date.now();
  const pinned = s => s.type === 'breaking' && now - new Date(s.published_at).getTime() < DAY_MS;
  return stories.slice().sort((a, b) => {
    if (pinned(a) !== pinned(b)) return pinned(a) ? -1 : 1;
    return new Date(b.published_at) - new Date(a.published_at);
  });
}

function sourceLine(story) {
  const kind = getTypeBadgeLabel(story.type);
  return story.type === 'news' ? `${kind} from ${story.source || 'SoSoValue'}` : `${kind} by Cinder`;
}

export default function StoryFeed() {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [openStory, setOpenStory] = useState(null);
  // Polling and live updates read the current filter without re-subscribing
  const filterRef = useRef('all');

  const fetchStories = async (pageNum, append = false, filterId = filterRef.current) => {
    try {
      if (pageNum === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      const offset = (pageNum - 1) * PAGE_SIZE;
      const pinFetch = filterId === 'all' && pageNum === 1
        // Breaking stories from the last day stay on top of "All" even when newer news fills the first page
        ? fetch('/api/stories?offset=0&limit=5&type=breaking').then(r => r.json()).catch(() => null)
        : Promise.resolve(null);
      const [res, pinned] = await Promise.all([
        fetch(`/api/stories?offset=${offset}&limit=${PAGE_SIZE}${apiType(filterId)}`),
        pinFetch
      ]);
      const data = await res.json();
      // A slower response for a filter the reader has already left is dropped
      if (filterId !== filterRef.current) return;

      if (data.success) {
        const recentBreaking = (pinned?.stories || []).filter(
          s => Date.now() - new Date(s.published_at).getTime() < DAY_MS && !data.stories.some(d => d.id === s.id)
        );
        setStories(prev => {
          if (!append) return [...recentBreaking, ...data.stories];
          const existingIds = new Set(prev.map(s => s.id));
          return [...prev, ...data.stories.filter(s => !existingIds.has(s.id))];
        });
        const total = data.pagination?.total || 0;
        setHasMore(offset + (data.stories?.length || 0) < total);
      } else {
        setError(data.error || 'The stories could not be loaded.');
      }
    } catch (err) {
      console.error('Error fetching stories:', err);
      setError('The stories could not be loaded. Check your connection and try again.');
    } finally {
      if (filterId === filterRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    fetchStories(1, false);
    // Ask the server to pull fresh news; it does so at most every 5 minutes
    fetch('/api/stories?refresh=true&limit=50').catch(() => {});
  }, []);

  // New stories arriving while the page is open: prepend anything not seen yet
  useEffect(() => {
    const prependNew = (incoming) => setStories(prev => {
      const existingIds = new Set(prev.map(s => s.id));
      const match = FILTERS.find(f => f.id === filterRef.current).match;
      const fresh = incoming.filter(s => !existingIds.has(s.id) && match(s));
      return fresh.length ? [...fresh, ...prev] : prev;
    });

    // SSE only reaches visitors on the same server instance (Vercel runs many), so also poll
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/stories?offset=0&limit=${PAGE_SIZE}${apiType(filterRef.current)}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.stories)) prependNew(data.stories);
      } catch {
        // Transient network errors: the next poll or SSE event catches up
      }
    }, 60000);

    let eventSource;
    let reconnectTimeout;
    let destroyed = false;
    const connect = () => {
      if (destroyed) return;
      eventSource = new EventSource('/api/stories/stream');
      eventSource.onmessage = (event) => {
        try {
          prependNew([JSON.parse(event.data)]);
        } catch (e) {
          console.error('Error parsing live story:', e);
        }
      };
      eventSource.onerror = () => {
        eventSource.close();
        if (!destroyed) reconnectTimeout = setTimeout(connect, 10000);
      };
    };
    connect();

    return () => {
      destroyed = true;
      clearInterval(pollInterval);
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  const handleFilter = (filterId) => {
    if (filterId === filterRef.current) return;
    filterRef.current = filterId;
    setFilter(filterId);
    setPage(1);
    setStories([]);
    fetchStories(1, false, filterId);
  };

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchStories(nextPage, true);
  };

  const activeFilter = FILTERS.find(f => f.id === filter);
  const [lead, ...rest] = sortStories(stories);

  return (
    <div className="feed-stories">
      <div className="feed-filters" role="group" aria-label="Show">
        {FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            className="feed-filter"
            aria-pressed={filter === f.id}
            onClick={() => handleFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="feed-loading" aria-label="Loading stories">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="feed-skeleton" style={{ width: `${88 - i * 9}%` }} />
          ))}
        </div>
      )}

      {!loading && error && stories.length === 0 && (
        <div className="feed-message">
          <p>{error}</p>
          <button type="button" className="feed-text-button" onClick={() => fetchStories(1, false)}>
            Try again
          </button>
        </div>
      )}

      {!loading && !error && stories.length === 0 && (
        <div className="feed-message">
          <p>{activeFilter.none}</p>
        </div>
      )}

      {!loading && lead && (
        <>
          <article className="feed-lead">
            <p className={`feed-meta${lead.type === 'breaking' ? ' is-breaking' : ''}`}>
              {sourceLine(lead)}, <time dateTime={lead.published_at}>{getRelativeTimeString(lead.published_at)}</time>
            </p>
            <h2 className="feed-lead-title">
              <button type="button" onClick={() => setOpenStory(lead)}>{lead.title}</button>
            </h2>
            {lead.summary && lead.summary !== lead.title && (
              <p className="feed-lead-summary">{getTruncatedSummary(lead.summary, 320)}</p>
            )}
          </article>

          {rest.length > 0 && (
            <ol className="feed-list">
              {rest.map(story => (
                <li key={story.id}>
                  <button type="button" className="feed-row" onClick={() => setOpenStory(story)}>
                    <time className="feed-row-time" dateTime={story.published_at}>
                      {getRelativeTimeString(story.published_at)}
                    </time>
                    <span className="feed-row-main">
                      <span className="feed-row-title">{story.title}</span>
                      <span className={`feed-meta${story.type === 'breaking' ? ' is-breaking' : ''}`}>
                        {sourceLine(story)}
                      </span>
                      {story.type !== 'news' && story.summary && story.summary !== story.title && (
                        <span className="feed-row-summary">{getTruncatedSummary(story.summary, 180)}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}

          {hasMore && (
            <button type="button" className="feed-more" onClick={handleLoadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading older stories' : 'Load older stories'}
            </button>
          )}
        </>
      )}

      <AnimatePresence>
        {openStory && <StoryReader story={openStory} onClose={() => setOpenStory(null)} />}
      </AnimatePresence>
    </div>
  );
}
