// Known TV apps. Identifiers per platform are used by the drivers in later stages.
// NOTE: Android TV links, package names, webOS ids and Tizen ids must be verified on real
// hardware (Stage 2 and Stage 5). Add more apps here and voice commands pick them up.

export interface AppDef {
  id: string;
  name: string;
  aliases: string[];
  androidTvLink?: string;
  androidTvPackage?: string;
  webosId?: string;
  tizenId?: string;
}

export const APPS: AppDef[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    aliases: ['youtube', 'you tube'],
    androidTvLink: 'https://www.youtube.com',
    androidTvPackage: 'com.google.android.youtube.tv',
    webosId: 'youtube.leanback.v4',
    tizenId: '111299001912',
  },
  {
    id: 'netflix',
    name: 'Netflix',
    aliases: ['netflix', 'net flix', 'net flicks'],
    androidTvLink: 'https://www.netflix.com/title',
    androidTvPackage: 'com.netflix.ninja',
    webosId: 'netflix',
    tizenId: '3201907018807',
  },
  {
    id: 'primevideo',
    name: 'Prime Video',
    aliases: ['prime video', 'amazon prime', 'amazon prime video', 'prime', 'amazon video'],
    androidTvLink: 'https://app.primevideo.com',
    androidTvPackage: 'com.amazon.amazonvideo.livingroom',
    webosId: 'amazon',
    tizenId: '3201910019365',
  },
  {
    id: 'disneyplus',
    name: 'Disney+',
    aliases: ['disney plus', 'disney+', 'disney'],
    androidTvLink: 'https://www.disneyplus.com',
    androidTvPackage: 'com.disney.disneyplus',
    webosId: 'com.disney.disneyplus-prod',
    tizenId: '3201901017640',
  },
  {
    id: 'spotify',
    name: 'Spotify',
    aliases: ['spotify'],
    androidTvLink: 'https://open.spotify.com',
    androidTvPackage: 'com.spotify.tv.android',
    webosId: 'spotify-beehive',
    tizenId: '3201606009684',
  },
];

export function findApp(text: string): AppDef | null {
  const t = text.toLowerCase().trim();
  let best: { app: AppDef; len: number } | null = null;
  for (const app of APPS) {
    for (const alias of app.aliases) {
      const re = new RegExp(`(^|\\s)${alias.replace(/[+.*?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
      if (re.test(t) && (!best || alias.length > best.len)) best = { app, len: alias.length };
    }
  }
  return best ? best.app : null;
}
