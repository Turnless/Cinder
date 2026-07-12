import '../styles/globals.css';
import '../styles/wire.css';
import '../styles/dashboard.css';
import '../styles/portfolio.css';

export const metadata = {
  title: 'AlphaWire | Autonomous Market News & Execution',
  description: 'AI-generated market intelligence with autonomous narrative-driven trade execution.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
