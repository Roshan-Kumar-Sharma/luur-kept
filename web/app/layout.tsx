import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kept Care — should you wash it?',
  description:
    'A care decision engine for clothes. Fibre, construction and what actually happened to the garment in; a care action with its reasoning out.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
