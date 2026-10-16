import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getAllBots, getAppConfig, SupabaseAppConfig } from '@/services/adminSupabase'; // Import service and getAllBots
import { fetchLocalBots } from '@/utils/local-bots';
import { isSupabaseConfigured, supabase } from '@/utils/supabaseClient'; // Import supabase client

export interface Bot {
    id: string;
    name: string;
    description: string;
    icon?: string;
    file: string; // Path to XML in Storage
    difficulty?: string;
    strategy?: string;
    features?: string[];
}

export interface Channels {
    whatsapp: string;
    telegram: string;
    email: string;
    discord?: string;
}

export interface AppConfig {
    channels: Channels;
    appName: string;
    supportEmail: string;
    bots: Bot[]; // Now includes bots
}

const defaultConfig: AppConfig = {
    channels: { whatsapp: '', telegram: '', email: '', discord: '' },
    appName: 'PulseTrader',
    supportEmail: 'support@pulsetrader.com',
    bots: [], // Initialize bots array
};

interface ConfigContextType {
    config: AppConfig;
    loading: boolean;
    refreshAppConfig: () => Promise<void>; // Renamed for clarity
    refreshBots: () => Promise<void>; // New: for refreshing bots separately
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [config, setConfig] = useState<AppConfig>(defaultConfig);
    const [loading, setLoading] = useState(true);

    // Function to refresh only the app config (channels, appName, supportEmail)
    const refreshAppConfig = useCallback(async () => {
        if (!isSupabaseConfigured) return; // Local mode: keep default config
        try {
            const data = await getAppConfig();
            if (data) {
                setConfig(prevConfig => ({
                    ...prevConfig,
                    channels: data.channels ?? defaultConfig.channels,
                    appName: data.app_name ?? defaultConfig.appName,
                    supportEmail: data.support_email ?? defaultConfig.supportEmail,
                }));
            } else {
                console.error('Failed to load app config from Supabase.');
                setConfig(prevConfig => ({
                    ...prevConfig,
                    channels: defaultConfig.channels,
                    appName: defaultConfig.appName,
                    supportEmail: defaultConfig.supportEmail,
                }));
            }
        } catch (error) {
            console.error('Failed to load app config from Supabase:', error);
            setConfig(prevConfig => ({
                ...prevConfig,
                channels: defaultConfig.channels,
                appName: defaultConfig.appName,
                supportEmail: defaultConfig.supportEmail,
            }));
        }
    }, []);

    // Function to refresh only the bots list
    const refreshBots = useCallback(async () => {
        let botsData: Bot[] = [];
        if (isSupabaseConfigured) {
            try {
                botsData = ((await getAllBots()) as unknown as Bot[]) || [];
            } catch (error) {
                console.error('Failed to load bots from Supabase:', error);
            }
        }
        // Local fallback: use the bundled XML files when Supabase is off, unreachable or empty
        if (botsData.length === 0) {
            botsData = await fetchLocalBots();
        }
        setConfig(prevConfig => ({ ...prevConfig, bots: botsData }));
    }, []);

    useEffect(() => {
        // Initial fetches
        Promise.all([refreshAppConfig(), refreshBots()]).finally(() => setLoading(false));

        if (!isSupabaseConfigured) return undefined; // No realtime subscriptions in local mode

        // Real-time subscription for app_config changes
        const appConfigSubscription = supabase
            .channel('app_config_changes')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_config' }, payload => {
                const updatedConfig = payload.new as SupabaseAppConfig;
                setConfig(prevConfig => ({
                    ...prevConfig,
                    channels: updatedConfig.channels,
                    appName: updatedConfig.app_name,
                    supportEmail: updatedConfig.support_email,
                }));
                console.log('Real-time app config update received:', updatedConfig);
            })
            .subscribe();

        // Real-time subscription for bots table changes (INSERT, UPDATE, DELETE)
        const botsSubscription = supabase
            .channel('bots_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'bots' }, // Listen to all events: INSERT, UPDATE, DELETE
                payload => {
                    console.log('Real-time bots update received:', payload);
                    // When a change occurs, re-fetch the entire bots list
                    refreshBots();
                }
            )
            .subscribe();

        return () => {
            appConfigSubscription.unsubscribe();
            botsSubscription.unsubscribe();
        };
    }, [refreshAppConfig, refreshBots]); // Dependencies for useCallback

    return (
        <ConfigContext.Provider value={{ config, loading, refreshAppConfig, refreshBots }}>
            {children}
        </ConfigContext.Provider>
    );
};

export const useConfig = () => {
    const context = useContext(ConfigContext);
    if (context === undefined) {
        throw new Error('useConfig must be used within ConfigProvider');
    }
    return context;
};
