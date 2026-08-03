# Leads +Add / Add Lead form polish

## START_SHA

```
START_SHA=597227c0a6802ce4c399062e8a315b89405191b9
```

Working tree was clean at start — no checkpoint commit needed.

## Scope

- Task A: + Add on Views → Leads (same pattern as Daily Tracker)
- Task B: Add Lead UI aligned with Add Daily Entry (shell, save frame, table fields)

## Difference found (Task A)

Daily Tracker/Dates render `+ Add` because `canEditRows` is true and pushes
`/dashboard/forms?form=add_action|date_entry`. Leads toolbar only had Filter +
Refresh — no Add button and no form link.
