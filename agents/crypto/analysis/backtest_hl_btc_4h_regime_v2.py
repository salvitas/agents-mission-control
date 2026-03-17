#!/usr/bin/env python3
import json, time, urllib.request, statistics


def fetch(days=730):
    end_ms=int(time.time()*1000); start_ms=end_ms-days*24*60*60*1000
    payload={"type":"candleSnapshot","req":{"coin":"BTC","interval":"4h","startTime":start_ms,"endTime":end_ms}}
    req=urllib.request.Request("https://api.hyperliquid.xyz/info",data=json.dumps(payload).encode(),headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=30) as r: raw=json.loads(r.read().decode())
    out=[]
    for x in raw:
        out.append({"t":int(x["t"]),"o":float(x["o"]),"h":float(x["h"]),"l":float(x["l"]),"c":float(x["c"]),"v":float(x.get("v",0.0))})
    out.sort(key=lambda z:z["t"])
    return out


def ema(v,p):
    k=2/(p+1); e=v[0]; o=[]
    for x in v: e=x*k+e*(1-k); o.append(e)
    return o


def atr(c,p=14):
    tr=[0.0]
    for i in range(1,len(c)):
        h,l,pc=c[i]["h"],c[i]["l"],c[i-1]["c"]
        tr.append(max(h-l,abs(h-pc),abs(l-pc)))
    return ema(tr,p)


def rsi(c,p=14):
    cl=[x["c"] for x in c]
    g=[0.0]; ls=[0.0]
    for i in range(1,len(cl)):
        d=cl[i]-cl[i-1]; g.append(max(d,0.0)); ls.append(max(-d,0.0))
    ag=ema(g,p); al=ema(ls,p)
    out=[]
    for a,b in zip(ag,al):
        out.append(100.0 if b==0 else 100-100/(1+a/b))
    return out


def trend_strength(c,p=14):
    cl=[x["c"] for x in c]
    ret=[0.0]
    for i in range(1,len(cl)): ret.append((cl[i]-cl[i-1])/cl[i-1])
    er=ema(ret,p); ea=ema([abs(x) for x in ret],p)
    return [abs(a)/b if b>0 else 0.0 for a,b in zip(er,ea)]


def stdw(vals,p):
    out=[None]*len(vals)
    for i in range(p-1,len(vals)): out[i]=statistics.pstdev(vals[i-p+1:i+1])
    return out


def percentile(arr, q):
    if not arr: return 0.0
    a=sorted(arr); idx=int((len(a)-1)*q)
    return a[idx]


def regime_signals(c,cfg):
    cl=[x["c"] for x in c]; hi=[x["h"] for x in c]; lo=[x["l"] for x in c]; vol=[x["v"] for x in c]
    e20,e50,e200=ema(cl,20),ema(cl,50),ema(cl,200)
    a=atr(c,14); rp=rsi(c,14); ts=trend_strength(c,14)
    st20=stdw(cl,20); mid=ema(cl,20)
    vema=ema(vol,20)

    reg=["neutral"]*len(c); sig=[0]*len(c); mode=[None]*len(c)
    for i in range(40,len(c)):
        atrp=a[i]/cl[i]
        bbw=(4*st20[i]/mid[i]) if st20[i] is not None and mid[i] else 0.0
        sep=abs(e50[i]-e200[i])/cl[i]
        vol_ok=vol[i] > vema[i]*cfg["vol_mult"]

        is_trend = ts[i]>=cfg["trend_ts_min"] and sep>=cfg["trend_sep_min"] and cfg["atr_min"]<=atrp<=cfg["atr_max"] and vol_ok
        is_range = ts[i]<=cfg["range_ts_max"] and bbw<=cfg["range_bbw_max"] and atrp<=cfg["range_atr_max"]

        if is_trend:
            reg[i]="trend"
            # trend strategy (long/short breakout+pullback blend)
            hh=max(hi[i-cfg["trend_lb"]:i]); ll=min(lo[i-cfg["trend_lb"]:i])
            long_cond=(e50[i]>e200[i]) and (cl[i]>hh or (cl[i-1]<e20[i-1] and cl[i]>e20[i]))
            short_cond=(e50[i]<e200[i]) and (cl[i]<ll or (cl[i-1]>e20[i-1] and cl[i]<e20[i]))
            if long_cond: sig[i]=1
            elif short_cond: sig[i]=-1
            mode[i]="trend"
        elif is_range:
            reg[i]="range"
            upper=mid[i]+2*(st20[i] or 0.0); lower=mid[i]-2*(st20[i] or 0.0)
            long_cond=(cl[i]<=lower and rp[i]<=cfg["range_rsi_lo"])
            short_cond=(cl[i]>=upper and rp[i]>=cfg["range_rsi_hi"])
            if long_cond: sig[i]=1
            elif short_cond: sig[i]=-1
            mode[i]="range"
    return reg,sig,mode,a,mid


