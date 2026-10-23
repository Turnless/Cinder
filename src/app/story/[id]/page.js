import Link from 'next/link';
import { notFound } from 'next/navigation';
import { query } from '../../../lib/db';
import Header from '../../../components/shared/Header';
import Footer from '../../../components/shared/Footer';
import StoryArticle from '../../../components/wire/StoryArticle';
import { getTypeBadgeLabel } from '../../../components/wire/story-format';
import '../../../styles/story-page.css';

export const dynamic = 'force-dynamic';

async function loadStory(id) {
  const rows = await query(
    `SELECT id, type, title, body, summary, chart_data, narrative_state, published_at
     FROM stories WHERE id = ?`,
    [id]
  );
  const story = rows[0] || null;
  if (!story) return null;

  for (const field of ['chart_data', 'narrative_state']) {
    if (typeof story[field] === 'string') {
      try {
        story[field] = JSON.parse(story[field]);
      } catch {
        story[field] = null;
      }
    }
  }
  // Plain object for the client component (database rows can carry extra prototype fields)
  return JSON.parse(JSON.stringify(story));
}

export async function generateMetadata({ params }) {
  try {
    const story = await loadStory(params.id);
    if (story) {
      return { title: `${story.title} | Cinder`, description: story.summary || undefined };
    }
  } catch {
    // Fall through to the generic title
  }
  return { title: 'Story not found | Cinder' };
}

function utcDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export default async function StoryDetailPage({ params }) {
  const { id } = params;

  let story = null;
  let related = [];
  let loadFailed = false;

  try {
    story = await loadStory(id);
    related = await query(
      `SELECT id, type, title, published_at
       FROM stories WHERE id != ? ORDER BY published_at DESC LIMIT 4`,
      [id]
    );
  } catch (err) {
    console.error('Error loading story detail page:', err);
    loadFailed = true;
  }

  // A missing story is a real 404 (see not-found.js); a failed database read is not
  if (!story && !loadFailed) {
    notFound();
  }

  return (
    <main className="story-page">
      <Header />

      <div className="story-wrap">
        <Link href="/feed" className="story-back">Back to the wire</Link>

        {story ? (
          <StoryArticle story={story} showMeta />
        ) : (
          <div className="story-missing">
            <h1 className="article-title">This story could not be loaded</h1>
            <p>Something went wrong reading the story. Refresh the page to try again.</p>
          </div>
        )}

        {related.length > 0 && (
          <section className="story-more" aria-labelledby="story-more-title">
            <h2 id="story-more-title" className="story-more-title">More from Cinder</h2>
            <ul>
              {related.map(item => (
                <li key={item.id}>
                  <Link href={`/story/${item.id}`} className="story-more-row">
                    <span className="story-more-meta">{getTypeBadgeLabel(item.type)}, {utcDate(item.published_at)}</span>
                    <span className="story-more-headline">{item.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <Footer />
    </main>
  );
}
