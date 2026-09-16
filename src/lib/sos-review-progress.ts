type ReviewItem = {id: string; is_correct?: boolean | null; review_is_correct?: boolean | null};

// A saved retry is not a completed correction; only a correct retry or a
// recorded explanation completion satisfies the existing review rules.
export function reviewProgress(items: ReviewItem[], explainedItems: Set<string>) {
  const graded = items.filter(item => typeof item.is_correct === "boolean");
  const wrong = graded.filter(item => item.is_correct === false);
  const corrected = wrong.filter(item => item.review_is_correct === true).length;
  const explained = wrong.filter(item => item.review_is_correct !== true && explainedItems.has(String(item.id))).length;
  return {graded: graded.length, wrong: wrong.length, corrected, explained,
    completed: corrected + explained, remaining: wrong.length - corrected - explained};
}
