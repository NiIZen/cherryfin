import type { ReactNode } from 'react';

function Svg({ children, filled }: { children: ReactNode; filled?: boolean }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const PlayIcon = () => <Svg filled><path d="M7.5 4.6c0-1 1.1-1.6 2-1.1l11 6.9c.8.5.8 1.7 0 2.2l-11 6.9c-.9.5-2-.1-2-1.1z" /></Svg>;
export const PauseIcon = () => <Svg filled><rect x="6" y="4" width="4.2" height="16" rx="1.2" /><rect x="13.8" y="4" width="4.2" height="16" rx="1.2" /></Svg>;
export const PlusIcon = () => <Svg><path d="M12 5v14M5 12h14" /></Svg>;
export const CheckIcon = () => <Svg><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>;
export const SearchIcon = () => <Svg><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.3-4.3" /></Svg>;
export const ChevronLeft = () => <Svg><path d="m15 5-7 7 7 7" /></Svg>;
export const ChevronRight = () => <Svg><path d="m9 5 7 7-7 7" /></Svg>;
export const RestartIcon = () => <Svg><path d="M4 12a8 8 0 1 0 2.6-5.9L4 8.5" /><path d="M4 4v4.5h4.5" /></Svg>;
export const SubtitlesIcon = () => <Svg><path d="M4.5 4.5h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H11l-4.5 3.5v-3.5h-2a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z" /><path d="M7 9.5h6M15.5 9.5H17M7 13h3M12.5 13H17" /></Svg>;
export const AudioIcon = () => <Svg><path d="M11 5 6.5 9H3v6h3.5L11 19z" /><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.5 6.2a8.2 8.2 0 0 1 0 11.6" /></Svg>;
export const SpeedIcon = () => <Svg><path d="M4.5 18a9 9 0 1 1 15 0" /><path d="m12 14 4-5" /><circle cx="12" cy="14" r="1.2" /></Svg>;
export const NextIcon = () => <Svg filled><path d="M5 5.6c0-.9 1-1.4 1.700-.9l8 5.9c.6.4.6 1.300 0 1.700l-8 5.900c-.7.5-1.700 0-1.700-.9z" /><rect x="16.500" y="4.500" width="3" height="15" rx="1" /></Svg>;
export const BackspaceIcon = () => <Svg><path d="M21 6H9l-6 6 6 6h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1z" /><path d="m12.500 9.500 5 5M17.500 9.500l-5 5" /></Svg>;
export const SpaceIcon = () => <Svg><path d="M4 10v4h16v-4" /></Svg>;
export const GridIcon = () => <Svg><rect x="4" y="4" width="6.500" height="6.500" rx="1.500" /><rect x="13.500" y="4" width="6.500" height="6.500" rx="1.500" /><rect x="4" y="13.500" width="6.500" height="6.500" rx="1.500" /><rect x="13.500" y="13.500" width="6.500" height="6.500" rx="1.500" /></Svg>;
export const ArrowUpIcon = () => <Svg><path d="M12 19V5M6 11l6-6 6 6" /></Svg>;
export const ArrowDownIcon = () => <Svg><path d="M12 5v14M6 13l6 6 6-6" /></Svg>;
export const SlidersIcon = () => <Svg><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Svg>;
export const ServerIcon = () => <Svg><rect x="3.500" y="4.500" width="17" height="6.500" rx="1.800" /><rect x="3.500" y="13" width="17" height="6.500" rx="1.800" /><path d="M7.500 7.750h.01M7.500 16.250h.01" /></Svg>;
