# Posting order

Recommended order for every unpublished script. Already published, not listed: 01, 02, 04 and 07.

Mix: 11 (50%) beginner, 7 (32%) intermediate, 4 (18%) advanced. Never two advanced in a row.

## Length test

Posts 1 to 7 are the short group: 65 to 85 words of narration, about 25 to 35 seconds. Every later post stays at full length (about 85 to 120 words, about 40 to 50 seconds), so compare average percentage viewed for posts 1 to 7 against posts 8 to 22. The short group mixes levels (4 beginner, 2 intermediate, 1 advanced) so the length test is not just a beginner test.

## Order

Hook = the title scene heading (on screen and the thumbnail) and the first spoken sentence.

| # | Script | Level | Words | Group | Heading | First spoken line |
|---|---|---|---|---|---|---|
| 1 | `05-array-sort-numbers.yaml` | beginner | 85 | short test | [1, 2, 10].sort() gives [1, 10, 2] | JavaScript sorts ten before two. |
| 2 | `14-key-prop-reset-state.yaml` | intermediate | 84 | short test | Switched users. Form didn't reset. | The old user's text stayed. |
| 3 | `06-const-not-immutable.yaml` | beginner | 85 | short test | It's const. user.name still changed. | Your const object still changed. |
| 4 | `11-microtask-vs-settimeout.yaml` | advanced | 84 | short test | A later promise beat setTimeout 0 | Timeout zero still runs last. |
| 5 | `13-useref-no-rerender.yaml` | beginner | 79 | short test | Clicked 5 times. Still shows 0. | The counter ignores your clicks. |
| 6 | `10-nextjs-params-promise.yaml` | intermediate | 79 | short test | Next.js 16: params.slug is undefined. | The upgrade broke your slug. |
| 7 | `12-var-in-loops-closures.yaml` | beginner | 84 | short test | Expected 0,1,2. Got 3,3,3. | It logs three, three times. |
| 8 | `21-loose-equality-coercion.yaml` | beginner | 104 | full length | Both equal 0. Not each other. | Both equal zero but differ. |
| 9 | `03-use-client-ssr.yaml` | intermediate | 116 | full length | 'use client'. window is not defined. | Client code crashes the server. |
| 10 | `22-object-keys-are-strings.yaml` | beginner | 118 | full length | cache[a] returned b's value | Cache of a gives b. |
| 11 | `15-next-public-env-build-time.yaml` | advanced | 120 | full length | Changed the env var. Nothing changed. | The browser ignores your change. |
| 12 | `24-floating-point-sum.yaml` | beginner | 118 | full length | 0.1 + 0.2 is not 0.3 | JavaScript gets this sum wrong. |
| 13 | `23-this-arrow-vs-function.yaml` | intermediate | 108 | full length | Same this.n. One undefined, one 5. | Two callbacks disagree about this. |
| 14 | `08-typeof-null.yaml` | beginner | 116 | full length | typeof null === 'object' | Null passed your object check. |
| 15 | `16-server-actions-auth.yaml` | advanced | 107 | full length | Button hidden. Anyone can still delete. | Anyone can still delete posts. |
| 16 | `25-array-equality-references.yaml` | beginner | 93 | full length | Two identical arrays. === says false. | Matching arrays still aren't equal. |
| 17 | `09-shopify-storefront-tokens.yaml` | intermediate | 105 | full length | Your Shopify token, visible in DevTools | Anyone can copy your token. |
| 18 | `26-interview-shallow-vs-deep-copy.yaml` | beginner | 117 | full length | Edited the copy. Original changed too. | Your copy changed the original. |
| 19 | `28-interview-debounce-vs-throttle.yaml` | advanced | 114 | full length | Typing "javascript" sent 10 requests | Ten keystrokes sent ten requests. |
| 20 | `18-shopify-moneyv2-prices.yaml` | beginner | 120 | full length | Your euro store says $29.99 | Your euro price shows dollars. |
| 21 | `27-interview-event-delegation.yaml` | intermediate | 105 | full length | New list items ignore clicks | New items ignore your clicks. |
| 22 | `20-shopify-cursor-pagination.yaml` | intermediate | 112 | full length | 300 products. Listing shows only 50. | Your listing stops at fifty. |

## Notes

- Word counts are narration words with pause markers removed.
- Same-topic scripts are spread out: the two NEXT_PUBLIC scripts (09 and 15) are six posts apart, and the two Shopify data scripts (18 and 20) are two apart.
- 11 is a guess-the-output video, so the format gets an early read before the new guess-the-output run (21 to 25).
- If you reorder, keep posts 1 to 7 together and keep advanced scripts (11, 15, 16, 28) apart.
