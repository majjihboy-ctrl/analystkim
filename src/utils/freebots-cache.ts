import localforage from 'localforage';
import LZString from 'lz-string';
import { getAllBots, getBotXmlPublicUrl } from '@/services/adminSupabase'; // Import from service
import { getLocalBotUrl, isLocalBotFile } from '@/utils/local-bots';

export type TBotsManifestItem = {
    id: string; // Add id
    name: string;
    file: string; // Path to XML in Supabase Storage
    description?: string;
    difficulty?: string;
    strategy?: string;
    features?: string[];
};

const XML_CACHE_PREFIX = 'freebots:xml:';

// In-memory cache for faster access
const memoryCache = new Map<string, string>();

// Removed XML_BASE and related functions as we'll use Supabase Storage URLs

const decompress = (data: string | null) => (data ? LZString.decompressFromUTF16(data) : null);
const compress = (data: string) => LZString.compressToUTF16(data);

export const getCachedXml = async (file: string): Promise<string | null> => {
    try {
        const key = `${XML_CACHE_PREFIX}${file}`;
        const cached = (await localforage.getItem<string>(key)) || null;
        return decompress(cached);
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('freebots-cache:getCachedXml error', e);
        return null;
    }
};

export const setCachedXml = async (file: string, xml: string) => {
    try {
        const key = `${XML_CACHE_PREFIX}${file}`;
        await localforage.setItem(key, compress(xml));
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('freebots-cache:setCachedXml error', e);
    }
};

export const fetchXmlWithCache = async (file: string): Promise<string | null> => {
    // Check memory cache first
    if (memoryCache.has(file)) {
        return memoryCache.get(file)!;
    }

    // Check persistent cache
    const cached = await getCachedXml(file);
    if (cached) {
        memoryCache.set(file, cached); // Store in memory for faster access
        return cached;
    }

    try {
        const publicUrl = isLocalBotFile(file) ? getLocalBotUrl(file) : getBotXmlPublicUrl(file);
        if (!publicUrl) {
            console.warn(`freebots-cache: No public URL found for bot XML: ${file}`);
            return null;
        }

        const res = await fetch(publicUrl);

        if (!res.ok) {
            // Silently handle 404s for missing files (don't spam console)
            if (res.status === 404) {
                return null;
            }
            throw new Error(`Failed to fetch ${file} from Supabase Storage: ${res.status}`);
        }
        const xml = await res.text();

        // Store in both caches
        memoryCache.set(file, xml);
        await setCachedXml(file, xml);
        return xml;
    } catch (e: any) {
        // Only log non-404 errors to reduce console noise
        if (e?.message && !e.message.includes('404')) {
            // eslint-disable-next-line no-console
            console.warn('freebots-cache:fetchXmlWithCache error', e);
        }
        return null;
    }
};

export const prefetchAllXmlInBackground = async (files: string[]) => {
    // Fire-and-forget prefetch with throttling to avoid overwhelming the browser
    const batchSize = 3; // Load 3 files at a time
    for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        await Promise.allSettled(batch.map(file => fetchXmlWithCache(file)));
        // Small delay between batches to prevent blocking
        if (i + batchSize < files.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
};

export const getBotsManifest = async (): Promise<TBotsManifestItem[] | null> => {
    try {
        const botsData = await getAllBots(); // Fetch from Supabase
        if (!botsData) return null;

        // Map SupabaseBot to TBotsManifestItem (SupabaseBot is a superset)
        const manifest: TBotsManifestItem[] = botsData.map(bot => ({
            id: bot.id,
            name: bot.name,
            file: bot.file,
            description: bot.description,
            difficulty: bot.difficulty,
            strategy: bot.strategy,
            features: bot.features,
        }));

        return manifest;
    } catch (e) {
        console.warn('freebots-cache:getBotsManifest error', e);
        return null;
    }
};
