# SOS195 Supabase type-check fix

- Removed strict Promise/PromiseLike callback typing from fetchAll.
- Supabase PostgrestFilterBuilder is accepted as an awaitable query builder.
- Result is normalized inside fetchAll to `{ data, error }`.
- No workflow/business logic changes from SOS193/194.
