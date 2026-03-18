# Mission Control — UI Variants (v1)

Brand constraints applied:
- Name: **Mission Control**
- Theme: **Dark**
- Accent colors: **Electric Blue + Magenta**
- Icon style: **Outline only**
- UX: **Mobile-first, responsive, clean + futuristic**

---

## Variant A — Fleet Grid (Recommended baseline)

**Best for:** fastest control across many agents.

### Layout
- Top bar: app title, gateway status dot, global search, quick actions
- Row 1 KPI cards: active agents, dispatch failures, queued approvals, cron health
- Main: responsive grid of **Agent Cards**
- Bottom dock: timeline ticker (latest 10 events)

### Agent card
- Health dot + heartbeat toggle
- Current task + elapsed time
- Pending approvals count
- Quick buttons: `Open`, `Run`, `Pause`, `Logs`, `Memory`

### Mobile behavior
- Single-column cards
- Sticky bottom nav for tabs

---

## Variant B — Timeline-Centric Ops

**Best for:** debugging, incident response, audit traceability.

### Layout
- Left: filters (agent/type/status/time)
- Center: unified activity timeline (dense event cards)
- Right: event detail drawer + related artifacts

### UX touches
- Failure events highlighted with magenta border
- Hover/expand shows raw payload + action replay button

### Mobile behavior
- Filters in collapsible sheet
- Detail drawer as full-screen panel

---

## Variant C — Command Cockpit

**Best for:** power operators doing active control.

### Layout
- Top command bar (`Run cron`, `Dispatch`, `Approve all safe`, `Open terminal`)
- 3-column desktop:
  1. Agent stack
  2. Kanban execution board
  3. Live logs + alerts

### UX touches
- Neon edge glow on active jobs
- Keyboard shortcuts (`g a`, `g k`, `g t`)

### Mobile behavior
- Tabbed panes with quick switch

---

## Variant D — Executive + Operator Split

**Best for:** high-level overview + deep operations in one app.

### Layout
- Toggle mode at top:
  - **Executive:** KPIs/cost/tokens/SLA trends
  - **Operator:** agents/tasks/cron/approvals/logs

### UX touches
- Same data model, two visual densities
- Quick “jump to incident” shortcut from Executive to Operator

### Mobile behavior
- Defaults to Executive summary cards

---

## Variant E — Mission Kanban First

**Best for:** execution-centric teams.

### Layout
- Center: Kanban (`todo`, `in_progress`, `review`, `done`)
- Side rail: agent availability + load score
- Bottom pane: result viewer and approval queue

### UX touches
- Assignment suggestions (“best agent”)
- Dispatch state badges (`queued/running/done/error`)

### Mobile behavior
- Horizontal swipe between columns

---

## Shared Design Tokens

```txt
Background: #070B14
Surface: #0F172A
Card Border: #334155
Text Primary: #E2E8F0
Text Secondary: #94A3B8
Blue Accent: #3B82F6
Magenta Accent: #D946EF
Success: #22C55E
Warning: #F59E0B
Error: #EF4444
```

Typography:
- Inter / system stack
- Card headings 15-16px semibold
- Meta 12-13px

Icons:
- Lucide outline-only
- Default stroke width: 1.75

---

## Suggested rollout
1. Implement **Variant A** shell first (Fleet Grid)
2. Add Variant B timeline behaviors inside Activity tab
3. Keep Kanban from Variant E as execution pane
4. A/B test with usage telemetry (tab opens, task dispatch latency, error recovery)
