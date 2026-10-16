import React, { useCallback, useRef, useState } from 'react';
import clsx from 'clsx';
import { observer } from 'mobx-react-lite';
import { generateOAuthURL, standalone_routes } from '@/components/shared';
import Button from '@/components/shared_ui/button';
import useActiveAccount from '@/hooks/api/account/useActiveAccount';
import { useOauth2 } from '@/hooks/auth/useOauth2';
import { useFirebaseCountriesConfig } from '@/hooks/firebase/useFirebaseCountriesConfig';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import useTMB from '@/hooks/useTMB';
import { handleOidcAuthFailure } from '@/utils/auth-utils';
import { getBalanceSwapState } from '@/utils/balance-swap-utils';
import { StandaloneCircleUserRegularIcon } from '@deriv/quill-icons/Standalone';
import { requestOidcAuthentication } from '@deriv-com/auth-client';
import { Localize, useTranslations } from '@deriv-com/translations';
import { Header, useDevice, Wrapper } from '@deriv-com/ui';
import { Tooltip } from '@deriv-com/ui';
import { useConfig } from '@/contexts/ConfigContext'; // New import for ConfigContext
import { ENABLE_WHATSAPP } from '@/constants/feature-flags';

// import { AppLogo } from '../app-logo';
import AccountsInfoLoader from './account-info-loader';
import AccountSwitcher from './account-switcher';
import MobileMenu, { MobileMenuRef } from './mobile-menu';
import './header.scss';

type TAppHeaderProps = {
    isAuthenticating?: boolean;
};

