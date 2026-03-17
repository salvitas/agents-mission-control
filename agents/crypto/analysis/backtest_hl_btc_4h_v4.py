#!/usr/bin/env python3
import json, time, urllib.request

def fetch(days=730):
    end_ms=int(time.time()*1000); start_ms=end_ms-days*24*60*60*1000
    payload={"type":"candleSnapshot","req":{"coin":"BTC","interval":"4h","startTime":start_ms,"endTime":end_ms}}
    req=urllib.request.Request("https://api.hyperliquid.xyz/info",data=json.dumps(payload).encode(),headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=30) as r: raw=json.loads(r.read().decode())
    c=[]
    for x in raw: c.append({"t":int(x["t"]),"o":float(x["o"]),"h":float(x["h"]),"l":float(x["l"]),"c":float(x["c"])})
    c.sort(key=lambda z:z["t"])
    return c

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

def build_sig(candles, trend_up=0.0, trend_dn=0.0, atr_min=0.011, atr_max=0.032):
    cl=[x["c"] for x in candles]
    e20,e50,e200=ema(cl,20),ema(cl,50),ema(cl,200)
    a=atr(candles,14)
    sig=[0]*len(cl)
    for i in range(50,len(cl)):
        atrp=a[i]/cl[i]
        if not (atr_min<=atrp<=atr_max):
            sig[i]=0; continue
        slope50=(e50[i]-e50[i-8])/e50[i-8]
        # no-trade chop filter
        if abs(slope50)<0.004: sig[i]=0; continue
        # long-only in up regime
        if e50[i]>e200[i] and slope50>trend_up:
            pullback=(cl[i-1]<e20[i-1] and cl[i]>e20[i])
            breakout=(cl[i]>max(x["h"] for x in candles[i-18:i]))
            sig[i]=1 if (pullback or breakout) else 0
        # short-only in down regime
        elif e50[i]<e200[i] and slope50<trend_dn:
            pullback=(cl[i-1]>e20[i-1] and cl[i]<e20[i])
            breakdown=(cl[i]<min(x["l"] for x in candles[i-18:i]))
            sig[i]=-1 if (pullback or breakdown) else 0
        else:
            sig[i]=0
    return sig

def bt(candles,sig,fee=0.00025,sl=0.018,tp=0.045,max_hold=14,cool=3):
    c=[x["c"] for x in candles]; h=[x["h"] for x in candles]; l=[x["l"] for x in candles]
    eq=1.0; peak=1.0; dd=0.0; pos=0; ent=0.0; bars=0; cd=0; tr=[]
    for i in range(1,len(c)):
        if cd>0: cd-=1
        s=sig[i]
        if pos==0 and cd==0 and s!=0:
            pos=s; ent=c[i]; bars=0; continue
        if pos!=0:
            bars+=1
            stop=ent*(1-sl) if pos==1 else ent*(1+sl)
            take=ent*(1+tp) if pos==1 else ent*(1-tp)
            xp=None
            if pos==1:
                if l[i]<=stop: xp=stop
                elif h[i]>=take: xp=take
            else:
                if h[i]>=stop: xp=stop
                elif l[i]<=take: xp=take
            if xp is None and bars>=max_hold: xp=c[i]
            if xp is None and s==-pos: xp=c[i]
            if xp is not None:
                net=((xp/ent-1)*pos)-2*fee
                eq*=1+net; tr.append(net)
                peak=max(peak,eq); dd=max(dd,(peak-eq)/peak)
                pos=0; ent=0.0; bars=0; cd=cool
    if pos!=0:
        net=((c[-1]/ent-1)*pos)-2*fee
        eq*=1+net; tr.append(net); peak=max(peak,eq); dd=max(dd,(peak-eq)/peak)
    w=[x for x in tr if x>0]; ls=[x for x in tr if x<0]
    pf=sum(w)/abs(sum(ls)) if ls else float('inf')
    return {"tr":len(tr),"win":(len(w)/len(tr)*100 if tr else 0),"ret":(eq-1)*100,"dd":dd*100,"pf":pf}

def row(n,r): return f"{n:14} | {r['tr']:5d} | {r['win']:5.1f} | {r['ret']:7.2f} | {r['dd']:6.2f} | {r['pf']:5.2f}"

def main():
    c=fetch(730); k=int(len(c)*0.7); trn,tst=c[:k],c[k:]
    best=None
    for tu in [0.0,0.002,0.004]:
        for td in [0.0,-0.002,-0.004]:
            for amin,amax in [(0.010,0.034),(0.011,0.032),(0.012,0.030)]:
                s=build_sig(trn,tu,td,amin,amax); r=bt(trn,s)
                score=r['ret']-0.8*r['dd']+(r['pf']-1)*20
                if best is None or score>best[0]: best=(score,tu,td,amin,amax,r)
    _,tu,td,amin,amax,rtr=best
    rt=bt(tst,build_sig(tst,tu,td,amin,amax))
    rf=bt(c,build_sig(c,tu,td,amin,amax))
    print(f"Candles: {len(c)}")
    print(f"Best params: trend_up>{tu}, trend_dn<{td}, atr[{amin},{amax}]")
    print("Set            | Trds | Win%  | Ret%    | MaxDD% | PF")
    print("-"*62)
    print(row("TRAIN (70%)",rtr))
    print(row("TEST (30%)",rt))
    print(row("FULL (100%)",rf))

if __name__=='__main__':
    main()
