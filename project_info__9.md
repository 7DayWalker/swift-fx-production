# Swift FX — Dashboard Stats Consistency Investigation (Tier-Coupled Aggregation)

## Summary
Dashboard “performance” metrics (signals / total pips / win rate) are currently computed in the **frontend** from the **tier-gated signal feed** returned by `GET /api/signals`. Free users receive “locked” signal placeholders for premium/VIP entries, and the frontend’s stats computation treats missing `final_pips/result_pips` as **0**, which reduces pips and win rate. VIP/Admin users receive full `final_pips` for all closed signals, so their dashboard totals match the global aggregates and their signal history.

This means the dashboard is effectively **tier-coupled** even though there is already a backend global dashboard performance aggregation endpoint (`GET /api/dashboard`) that appears to compute metrics from **all closed signals**.

---

## 1) Full dashboard stats data flow (where the dashboard metrics come from)
**Dashboard performance cards on the mobile “(tabs)/dashboard” screen are sourced from `SignalContext` stats, not from `GET /api/dashboard`.**

1. App loads `SignalProvider` (see `frontend/app/_layout.tsx` wraps screens in `SignalProvider`).
2. `frontend/src/context/SignalContext.tsx` calls **backend**:
   - `GET /api/signals` (via `refreshSignals()`).
3. Backend `GET /api/signals` (in `backend/api/routes/signals.py`) returns:
   - For each signal: either full signal fields (if the user can access that signal’s `visibility`), or a **locked placeholder** object (with `locked: True` and without sensitive performance fields).
4. `SignalContext` recomputes `stats` locally whenever `signals` changes:
   - `total_signals: signals.length`
   - `total_pips: sum(final_pips/result_pips)` where missing pips resolve to `0` due to `s.final_pips ?? s.result_pips ?? 0`
   - `win_rate` computed from which closed signals have `pips > 0`; any locked/no-pips signals become non-winners.
5. `frontend/app/(tabs)/dashboard.tsx` renders “Your Performance” using these computed values:
   - `winRate = stats?.win_rate ?? 0`
   - `totalPips = stats?.total_pips ?? 0`
   - `totalSignals = signals.length`

**Therefore: dashboard stats = aggregation over the tier-shaped signal feed held in `SignalContext`.**

---

## 2) Exact tier filtering flow (where free-tier restrictions are applied)
Tier access is enforced at multiple steps:

### A. Frontend resolves user tier (for context + to drive refresh logic)
In `frontend/src/context/SignalContext.tsx`:
1. `fetchUserTier()` decides `userTier` with precedence:
   - If profile role is `super_admin` or `admin` → `vip`
   - Else, checks Supabase `subscriptions` table for active subs and picks the highest tier among `vip/premium/free`.

### B. Backend filters which fields a user can see in the signal feed
In `backend/api/routes/signals.py`:
1. `GET /api/signals` resolves `user_subscription` (via `get_effective_subscription`) from the JWT user.
2. For each signal, it reads `signal.visibility`.
3. `can_access_visibility(user_subscription, signal_visibility)` determines access.
4. If allowed:
   - returns full signal fields (including `final_pips` / `result_pips` once closed)
5. If not allowed:
   - returns a **locked placeholder** containing only: `signal_id`, `pair`, `signal_type`, `state`, `is_active`, `visibility`, `created_at`, `locked: True`, and `required_plan`
   - crucially, the placeholder does **not** include performance fields like `final_pips/result_pips` used for pips and win-rate.

This is the core mechanism that makes free users’ dashboard totals differ: the backend’s “locked placeholder” shape changes what numbers the frontend can aggregate.

---

## 3) Does dashboard stats reuse filtered history / tier-filtered datasets?
**Yes—indirectly.** The dashboard’s computed totals reuse the same tier-filtered signal universe produced by `GET /api/signals`, and those objects correspond to the “accessible signals” that the history endpoint uses for stats.

Evidence from code paths:

- `frontend/app/signal-history.tsx` calls `GET /signals/history/stats`.
- Backend `GET /api/signals/history/stats` (`backend/api/routes/signals.py`) computes:
  - `accessible_signals` by filtering `all_closed` with `can_access_signal(user_role, signal_visibility)`
  - and then computes `total_pips/win_rate` from that `accessible_signals` list.
- Dashboard does **not** call `signals/history/stats`, but dashboard stats come from:
  - `SignalContext` aggregation over the tier-shaped `GET /api/signals` feed
  - locked placeholders do not include pips → pips aggregation effectively matches “only accessible signals contribute non-zero pips”.

This aligns with your observation:
- Free dashboard `Total Pips` equals free signal-history `Total Pips`, even though dashboard `Signals` count is higher.
  - That implies locked entries are counted in dashboard signal count, but contribute `0` pips.

---

## 4) Frontend recomputation findings (how metrics are derived client-side)
In `frontend/src/context/SignalContext.tsx`:

- It recomputes `stats` locally on every `signals` update:
  - **`total_signals` = `signals.length`**
    - If backend returns locked placeholders for premium/VIP signals, those placeholders still increase `signals.length`.
  - **`total_pips` = sum of `s.final_pips ?? s.result_pips ?? 0`**
    - Locked placeholders omit `final_pips/result_pips`, so they contribute **0**.
  - **`win_rate`**:
    - `winning = closed.filter(pips > 0)`
    - `losing_trades = closed.length - winning.length`
    - any locked/zero-pips closed entries count against win rate.

