import { query } from '../../../lib/db';
import Header from '../../../components/shared/Header';
import StoryCard from '../../../components/wire/StoryCard';

export const dynamic = 'force-dynamic';

export default async function StoryDetailPage({ params }) {
  const { id } = params;

  let story = null;
  let relatedStories = [];

  try {
    // Fetch current story details
    const stories = await query(
      `SELECT id, type, title, body, summary, chart_data, narrative_state, published_at 
       FROM stories WHERE id = ?`,
      [id]
    );
    story = stories[0] || null;

    // Fetch related stories (3 latest, excluding current)
    relatedStories = await query(
      `SELECT id, type, title, body, summary, chart_data, narrative_state, published_at 
       FROM stories WHERE id != ? ORDER BY published_at DESC LIMIT 3`,
      [id]
    );
  } catch (err) {
    console.error('Error loading story detail page:', err);
  }

  // Formatting chart_data and narrative_state
  if (story) {
    if (typeof story.chart_data === 'string') {
      try {
        story.chart_data = JSON.parse(story.chart_data);
      } catch (e) {
        story.chart_data = {};
      }
    }
    if (typeof story.narrative_state === 'string') {
      try {
        story.narrative_state = JSON.parse(story.narrative_state);
      } catch (e) {
        story.narrative_state = {};
      }
    }
  }

  return (
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--color-obsidian)' }}>
      <Header />
      
      <div className="container" style={{ padding: '0 var(--space-lg)' }}>
        {!story ? (
          <div className="clay-glass feed-empty-state" style={{ margin: 'var(--space-3xl) auto' }}>
            <h4>Intelligence Report Not Found</h4>
            <p>The requested narrative shift record may have been archived or removed.</p>
            <a href="/" className="btn-hero-primary">
              Return to Feed
            </a>
          </div>
        ) : (
          <>
            {/* Render full story details using StoryCard with isDetail flag */}
            <StoryCard story={story} isDetail={true} />

            {/* Related intelligence row */}
            {relatedStories.length > 0 && (
              <div style={{ maxWidth: '720px', margin: '0 auto var(--space-3xl) auto', paddingTop: 'var(--space-2xl)', borderTop: '1px solid var(--glass-border)' }}>
                <h3 
                  className="section-heading" 
                  style={{ 
                    fontSize: '1.25rem', 
                    marginBottom: 'var(--space-lg)',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700
                  }}
                >
                  Related Intelligence
                </h3>
                
                <div 
                  style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr', 
                    gap: 'var(--space-lg)' 
                  }}
                >
                  {relatedStories.map((relatedStory) => {
                    // Safety parsing for related cards
                    if (typeof relatedStory.narrative_state === 'string') {
                      try {
                        relatedStory.narrative_state = JSON.parse(relatedStory.narrative_state);
                      } catch (e) {}
                    }
                    return (
                      <StoryCard 
                        key={relatedStory.id} 
                        story={relatedStory} 
                        isDetail={false} 
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
