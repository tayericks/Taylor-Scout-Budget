# Taylor Budget v30.0.1 Deploy Fix

Fixed the Vercel TypeScript build failure in `src/main.tsx` by adding `actual` to the permitted `BudgetItem.status` values.

Previous type:
`estimate | approved | committed | paid`

Corrected type:
`estimate | approved | committed | paid | actual`

No storage keys, Supabase tables, saved budget records, or existing features were changed.
