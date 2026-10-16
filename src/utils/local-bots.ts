/**
 * Local (no-backend) source for the Free Bots tab.
 * Bots are listed in public/xml/manifest.json and their XML lives next to it in public/xml.
 * Entries use a `local:` file prefix so they are never sent to Supabase Storage.
 */
import type { Bot } from '@/contexts/ConfigContext';

export const LOCAL_BOT_PREFIX = 'local:';

export const isLocalBotFile = (file: string) => file.startsWith(LOCAL_BOT_PREFIX);

export const getLocalBotUrl = (file: string) =>
    `/xml/${encodeURIComponent(file.slice(LOCAL_BOT_PREFIX.length))}`;

export const fetchLocalBots = async (): Promise<Bot[]> => {
    try {
        const res = await fetch('/xml/manifest.json', { cache: 'no-cache' });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? (data as Bot[]) : [];
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Could not load local bots manifest:', e);
        return [];
    }
};
