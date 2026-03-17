#!/usr/bin/env bash
set -euo pipefail

CFG="/Users/salva/.openclaw/workspace/agents/crypto/config/mcporter.json"
LOG="/Users/salva/.openclaw/workspace/agents/crypto/analysis/monitor_v2b_live.log"

check_signal() {
python3 - <<'PY'
import json, time, urllib.request

def ema(v,p):
    k=2/(p+1); e=v[0]; o=[]
    for x in v:
        e=x*k+e*(1-k); o.append(e)
    return o

def atr(c,p=14):
    tr=[0.0]
    for i in range(1,len(c)):
        h,l,pc=c[i]['h'],c[i]['l'],c[i-1]['c']
        tr.append(max(h-l,abs(h-pc),abs(l-pc)))
    return ema(tr,p)

def rsi(c,p=14):
    cl=[x['c'] for x in c]
    g=[0.0]; ls=[0.0]
    for i in range(1,len(cl)):
        d=cl[i]-cl[i-1]; g.append(max(d,0)); ls.append(max(-d,0))
    ag=ema(g,p); al=ema(ls,p)
    out=[]
    for a,b in zip(ag,al): out.append(100 if b==0 else 100-100/(1+a/b))
    return out

def stdw(vals,p):
    import statistics
    out=[None]*len(vals)
    for i in range(p-1,len(vals)): out[i]=statistics.pstdev(vals[i-p+1:i+1])
    return out

def trend_strength(c,p=14):
    cl=[x['c'] for x in c]
    ret=[0.0]
    for i in range(1,len(cl)): ret.append((cl[i]-cl[i-1])/cl[i-1])
    er=ema(ret,p); ea=ema([abs(x) for x in ret],p)
    return [abs(a)/b if b>0 else 0 for a,b in zip(er,ea)]

end=int(time.time()*1000); start=end-60*24*60*60*1000
payload={"type":"candleSnapshot","req":{"coin":"BTC","interval":"4h","startTime":start,"endTime":end}}
req=urllib.request.Request("https://api.hyperliquid.xyz/info",data=json.dumps(payload).encode(),headers={"Content-Type":"application/json"})
with urllib.request.urlopen(req,timeout=20) as r: raw=json.loads(r.read().decode())
raw.sort(key=lambda x:x['t'])
c=[{"o":float(x['o']),"h":float(x['h']),"l":float(x['l']),"c":float(x['c']),"v":float(x.get('v',0))} for x in raw]
cl=[x['c'] for x in c]; hi=[x['h'] for x in c]; lo=[x['l'] for x in c]; v=[x['v'] for x in c]

# V2_B params
trend_ts_min=0.18; trend_sep_min=0.020; atr_min=0.009; atr_max=0.036; vol_mult=1.05
range_ts_max=0.12; range_bbw_max=0.065; range_atr_max=0.023
trend_lb=18; range_rsi_lo=36; range_rsi_hi=64

e20,e50,e200=ema(cl,20),ema(cl,50),ema(cl,200)
a=atr(c,14); rp=rsi(c,14); ts=trend_strength(c,14)
st=stdw(cl,20); mid=ema(cl,20); vema=ema(v,20)

i=len(c)-1
atrp=a[i]/cl[i]
bbw=(4*st[i]/mid[i]) if st[i] is not None and mid[i] else 0
sep=abs(e50[i]-e200[i])/cl[i]
vol_ok=v[i] > vema[i]*vol_mult

reg='neutral'; sig=0; mode='neutral'
if ts[i]>=trend_ts_min and sep>=trend_sep_min and atr_min<=atrp<=atr_max and vol_ok:
    reg='trend'; mode='trend'
    hh=max(hi[i-trend_lb:i]); ll=min(lo[i-trend_lb:i])
    long_cond=(e50[i]>e200[i]) and (cl[i]>hh or (cl[i-1]<e20[i-1] and cl[i]>e20[i]))
    short_cond=(e50[i]<e200[i]) and (cl[i]<ll or (cl[i-1]>e20[i-1] and cl[i]<e20[i]))
    sig=1 if long_cond else (-1 if short_cond else 0)
elif ts[i]<=range_ts_max and bbw<=range_bbw_max and atrp<=range_atr_max:
    reg='range'; mode='range'
    upper=mid[i]+2*(st[i] or 0); lower=mid[i]-2*(st[i] or 0)
    long_cond=(cl[i]<=lower and rp[i]<=range_rsi_lo)
    short_cond=(cl[i]>=upper and rp[i]>=range_rsi_hi)
    sig=1 if long_cond else (-1 if short_cond else 0)

out={"signal":sig,"mode":mode,"atr":a[i],"close":cl[i],"regime":reg}
print(json.dumps(out))
PY
}

