import Link from 'next/link';
import Header from '../../../components/shared/Header';
import Footer from '../../../components/shared/Footer';
import '../../../styles/reader.css';
import '../../../styles/story-page.css';

export const metadata = { title: 'Story not found | Cinder' };

export default function StoryNotFound() {
  return (
    <main className="story-page">
      <Header />
      <div className="story-wrap">
        <Link href="/feed" className="story-back">Back to the wire</Link>
        <div className="story-missing">
          <h1 className="article-title">Story not found</h1>
          <p>
            It may have been removed, or the link is incomplete. News items from the feed open in the
            reader and do not have their own page.
          </p>
        </div>
      </div>
      <Footer />
    </main>
  );
}
