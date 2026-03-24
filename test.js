async function check() {
  try {
    const res = await fetch('https://api.omni.variational.io/v1/market/stats');
    const text = await res.text();
    console.log("Variational /market/stats:", text.slice(0, 100));
  } catch(e) { console.error("Variational errored:", e.message) }
  
  try {
    const res = await fetch('https://api.omni.variational.io/v1/market');
    const text = await res.text();
    console.log("Variational /market:", text.slice(0, 100));
  } catch(e) { console.error("Variational errored:", e.message) }

  try {
    const res = await fetch('https://api.grvt.io/v1/market/tickers');
    const text = await res.text();
    console.log("GRVT /market/tickers:", text.slice(0, 100));
  } catch(e) { console.error("GRVT errored:", e.message) }
  
  try {
    const res = await fetch('https://api.grvt.io/v1/tickers');
    const text = await res.text();
    console.log("GRVT /tickers:", text.slice(0, 100));
  } catch(e) { console.error("GRVT errored:", e.message) }
}
check();