while true; do
  {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] tick"

    # Skip if existing position/order
    POS=$(zsh -lc "source ~/.zshrc && mcporter --config $CFG call hyperliquid.hyperliquid_get_positions")
    OPN=$(zsh -lc "source ~/.zshrc && mcporter --config $CFG call hyperliquid.hyperliquid_get_open_orders")

    POSN=$(python3 - <<PY
import json
p=json.loads('''$POS''')
print(p.get('summary',{}).get('numberOfPositions',0))
PY
)
    ORDN=$(python3 - <<PY
import json
o=json.loads('''$OPN''')
print(o.get('summary',{}).get('numberOfOrders',0))
PY
)

    if [ "$POSN" != "0" ] || [ "$ORDN" != "0" ]; then
      echo "skip: active position/order pos=$POSN ord=$ORDN"
      sleep 900
      continue
    fi

    SIG=$(check_signal)
    SIGNAL=$(python3 - <<PY
import json
d=json.loads('''$SIG''')
print(d['signal'])
PY
)
    MODE=$(python3 - <<PY
import json
d=json.loads('''$SIG''')
print(d['mode'])
PY
)
    ATR=$(python3 - <<PY
import json
d=json.loads('''$SIG''')
print(d['atr'])
PY
)

    if [ "$SIGNAL" = "0" ]; then
      echo "no setup"
      sleep 900
      continue
    fi

    MIDS=$(zsh -lc "source ~/.zshrc && mcporter --config $CFG call hyperliquid.hyperliquid_get_all_mids")
    BAL=$(zsh -lc "source ~/.zshrc && mcporter --config $CFG call hyperliquid.hyperliquid_get_balance")

    ENTRY=$(python3 - <<PY
import json
m=json.loads('''$MIDS''')
print(float(m['data']['BTC']))
PY
)
    EQUITY=$(python3 - <<PY
import json
b=json.loads('''$BAL''')
print(float(b['summary']['accountValue']))
PY
)

    PY=$(python3 - <<PY
import json
signal=int('$SIGNAL'); mode='$MODE'; atr=float('$ATR'); entry=float('$ENTRY'); equity=float('$EQUITY')
risk_usd=equity*0.0075
if mode=='trend':
    sl_dist=1.6*atr; tp_dist=3.4*atr
else:
    sl_dist=1.1*atr; tp_dist=2.0*atr
size=risk_usd/sl_dist if sl_dist>0 else 0
if size*entry < 10:
    size=10/entry
size=max(size,0.0002)
if signal==1:
    sl=entry-sl_dist; tp=entry+tp_dist; is_buy='true'
else:
    sl=entry+sl_dist; tp=entry-tp_dist; is_buy='false'
print(json.dumps({"is_buy":is_buy,"size":f"{size:.5f}","entry":f"{entry:.1f}","tp":f"{tp:.1f}","sl":f"{sl:.1f}"}))
PY
)

    ISBUY=$(python3 - <<PY
import json
d=json.loads('''$PY'''); print(d['is_buy'])
PY
)
    SIZE=$(python3 - <<PY
import json
d=json.loads('''$PY'''); print(d['size'])
PY
)
    E=$(python3 - <<PY
import json
d=json.loads('''$PY'''); print(d['entry'])
PY
)
    TP=$(python3 - <<PY
import json
d=json.loads('''$PY'''); print(d['tp'])
PY
)
    SL=$(python3 - <<PY
import json
d=json.loads('''$PY'''); print(d['sl'])
PY
)

    echo "execute signal=$SIGNAL mode=$MODE entry=$E size=$SIZE sl=$SL tp=$TP"
    zsh -lc "source ~/.zshrc && mcporter --config $CFG call \"hyperliquid.hyperliquid_place_bracket_order(asset: 0, isBuy: $ISBUY, size: \\\"$SIZE\\\", entryPrice: \\\"$E\\\", takeProfitPrice: \\\"$TP\\\", stopLossPrice: \\\"$SL\\\")\""

  } >> "$LOG" 2>&1

  sleep 900
done