def backtest(c,cfg,fee=0.00025):
    cl=[x["c"] for x in c]; hi=[x["h"] for x in c]; lo=[x["l"] for x in c]
    reg,sig,mode,a,mid=regime_signals(c,cfg)

    eq=1.0; peak=1.0; dd=0.0; pos=0; ent=0.0; md=None; bars=0; trades=[]
    for i in range(1,len(c)):
        if pos==0 and sig[i]!=0:
            pos=sig[i]; ent=cl[i]; md=mode[i]; bars=0; continue
        if pos!=0:
            bars+=1
            atrv=a[i]
            if md=="trend":
                sl=ent - cfg["trend_sl_atr"]*atrv if pos==1 else ent + cfg["trend_sl_atr"]*atrv
                tp=ent + cfg["trend_tp_atr"]*atrv if pos==1 else ent - cfg["trend_tp_atr"]*atrv
                max_hold=cfg["trend_max_hold"]
            else:
                sl=ent - cfg["range_sl_atr"]*atrv if pos==1 else ent + cfg["range_sl_atr"]*atrv
                tp=ent + cfg["range_tp_atr"]*atrv if pos==1 else ent - cfg["range_tp_atr"]*atrv
                max_hold=cfg["range_max_hold"]

            xp=None
            if pos==1:
                if lo[i]<=sl: xp=sl
                elif hi[i]>=tp: xp=tp
                elif md=="range" and hi[i]>=mid[i]: xp=mid[i]
            else:
                if hi[i]>=sl: xp=sl
                elif lo[i]<=tp: xp=tp
                elif md=="range" and lo[i]<=mid[i]: xp=mid[i]

            if xp is None and bars>=max_hold: xp=cl[i]
            if xp is None and reg[i]=="neutral": xp=cl[i]

            if xp is not None:
                net=((xp/ent-1)*pos)-2*fee
                eq*=1+net; trades.append(net)
                peak=max(peak,eq); dd=max(dd,(peak-eq)/peak)
                pos=0; ent=0.0; md=None; bars=0

    wins=[x for x in trades if x>0]; losses=[x for x in trades if x<0]
    pf=sum(wins)/abs(sum(losses)) if losses else float('inf')
    return {"trades":len(trades),"win":(len(wins)/len(trades)*100 if trades else 0),"ret":(eq-1)*100,"dd":dd*100,"pf":pf}


def walk_forward(c,cfg,train=900,test=220,step=220):
    rs=[]; start=0
    while start+train+test<=len(c):
        ts=c[start+train:start+train+test]
        r=backtest(ts,cfg)
        rs.append(r)
        start+=step
    if not rs:
        return {"folds":0,"trades":0,"win":0,"ret":0,"dd":0,"pf":0}

    # conservative aggregate: sum returns across independent fold windows,
    # weighted win-rate by trade count, mean drawdown across folds.
    total_trades=sum(x["trades"] for x in rs)
    weighted_win=(sum(x["win"]*x["trades"] for x in rs)/total_trades) if total_trades else 0
    total_ret=sum(x["ret"] for x in rs)
    mean_dd=sum(x["dd"] for x in rs)/len(rs)
    mean_pf=sum((x["pf"] if x["pf"]!=float('inf') else 3.0) for x in rs)/len(rs)

    return {
        "folds":len(rs),
        "trades":total_trades,
        "win":weighted_win,
        "ret":total_ret,
        "dd":mean_dd,
        "pf":mean_pf,
    }


def fmt(name,r):
    return f"{name:16} | {int(r['trades']):5d} | {r['win']:5.1f} | {r['ret']:7.2f} | {r['dd']:6.2f} | {r['pf']:5.2f}"


def main():
    c=fetch(730)
    options={
      "V2_A":{
        "trend_ts_min":0.20,"trend_sep_min":0.025,"atr_min":0.010,"atr_max":0.033,"vol_mult":1.10,
        "range_ts_max":0.10,"range_bbw_max":0.055,"range_atr_max":0.020,
        "trend_lb":20,"range_rsi_lo":35,"range_rsi_hi":65,
        "trend_sl_atr":1.4,"trend_tp_atr":3.2,"trend_max_hold":20,
        "range_sl_atr":1.0,"range_tp_atr":1.8,"range_max_hold":10,
      },
      "V2_B":{
        "trend_ts_min":0.18,"trend_sep_min":0.020,"atr_min":0.009,"atr_max":0.036,"vol_mult":1.05,
        "range_ts_max":0.12,"range_bbw_max":0.065,"range_atr_max":0.023,
        "trend_lb":18,"range_rsi_lo":36,"range_rsi_hi":64,
        "trend_sl_atr":1.6,"trend_tp_atr":3.4,"trend_max_hold":18,
        "range_sl_atr":1.1,"range_tp_atr":2.0,"range_max_hold":9,
      },
      "V2_C":{
        "trend_ts_min":0.16,"trend_sep_min":0.018,"atr_min":0.009,"atr_max":0.038,"vol_mult":1.00,
        "range_ts_max":0.14,"range_bbw_max":0.075,"range_atr_max":0.027,
        "trend_lb":16,"range_rsi_lo":38,"range_rsi_hi":62,
        "trend_sl_atr":1.8,"trend_tp_atr":3.6,"trend_max_hold":16,
        "range_sl_atr":1.2,"range_tp_atr":2.2,"range_max_hold":8,
      }
    }

    print(f"Candles: {len(c)}")
    print("FULL SAMPLE")
    print("Option            | Trds  | Win%  | Ret%    | MaxDD% | PF")
    print("-"*64)
    for n,cfg in options.items():
        r=backtest(c,cfg)
        print(fmt(n,r))

    print("\nROLLING WALK-FORWARD (train 900 bars, test 220 bars, step 220)")
    print("Option            | Trds  | Win%  | Ret%    | MaxDD% | PF")
    print("-"*64)
    for n,cfg in options.items():
        r=walk_forward(c,cfg,train=900,test=220,step=220)
        print(fmt(n+f" ({r['folds']}f)",r))

if __name__=='__main__':
    main()
