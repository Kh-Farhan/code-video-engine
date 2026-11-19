# Posting order

Recommended order for every unpublished script. Already published, not listed: 01, 02, 04 and 07.

Mix: 11 (50%) beginner, 7 (32%) intermediate, 4 (18%) advanced. Never two advanced in a row.

## Length test

Posts 1 to 7 are the short group: 65 to 85 words of narration, about 25 to 35 seconds. Every later post stays at full length (about 90 to 115 words, about 40 to 50 seconds), so compare average percentage viewed for posts 1 to 7 against posts 8 to 22. The short group mixes levels (4 beginner, 2 intermediate, 1 advanced) so the length test is not just a beginner test.

## Order

Hook = the title scene heading (on screen and the thumbnail) and the first spoken sentence.

| # | Script | Level | Words | Group | Heading | First spoken line |
|---|---|---|---|---|---|---|
| 1 | `05-array-sort-numbers.yaml` | beginner | 80 | short test | [1, 2, 10].sort() gives [1, 10, 2] | Sort one, two and ten, and JavaScript hands you one, ten, two. |
| 2 | `14-key-prop-reset-state.yaml` | intermediate | 74 | short test | New user. Old draft still in the form. | You switch users, and the form still shows the old user's text. |
| 3 | `06-const-not-immutable.yaml` | beginner | 80 | short test | It's const. user.name still changed. | You declare user with const, and user dot name still changes from Ali to Sara. |
| 4 | `11-microtask-vs-settimeout.yaml` | advanced | 78 | short test | setTimeout 0 ran after the promise below it | A zero millisecond timeout, and a promise written after it still runs first. |
| 5 | `13-useref-no-rerender.yaml` | beginner | 74 | short test | Clicked 5 times. The button still says 0. | You click the counter five times, and the button still says zero. |
| 6 | `10-nextjs-params-promise.yaml` | intermediate | 75 | short test | Upgraded to Next.js 16. params.slug is undefined. | You upgrade to Next.js sixteen, and params dot slug comes back undefined. |
| 7 | `12-var-in-loops-closures.yaml` | beginner | 78 | short test | Expected 0, 1, 2. Got 3, 3, 3. | You expect zero, one, two, and this loop logs three, three times. |
| 8 | `21-loose-equality-coercion.yaml` | beginner | 97 | full length | Both equal 0. They don't equal each other. | Two values both equal zero, and they still don't equal each other. |
| 9 | `03-use-client-ssr.yaml` | intermediate | 114 | full length | Marked 'use client'. Crashed: window is not defined. | You mark a component use client, and the server still says window is not defined. |
| 10 | `22-object-keys-are-strings.yaml` | beginner | 112 | full length | cache[a] returned the value you stored for b | You store one value under object a and another under object b, and reading a gives you b's value. |
| 11 | `15-next-public-env-build-time.yaml` | advanced | 115 | full length | You changed the env var. Nothing changed. | You change the API URL in production and restart the server, but the browser keeps calling the old one. |
| 12 | `24-floating-point-sum.yaml` | beginner | 109 | full length | 0.1 + 0.2 is not 0.3 in JavaScript | Add zero point one and zero point two, and JavaScript says the result is not zero point three. |
| 13 | `23-this-arrow-vs-function.yaml` | intermediate | 96 | full length | Same this.n. One says undefined, one says 5. | Two timeouts log the same this dot n. |
| 14 | `08-typeof-null.yaml` | beginner | 108 | full length | typeof null === 'object' | You check that typeof value equals object, and null slips right through. |
| 15 | `16-server-actions-auth.yaml` | advanced | 103 | full length | Hid the delete button. Anyone can still delete. | You hide the delete button from everyone but admins. |
| 16 | `25-array-equality-references.yaml` | beginner | 92 | full length | Two identical arrays. === says false. | Two arrays with exactly the same numbers, and triple equals says they are not equal. |
| 17 | `09-shopify-storefront-tokens.yaml` | intermediate | 103 | full length | Your Shopify token is readable in DevTools | Any visitor can open DevTools and copy your private Shopify token, because you prefixed it with next public. |
| 18 | `26-interview-shallow-vs-deep-copy.yaml` | beginner | 110 | full length | You edited the copy. The original changed too. | Asked in a frontend interview: you edit a copy of an object, and the original changes too. |
| 19 | `28-interview-debounce-vs-throttle.yaml` | advanced | 112 | full length | Typing "javascript" sent 10 requests | Asked in a frontend interview: typing javascript into your search box sends ten requests, one per key. |
| 20 | `18-shopify-moneyv2-prices.yaml` | beginner | 111 | full length | Your euro store says $29.99 | You launch in Europe, and your product page shows a dollar sign next to a euro price. |
| 21 | `27-interview-event-delegation.yaml` | intermediate | 105 | full length | New list items ignore your click handler | Asked in a frontend interview: you add click handlers to every list item, and new items ignore clicks. |
| 22 | `20-shopify-cursor-pagination.yaml` | intermediate | 110 | full length | 300 products. Your listing shows only 50. | Your shop has three hundred products, but the listing shows only fifty, and nothing errors. |

## Notes

- Word counts are narration words with pause markers removed.
- Same-topic scripts are spread out: the two NEXT_PUBLIC scripts (09 and 15) are six posts apart, and the two Shopify data scripts (18 and 20) are two apart.
- 11 is a guess-the-output video, so the format gets an early read before the new guess-the-output run (21 to 25).
- If you reorder, keep posts 1 to 7 together and keep advanced scripts (11, 15, 16, 28) apart.
