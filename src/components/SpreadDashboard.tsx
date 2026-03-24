"use client";

import React, { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { fetchVariationalPrices, fetchGRVTPrices, calculateSignal, PriceData, SignalType } from '@/lib/api';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, Clock, Activity, AlertTriangle, Bell, BellOff, Info, Calculator, HelpCircle, ShieldAlert } from 'lucide-react';

const TradingViewWidget = dynamic(
    () => import('./TradingViewWidget'),
    { ssr: false }
);

const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
};

export default function SpreadDashboard() {
    const [varData, setVarData] = useState<PriceData[]>([]);
    const [grvtData, setGrvtData] = useState<PriceData[]>([]);
    const [activeTab, setActiveTab] = useState<'variational' | 'grvt'>('variational');
    const [isAlertEnabled, setIsAlertEnabled] = useState(true);

    // Pro Arbitrage Calculator State
    const [margin, setMargin] = useState<number>(5000); // USD Margin
    const [marginPercent, setMarginPercent] = useState<number>(50); // % Margin for Cross mode
    const [marginInputType, setMarginInputType] = useState<'usd' | 'percent'>('usd');
    const [leverage, setLeverage] = useState<number>(20);
    const [targetExitSpread, setTargetExitSpread] = useState<number>(15);
    const [longEntryTarget, setLongEntryTarget] = useState<number>(10);
    const [shortEntryTarget, setShortEntryTarget] = useState<number>(20);
    const [customFeeRate, setCustomFeeRate] = useState<number>(0);

    // Cross vs Isolated Margin Feature
    const [marginMode, setMarginMode] = useState<'cross' | 'isolated'>('cross');
    const [totalEquity, setTotalEquity] = useState<number>(10000);

    useEffect(() => {
        if (activeTab === 'variational') setCustomFeeRate(0);
        if (activeTab === 'grvt') setCustomFeeRate(0.045);
    }, [activeTab]);

    // Enforce USD mode when switching to Isolated
    useEffect(() => {
        if (marginMode === 'isolated') setMarginInputType('usd');
    }, [marginMode]);

    const lastSignalRef = useRef<{ variational: SignalType, grvt: SignalType }>({ variational: 'WAIT', grvt: 'WAIT' });
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audioRef.current.volume = 0.5;
        }
    }, []);

    const triggerAlert = async (signal: SignalType, exchange: string, spread: number) => {
        if (!isAlertEnabled) return;
        if (signal === 'WAIT' || signal === 'LOADING') return;

        if (audioRef.current) {
            audioRef.current.play().catch(e => console.log('Audio play blocked:', e));
        }

        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(`Tanda Entry dari ${exchange}!`, {
                body: `Sinyal baru: ${signal.replace(/_/g, ' ')}\nSpread: ${spread.toFixed(2)}`,
                icon: '/favicon.ico'
            });
        }

        try {
            const message = `🚨 <b>ENTRY SIGNAL: ${exchange}</b> 🚨\n\n<b>Action:</b> ${signal.replace(/_/g, ' ')}\n<b>Spread:</b> ${spread.toFixed(2)}\n\n<a href="https://omni.variational.io">Variational</a> | <a href="https://grvt.io">GRVT</a>`;
            await fetch('/api/telegram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });
        } catch (e) {
            console.error("Failed to send telegram", e);
        }
    };

    const getRealSpreadAndSlippage = (markSpread: number, vResult: any) => {
        const signal = calculateSignal(markSpread, longEntryTarget, shortEntryTarget);
        let realSpread = markSpread;
        if (signal === 'LONG_PAXG_SHORT_XAUT') {
            realSpread = vResult.paxgAsk - vResult.xautBid;
        } else if (signal === 'SHORT_PAXG_LONG_XAUT') {
            realSpread = vResult.paxgBid - vResult.xautAsk;
        } else {
            realSpread = vResult.paxgAsk - vResult.xautBid;
        }
        return realSpread;
    };

    useEffect(() => {
        let isMounted = true;
        const fetchData = async () => {
            const ts = Date.now();

            const vResult = await fetchVariationalPrices();
            if (vResult && isMounted) {
                const spread = vResult.paxg - vResult.xaut;
                const realSpread = getRealSpreadAndSlippage(spread, vResult);
                const newEntry: PriceData = { ...vResult, spread, realSpread, timestamp: ts };
                setVarData(prev => [...prev, newEntry].slice(-50));

                const newSignal = calculateSignal(spread, longEntryTarget, shortEntryTarget);
                if (newSignal !== 'WAIT' && newSignal !== lastSignalRef.current.variational) {
                    triggerAlert(newSignal, 'Variational', spread);
                }
                lastSignalRef.current.variational = newSignal;
            }

            const gResult = await fetchGRVTPrices();
            if (gResult && isMounted) {
                const spread = gResult.paxg - gResult.xaut;
                const realSpread = getRealSpreadAndSlippage(spread, gResult);
                const newEntry: PriceData = { ...gResult, spread, realSpread, timestamp: ts };
                setGrvtData(prev => [...prev, newEntry].slice(-50));

                const newSignal = calculateSignal(spread, longEntryTarget, shortEntryTarget);
                if (newSignal !== 'WAIT' && newSignal !== lastSignalRef.current.grvt) {
                    triggerAlert(newSignal, 'GRVT', spread);
                }
                lastSignalRef.current.grvt = newSignal;
            }
        };
        fetchData();
        const interval = setInterval(fetchData, 4000);
        return () => { isMounted = false; clearInterval(interval); };
    }, [isAlertEnabled]);

    const currentData = activeTab === 'variational' ? varData : grvtData;
    const latestEntry = currentData.length > 0 ? currentData[currentData.length - 1] : null;
    const currentSignal = latestEntry ? calculateSignal(latestEntry.spread, longEntryTarget, shortEntryTarget) : 'LOADING';
    const slippage = latestEntry ? Math.abs(latestEntry.spread - latestEntry.realSpread) : 0;
    const isHighSlippage = slippage > 1.5;

    // CALCULATOR LOGIC
    const effectiveMargin = (marginMode === 'cross' && marginInputType === 'percent')
        ? (marginPercent / 100) * totalEquity
        : margin;

    const notional = effectiveMargin * leverage;
    const perLegAllocation = notional / 2;
    const avgPrice = latestEntry ? (latestEntry.paxg + latestEntry.xaut) / 2 : 1;
    const quantity = latestEntry ? perLegAllocation / avgPrice : 0;

    const feeDecimal = customFeeRate / 100;
    const totalFees = 4 * (perLegAllocation * feeDecimal);

    const spreadDiff = latestEntry ? Math.abs(targetExitSpread - latestEntry.realSpread) : 0;
    let grossProfit = quantity * spreadDiff;

    if (currentSignal === 'WAIT') grossProfit = 0;

    const netProfit = currentSignal !== 'WAIT' ? grossProfit - totalFees : 0;
    const roe = effectiveMargin > 0 ? (netProfit / effectiveMargin) * 100 : 0;
    const breakevenPoints = quantity > 0 ? totalFees / quantity : 0;

    // Chart Dynamic Breakeven Line
    let chartBreakevenLine: number | null = null;
    if (latestEntry && currentSignal !== 'WAIT') {
        if (currentSignal === 'LONG_PAXG_SHORT_XAUT') chartBreakevenLine = latestEntry.realSpread + breakevenPoints;
        if (currentSignal === 'SHORT_PAXG_LONG_XAUT') chartBreakevenLine = latestEntry.realSpread - breakevenPoints;
    }

    // Cross vs Isolated Liquidation tracking
    const effectiveBufferDecimal = marginMode === 'cross'
        ? (notional > 0 ? totalEquity / notional : 0)
        : (leverage > 0 ? 1 / leverage : 0);

    let liqPaxg = 0;
    let liqXaut = 0;
    if (latestEntry && effectiveBufferDecimal > 0) {
        if (currentSignal === 'LONG_PAXG_SHORT_XAUT' || currentSignal === 'WAIT') {
            liqPaxg = latestEntry.paxgAsk * (1 - effectiveBufferDecimal);
            liqXaut = latestEntry.xautBid * (1 + effectiveBufferDecimal);
        } else {
            liqPaxg = latestEntry.paxgBid * (1 + effectiveBufferDecimal);
            liqXaut = latestEntry.xautAsk * (1 - effectiveBufferDecimal);
        }
    }
    const safetyBuffer = effectiveBufferDecimal * 100;

    // Traffic Light Indicator
    let trafficLightColor = 'bg-slate-500';
    let trafficLightText = 'WAITING';
    if (currentSignal !== 'WAIT') {
        if (netProfit > 0 && !isHighSlippage) {
            trafficLightColor = 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]';
            trafficLightText = '🟢 SAFE TO ENTRY';
        } else if (netProfit > 0 && isHighSlippage) {
            trafficLightColor = 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]';
            trafficLightText = '🟡 RISKY (HIGH SLIPPAGE)';
        } else {
            trafficLightColor = 'bg-rose-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]';
            trafficLightText = '🔴 DO NOT ENTRY';
        }
    }

    const TooltipIcon = ({ text }: { text: string }) => (
        <div className="group relative inline-flex ml-1 cursor-help">
            <HelpCircle className="w-4 h-4 text-slate-500 hover:text-indigo-400" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 bg-slate-800 text-xs text-slate-200 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-2xl border border-slate-700 leading-relaxed whitespace-pre-wrap">
                {text}
            </div>
        </div>
    );

    const SignalCard = () => {
        if (!latestEntry) return (
            <div className="glass-panel p-6 flex items-center justify-center animate-pulse">
                <Activity className="w-6 h-6 mr-2 text-warning" /> Loading data...
            </div>
        );

        let bgColor = 'bg-card border-border';
        let icon = <Clock className="w-8 h-8 text-slate-400" />;
        let text = 'WAKTU MENUNGGU (SPREAD NORMAL)';
        let subtext = 'Spread berada di antara 10 - 20.';
        let textColor = 'text-slate-200';

        if (currentSignal === 'LONG_PAXG_SHORT_XAUT') {
            bgColor = 'bg-emerald-950/40 border-emerald-500/30';
            icon = <TrendingUp className="w-8 h-8 text-emerald-400" />;
            text = 'LONG PAXG | SHORT XAUt';
            subtext = `Spread Mark di bawah 10 (${latestEntry.spread.toFixed(2)}).`;
            textColor = 'text-emerald-400';
        } else if (currentSignal === 'SHORT_PAXG_LONG_XAUT') {
            bgColor = 'bg-rose-950/40 border-rose-500/30';
            icon = <TrendingDown className="w-8 h-8 text-rose-400" />;
            text = 'SHORT PAXG | LONG XAUt';
            subtext = `Spread Mark di atas 20 (${latestEntry.spread.toFixed(2)}).`;
            textColor = 'text-rose-400';
        }

        return (
            <div className={`glass-panel p-6 ${bgColor} transition-colors duration-500 border`}>
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center">
                        <div className={`p-3 rounded-xl bg-black/20 mr-4`}>{icon}</div>
                        <div>
                            <h3 className="text-sm text-slate-400 font-medium tracking-wider mb-1">AKSI SAAT INI</h3>
                            <div className={`text-2xl font-bold ${textColor}`}>{text}</div>
                            <p className="text-sm mt-1 text-slate-300 opacity-80">{subtext}</p>
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                        <div className={`px-4 py-1.5 rounded-full text-xs font-bold text-white tracking-widest ${trafficLightColor}`}>
                            {trafficLightText}
                        </div>

                        <div className="flex gap-4 mt-2">
                            <div className="flex flex-col justify-center bg-black/30 rounded-lg p-3 shadow-inner border border-white/5">
                                <span className="text-xs flex items-center uppercase font-bold text-white/50 mb-1">
                                    REAL SPREAD
                                    <TooltipIcon text="Harga eksekusi riil (Market Order). Selisih harga 'asli' jika kamu klik beli sekarang." />
                                </span>
                                <span className={`font-mono text-xl font-bold ${isHighSlippage ? 'text-rose-400' : 'text-slate-200'}`}>
                                    {latestEntry.realSpread.toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {isHighSlippage && currentSignal !== 'WAIT' && (
                    <div className="mt-4 p-3 bg-rose-500/20 border border-rose-500/50 rounded-lg flex items-center text-rose-200 text-sm">
                        <AlertTriangle className="w-5 h-5 mr-3 text-rose-400 flex-shrink-0" />
                        <div>
                            <strong className="block text-rose-400">High Slippage Warning!</strong>
                            Slippage memakan ${(slippage * quantity).toFixed(2)} potensi profitmu. Lebih baik pasang Limit Order! Margin error: ${slippage.toFixed(2)} pts.
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="min-h-screen text-foreground p-4 md:p-8 font-sans max-w-7xl mx-auto">
            {/*... header and prices blocks... */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Gold Arbi <span className="gradient-text text-transparent bg-clip-text">Pro</span></h1>
                    <p className="text-sm text-slate-400 mt-1 flex items-center">
                        <Activity className="w-4 h-4 mr-1 inline" /> Real-time Arbitrage Dashboard | Pro Level Analytics
                    </p>
                </div>
                <div className="flex gap-2 bg-card/80 p-1.5 rounded-xl border border-white/5 shadow-xl glass-panel">
                    <button
                        onClick={() => setActiveTab('variational')}
                        className={`px-6 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${activeTab === 'variational' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        Variational
                    </button>
                    <button
                        onClick={() => setActiveTab('grvt')}
                        className={`px-6 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${activeTab === 'grvt' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        GRVT
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
                <div className="lg:col-span-8 flex flex-col gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="glass-panel p-5 flex flex-col justify-between">
                            <div>
                                <h3 className="text-slate-400 text-sm font-medium mb-1 flex items-center justify-between">
                                    PAXG Mark Price
                                    <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300">Bid: {latestEntry?.paxgBid?.toFixed(1)} / Ask: {latestEntry?.paxgAsk?.toFixed(1)}</span>
                                </h3>
                                <div className="text-3xl font-mono font-bold mt-2">
                                    {latestEntry ? `$${latestEntry.paxg.toFixed(2)}` : '----'}
                                </div>
                            </div>
                        </div>

                        <div className="glass-panel p-5 flex flex-col justify-between">
                            <div>
                                <h3 className="text-slate-400 text-sm font-medium mb-1 flex items-center justify-between">
                                    XAUt Mark Price
                                    <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300">Bid: {latestEntry?.xautBid?.toFixed(1)} / Ask: {latestEntry?.xautAsk?.toFixed(1)}</span>
                                </h3>
                                <div className="text-3xl font-mono font-bold mt-2">
                                    {latestEntry ? `$${latestEntry.xaut.toFixed(2)}` : '----'}
                                </div>
                            </div>
                        </div>

                        <div className="glass-panel p-5 flex flex-col justify-center relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                            </div>
                            <h3 className="text-slate-400 text-sm font-medium mb-1 flex items-center">
                                Mark Spread
                                <TooltipIcon text="Selisih harga 'teoritis' di chart. Jangan jadikan satu-satunya acuan entry." />
                            </h3>
                            <div className={`text-4xl font-mono font-bold ${latestEntry ? (latestEntry.spread < 10 || latestEntry.spread > 20 ? 'text-amber-400' : 'text-emerald-400') : ''}`}>
                                {latestEntry ? latestEntry.spread.toFixed(2) : '----'}
                            </div>
                        </div>
                    </div>

                    <SignalCard />

                    <div className="glass-panel p-6 h-[400px] flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-lg font-bold flex items-center">
                                <Activity className="w-5 h-5 mr-2 text-blue-400" />
                                Spread History ({activeTab === 'variational' ? 'Variational' : 'GRVT'})
                            </h2>
                            <div className="flex items-center gap-4 text-xs">
                                <div className="flex items-center"><div className="w-3 h-3 bg-amber-400 rounded-full mr-1"></div> Mark</div>
                                <div className="flex items-center"><div className="w-3 h-3 bg-blue-500 rounded-full mr-1"></div> Real</div>
                                {chartBreakevenLine !== null && <div className="flex items-center"><div className="w-3 h-3 bg-fuchsia-400 rounded-full mr-1"></div> Breakeven</div>}
                            </div>
                        </div>

                        {currentData.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                                <Activity className="w-8 h-8 mb-4 animate-pulse opacity-50" />
                                <p>Menunggu data dari bursa...</p>
                            </div>
                        ) : (
                            <div className="flex-1 w-full min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={currentData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                                        <XAxis dataKey="timestamp" tickFormatter={formatTime} stroke="#ffffff40" tick={{ fill: '#ffffff60', fontSize: 12 }} minTickGap={20} />
                                        <YAxis domain={['auto', 'auto']} stroke="#ffffff40" tick={{ fill: '#ffffff60', fontSize: 12 }} width={40} />
                                        <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }} labelFormatter={(v) => formatTime(v as number)} itemStyle={{ color: '#fbbf24' }} />

                                        <ReferenceLine y={longEntryTarget} stroke="#10b981" strokeDasharray="3 3" opacity={0.3} label={{ position: 'insideTopLeft', value: 'Long Limit', fill: '#10b981', fontSize: 10 }} />
                                        <ReferenceLine y={shortEntryTarget} stroke="#ef4444" strokeDasharray="3 3" opacity={0.3} label={{ position: 'insideTopLeft', value: 'Short Limit', fill: '#ef4444', fontSize: 10 }} />

                                        {chartBreakevenLine !== null && (
                                            <ReferenceLine y={chartBreakevenLine} stroke="#e879f9" strokeDasharray="3 3" opacity={0.8} label={{ position: 'insideBottomRight', value: 'Breakeven', fill: '#e879f9', fontSize: 10 }} />
                                        )}

                                        <Line type="monotone" dataKey="spread" name="Mark Spread" stroke="#fbbf24" strokeWidth={2} dot={false} isAnimationActive={false} />
                                        <Line type="monotone" dataKey="realSpread" name="Real Orderbook Spread" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    {/* TradingView Integrated Chart */}
                    <div className="glass-panel p-6 h-[550px] flex flex-col border-indigo-500/20">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-lg font-bold flex items-center">
                                    <Activity className="w-5 h-5 mr-2 text-indigo-400" />
                                    Live Spread Chart (TradingView)
                                </h2>
                                <p className="text-[11px] text-indigo-300/70 mt-1 flex items-center">
                                    <Info className="w-3 h-3 mr-1" />
                                    Klik area chart, lalu tekan <b className="text-indigo-200 mx-1">Alt + L</b> untuk mode Logaritma (Sangat direkomendasikan).
                                </p>
                            </div>
                            <div className="text-xs text-slate-400 bg-black/30 px-3 py-1 rounded-full border border-white/5">
                                Symbol: PAXG - XAUt
                            </div>
                        </div>
                        <div className="flex-1 w-full min-h-0 bg-[#18181b] rounded-xl overflow-hidden border border-white/5">
                            <TradingViewWidget />
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-4 flex flex-col gap-6">

                    <div className="glass-panel bg-stone-900 border-stone-800 overflow-hidden flex flex-col">
                        <div className="p-5 border-b border-white/5 bg-stone-950/40">
                            <h3 className="text-amber-400 font-bold flex items-center">
                                <Calculator className="w-5 h-5 mr-2" /> Position Summary
                            </h3>
                        </div>

                        <div className="p-5 space-y-4 bg-stone-900">

                            {/* Cross Margin Feature Controls */}
                            <div className="flex justify-between items-center text-sm pb-2 mb-2 border-b border-white/5">
                                <label className="text-slate-400 flex items-center">
                                    Margin Mode
                                    <TooltipIcon text={`Isolated: Risiko dibatasi pada Margin input ($). \n\nCross: Seluruh ekuitas akun Anda menahan posisi, memperjauh harga likuidasi secara drastis.`} />
                                </label>
                                <div className="flex gap-1 bg-black/30 p-1 rounded border border-white/10">
                                    <button onClick={() => setMarginMode('cross')} className={`px-2 py-0.5 text-[10px] rounded transition-colors ${marginMode === 'cross' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>Cross (Def)</button>
                                    <button onClick={() => setMarginMode('isolated')} className={`px-2 py-0.5 text-[10px] rounded transition-colors ${marginMode === 'isolated' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>Isolated</button>
                                </div>
                            </div>

                            {marginMode === 'cross' && (
                                <div className="flex justify-between items-center text-sm">
                                    <label className="text-indigo-400 font-medium">Total Equity ($)</label>
                                    <input type="number" value={totalEquity} onChange={e => setTotalEquity(Number(e.target.value))} className="w-24 bg-indigo-950/40 border border-indigo-500/50 rounded px-2 py-1 text-right text-white focus:outline-none focus:border-indigo-400 font-mono shadow-inner shadow-indigo-900/20" />
                                </div>
                            )}

                            <div className="flex justify-between items-center text-sm">
                                <label className="text-slate-400 flex flex-col justify-center">
                                    <div className="flex items-center gap-1">
                                        Margin Input
                                        <TooltipIcon text={`Uang jaminan yang dipakai.\nPilih input dalam persentase (%) dari Total Equity atau nominal tetap dalam USD ($).`} />
                                    </div>
                                    {marginMode === 'cross' && (
                                        <div className="flex mt-1.5 bg-black/40 rounded overflow-hidden border border-white/10 w-fit">
                                            <button onClick={() => setMarginInputType('usd')} className={`px-2 py-0.5 text-[10px] font-bold ${marginInputType === 'usd' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:bg-white/5'}`}>$</button>
                                            <button onClick={() => setMarginInputType('percent')} className={`px-2 py-0.5 text-[10px] font-bold border-l border-white/10 ${marginInputType === 'percent' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:bg-white/5'}`}>%</button>
                                        </div>
                                    )}
                                </label>

                                <div className="flex items-center">
                                    {marginMode === 'cross' && marginInputType === 'percent' ? (
                                        <div className="flex items-center">
                                            <input type="number" max="100" value={marginPercent} onChange={e => setMarginPercent(Number(e.target.value))} className="w-16 bg-black/50 border border-white/10 border-r-0 rounded-l px-2 py-1.5 text-right text-white focus:outline-none focus:border-amber-500 font-mono" />
                                            <span className="bg-black/80 border border-white/10 rounded-r px-2 py-1.5 text-slate-400 text-xs font-bold">%</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center">
                                            <span className="bg-black/80 border border-white/10 border-r-0 rounded-l px-2 py-1.5 text-slate-400 text-xs font-bold">$</span>
                                            <input type="number" value={margin} onChange={e => setMargin(Number(e.target.value))} className="w-20 bg-black/50 border border-white/10 rounded-r px-2 py-1.5 text-right text-white focus:outline-none focus:border-amber-500 font-mono" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {marginMode === 'cross' && marginInputType === 'percent' && (
                                <div className="text-right text-[10px] text-amber-500/70 font-mono -mt-2 pr-1 animate-pulse">
                                    ≈ ${effectiveMargin.toLocaleString()}
                                </div>
                            )}

                            <div className="flex justify-between items-center text-sm">
                                <label className="text-slate-400">Leverage (x)</label>
                                <input type="number" value={leverage} onChange={e => setLeverage(Number(e.target.value))} className="w-24 bg-black/50 border border-white/10 rounded px-2 py-1 text-right text-white focus:outline-none focus:border-amber-500" />
                            </div>

                            <div className="flex justify-between items-center text-sm pt-2 border-t border-white/5">
                                <label className="text-slate-400">Target Exit Spread</label>
                                <input type="number" value={targetExitSpread} onChange={e => setTargetExitSpread(Number(e.target.value))} className="w-24 bg-black/50 border border-white/10 rounded px-2 py-1 text-right text-white focus:outline-none focus:border-amber-500" />
                            </div>

                            <div className="flex justify-between items-center text-sm">
                                <label className="text-emerald-400">Target Long PAXG</label>
                                <input type="number" value={longEntryTarget} onChange={e => setLongEntryTarget(Number(e.target.value))} className="w-24 bg-emerald-950/40 border border-emerald-500/50 rounded px-2 py-1 text-right text-white focus:outline-none focus:border-emerald-400 font-mono shadow-inner shadow-emerald-900/20" />
                            </div>

                            <div className="flex justify-between items-center text-sm">
                                <label className="text-rose-400">Target Short PAXG</label>
                                <input type="number" value={shortEntryTarget} onChange={e => setShortEntryTarget(Number(e.target.value))} className="w-24 bg-rose-950/40 border border-rose-500/50 rounded px-2 py-1 text-right text-white focus:outline-none focus:border-rose-400 font-mono shadow-inner shadow-rose-900/20" />
                            </div>

                            <div className="flex justify-between items-center text-sm">
                                <label className="text-slate-400 flex flex-col">
                                    Custom Fee (%)
                                    {activeTab === 'variational' && <span className="text-[10px] text-emerald-400 mt-0.5">Var = 0% Fee!</span>}
                                </label>
                                <input type="number" step="0.001" value={customFeeRate} onChange={e => setCustomFeeRate(Number(e.target.value))} className="w-24 bg-black/50 border border-white/10 rounded px-2 py-1 text-right text-white focus:outline-none focus:border-amber-500" />
                            </div>
                        </div>

                        <div className="p-5 border-t border-white/5 space-y-3 bg-stone-900/60">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-300 flex items-center">
                                    Notional Size
                                    <TooltipIcon text={`Total nilai emas yang kamu kontrol ($${(notional / 2).toLocaleString()} Long / $${(notional / 2).toLocaleString()} Short).`} />
                                </span>
                                <div className="text-right">
                                    <div className="font-mono text-white">${notional.toLocaleString()} ({(quantity * 2).toFixed(2)} units)</div>
                                    <div className="text-[10px] text-slate-500">📦 Exposure Split: ${perLegAllocation.toLocaleString()} per leg</div>
                                </div>
                            </div>

                            <div className="flex justify-between text-sm">
                                <span className="text-slate-300">Est. Total Fees (4x)</span>
                                <span className="font-mono text-rose-400">-${totalFees.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-300 flex items-center">
                                    Breakeven Offset
                                    <TooltipIcon text={`Jarak poin (pts) yang dibutuhkan agar keuntungan dari pergerakan spread bisa menutupi seluruh biaya transaksi (Entry + Exit Fee). Jika angka ini 0.00, berarti Anda sudah berada di zona profit sejak pertama kali masuk (karena 0% fee).`} />
                                </span>
                                <span className="font-mono text-white">{breakevenPoints.toFixed(2)} pts</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-300 flex items-center">
                                    Spread Sensitivity
                                    <TooltipIcon text={`Nilai uang (USD) yang akan berubah di saldo Anda untuk setiap pergerakan 1 poin ($1) pada selisih harga (spread). Semakin besar unit yang Anda pegang, semakin sensitif saldo Anda terhadap pergerakan spread.`} />
                                </span>
                                <span className="font-mono text-white">${quantity.toFixed(2)} / pt</span>
                            </div>

                            <div className="flex justify-between text-sm border-t border-white/5 pt-3 mt-3">
                                <span className="text-slate-200 font-bold">Expected Profit</span>
                                <span className={`font-mono font-bold ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    ${netProfit.toFixed(2)} <span className="text-[10px] font-normal opacity-70">(setelah dipotong fee)</span>
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-200 font-bold flex items-center">
                                    Est. ROE
                                    <TooltipIcon text={`Return on Equity pada Margin yang dikunci ($${effectiveMargin.toLocaleString()}).`} />
                                </span>
                                <span className={`font-mono font-bold ${roe >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {roe.toFixed(2)}%
                                </span>
                            </div>

                            <div className="mt-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-md">
                                <p className="text-xs text-indigo-300 text-center text-balance leading-relaxed">
                                    Posisi Anda <b>Delta Neutral</b>. Naik turunnya harga emas dunia tidak akan mempengaruhi saldo Anda. Anda hanya fokus mencari cuan dari selisih (spread) kedua koin ini.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="glass-panel p-5 bg-rose-950/10 border-rose-500/20">
                        <h3 className="text-rose-400 font-bold mb-3 flex items-center text-sm">
                            <ShieldAlert className="w-4 h-4 mr-2" /> Liquidation Safety Margin
                        </h3>
                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                                <span className="text-slate-400">Est. Liq Price (PAXG)</span>
                                <span className="font-mono text-rose-300">${liqPaxg.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Est. Liq Price (XAUt)</span>
                                <span className="font-mono text-rose-300">${liqXaut.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between border-t border-rose-500/20 pt-2 mt-2">
                                <span className="text-slate-300 font-bold flex items-center">
                                    Safety Buffer
                                    <TooltipIcon text={`Jarak aman antara harga pasar saat ini dengan harga likuidasi dalam bentuk persentase. Jika angka ini mendekati 0%, posisi Anda terancam ditutup paksa oleh sistem bursa. Mode: ${marginMode.toUpperCase()}`} />
                                </span>
                                <span className={`font-mono font-bold ${safetyBuffer < 10 ? 'text-rose-500 animate-pulse' : 'text-emerald-400'}`}>
                                    ±{safetyBuffer.toFixed(1)}% price move
                                </span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
