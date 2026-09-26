import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Aydra · Print Pilot', description: 'Prepare offset books and pamphlets privately in your browser.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
