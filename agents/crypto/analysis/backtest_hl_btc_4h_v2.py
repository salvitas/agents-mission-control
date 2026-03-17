#!/usr/bin/env python3
import json
import time
import urllib.request


def fetch_hl(coin="BTC", interval="4h", days=730):
    end_ms = int(time.time() * 1000)
    start_ms = end_ms - days * 24 * 60 * 60 * 1000
    payload = {
        "type": "candleSnapshot",
        "req": {"coin": coin, "interval": interval, "startTime": start_ms, "endTime": end_ms},
    }
    req = urllib.request.Request(
        "https://api.hyperliquid.xyz/info",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = json.loads(r.read().decode())
    out = []
    for x in raw:
        out.append({"t": int(x["t"]), "o": float(x["o"]), "h": float(x["h"]), "l": float(x["l"]), "c": float(x["c"])})
    out.sort(key=lambda z: z["t"])
    return out


def ema(vals, p):
    k = 2 / (p + 1)
    e = vals[0]
    out = []
    for v in vals:
        e = v * k + e * (1 - k)
        out.append(e)
    return out


def atr(candles, p=14):
    tr = [0.0]
    for i in range(1, len(candles)):
        h = candles[i]["h"]
        l = candles[i]["l"]
        pc = candles[i - 1]["c"]
        tr.append(max(h - l, abs(h - pc), abs(l - pc)))
    return ema(tr, p)


def backtest(candles, signals, fee=0.00025, sl_pct=0.02, tp_pct=0.05):
    c = [x["c"] for x in candles]
    h = [x["h"] for x in candles]
    l = [x["l"] for x in candles]

    eq = 1.0
    peak = 1.0
    maxdd = 0.0
    pos = 0
    entry = None
    trades = []

    for i in range(1, len(c)):
        s = signals[i]
        # entry/reverse on close
        if pos == 0 and s != 0:
            pos = s
            entry = c[i]
            continue

        if pos != 0:
            stop = entry * (1 - sl_pct) if pos == 1 else entry * (1 + sl_pct)
            take = entry * (1 + tp_pct) if pos == 1 else entry * (1 - tp_pct)

            # intrabar exit check
            exit_px = None
            reason = None
            if pos == 1:
                if l[i] <= stop:
                    exit_px = stop
                    reason = "SL"
                elif h[i] >= take:
                    exit_px = take
                    reason = "TP"
            else:
                if h[i] >= stop:
                    exit_px = stop
                    reason = "SL"
                elif l[i] <= take:
                    exit_px = take
                    reason = "TP"

            # signal flip if still open
            if exit_px is None and s != pos:
                exit_px = c[i]
                reason = "FLIP"

            if exit_px is not None:
                gross = (exit_px / entry - 1.0) * pos
                net = gross - 2 * fee
                eq *= 1 + net
                trades.append(net)
                peak = max(peak, eq)
                maxdd = max(maxdd, (peak - eq) / peak)
                pos = 0
                entry = None
                # allow same-bar re-entry after flip only
                if reason == "FLIP" and s != 0:
                    pos = s
                    entry = c[i]

    if pos != 0:
        gross = (c[-1] / entry - 1.0) * pos
        net = gross - 2 * fee
        eq *= 1 + net
        trades.append(net)
        peak = max(peak, eq)
        maxdd = max(maxdd, (peak - eq) / peak)

    wins = [x for x in trades if x > 0]
    losses = [x for x in trades if x < 0]
    pf = sum(wins) / abs(sum(losses)) if losses else float("inf")
    return {
        "trades": len(trades),
        "win_rate": (len(wins) / len(trades) * 100) if trades else 0,
        "ret": (eq - 1) * 100,
        "maxdd": maxdd * 100,
        "pf": pf,
    }


def sig_v2_ema_atr(candles):
    c = [x["c"] for x in candles]
    e50 = ema(c, 50)
    e200 = ema(c, 200)
    a = atr(candles, 14)
    out = [0] * len(c)
    for i in range(len(c)):
        vol_ok = a[i] / c[i] > 0.012  # avoid dead zones
        if e50[i] > e200[i] and c[i] > e50[i] and vol_ok:
            out[i] = 1
        elif e50[i] < e200[i] and c[i] < e50[i] and vol_ok:
            out[i] = -1
        else:
            out[i] = 0
    return out


def sig_v2_pullback(candles):
    c = [x["c"] for x in candles]
    e20 = ema(c, 20)
    e50 = ema(c, 50)
    e200 = ema(c, 200)
    out = [0] * len(c)
    for i in range(2, len(c)):
        # long: trend up, prior candle dipped near e20 then reclaimed
        long_cond = e50[i] > e200[i] and c[i - 1] < e20[i - 1] and c[i] > e20[i]
        short_cond = e50[i] < e200[i] and c[i - 1] > e20[i - 1] and c[i] < e20[i]
        if long_cond:
            out[i] = 1
        elif short_cond:
            out[i] = -1
        else:
            out[i] = 0
    return out


def sig_v2_breakout_confirm(candles):
    c = [x["c"] for x in candles]
    h = [x["h"] for x in candles]
    l = [x["l"] for x in candles]
    e200 = ema(c, 200)
    out = [0] * len(c)
    lb = 30
    for i in range(lb + 2, len(c)):
        hh = max(h[i - lb : i])
        ll = min(l[i - lb : i])
        # require 2-bar confirmation above/below level
        if c[i] > hh and c[i - 1] > hh and c[i] > e200[i]:
            out[i] = 1
        elif c[i] < ll and c[i - 1] < ll and c[i] < e200[i]:
            out[i] = -1
        else:
            out[i] = 0
    return out


def main():
    candles = fetch_hl("BTC", "4h", 730)
    suites = [
        ("V2_EMA_ATR", sig_v2_ema_atr),
        ("V2_PULLBACK", sig_v2_pullback),
        ("V2_BREAKOUT_CONFIRM", sig_v2_breakout_confirm),
    ]

    print(f"Candles: {len(candles)}")
    print(f"Period: {time.strftime('%Y-%m-%d', time.gmtime(candles[0]['t']/1000))} -> {time.strftime('%Y-%m-%d', time.gmtime(candles[-1]['t']/1000))}")
    print("Strategy | Trades | Win% | Return% | MaxDD% | ProfitFactor")
    print("-" * 72)
    for name, fn in suites:
        sig = fn(candles)
        r = backtest(candles, sig)
        print(f"{name:22} | {r['trades']:6d} | {r['win_rate']:5.1f} | {r['ret']:7.1f} | {r['maxdd']:6.1f} | {r['pf']:11.2f}")


if __name__ == "__main__":
    main()