So the dashboard is not recomputing from “visible signals” in the UI—rather, it recomputes from the entire tier-shaped dataset returned by `/api/signals`, where only the performance fields are missing for disallowed entries.

---

## 5) Backend aggregation findings (is there a global stats endpoint?)
There is a backend endpoint that appears to compute **global performance**:

- `backend/api/routes/dashboard.py` → `GET /api/dashboard`
  - Aggregates performance using a MongoDB pipeline:
    - `"$match": {"state": "closed"}`
    - `"$group": {"total": {"$sum": 1}, "total_pips": ... }`
  - **It does not filter the performance aggregation by user role / visibility.**
  - It only filters `recent_signals` based on `can_access_signal(...)` when returning the “recent_signals” list.

However, the **mobile dashboard performance cards** in `frontend/app/(tabs)/dashboard.tsx` are not using `/api/dashboard.performance`—they are using `SignalContext.stats`.

Additionally, there is a tier-aware history stats endpoint:

- `backend/api/routes/signals.py` → `GET /api/signals/history/stats`
  - explicitly filters to `accessible_signals` based on `can_access_signal(user_role, signal_visibility)`
  - returns different stats for Free vs Premium/VIP by construction.

---

## 6) Exact source of the mismatch (why tiers show different dashboard metrics)
**Root cause:** Dashboard performance metrics are computed from **tier-gated signal feed objects** (`GET /api/signals`), not from a dedicated global aggregation.

Mechanically:
1. Free users receive:
   - locked placeholders for premium/VIP signals (still counted in `signals.length` and in `closed.length` if `state` is `closed`)
   - but missing `final_pips/result_pips`.
2. `SignalContext` aggregates:
   - counts include locked entries (`total_signals`)
   - performance numbers treat missing pips as `0`, lowering `total_pips` and win rate.
3. VIP/Admin users receive full closed signal fields (including `final_pips`), so aggregation matches global totals.

**Important non-obvious detail:** dashboard `Signals` metric uses `signals.length` (includes locked placeholders), while `Total Pips` and win rate use pips fields that are absent for locked placeholders. This creates the “same pips as free history, but different signals count” pattern you observed.

---

## 7) Exact files involved (minimize implementation surface)
### Frontend
- `frontend/app/(tabs)/dashboard.tsx`
  - Renders “Your Performance” from `useSignals()` (`stats`, `signals.length`).
- `frontend/src/context/SignalContext.tsx`
  - Fetches `GET /api/signals`
  - Recomputes `stats` locally from the tier-shaped `signals` array.
- `frontend/app/signal-history.tsx`
  - Calls `GET /signals/history/stats` for history page stats.

### Backend
- `backend/api/routes/signals.py`
  - `GET /api/signals` (tier-gated feed with locked placeholders)
  - `GET /api/signals/history/stats` (tier-aware stats)
- `backend/api/routes/dashboard.py`
  - `GET /api/dashboard` (global performance aggregation appears role-agnostic for the aggregated performance fields)

---

## 8) Safest minimal-risk architectural correction (no redesign, only mapping to correct source of truth)
**Use the existing global performance aggregation for dashboard performance cards, without changing history gating.**

Safest minimal-risk approach based on current code:
- **Frontend correction:** Update `frontend/app/(tabs)/dashboard.tsx` to display performance values from `GET /api/dashboard` (global aggregation) rather than `SignalContext.stats`.
  - Keep `SignalContext` for active signals listing and tier-gated field visibility.
  - Keep `frontend/app/signal-history.tsx` unchanged so free history remains limited/tier-gated.

This minimizes surface area because:
- The backend global aggregator already exists (`backend/api/routes/dashboard.py`).
- The change is localized to dashboard performance rendering logic (swap data source), leaving tier gating and history behavior intact.

---

## 9) Where the fix should occur
- **Frontend:** Yes (main fix), because the mismatch is that the dashboard UI currently uses `SignalContext.stats` (tier-coupled) instead of the global aggregator.
- **Backend:** Not strictly required to achieve global consistency for dashboard performance *if* `GET /api/dashboard` is already used as the source of truth by the dashboard UI.  
  - Backend already contains the needed global performance aggregation behavior.

**Recommendation:** **Frontend-only** correction (wire dashboard performance cards to `GET /api/dashboard.performance`), while keeping backend history endpoints tier-aware.

---

## [Optional developer checklist for follow-up investigation]
- [x] Identify dashboard UI that displays mismatched metrics (`frontend/app/(tabs)/dashboard.tsx`)
- [x] Trace where those metrics are computed (`frontend/src/context/SignalContext.tsx`)
- [x] Trace tier gating in the feed (`backend/api/routes/signals.py` → `GET /api/signals`)
- [x] Trace tier-aware history stats (`backend/api/routes/signals.py` → `GET /api/signals/history/stats`)
- [x] Identify existing global dashboard performance aggregation (`backend/api/routes/dashboard.py` → `GET /api/dashboard`)
- [ ] Confirm whether any other dashboard card uses `SignalContext.stats` (admin analytics, etc.) for completeness
- [ ] Confirm exact response shape from `/api/dashboard` in runtime usage (fields names and where performance object lands in JSON)
