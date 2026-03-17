#!/usr/bin/env python3
import json
import math
import time
import urllib.request


def fetch_hl(coin="BTC", interval="4h", days=730):
    end_ms = int(time.time() * 1000)
    start_ms = end_ms - days * 24 * 60 * 60 * 1000
    payload = {"type": "candleSnapshot", "req": {"coin": coin, "interval": interval, "startTime": start_ms, "endTime": end_ms}}
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
        h, l, pc = candles[i]["h"], candles[i]["l"], candles[i - 1]["c"]
        tr.append(max(h - l, abs(h - pc), abs(l - pc)))
    return ema(tr, p)


def adx_proxy(candles, p=14):
    # lightweight trend-strength proxy: |EMA(returns)| / EMA(|returns|)
    c = [x["c"] for x in candles]
    ret = [0.0]
    for i in range(1, len(c)):
        ret.append((c[i] - c[i - 1]) / c[i - 1])
    er = ema(ret, p)
    ea = ema([abs(x) for x in ret], p)
    out = []
    for a, b in zip(er, ea):
        out.append(abs(a) / b if b > 0 else 0.0)
    return out


def backtest(candles, signals, fee=0.00025, sl=0.02, tp=0.05, max_hold=18, trailing_atr_mult=2.2, cooldown_bars=2):
    c = [x["c"] for x in candles]
    h = [x["h"] for x in candles]
    l = [x["l"] for x in candles]
    a = atr(candles, 14)

    eq, peak, maxdd = 1.0, 1.0, 0.0
    pos, entry, bars_in, stop_dyn = 0, None, 0, None
    cooldown = 0
    trades = []

    for i in range(1, len(c)):
        if cooldown > 0:
            cooldown -= 1

        s = signals[i]

        # enter
        if pos == 0 and cooldown == 0 and s != 0:
            pos = s
            entry = c[i]
            bars_in = 0
            stop_dyn = entry - trailing_atr_mult * a[i] if pos == 1 else entry + trailing_atr_mult * a[i]
            continue

        if pos != 0:
            bars_in += 1
            # update trailing
            if pos == 1:
                stop_dyn = max(stop_dyn, c[i] - trailing_atr_mult * a[i])
            else:
                stop_dyn = min(stop_dyn, c[i] + trailing_atr_mult * a[i])

            stop_hard = entry * (1 - sl) if pos == 1 else entry * (1 + sl)
            take = entry * (1 + tp) if pos == 1 else entry * (1 - tp)
            stop = max(stop_hard, stop_dyn) if pos == 1 else min(stop_hard, stop_dyn)

            exit_px, reason = None, None
            if pos == 1:
                if l[i] <= stop:
                    exit_px, reason = stop, "SL/TRAIL"
                elif h[i] >= take:
                    exit_px, reason = take, "TP"
            else:
                if h[i] >= stop:
                    exit_px, reason = stop, "SL/TRAIL"
                elif l[i] <= take:
                    exit_px, reason = take, "TP"

            if exit_px is None and bars_in >= max_hold:
                exit_px, reason = c[i], "TIME"

            if exit_px is None and s == -pos:
                exit_px, reason = c[i], "FLIP"

            if exit_px is not None:
                gross = (exit_px / entry - 1.0) * pos
                net = gross - 2 * fee
                eq *= (1 + net)
                trades.append(net)
                peak = max(peak, eq)
                maxdd = max(maxdd, (peak - eq) / peak)
                pos, entry, bars_in, stop_dyn = 0, None, 0, None
                cooldown = cooldown_bars

    if pos != 0:
        gross = (c[-1] / entry - 1.0) * pos
        net = gross - 2 * fee
        eq *= (1 + net)
        trades.append(net)
        peak = max(peak, eq)
        maxdd = max(maxdd, (peak - eq) / peak)

    wins = [x for x in trades if x > 0]
    losses = [x for x in trades if x < 0]
    pf = sum(wins) / abs(sum(losses)) if losses else float("inf")
    return {
        "trades": len(trades),
        "win": (len(wins) / len(trades) * 100) if trades else 0.0,
        "ret": (eq - 1) * 100,
        "maxdd": maxdd * 100,
        "pf": pf,
    }


def build_signal(candles, trend_strength_min=0.16, atr_min=0.010, atr_max=0.040):
    c = [x["c"] for x in candles]
    e20, e50, e200 = ema(c, 20), ema(c, 50), ema(c, 200)
    a = atr(candles, 14)
    ax = adx_proxy(candles, 14)

    sig = [0] * len(c)
    for i in range(24, len(c)):
        atrp = a[i] / c[i]
        regime_ok = (ax[i] >= trend_strength_min) and (atr_min <= atrp <= atr_max)
        if not regime_ok:
            sig[i] = 0
            continue

        long_pb = e50[i] > e200[i] and c[i - 1] < e20[i - 1] and c[i] > e20[i]
        short_pb = e50[i] < e200[i] and c[i - 1] > e20[i - 1] and c[i] < e20[i]
        # breakout fallback
        hh = max([x["h"] for x in candles[i - 24 : i]])
        ll = min([x["l"] for x in candles[i - 24 : i]])
        long_bo = c[i] > hh and e50[i] > e200[i]
        short_bo = c[i] < ll and e50[i] < e200[i]

        if long_pb or long_bo:
            sig[i] = 1
        elif short_pb or short_bo:
            sig[i] = -1
        else:
            sig[i] = 0
    return sig


def split_walk_forward(candles, train_ratio=0.7):
    n = len(candles)
    k = int(n * train_ratio)
    return candles[:k], candles[k:]


def report_row(name, r):
    return f"{name:16} | {r['trades']:6d} | {r['win']:5.1f} | {r['ret']:7.1f} | {r['maxdd']:6.1f} | {r['pf']:11.2f}"


def main():
    candles = fetch_hl("BTC", "4h", 730)
    train, test = split_walk_forward(candles, 0.7)

    # small grid on train
    grid = []
    for ts in [0.14, 0.16, 0.18, 0.20]:
        for amin, amax in [(0.009, 0.040), (0.010, 0.038), (0.011, 0.036)]:
            sig = build_signal(train, trend_strength_min=ts, atr_min=amin, atr_max=amax)
            r = backtest(train, sig)
            score = r["ret"] - 0.7 * r["maxdd"] + (r["pf"] - 1.0) * 20
            grid.append((score, ts, amin, amax, r))

    grid.sort(key=lambda x: x[0], reverse=True)
    top = grid[0]
    _, ts, amin, amax, r_train = top

    sig_test = build_signal(test, trend_strength_min=ts, atr_min=amin, atr_max=amax)
    r_test = backtest(test, sig_test)

    # full sample with chosen params
    sig_full = build_signal(candles, trend_strength_min=ts, atr_min=amin, atr_max=amax)
    r_full = backtest(candles, sig_full)

    print(f"Candles: {len(candles)}")
    print(f"Period: {time.strftime('%Y-%m-%d', time.gmtime(candles[0]['t']/1000))} -> {time.strftime('%Y-%m-%d', time.gmtime(candles[-1]['t']/1000))}")
    print(f"Best train params: trend_strength_min={ts}, atr_min={amin}, atr_max={amax}")
    print("Set              | Trades | Win% | Return% | MaxDD% | ProfitFactor")
    print("-" * 74)
    print(report_row("TRAIN (70%)", r_train))
    print(report_row("TEST (30%)", r_test))
    print(report_row("FULL (100%)", r_full))


if __name__ == "__main__":
    main()
