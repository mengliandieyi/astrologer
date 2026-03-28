# 2-Week AB Experiment Runbook

## Goal
- Validate whether evidence-chain interpretation improves:
  - share rate >= 10%
  - pro click rate >= 35%
  - D1 return rate >= 12%

## Experiment Design
- Group split: 50/50 by `assignAbGroup(anon_id)`.
- A group: pro report without evidence chain.
- B group: pro report with evidence chain.
- Stop condition: run for 7 days and at least 1000 `report_view` UV.

## Event Dictionary
- `report_view`: when result page loads
- `pro_click`: click deep interpretation
- `evidence_expand`: open evidence chain panel
- `share_click`: click share button
- `share_success`: successful share callback or short-link return proxy
- `return_visit_d1`: user revisits next day

## Daily Review Template (10 min)
1. Yesterday UV by group (`report_view_uv`)
2. Core metrics by group:
   - `pro_click_uv / report_view_uv`
   - `share_success_uv / report_view_uv`
   - `return_visit_d1_uv / report_view_uv`
3. Diagnose losses:
   - if share click high but success low -> check share pipeline
   - if pro click high but return low -> improve "next action" in report
4. Action for today (single item only)

## Rollback Rules
- If B raises pro click but drops share rate by >20% relative:
  - keep evidence behind accordion by default.
- If B shows no positive movement after 2 weeks:
  - disable evidence default display, keep API fields and event collection.
