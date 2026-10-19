'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import StoryCard from './StoryCard';
import { useWallet } from '../../context/WalletContext';

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
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } }
};

// Mock Markets data to feed the Edge MSN index widget
const MARKET_INDEXES = [
  { name: 'Cinder Protocol Index', code: 'CNDR/USDC', price: 1.24, change: 5.42, up: true, sparkline: [1.1, 1.15, 1.12, 1.2, 1.22, 1.24] },
  { name: 'Bitcoin Sovereign Index', code: 'BTC/USDC', price: 64250.00, change: 1.85, up: true, sparkline: [63100, 63400, 62900, 63800, 64100, 64250] },
  { name: 'Ethereum Liquid Yield', code: 'ETH/USDC', price: 3421.50, change: -2.14, up: false, sparkline: [3520, 3490, 3460, 3480, 3430, 3421.5] },
  { name: 'Solana High Speed Index', code: 'SOL/USDC', price: 142.80, change: 0.72, up: true, sparkline: [141, 140.5, 143, 142, 141.8, 142.8] }
];

export default function StoryFeed({ temperatureWidget }) {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('Discover');
  const [liveIndices, setLiveIndices] = useState([]);

  useEffect(() => {
    let isMounted = true;
    const fetchLiveIndices = async () => {
      try {
        const response = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbols=[%22BTCUSDT%22,%22ETHUSDT%22,%22SOLUSDT%22]');
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        
        if (!isMounted) return;

        const btcData = data.find(d => d.symbol === 'BTCUSDT');
        const ethData = data.find(d => d.symbol === 'ETHUSDT');
        const solData = data.find(d => d.symbol === 'SOLUSDT');

        const getSparkline = (isUp) => isUp 
          ? [1, 1.05, 1.02, 1.12, 1.08, 1.15]
          : [1.15, 1.1, 1.12, 1.02, 1.08, 1];

        const mapped = [
          {
            name: 'Cinder Protocol Index',
            code: 'CNDR/USDC',
            price: 1.24 + (Math.sin(Date.now() / 60000) * 0.01),
            change: 5.42,
            up: true,
            sparkline: [1.1, 1.15, 1.12, 1.2, 1.22, 1.24]
          },
          {
            name: 'Bitcoin Sovereign Index',
            code: 'BTC/USDC',
            price: btcData ? parseFloat(btcData.lastPrice) : 64250.00,
            change: btcData ? parseFloat(btcData.priceChangePercent) : 1.85,
            up: btcData ? parseFloat(btcData.priceChangePercent) >= 0 : true,
            sparkline: getSparkline(btcData ? parseFloat(btcData.priceChangePercent) >= 0 : true)
          },
          {
            name: 'Ethereum Liquid Yield',
            code: 'ETH/USDC',
            price: ethData ? parseFloat(ethData.lastPrice) : 3421.50,
            change: ethData ? parseFloat(ethData.priceChangePercent) : -2.14,
            up: ethData ? parseFloat(ethData.priceChangePercent) >= 0 : false,
            sparkline: getSparkline(ethData ? parseFloat(ethData.priceChangePercent) >= 0 : false)
          },
          {
            name: 'Solana High Speed Index',
            code: 'SOL/USDC',
            price: solData ? parseFloat(solData.lastPrice) : 142.80,
            change: solData ? parseFloat(solData.priceChangePercent) : 0.72,
            up: solData ? parseFloat(solData.priceChangePercent) >= 0 : true,
            sparkline: getSparkline(solData ? parseFloat(solData.priceChangePercent) >= 0 : true)
          }
        ];

        setLiveIndices(mapped);
      } catch (e) {
        console.error('Failed to load live indices:', e);
        if (isMounted) {
          setLiveIndices(prev => (prev.length === 0 ? MARKET_INDEXES : prev));
        }
      }
    };

    fetchLiveIndices();
    const indexInterval = setInterval(fetchLiveIndices, 15000);
    return () => {
      isMounted = false;
      clearInterval(indexInterval);
    };
  }, []);
  
  const { isConnected } = useWallet();

  const fetchStories = async (pageNum, append = false) => {
    try {
      if (pageNum === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      const limit = 12;
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
    // Background refresh: fetch fresh news from SoSoValue without blocking page
    fetch('/api/stories?refresh=true&limit=50').catch(() => {});
  }, []);

  // SSE only reaches visitors connected to the same server instance (Vercel runs many),
  // so also poll the newest page and prepend anything we haven't seen
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/stories?offset=0&limit=12');
        const data = await res.json();
        if (!data.success || !Array.isArray(data.stories)) return;
        setStories(prev => {
          const existingIds = new Set(prev.map(s => s.id));
          const fresh = data.stories.filter(s => !existingIds.has(s.id));
          return fresh.length > 0 ? [...fresh, ...prev] : prev;
        });
      } catch (err) {
        // Transient network errors: the next poll or SSE event will catch up
      }
    }, 60000);
    return () => clearInterval(pollInterval);
  }, []);

  // Listen to live SSE updates
  useEffect(() => {
    let activeEventSource;
    let reconnectTimeout;
    let destroyed = false;

    function connectSSE() {
      if (destroyed) return;
      try {
        const es = new EventSource('/api/stories/stream');
        activeEventSource = es;

        es.onmessage = (event) => {
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

        es.onerror = () => {
          es.close();
          if (!destroyed) {
            reconnectTimeout = setTimeout(connectSSE, 10000);
          }
        };
      } catch (err) {
        console.error('Error establishing SSE stream:', err);
        if (!destroyed) {
          reconnectTimeout = setTimeout(connectSSE, 10000);
        }
      }
    }

    connectSSE();

    return () => {
      destroyed = true;
      if (activeEventSource) activeEventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchStories(nextPage, true);
  };

  // MSN Shimmer Skeletons
  const renderSkeletons = () => (
    <div className="edge-portal-grid" style={{ marginTop: '20px' }}>
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
        <h3 className="feed-title" style={{ fontFamily: 'var(--font-body)', fontSize: '1rem', color: 'var(--color-sage)' }}>Connecting to Cinder News Wire...</h3>
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

  const sortedStories = stories
    .slice()
    .sort((a, b) => {
      if (a.type === 'breaking' && b.type !== 'breaking') return -1;
      if (a.type !== 'breaking' && b.type === 'breaking') return 1;
      return new Date(b.published_at) - new Date(a.published_at);
    });

  const getFilteredStories = () => {
    if (activeTab === 'Discover') return sortedStories;
    if (activeTab === 'Breaking') return sortedStories.filter(s => s.type === 'breaking');
    if (activeTab === 'Deep Dives') return sortedStories.filter(s => s.type === 'deep_dive');
    if (activeTab === 'Market Pulse') return sortedStories.filter(s => s.type === 'pulse');
    if (activeTab === 'Live News') return sortedStories.filter(s => s.type === 'news');
    return sortedStories;
  };

  const filteredList = getFilteredStories();

  return (
    <div className="story-feed-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      
      {/* MSN-style news portal tab bar */}
      <div className="edge-portal-nav">
        <ul className="edge-portal-tabs">
          {['Discover', 'Live News', 'Breaking', 'Deep Dives', 'Market Pulse'].map((tab) => (
            <li 
              key={tab} 
              className={`edge-portal-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </li>
          ))}
        </ul>
        <button className="edge-portal-personalize">Personalize Feed</button>
      </div>

      <AnimatePresence mode="popLayout">
        <motion.div 
          className="edge-portal-grid"
          variants={containerVariants}
          initial="hidden"
          animate="show"
          layout
        >
          {/* Custom Portal Grid Assembly mapping the MSN screenshots layout */}
          
          {/* Item 1: Left Featured Card (Wide, spans 2 columns) */}
          {filteredList[0] && (
            <motion.div key={filteredList[0].id} className="edge-card-span-2" variants={itemVariants} layout>
              <StoryCard story={filteredList[0]} isWide={true} />
            </motion.div>
          )}

          {/* Item 2: Standard Card (1 column) */}
          {filteredList[1] && (
            <motion.div key={filteredList[1].id} variants={itemVariants} layout>
              <StoryCard story={filteredList[1]} />
            </motion.div>
          )}

          {/* Item 3: Markets Indexes Widget (1 column) */}
          <motion.div key="markets-widget" className="edge-card-base clay-glass" variants={itemVariants} layout>
            <div className="edge-widget-markets">
              <div className="edge-widget-header">
                <span className="edge-widget-title">
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-pulse-green)', marginRight: '4px' }} />
                  Live Indices
                </span>
                <span style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--color-sage)' }}>SoDEX</span>
              </div>
              
              {(liveIndices.length > 0 ? liveIndices : MARKET_INDEXES).map((idx) => (
                <div key={idx.code} className="edge-market-row">
                  <div>
                    <span className="edge-market-name">{idx.code}</span>
                    <span className="edge-market-code">{idx.name.split(' ')[0]}</span>
                  </div>
                  
                  {/* SVG Sparkline */}
                  <svg width="45" height="18" style={{ overflow: 'visible' }}>
                    <path 
                      d={`M ${idx.sparkline.map((val, i) => `${(i * 9)} ${18 - ((val - Math.min(...idx.sparkline)) / (Math.max(...idx.sparkline) - Math.min(...idx.sparkline) || 1)) * 14}`).join(' L ')}`} 
                      fill="none" 
                      stroke={idx.up ? 'var(--color-pulse-green)' : 'var(--color-shift-red)'} 
                      strokeWidth="1.5" 
                      strokeLinecap="round"
                    />
                  </svg>

                  <div style={{ textAlign: 'right' }}>
                    <span className="edge-market-price" style={{ display: 'block', color: 'var(--color-linen)' }}>
                      ${idx.price >= 1000 ? idx.price.toLocaleString() : idx.price.toFixed(2)}
                    </span>
                    <span 
                      className="edge-market-change" 
                      style={{ 
                        color: idx.up ? 'var(--color-pulse-green)' : 'var(--color-shift-red)',
                        background: idx.up ? 'rgba(74, 222, 128, 0.05)' : 'rgba(239, 68, 68, 0.05)' 
                      }}
                    >
                      {idx.up ? '+' : ''}{idx.change}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Item 4: Standard Card (1 column) */}
          {filteredList[2] && (
            <motion.div 
              key={filteredList[2].id} 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ type: 'spring', stiffness: 100, damping: 20 }}
              layout
            >
              <StoryCard story={filteredList[2]} />
            </motion.div>
          )}

          {/* Item 5: Standard Card (1 column) */}
          {filteredList[3] && (
            <motion.div 
              key={filteredList[3].id} 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ type: 'spring', stiffness: 100, damping: 20 }}
              layout
            >
              <StoryCard story={filteredList[3]} />
            </motion.div>
          )}

          {/* Item 6: Weather-styled Market Temperature Gauge Widget (Wide, spans 2 columns) */}
          {temperatureWidget && (
            <motion.div 
              key="weather-widget" 
              className="edge-card-span-2" 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ type: 'spring', stiffness: 100, damping: 20 }}
              layout
            >
              <div className="edge-card-base clay-glass" style={{ height: '100%' }}>
                <div className="edge-widget-weather">
                  {temperatureWidget}
                </div>
              </div>
            </motion.div>
          )}

          {/* Item 7: Second Wide Card (Wide, spans 2 columns) */}
          {filteredList[4] && (
            <motion.div 
              key={filteredList[4].id} 
              className="edge-card-span-2" 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ type: 'spring', stiffness: 100, damping: 20 }}
              layout
            >
              <StoryCard story={filteredList[4]} isWide={true} />
            </motion.div>
          )}

          {/* Item 8: Standard Card (1 column) */}
          {filteredList[5] && (
            <motion.div 
              key={filteredList[5].id} 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ type: 'spring', stiffness: 100, damping: 20 }}
              layout
            >
              <StoryCard story={filteredList[5]} />
            </motion.div>
          )}

          {/* Item 9: Headlines Bullet Stack Widget (1 column) */}
          {filteredList.length > 6 && (
            <motion.div 
              key="headlines-widget" 
              className="edge-card-base clay-glass" 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ type: 'spring', stiffness: 100, damping: 20 }}
              layout
            >
              <div className="edge-widget-headlines">
                <div className="edge-widget-header">
                  <span className="edge-widget-title">
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-wire-gold)', marginRight: '4px' }} />
                    Top Headlines
                  </span>
                  <span style={{ fontSize: '0.62rem', color: 'var(--color-sage)' }}>Wire</span>
                </div>
                
                {filteredList.slice(6, 9).map((story) => (
                  <div key={story.id} className="edge-headline-item">
                    <span className="edge-headline-source">{story.type === 'breaking' ? 'Breaking' : 'Intelligence'}</span>
                    <span className="edge-headline-title">{story.title}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Subsequent items rendered as standard cards */}
          {filteredList.slice(9).map((story) => (
            <motion.div 
              key={story.id} 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ type: 'spring', stiffness: 100, damping: 20 }}
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
