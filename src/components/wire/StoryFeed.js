'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import StoryCard from './StoryCard';

const spring = { type: 'spring', stiffness: 280, damping: 24 };

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: spring }
};

export default function StoryFeed() {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);

  // Fetch stories on load and page change
  const fetchStories = async (pageNum, append = false) => {
    try {
      if (pageNum === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      const limit = 10;
      const offset = (pageNum - 1) * limit;

      const res = await fetch(`/api/stories?offset=${offset}&limit=${limit}`);
      const data = await res.json();

      if (data.success) {
        setStories(prev => {
          if (append) {
            const existingIds = new Set(prev.map(s => s.id));
            const newStories = data.stories.filter(s => !existingIds.has(s.id));
            return [...prev, ...newStories];
          } else {
            return data.stories;
          }
        });
        
        const total = data.pagination?.total || 0;
        setHasMore(offset + (data.stories?.length || 0) < total);
      } else {
        setError(data.error || 'Failed to retrieve stories');
      }
    } catch (err) {
      console.error('Error fetching stories:', err);
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchStories(1, false);
  }, []);

  // Listen to live SSE updates
  useEffect(() => {
    let eventSource;
    let reconnectTimeout;

    function connectSSE() {
      try {
        eventSource = new EventSource('/api/stories/stream');

        eventSource.onmessage = (event) => {
          try {
            const newStory = JSON.parse(event.data);
            setStories(prev => {
              if (prev.some(s => s.id === newStory.id)) {
                return prev;
              }
              return [newStory, ...prev];
            });
          } catch (e) {
            console.error('Error parsing live story:', e);
          }
        };

        eventSource.onerror = () => {
          eventSource.close();
          reconnectTimeout = setTimeout(connectSSE, 10000);
        };
      } catch (err) {
        console.error('Error establishing SSE stream:', err);
        reconnectTimeout = setTimeout(connectSSE, 10000);
      }
    }

    connectSSE();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, []);

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchStories(nextPage, true);
  };

  // Premium Shimmer Loading Skeletons
  const renderSkeletons = () => (
    <div className="story-feed">
      {[1, 2, 3, 4].map((n) => (
        <div key={n} className="story-card-skeleton">
          <div className="skeleton-header">
            <div className="skeleton-badge shimmer"></div>
            <div className="skeleton-date shimmer"></div>
          </div>
          <div className="skeleton-title shimmer"></div>
          <div className="skeleton-summary shimmer"></div>
          <div className="skeleton-line shimmer"></div>
        </div>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="story-feed-wrapper">
        <h3 className="feed-title">Loading stories...</h3>
        {renderSkeletons()}
      </div>
    );
  }

  if (error && stories.length === 0) {
    return (
      <div className="feed-error-state clay-glass">
        <h4>Could not load stories</h4>
        <p>{error}</p>
        <button className="btn-hero-primary" onClick={() => fetchStories(1, false)}>
          Retry
        </button>
      </div>
    );
  }

  if (stories.length === 0) {
    return (
      <div className="feed-empty-state clay-glass">
        <h4>No stories yet</h4>
        <p>Nothing has been published yet. Check back soon.</p>
      </div>
    );
  }

  return (
    <div className="story-feed-wrapper">
      <div className="feed-header-row">
        <h2 className="feed-title">Latest Stories</h2>
        <span className="feed-count">{stories.length} reports loaded</span>
      </div>

      <AnimatePresence mode="popLayout">
        <motion.div 
          className="story-feed" 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          layout
        >
          {stories.map((story) => (
            <motion.div
              key={story.id}
              variants={itemVariants}
              layout
            >
              <StoryCard story={story} />
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>

      {hasMore && (
        <div className="load-more-container">
          <button 
            className="btn-hero-secondary" 
            onClick={handleLoadMore} 
            disabled={loadingMore}
            style={{ width: '100%', maxWidth: '320px' }}
          >
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}
