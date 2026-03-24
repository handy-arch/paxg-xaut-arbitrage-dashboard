"use client";

import React, { useEffect, useRef, memo } from 'react';

// Using a global flag to load the script at most once
let tvScriptLoadingPromise: Promise<void> | null = null;

function TradingViewWidget() {
    const onLoadScriptRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        onLoadScriptRef.current = createWidget;

        if (!tvScriptLoadingPromise) {
            tvScriptLoadingPromise = new Promise((resolve) => {
                const script = document.createElement('script');
                script.id = 'tradingview-widget-loading-script';
                script.src = 'https://s3.tradingview.com/tv.js';
                script.type = 'text/javascript';
                script.onload = () => resolve();

                document.head.appendChild(script);
            });
        }

        tvScriptLoadingPromise.then(() => {
            if (onLoadScriptRef.current) {
                onLoadScriptRef.current();
            }
        });

        return () => {
            onLoadScriptRef.current = null;
        };

        function createWidget() {
            if (document.getElementById('tradingview_chart') && 'TradingView' in window) {
                // @ts-ignore
                new window.TradingView.widget({
                    autosize: true,
                    // Formula spread dari User (TradingView Perpetual Symbol)
                    symbol: "BYBIT:PAXGUSDT.P-BYBIT:XAUTUSDT.P",
                    interval: "1",
                    timezone: "Etc/UTC",
                    theme: "dark",
                    style: "1",
                    locale: "id",
                    toolbar_bg: "#18181b",
                    enable_publishing: false,
                    hide_side_toolbar: false,
                    allow_symbol_change: true,
                    container_id: "tradingview_chart",
                });
            }
        }
    }, []);

    return (
        <div className='tradingview-widget-container h-full w-full rounded-xl overflow-hidden'>
            <div id='tradingview_chart' className='h-full w-full' />
        </div>
    );
}

// Wrap in memo to prevent unnecessary re-renders when dashboard ticks every 4s
export default memo(TradingViewWidget);
