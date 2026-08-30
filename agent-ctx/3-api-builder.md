# Task 3 - API Builder

## Files Created
1. `/src/app/api/client/professionals/route.ts` - GET (list with filters) + POST (create)
2. `/src/app/api/client/professionals/[id]/route.ts` - GET + PATCH + DELETE (soft delete)
3. `/src/app/api/client/professionals/[id]/services/route.ts` - GET + POST
4. `/src/app/api/client/service-requests/route.ts` - GET + POST (with push)
5. `/src/app/api/client/service-requests/[id]/route.ts` - GET + PATCH (with push on status change)
6. `/src/app/api/client/reviews/route.ts` - GET + POST (with rating recalc)
7. `/src/app/api/client/reviews/[id]/route.ts` - GET + PATCH + DELETE (with rating recalc)
8. `/src/app/api/client/chat/[serviceRequestId]/route.ts` - GET (markRead) + POST (with push)

## Key Patterns
- All routes use `NextRequest`/`NextResponse` from `next/server`
- `const { searchParams } = new URL(request.url)` for GET query params
- `request.json()` for POST/PATCH bodies
- French error messages throughout
- `try/catch` with `console.error` logging
- `db` imported from `@/lib/db`
- Push notifications via `sendPushToUser` and `sendPushToHome` from `@/lib/push-sender`
- `recalcProfessionalRating` helper used in reviews routes
- Type validation using constants from `@/types/database`
- Lint clean, zero errors
