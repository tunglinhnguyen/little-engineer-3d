import type { ModuleType } from './types';

const drawings:Record<ModuleType,string>={
 'car-base':'<path d="M3 5h18v14H3zM3 9h18M8 5v14M16 5v14"/>',
 'idler-axle':'<path d="M4 12h16"/><rect x="2" y="7" width="3" height="10" rx="1"/><rect x="19" y="7" width="3" height="10" rx="1"/>',
 'cargo-bed':'<path d="M3 7h18v12H3zM3 11h18M8 7v12m8-12v12"/>',
 hitch:'<ellipse cx="12" cy="13" rx="9" ry="6"/><circle cx="12" cy="12" r="3"/><path d="M12 4v8"/>',
 trailer:'<path d="M2 4h20v12H2zM7 4v12m5-12v12m5-12v12M2 16v3"/><circle cx="15" cy="19" r="2"/><circle cx="21" cy="19" r="2"/>',
 battery:'<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M7 7V4h3v3m4 0V4h3v3M7 13h4m-2-2v4m5-2h3"/>',
 switch:'<rect x="3" y="10" width="18" height="10" rx="2"/><path d="m8 13 8-8m-2-2 4 4M7 17h2m6 0h2"/>',
 motor:'<rect x="7" y="6" width="13" height="12" rx="4"/><path d="M2 12h5m13 0h2M10 9v6m4-6v6m-7 3v3m10-3v3"/>',
 gearbox:'<rect x="2" y="3" width="20" height="18" rx="2"/><circle cx="9" cy="10" r="3"/><circle cx="15" cy="15" r="4"/><path d="M9 5v2m-5 3h2m3 3v2m10 0h3"/>',
 differential:'<path d="M2 15h6m8 0h6M12 3v5"/><circle cx="12" cy="14" r="6"/><path d="m8 11 8 6m-8 0 8-6"/>',
 'front-axle':'<path d="M4 12h16M7 9v6m10-6v6m-9-4h8"/><rect x="2" y="7" width="3" height="10" rx="1"/><rect x="19" y="7" width="3" height="10" rx="1"/>',
 'drive-axle':'<path d="M4 12h5m6 0h5"/><rect x="9" y="8" width="6" height="8" rx="2"/><rect x="2" y="7" width="3" height="10" rx="1"/><rect x="19" y="7" width="3" height="10" rx="1"/>',
 wheel:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 6v4m0 4v4M6 12h4m4 0h4"/>',
 'road-straight':'<path d="M6 2v20m12-20v20m-6-20v4m0 4v4m0 4v4"/>',
 'road-curve':'<path d="M3 22C3 9 9 3 22 3M9 22c0-9 4-13 13-13m-16 13v-3m2-5 2-3m5-3 3-1"/>',
 'road-wide-curve':'<path d="M2 22C2 8 8 2 22 2M10 22c0-8 4-12 12-12M6 22C6 11 11 6 22 6"/>',
 'road-intersection':'<path d="M8 2v6H2m14-6v6h6M8 22v-6H2m14 6v-6h6M12 2v3m0 14v3M2 12h3m14 0h3"/>',
 'traffic-light':'<rect x="7" y="2" width="10" height="16" rx="2"/><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="10" r="1.5"/><circle cx="12" cy="14" r="1.5"/><path d="M12 18v4"/>',
 'stop-sign':'<path d="m8 2 8 0 5 5v8l-5 5H8l-5-5V7zM12 20v3"/><text x="12" y="13" text-anchor="middle" fill="currentColor" stroke="none" font-size="6" font-family="sans-serif" font-weight="bold">STOP</text>',
 'speed-sign':'<circle cx="12" cy="10" r="8"/><path d="M12 18v5"/><text x="12" y="13" text-anchor="middle" fill="currentColor" stroke="none" font-size="8" font-family="sans-serif" font-weight="bold">30</text>',
};
export function moduleIcon(type:ModuleType){return `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${drawings[type]}</svg>`;}
