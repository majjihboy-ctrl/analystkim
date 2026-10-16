import React from 'react';
import { ENABLE_EXTERNAL_TOOLS } from '@/constants/feature-flags';
import './iframe-wrapper.scss';

interface IframeWrapperProps {
    src: string;
    title: string;
    className?: string;
}

// These tools were separate apps hosted on Vercel. When they are not deployed (or when running
// locally) the iframe would just show a Vercel 404, so show a clear notice instead.
const isExternallyHosted = (src: string) => {
    try {
        return new URL(src).hostname.endsWith('.vercel.app');
    } catch {
        return false;
    }
};

const IframeWrapper: React.FC<IframeWrapperProps> = ({ src, title, className = '' }) => {
    if (!ENABLE_EXTERNAL_TOOLS && isExternallyHosted(src)) {
        return (
            <div className={`iframe-wrapper ${className}`}>
                <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                    <h3>{title}</h3>
                    <p>This tool is hosted externally and isn&apos;t available when running locally.</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`iframe-wrapper ${className}`}>
            <iframe
                src={src}
                title={title}
                className='iframe-wrapper__frame'
                frameBorder='0'
                allowFullScreen
                loading='lazy'
            />
        </div>
    );
};

export default IframeWrapper;