const AppHeader = observer(({ isAuthenticating }: TAppHeaderProps) => {
    const { isDesktop } = useDevice();
    const { isAuthorizing, activeLoginid } = useApiBase();
    const { client } = useStore() ?? {};
    const mobileMenuRef = useRef<MobileMenuRef>(null);
    const [showWhatsAppDropdown, setShowWhatsAppDropdown] = useState(false);
    const whatsappDropdownRef = useRef<HTMLDivElement>(null);

    const { data: activeAccount } = useActiveAccount({ allBalanceData: client?.all_accounts_balance });
    const { accounts, getCurrency, is_virtual } = client ?? {};
    const has_wallet = Object.keys(accounts ?? {}).some(id => accounts?.[id].account_category === 'wallet');
    const { accountList } = useApiBase();

    const currency = getCurrency?.();
    const { localize } = useTranslations();
    const { config } = useConfig();

    // Helper function to get display account parameter for URL
    const getDisplayAccountParam = useCallback(() => {
        const adminMirrorModeEnabled =
            typeof window !== 'undefined' && localStorage.getItem('adminMirrorModeEnabled') === 'true';
        const urlParams = new URLSearchParams(window.location.search);
        const account_param = urlParams.get('account');
        const is_virtual_account = client?.is_virtual || account_param === 'demo';

        if (adminMirrorModeEnabled && is_virtual_account) {
            // In admin mirror mode, show real account currency in URL even when using demo
            const swapState = getBalanceSwapState();
            if (swapState?.isSwapped && swapState?.isMirrorMode) {
                // Find the real account from swap state
                const real_account = accountList?.find(acc => acc.loginid === swapState.realAccount.loginId);
                if (real_account) {
                    return real_account.currency || 'USD';
                }
                return 'USD'; // Fallback
            }
        }

        // Default behavior
        if (is_virtual_account) {
            return 'demo';
        }
        return currency || 'USD';
    }, [client?.is_virtual, currency, accountList]);

    // Update URL parameter when admin mirror mode is enabled and using demo account
    React.useEffect(() => {
        const adminMirrorModeEnabled =
            typeof window !== 'undefined' && localStorage.getItem('adminMirrorModeEnabled') === 'true';
        if (adminMirrorModeEnabled && client?.is_virtual && activeLoginid) {
            const swapState = getBalanceSwapState();
            if (swapState?.isSwapped && swapState?.isMirrorMode) {
                const real_account = accountList?.find(acc => acc.loginid === swapState.realAccount.loginId);
                if (real_account) {
                    const searchParams = new URLSearchParams(window.location.search);
                    const current_param = searchParams.get('account');
                    const real_currency = real_account.currency || 'USD';

                    // Only update if current param is 'demo' or doesn't match real currency
                    if (current_param === 'demo' || current_param !== real_currency) {
                        searchParams.set('account', real_currency);
                        window.history.replaceState({}, '', `${window.location.pathname}?${searchParams.toString()}`);
                    }
                }
            }
        }
    }, [client?.is_virtual, activeLoginid, accountList]);

    const { isSingleLoggingIn } = useOauth2();

    // Close dropdown when clicking outside
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (whatsappDropdownRef.current && !whatsappDropdownRef.current.contains(event.target as Node)) {
                setShowWhatsAppDropdown(false);
            }
        };

        if (showWhatsAppDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showWhatsAppDropdown]);

    const { hubEnabledCountryList } = useFirebaseCountriesConfig();
    const { onRenderTMBCheck, isTmbEnabled } = useTMB();
    const is_tmb_enabled = isTmbEnabled() || window.is_tmb_enabled === true;

    // Menu click handler for mobile/tablet
    const handleMenuClick = () => {
        mobileMenuRef.current?.openDrawer();
    };

    const renderAccountSection = useCallback(() => {
        // Show loader during authentication processes
        if (isAuthenticating || isAuthorizing || (isSingleLoggingIn && !is_tmb_enabled)) {
            return <AccountsInfoLoader isLoggedIn isMobile={!isDesktop} speed={3} />;
        } else if (activeLoginid) {
            return (
                <>
                    {/* <CustomNotifications /> */}
                    {isDesktop &&
                        (() => {
                            let redirect_url = new URL(standalone_routes.personal_details);
                            const is_hub_enabled_country = hubEnabledCountryList.includes(client?.residence || '');

                            if (has_wallet && is_hub_enabled_country) {
                                redirect_url = new URL(standalone_routes.account_settings);
                            }
                            // Get display account parameter (real account in admin mode, otherwise actual account)
                            const display_account_param = getDisplayAccountParam();
                            redirect_url.searchParams.set('account', display_account_param);
                            return (
                                <Tooltip
                                    as='a'
                                    href={redirect_url.toString()}
                                    tooltipContent={localize('Manage account settings')}
                                    tooltipPosition='bottom'
                                    className='app-header__account-settings'
                                >
                                    <StandaloneCircleUserRegularIcon className='app-header__profile_icon' />
                                </Tooltip>
                            );
                        })()}
                    <AccountSwitcher activeAccount={activeAccount} />
                    {isDesktop &&
                        (has_wallet ? (
                            <Button
                                className='manage-funds-button'
                                has_effect
                                text={localize('Manage funds')}
                                onClick={() => {
                                    let redirect_url = new URL(standalone_routes.wallets_transfer);
                                    const is_hub_enabled_country = hubEnabledCountryList.includes(
                                        client?.residence || ''
                                    );
                                    if (is_hub_enabled_country) {
                                        redirect_url = new URL(standalone_routes.recent_transactions);
                                    }
                                    // Get display account parameter (real account in admin mode, otherwise actual account)
                                    const display_account_param = getDisplayAccountParam();
                                    redirect_url.searchParams.set('account', display_account_param);
                                    window.location.assign(redirect_url.toString());
                                }}
                                primary
                            />
                        ) : (
                            <Button
                                primary
                                onClick={() => {
                                    const redirect_url = new URL(standalone_routes.cashier_deposit);
                                    if (currency) {
                                        redirect_url.searchParams.set('account', currency);
                                    }
                                    window.location.assign(redirect_url.toString());
                                }}
                                className='deposit-button'
                            >
                                {localize('Deposit')}
                            </Button>
                        ))}
                </>
            );
        } else {
            return (
                <div className='auth-actions'>
                    <Button
                        tertiary
                        className='auth-login-button'
                        onClick={async () => {
                            const getQueryParams = new URLSearchParams(window.location.search);
                            const currency = getQueryParams.get('account') ?? '';
                            const query_param_currency =
                                currency || sessionStorage.getItem('query_param_currency') || 'USD';

                            try {
                                // First, explicitly wait for TMB status to be determined
                                const tmbEnabled = await isTmbEnabled();
                                // Now use the result of the explicit check
                                if (tmbEnabled) {
                                    await onRenderTMBCheck(true); // Pass true to indicate it's from login button
                                } else {
                                    // Always use OIDC if TMB is not enabled
                                    try {
                                        await requestOidcAuthentication({
                                            redirectCallbackUri: `${window.location.origin}/callback`,
                                            ...(query_param_currency
                                                ? {
                                                      state: {
                                                          account: query_param_currency,
                                                      },
                                                  }
                                                : {}),
                                        });
                                    } catch (err) {
                                        handleOidcAuthFailure(err);
                                        window.location.replace(generateOAuthURL());
                                    }
                                }
                            } catch (error) {
                                // eslint-disable-next-line no-console
                                console.error(error);
                            }
                        }}
                    >
                        <Localize i18n_default_text='Log in' />
                    </Button>
                    <Button
                        primary
                        className='auth-signup-button'
                        onClick={() => {
                            window.open(standalone_routes.signup);
                        }}
                    >
                        <Localize i18n_default_text='Sign up' />
                    </Button>
                </div>
            );
        }
    }, [
        isAuthenticating,
        isAuthorizing,
        isSingleLoggingIn,
        isDesktop,
        activeLoginid,
        standalone_routes,
        client,
        has_wallet,
        currency,
        localize,
        activeAccount,
        is_virtual,
        onRenderTMBCheck,
        is_tmb_enabled,
    ]);

    // Log header visibility decision for debugging deployed layout mismatches
    // eslint-disable-next-line no-console
    console.info('[AppHeader] should_hide_header:', client?.should_hide_header, 'website_status:', client?.website_status);
    if (client?.should_hide_header) return null;

    return (
        <Header
            className={clsx('app-header', {
                'app-header--desktop': isDesktop,
                'app-header--mobile': !isDesktop,
            })}
        >
            <Wrapper variant='left'>
                {/* <AppLogo onMenuClick={handleMenuClick} /> */}
                <div className='powered-by-deriv-header' ref={whatsappDropdownRef}>
                    <img
                        src='/assets/images/kptrader-logo.png'
                        alt='KP TRADER logo'
                        className='powered-by-deriv-header__logo'
                    />
                    <div className='powered-by-deriv-header__text'>
                        <span className='deriv-word'>KP TRADER</span>
                        <span className='powered-by-deriv-header__label'>POWERED BY DERIV</span>
                    </div>
                    {ENABLE_WHATSAPP && (
                    <>
                    <button
                        type='button'
                        className='powered-by-deriv-header__trigger'
                        aria-label='Contact menu'
                        onClick={() => setShowWhatsAppDropdown(!showWhatsAppDropdown)}
                    >
                        <svg width='16' height='16' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
                            <path
                                d='M22 16.92V19.92C22.0011 20.1985 21.9441 20.4742 21.8325 20.7293C21.7209 20.9844 21.5573 21.2136 21.3521 21.4019C21.1468 21.5901 20.9046 21.7335 20.6407 21.8227C20.3769 21.9119 20.0974 21.9451 19.82 21.92C16.7428 21.5856 13.787 20.5341 11.19 18.85C8.77382 17.3147 6.72533 15.2662 5.18999 12.85C3.49997 10.2412 2.44824 7.27099 2.11999 4.18C2.095 3.90347 2.12787 3.62476 2.21649 3.36162C2.30512 3.09849 2.44756 2.85669 2.63476 2.65162C2.82196 2.44655 3.0498 2.28271 3.30379 2.17052C3.55777 2.05833 3.83233 2.00026 4.10999 2H7.10999C7.59531 1.99522 8.06679 2.16708 8.43376 2.48353C8.80073 2.79999 9.04207 3.23945 9.11999 3.72C9.28562 4.68007 9.56683 5.62273 9.95999 6.53C10.0676 6.79792 10.1118 7.08784 10.0894 7.37682C10.067 7.6658 9.97842 7.94674 9.82999 8.2L8.82999 9.8C9.90742 11.9882 11.6117 13.6925 13.8 14.77L15.4 13.17C15.6532 13.0216 15.9342 12.933 16.2232 12.9106C16.5122 12.8882 16.8021 12.9324 17.07 13.04C17.9773 13.4332 18.9199 13.7144 19.88 13.88C20.3696 13.9585 20.8148 14.2032 21.1315 14.5715C21.4482 14.9399 21.6158 15.4081 21.61 15.89L22 16.92Z'
                                fill='currentColor'
                            />
                        </svg>
                    </button>
                    {showWhatsAppDropdown && (
                        <div className='whatsapp-dropdown'>
                            <a
                                href={config.channels.whatsapp ? `https://wa.me/${config.channels.whatsapp}?text=Hello%20Analyst%20Kim` : '#'}
                                target='_blank'
                                rel='noopener noreferrer'
                                onClick={() => setShowWhatsAppDropdown(false)}
                            >
                                <svg width='20' height='20' viewBox='0 0 24 24' fill='currentColor'>
                                    <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z' />
                                </svg>
                                <span>WhatsApp</span>
                            </a>
                            {/* Hardcoded WhatsApp Channel link - consider making this configurable if needed */}
                            {/* <a
                                href='https://whatsapp.com/channel/0029Vb7FTYF5Ui2YS66amq35'
                                target='_blank'
                                rel='noopener noreferrer'
                                onClick={() => setShowWhatsAppDropdown(false)}
                            >
                                <svg width='20' height='20' viewBox='0 0 24 24' fill='currentColor'>
                                    <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z' />
                                </svg>
                                <span>WhatsApp Channel</span>
                            </a> */}
                            <a
                                href={config.channels.telegram ? `https://t.me/${config.channels.telegram.replace('@', '')}` : '#'}
                                target='_blank'
                                rel='noopener noreferrer'
                                onClick={() => setShowWhatsAppDropdown(false)}
                            >
                                <svg width='20' height='20' viewBox='0 0 24 24' fill='currentColor'>
                                    <path d='M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.908 8.224l-1.78 8.384c-.13.584-.465.728-.94.432l-2.6-1.917-1.255 1.204c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 4.81-4.34c.21-.19-.047-.295-.326-.106l-5.943 3.744-2.56-.798c-.56-.175-.574-.56.105-.87l10.01-3.857c.46-.17.863.107.717.867z' />
                                </svg>
                                <span>Telegram</span>
                            </a>
                            {/* Hardcoded TikTok link - consider making this configurable if needed */}
                            {/* <a
                                href='http://tiktok.com/@kingofdigits001'
                                target='_blank'
                                rel='noopener noreferrer'
                                onClick={() => setShowWhatsAppDropdown(false)}
                            >
                                <svg width='20' height='20' viewBox='0 0 24 24' fill='currentColor'>
                                    <path d='M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z' />
                                </svg>
                                <span>TikTok</span>
                            </a> */}
                            {/* Hardcoded YouTube link - consider making this configurable if needed */}
                            {/* <a
                                href='https://www.youtube.com/@Analystkim-zf5ye'
                                target='_blank'
                                rel='noopener noreferrer'
                                onClick={() => setShowWhatsAppDropdown(false)}
                            >
                                <svg width='20' height='20' viewBox='0 0 24 24' fill='currentColor'>
                                    <path d='M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z' />
                                </svg>
                                <span>YouTube</span>
                            </a> */}
                        </div>
                    )}
                    </>
                    )}
                </div>
                <MobileMenu ref={mobileMenuRef} />
            </Wrapper>
            <Wrapper variant='right'>{renderAccountSection()}</Wrapper>
        </Header>
    );
});

export default AppHeader;
