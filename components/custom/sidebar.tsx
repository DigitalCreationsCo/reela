"use client";


import { Music, Mic2, Clapperboard } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Scene Generator', icon: Clapperboard },
  { href: '/music-video-generator', label: 'Music Video Generator', icon: Music },
  { href: '/misheard-lyrics-generator', label: 'Misheard Lyrics Generator', icon: Mic2 },
  // { href: '/lyrics-video-generator', label: 'Lyrics Video Generator', icon: Clapperboard }
];

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="fixed top-0 left-0 w-64 h-[calc(100vh-18px)] pt-20 transition-transform -translate-x-full border-r sm:translate-x-0">
      <div className="h-full px-3 pb-4 overflow-y-auto">
        <ul className="space-y-2 font-medium">
          {navItems.map((item) => (
            <li key={ item.href } className={ cn(
              pathname === item.href && 'underline',
              'hover:underline underline-offset-4'
            ) }>
              <Link
                href={item.href}
                className="flex items-center p-2 rounded-lg group"
              >
                <item.icon className="w-5 h-5 transition duration-75" />
                <span className="text-sm ml-3">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
