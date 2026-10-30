'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import StoryArticle from './StoryArticle';
import { getRelativeTimeString, getTypeBadgeLabel } from './story-format';
import '../../styles/reader.css';

/**
 * Full-screen reading view for one story. Render it inside AnimatePresence.
 * @param {{story: Object, onClose: Function}} props
 */
export default function StoryReader({ story, onClose }) {
  const { type, published_at } = story;
  const closeRef = useRef(null);
  // Parents pass a new onClose on every render (the feed re-renders on each poll); keep the latest
  // in a ref so the setup below runs once and focus doesn't jump while someone is reading
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Lock page scroll, start keyboard focus on the close button, close on Escape,
  // and hand focus back to whatever opened the reader when it closes
  useEffect(() => {
    const opener = document.activeElement;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
    };
  }, []);

  const dateFormatted = new Date(published_at).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short'
  });

  return (
    <motion.div
      className="story-modal-wrapper-fixed"
      style={{ zIndex: 2000 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="story-modal-backdrop" onClick={onClose} />

      <motion.div
        className="story-modal-content reader"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reader-title"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="story-modal-header">
          <button ref={closeRef} type="button" onClick={onClose} className="story-modal-back-btn">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M14 8H2M2 8L7 13M2 8L7 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Back to the wire</span>
          </button>
          <span className="reader-meta">
            <span className={type === 'breaking' ? 'reader-kind is-breaking' : 'reader-kind'}>{getTypeBadgeLabel(type)}</span>
            <time dateTime={published_at} title={dateFormatted}>{getRelativeTimeString(published_at)}</time>
          </span>
        </div>

        <div className="story-modal-scroll-area">
          <StoryArticle story={story} titleId="reader-title" />
        </div>
      </motion.div>
    </motion.div>
  );
}
