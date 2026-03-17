#!/usr/bin/env python3
import json, time, urllib.request, statistics


def fetch_hl(days=730):
    end_ms = int(time.time() * 1000)
    start_ms = end_ms - days * 24 * 60 * 60 * 1000
    payload = {"type": "candleSnapshot", "req": {"coin": "BTC", "interval": "4h", "startTime": start_ms, "endTime": end_ms}}
    req = urllib.request.Request(
        "https://api.hyperliquid.xyz/info",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = json.loads(r.read().decode())
    out = [{"t": int(x["t"]), "o": float(x["o"]), "h": float(x["h"]), "l": float(x["l"]), "c": float(x["c"])} for x in raw]
    out.sort(key=lambda z: z["t"])
    return out


def ema(v, p):
    k = 2 / (p + 1)
    e = v[0]
    out = []
    for x in v:
        e = x * k + e * (1 - k)
        out.append(e)
    return out


def std_window(vals, p):
    out = [None] * len(vals)
    for i in range(p - 1, len(vals)):
        out[i] = statistics.pstdev(vals[i - p + 1 : i + 1])
    return out


def atr(c, p=14):
    tr = [0.0]
    for i in range(1, len(c)):
        h, l, pc = c[i]["h"], c[i]["l"], c[i - 1]["c"]
        tr.append(max(h - l, abs(h - pc), abs(l - pc)))
    return ema(tr, p)


def rsi(c, p=14):
    closes = [x["c"] for x in c]
    gains, losses = [0.0], [0.0]
    for i in range(1, len(closes)):
        d = closes[i] - closes[i - 1]
        gains.append(max(d, 0.0))
        losses.append(max(-d, 0.0))
    ag = ema(gains, p)
    al = ema(losses, p)
    out = []
    for g, l in zip(ag, al):
        if l == 0:
            out.append(100.0)
        else:
            rs = g / l
            out.append(100.0 - 100.0 / (1.0 + rs))
    return out


def adx_proxy(c, p=14):
    closes = [x["c"] for x in c]
    ret = [0.0]
    for i in range(1, len(closes)):
        ret.append((closes[i] - closes[i - 1]) / closes[i - 1])
    er = ema(ret, p)
    ea = ema([abs(x) for x in ret], p)
    out = []
    for a, b in zip(er, ea):
        out.append(abs(a) / b if b > 0 else 0.0)
    return out


def regime_and_signals(c, cfg):
    closes = [x["c"] for x in c]
    highs = [x["h"] for x in c]
    lows = [x["l"] for x in c]

    e20, e50, e200 = ema(closes, 20), ema(closes, 50), ema(closes, 200)
    a = atr(c, 14)
    rp = rsi(c, 14)
    ax = adx_proxy(c, 14)

    st20 = std_window(closes, 20)
    bb_mid = ema(closes, 20)

    regime = ["neutral"] * len(c)
    trend_sig = [0] * len(c)
    range_sig = [0] * len(c)

    for i in range(40, len(c)):
        atrp = a[i] / closes[i]
        bb_width = (4 * st20[i] / bb_mid[i]) if st20[i] is not None and bb_mid[i] else 0.0
        trend_sep = abs(e50[i] - e200[i]) / closes[i]

        is_trending = (
            ax[i] >= cfg["trend_ax_min"]
            and trend_sep >= cfg["trend_sep_min"]
            and cfg["atr_min"] <= atrp <= cfg["atr_max"]
        )
        is_ranging = (
            ax[i] <= cfg["range_ax_max"]
            and bb_width <= cfg["range_bb_width_max"]
            and atrp <= cfg["range_atr_max"]
        )

        if is_trending:
            regime[i] = "trend"
            hh = max(highs[i - cfg["trend_breakout_lb"] : i])
            ll = min(lows[i - cfg["trend_breakout_lb"] : i])
            if e50[i] > e200[i] and closes[i] > hh:
                trend_sig[i] = 1
            elif e50[i] < e200[i] and closes[i] < ll:
                trend_sig[i] = -1

        elif is_ranging:
            regime[i] = "range"
            upper = bb_mid[i] + 2 * (st20[i] or 0.0)
            lower = bb_mid[i] - 2 * (st20[i] or 0.0)
            if closes[i] <= lower and rp[i] <= cfg["range_rsi_long_max"]:
                range_sig[i] = 1
            elif closes[i] >= upper and rp[i] >= cfg["range_rsi_short_min"]:
                range_sig[i] = -1

    return regime, trend_sig, range_sig, bb_mid


def backtest_combo(c, cfg, fee=0.00025):
    closes = [x["c"] for x in c]
    highs = [x["h"] for x in c]
    lows = [x["l"] for x in c]

    regime, trend_sig, range_sig, bb_mid = regime_and_signals(c, cfg)

    eq, peak, maxdd = 1.0, 1.0, 0.0
    pos, entry, mode, bars = 0, 0.0, None, 0
    trades = []

    for i in range(1, len(c)):
        # Entry only when flat
        if pos == 0:
            if regime[i] == "trend" and trend_sig[i] != 0:
                pos = trend_sig[i]
                entry = closes[i]
                mode = "trend"
                bars = 0
            elif regime[i] == "range" and range_sig[i] != 0:
                pos = range_sig[i]
                entry = closes[i]
                mode = "range"
                bars = 0
            continue

        bars += 1
        exit_px = None

        if mode == "trend":
            sl = entry * (1 - cfg["trend_sl"]) if pos == 1 else entry * (1 + cfg["trend_sl"])
            tp = entry * (1 + cfg["trend_tp"]) if pos == 1 else entry * (1 - cfg["trend_tp"])
            if pos == 1:
                if lows[i] <= sl:
                    exit_px = sl
                elif highs[i] >= tp:
                    exit_px = tp
            else:
                if highs[i] >= sl:
                    exit_px = sl
                elif lows[i] <= tp:
                    exit_px = tp
            if exit_px is None and bars >= cfg["trend_max_hold"]:
                exit_px = closes[i]

        elif mode == "range":
            sl = entry * (1 - cfg["range_sl"]) if pos == 1 else entry * (1 + cfg["range_sl"])
            tp = entry * (1 + cfg["range_tp"]) if pos == 1 else entry * (1 - cfg["range_tp"])
            # mean reversion exit at bb mid if touched first
            mid = bb_mid[i] if bb_mid[i] is not None else closes[i]
            if pos == 1:
                if lows[i] <= sl:
                    exit_px = sl
                elif highs[i] >= mid:
                    exit_px = mid
                elif highs[i] >= tp:
                    exit_px = tp
            else:
                if highs[i] >= sl:
                    exit_px = sl
                elif lows[i] <= mid:
                    exit_px = mid
                elif lows[i] <= tp:
                    exit_px = tp
            if exit_px is None and bars >= cfg["range_max_hold"]:
                exit_px = closes[i]

        # regime invalidation exit
        if exit_px is None and ((mode == "trend" and regime[i] != "trend") or (mode == "range" and regime[i] != "range")):
            exit_px = closes[i]

        if exit_px is not None:
            net = ((exit_px / entry - 1.0) * pos) - 2 * fee
            eq *= 1 + net
            trades.append(net)
            peak = max(peak, eq)
            maxdd = max(maxdd, (peak - eq) / peak)
            pos, entry, mode, bars = 0, 0.0, None, 0

    wins = [x for x in trades if x > 0]
    losses = [x for x in trades if x < 0]
    pf = sum(wins) / abs(sum(losses)) if losses else float("inf")
    return {
        "trades": len(trades),
        "win": (len(wins) / len(trades) * 100) if trades else 0.0,
        "ret": (eq - 1) * 100,
        "dd": maxdd * 100,
        "pf": pf,
    }


def split(c, ratio=0.7):
    k = int(len(c) * ratio)
    return c[:k], c[k:]


def fmt(name, r):
    return f"{name:18} | {r['trades']:5d} | {r['win']:5.1f} | {r['ret']:7.2f} | {r['dd']:6.2f} | {r['pf']:5.2f}"


def main():
    c = fetch_hl(730)
    train, test = split(c, 0.7)

    options = {
        "A_Conservative": {
            "trend_ax_min": 0.22, "trend_sep_min": 0.035, "atr_min": 0.011, "atr_max": 0.030,
            "range_ax_max": 0.12, "range_bb_width_max": 0.055, "range_atr_max": 0.020,
            "trend_breakout_lb": 24, "range_rsi_long_max": 34, "range_rsi_short_min": 66,
            "trend_sl": 0.018, "trend_tp": 0.050, "trend_max_hold": 20,
            "range_sl": 0.012, "range_tp": 0.020, "range_max_hold": 10,
        },
        "B_Balanced": {
            "trend_ax_min": 0.18, "trend_sep_min": 0.025, "atr_min": 0.010, "atr_max": 0.034,
            "range_ax_max": 0.14, "range_bb_width_max": 0.065, "range_atr_max": 0.023,
            "trend_breakout_lb": 20, "range_rsi_long_max": 36, "range_rsi_short_min": 64,
            "trend_sl": 0.020, "trend_tp": 0.052, "trend_max_hold": 18,
            "range_sl": 0.013, "range_tp": 0.022, "range_max_hold": 9,
        },
        "C_Aggressive": {
            "trend_ax_min": 0.15, "trend_sep_min": 0.018, "atr_min": 0.009, "atr_max": 0.038,
            "range_ax_max": 0.17, "range_bb_width_max": 0.075, "range_atr_max": 0.028,
            "trend_breakout_lb": 16, "range_rsi_long_max": 38, "range_rsi_short_min": 62,
            "trend_sl": 0.022, "trend_tp": 0.055, "trend_max_hold": 16,
            "range_sl": 0.015, "range_tp": 0.025, "range_max_hold": 8,
        },
    }

    print(f"Candles: {len(c)}")
    print(f"Period: {time.strftime('%Y-%m-%d', time.gmtime(c[0]['t']/1000))} -> {time.strftime('%Y-%m-%d', time.gmtime(c[-1]['t']/1000))}")
    print("Option             | Trds  | Win%  | Ret%    | MaxDD% | PF")
    print("-" * 64)
    for name, cfg in options.items():
        r_full = backtest_combo(c, cfg)
        r_test = backtest_combo(test, cfg)
        print(fmt(name + " (FULL)", r_full))
        print(fmt(name + " (TEST)", r_test))
        print("-" * 64)


if __name__ == "__main__":
    main()
