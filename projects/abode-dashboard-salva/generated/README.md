# Abode Dashboard → Salva HA adaptation

## Best output to test now

Use **Phase 3** files:
- `generated/cards-phase3/` (all 8 cards)
- `generated/packages/abode_dashboard_helpers_salva.yaml`

## What Phase 3 achieved

- Global naming rewrite completed:
  - `echo` → `homepod`
  - `alexa` → `siri`
- Full-card normalization against your current HA entity set.
- Remaining unresolved entities reduced to **2 only**, both provided by the package.

## Reports

- `generated/reports/ha_compatibility_report.md`
- `generated/reports/full_cards_entity_check.md`
- `generated/reports/phase2_normalization_report.md`
- `generated/reports/phase3_cleanup_report.md`

## Apply in Home Assistant

1. Add package file:
   - `generated/packages/abode_dashboard_helpers_salva.yaml`
2. Reload YAML for templates/helpers/scripts (or restart HA once).
3. In a new dashboard view, paste cards from `generated/cards-phase3/` one by one.

## Expected final state

After package reload, phase3 cards should render without missing-entity errors related to this adaptation set.
