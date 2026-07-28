# SOS23 crop final correction 2

- PDF text anchor now determines both question start Y and actual left/right column.
- Fixed questions assigned to the wrong column, including 7/8 and 19/20 patterns.
- Reduced automatic top margin from 1.1% to 0.45% so section labels are not included.
- Thick horizontal title/divider bars are ignored during bottom-content detection.
- Same-column next question number is used as the strongest bottom boundary.
- Footer search is capped before the bottom 5% of the page.
- Large blank gaps stop content scanning so footer and unrelated lower content are excluded.
