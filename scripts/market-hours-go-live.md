# Market Hours Go-Live Checklist

## ✅ Systems Verified (Aug 20, 1:00 AM PDT)

### Core Infrastructure
- [x] **Production Status**: Healthy, all systems operational  
- [x] **Database Fix**: Deployed schema initialization in startup
- [x] **Portfolio API**: Working (`/api/portfolio/positions`)
- [x] **Orders Interface**: Active (`/orders-log.html`)
- [x] **Main Dashboard**: Accessible (`/portfolio-lpi-v2.html`)

### Conservative Risk Parameters  
- [x] **Daily Cap**: $500 (reduced 75% from $2000)
- [x] **Per-Ticker**: $150 (reduced 70% from $500)  
- [x] **Shadow Mode**: ORDERS_ENABLED=0 (ready to flip)
- [x] **Paper Trading**: Alpaca paper API configured

## 🚀 GO-LIVE EXECUTION (9:35 AM ET)

### Phase 1: Market Hours Validation
```bash
current_hour=$(TZ=America/New_York date +%H)
# Must be between 9:35 AM - 3:50 PM ET
```

### Phase 2: Single Command Activation  
```bash
./scripts/go-live.sh
```

**What it does:**
1. Validates trading hours
2. Commits conservative parameters  
3. Sets `ORDERS_ENABLED=1`
4. Pushes to production
5. Provides monitoring URLs

### Phase 3: First Order Test
1. **Target**: BUY_MORE signal with score >60
2. **Action**: Click Buy button on high-confidence card
3. **Verify**: Bracket order appears in Alpaca  
4. **Monitor**: `/orders-log.html` for execution

### Phase 4: KPI Tracking
- **TP1 Hit Rate**: Target ≥45%
- **1-Hour P&L**: Target ≥+0.3R  
- **Stop Loss**: Must trigger on adverse moves

## 🛑 Emergency Procedures

### Instant Rollback
```bash
./scripts/emergency-stop.sh
```
- Sets `ORDERS_ENABLED=0`  
- Returns to shadow mode
- Preserves existing positions

### When to Use Emergency Stop
- Any order execution errors
- KPI targets missed consistently  
- System instability
- Unexpected market conditions

## 📊 Success Criteria

### Hour 1 (9:35-10:35 AM ET)
- [ ] First order executes successfully
- [ ] Bracket orders created (dual TP + stop)
- [ ] No system errors in `/orders-log.html`

### Day 1 (Full Session)  
- [ ] TP1 hit rate ≥45%
- [ ] Average P&L per trade ≥+0.3R
- [ ] All stop losses functioning
- [ ] Maximum exposure limits respected

### Scale-Up Criteria (After 3+ Successful Days)
- Increase MAX_DAILY_NOTIONAL to $1000
- Increase MAX_TICKER_EXPOSURE to $300
- Monitor performance metrics

---

**System Status**: READY FOR CONTROLLED GO-LIVE ✅  
**Next Action**: Execute `./scripts/go-live.sh` at 9:35 AM ET