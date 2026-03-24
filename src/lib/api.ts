export interface PriceData {
    paxg: number; // Mark
    paxgBid: number;
    paxgAsk: number;

    xaut: number; // Mark
    xautBid: number;
    xautAsk: number;

    spread: number; // Mark Spread
    realSpread: number; // Worst Case Orderbook Spread
    timestamp: number;
}

export type SignalType = 'LONG_PAXG_SHORT_XAUT' | 'WAIT' | 'SHORT_PAXG_LONG_XAUT' | 'LOADING';

export const calculateSignal = (spread: number, longTarget: number = 10, shortTarget: number = 20): SignalType => {
    if (spread < longTarget) return 'LONG_PAXG_SHORT_XAUT';
    if (spread > shortTarget) return 'SHORT_PAXG_LONG_XAUT';
    return 'WAIT';
};

export async function fetchVariationalPrices(): Promise<Omit<PriceData, 'timestamp' | 'spread' | 'realSpread'> | null> {
    try {
        const res = await fetch('https://api.omni.variational.io/v1/market/stats');
        if (!res.ok) throw new Error('Failed to fetch Variational API');

        const data = await res.json();
        let result = { paxg: 0, paxgBid: 0, paxgAsk: 0, xaut: 0, xautBid: 0, xautAsk: 0 };

        // Parsing for the new stats structure if available
        if (data.listing_stats) {
            data.listing_stats.forEach((item: any) => {
                if (item.ticker === 'PAXG') {
                    result.paxg = parseFloat(item.mark_price);
                    result.paxgBid = parseFloat(item.quotes?.base?.bid || "0");
                    result.paxgAsk = parseFloat(item.quotes?.base?.ask || "0");
                }
                if (item.ticker === 'XAUt' || item.ticker === 'XAUT') {
                    result.xaut = parseFloat(item.mark_price);
                    result.xautBid = parseFloat(item.quotes?.base?.bid || "0");
                    result.xautAsk = parseFloat(item.quotes?.base?.ask || "0");
                }
            });
        } else if (data.data) {
            // Fallback or alternative structure
            const items = Array.isArray(data.data) ? data.data : [];
            items.forEach((item: any) => {
                if (item.ticker === 'PAXG') {
                    result.paxg = parseFloat(item.mark_price);
                    result.paxgBid = parseFloat(item.quotes?.base?.bid || "0");
                    result.paxgAsk = parseFloat(item.quotes?.base?.ask || "0");
                }
                if (item.ticker === 'XAUt' || item.ticker === 'XAUT') {
                    result.xaut = parseFloat(item.mark_price);
                    result.xautBid = parseFloat(item.quotes?.base?.bid || "0");
                    result.xautAsk = parseFloat(item.quotes?.base?.ask || "0");
                }
            });
        }

        if (result.paxg > 0 && result.xaut > 0) return result;
        return null;
    } catch (error) {
        console.error('Error fetching Variational:', error);
        return null;
    }
}

export async function fetchGRVTPrices(): Promise<Omit<PriceData, 'timestamp' | 'spread' | 'realSpread'> | null> {
    try {
        const res = await fetch('https://api.grvt.io/v1/market/tickers');
        if (!res.ok) throw new Error('Failed to fetch GRVT API');

        const data = await res.json();
        let result = { paxg: 0, paxgBid: 0, paxgAsk: 0, xaut: 0, xautBid: 0, xautAsk: 0 };

        const tickers = data.tickers || data.data || [];
        tickers.forEach((item: any) => {
            if (item.symbol === 'PAXG_USDT_Perp' || item.i === 'PAXG_USDT_Perp') {
                result.paxg = parseFloat(item.last_price || item.mp || "0");
                result.paxgBid = parseFloat(item.bid_price || item.bb || "0");
                result.paxgAsk = parseFloat(item.ask_price || item.ba || "0");
            }
            if (item.symbol === 'XAU_USDT_Perp' || item.i === 'XAU_USDT_Perp') {
                result.xaut = parseFloat(item.last_price || item.mp || "0");
                result.xautBid = parseFloat(item.bid_price || item.bb || "0");
                result.xautAsk = parseFloat(item.ask_price || item.ba || "0");
            }
        });

        if (result.paxg > 0 && result.xaut > 0) return result;
        return null;
    } catch (error) {
        console.error('Error fetching GRVT:', error);
        return null;
    }
}
