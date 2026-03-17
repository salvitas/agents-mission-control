#!/usr/bin/env python3
import json
import math
import time
import urllib.request
from dataclasses import dataclass


def fetch_hyperliquid_candles(coin="BTC", interval="4h", days=730):
    end_ms = int(time.time() * 1000)
    start_ms = end_ms - days * 24 * 60 * 60 * 1000
    payload = {
        "type": "candleSnapshot",
        "req": {
            "coin": coin,
            "interval": interval,
            "startTime": start_ms,
            "endTime": end_ms,
        },
    }
    req = urllib.request.Request(
        "https://api.hyperliquid.xyz/info",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = json.loads(r.read().decode())

    candles = []
    for x in raw:
        candles.append(
            {
                "t": int(x["t"]),
                "o": float(x["o"]),
                "h": float(x["h"]),
                "l": float(x["l"]),
                "c": float(x["c"]),
                "v": float(x["v"]),
            }
        )
    candles.sort(key=lambda z: z["t"])
    return candles


def ema(values, period):
    k = 2 / (period + 1)
    out = []
    e = values[0]
    for v in values:
        e = v * k + e * (1 - k)
        out.append(e)
    return out


def highest(values, lookback):
    out = [None] * len(values)
    for i in range(lookback - 1, len(values)):
        out[i] = max(values[i - lookback + 1 : i + 1])
    return out


def lowest(values, lookback):
    out = [None] * len(values)
    for i in range(lookback - 1, len(values)):
        out[i] = min(values[i - lookback + 1 : i + 1])
    return out


def macd(values, fast=12, slow=26, signal=9):
    ef = ema(values, fast)
    es = ema(values, slow)
    m = [a - b for a, b in zip(ef, es)]
    s = ema(m, signal)
    return m, s


@dataclass
class Result:
    name: str
    trades: int
    win_rate: float
    total_return_pct: float
    max_drawdown_pct: float
    profit_factor: float


def run_backtest(candles, signal_fn, name, fee_per_side=0.00025):
    closes = [x["c"] for x in candles]
    signals = signal_fn(candles)

    equity = 1.0
    peak = 1.0
    max_dd = 0.0

    pos = 0  # -1 short, 0 flat, 1 long
    entry = 0.0
    trade_pnls = []

    for i in range(1, len(closes)):
        s = signals[i]
        px = closes[i]

        # execute reversals at close
        if s != pos:
            if pos != 0:
                gross = (px / entry - 1.0) * pos
                net = gross - 2 * fee_per_side
                equity *= 1 + net
                trade_pnls.append(net)
                peak = max(peak, equity)
                max_dd = max(max_dd, (peak - equity) / peak)
            if s != 0:
                pos = s
                entry = px
            else:
                pos = 0
                entry = 0.0

    # close last open trade at final bar
    if pos != 0:
        px = closes[-1]
        gross = (px / entry - 1.0) * pos
        net = gross - 2 * fee_per_side
        equity *= 1 + net
        trade_pnls.append(net)
        peak = max(peak, equity)
        max_dd = max(max_dd, (peak - equity) / peak)

    wins = [p for p in trade_pnls if p > 0]
    losses = [p for p in trade_pnls if p < 0]
    profit_factor = (sum(wins) / abs(sum(losses))) if losses else float("inf")

    return Result(
        name=name,
        trades=len(trade_pnls),
        win_rate=(len(wins) / len(trade_pnls) * 100.0) if trade_pnls else 0.0,
        total_return_pct=(equity - 1.0) * 100.0,
        max_drawdown_pct=max_dd * 100.0,
        profit_factor=profit_factor,
    )


def sig_ema_cross(candles):
    c = [x["c"] for x in candles]
    e50 = ema(c, 50)
    e200 = ema(c, 200)
    out = [0] * len(c)
    for i in range(len(c)):
        out[i] = 1 if e50[i] > e200[i] else -1
    return out


def sig_turtle(candles):
    c = [x["c"] for x in candles]
    h = [x["h"] for x in candles]
    l = [x["l"] for x in candles]

    out = [0] * len(c)
    pos = 0
    for i in range(21, len(c)):
        px = c[i]
        hh20_prev = max(h[i - 20 : i])
        ll20_prev = min(l[i - 20 : i])
        hh10_prev = max(h[i - 10 : i])
        ll10_prev = min(l[i - 10 : i])

        if pos == 0:
            if px > hh20_prev:
                pos = 1
            elif px < ll20_prev:
                pos = -1
        elif pos == 1:
            if px < ll10_prev:
                pos = 0
            if px < ll20_prev:
                pos = -1
        elif pos == -1:
            if px > hh10_prev:
                pos = 0
            if px > hh20_prev:
                pos = 1

        out[i] = pos
    return out


def sig_macd_trend(candles):
    c = [x["c"] for x in candles]
    e200 = ema(c, 200)
    m, s = macd(c)
    out = [0] * len(c)
    pos = 0
    for i in range(1, len(c)):
        cross_up = m[i] > s[i] and m[i - 1] <= s[i - 1]
        cross_dn = m[i] < s[i] and m[i - 1] >= s[i - 1]
        if cross_up and c[i] > e200[i]:
            pos = 1
        elif cross_dn and c[i] < e200[i]:
            pos = -1
        out[i] = pos
    return out


def sig_breakout_trend(candles):
    c = [x["c"] for x in candles]
    h = [x["h"] for x in candles]
    l = [x["l"] for x in candles]
    e50 = ema(c, 50)
    e200 = ema(c, 200)
    out = [0] * len(c)
    pos = 0
    lb = 40
    for i in range(lb + 1, len(c)):
        px = c[i]
        hh_prev = max(h[i - lb : i])
        ll_prev = min(l[i - lb : i])

        if pos == 0:
            if px > hh_prev and e50[i] > e200[i]:
                pos = 1
            elif px < ll_prev and e50[i] < e200[i]:
                pos = -1
        elif pos == 1:
            if px < e50[i]:
                pos = 0
        elif pos == -1:
            if px > e50[i]:
                pos = 0
        out[i] = pos
    return out


def main():
    candles = fetch_hyperliquid_candles("BTC", "4h", 730)
    results = [
        run_backtest(candles, sig_ema_cross, "EMA50/200 Long+Short"),
        run_backtest(candles, sig_turtle, "Turtle(20/10) Long+Short"),
        run_backtest(candles, sig_macd_trend, "MACD+EMA200 Long+Short"),
        run_backtest(candles, sig_breakout_trend, "Breakout40+TrendFilter"),
    ]

    print(f"Candles fetched from Hyperliquid: {len(candles)}")
    print(f"Period: {time.strftime('%Y-%m-%d', time.gmtime(candles[0]['t']/1000))} -> {time.strftime('%Y-%m-%d', time.gmtime(candles[-1]['t']/1000))}")
    print()
    print("Strategy | Trades | Win% | Return% | MaxDD% | ProfitFactor")
    print("-" * 72)
    for r in results:
        print(
            f"{r.name:27} | {r.trades:6d} | {r.win_rate:5.1f} | {r.total_return_pct:7.1f} | {r.max_drawdown_pct:6.1f} | {r.profit_factor:11.2f}"
        )


if __name__ == "__main__":
    main()
