# SOS196 AI needed questions build fix

- Restored `analysisNeededQuestions` that was accidentally removed while unifying workflow buckets.
- It now derives from the same shared `workflowBucketOf()` rule.
- Only `other` (not yet analyzed) questions are treated as AI-analysis-needed.
- Registered / pending / review / failed questions are not automatically reanalyzed.
