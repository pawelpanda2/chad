# Story 85 — Message Creator redesign (Beeper / Analysis)

## Source

User request (2026-07-25): full redesign of Message Creator to match the
attached HTML mockup in `examples/chad_message_creator_two_level_layout_mockup_v12.html`,
plus UX clarifications after mockup review.

## Intent (verbatim summary)

- Two modes only: **Beeper** and **Analysis** (not separate routes/sidebar).
- Active mode: black background / white text.
- Analysis disabled until message selected + concrete prompt version chosen
  (not `Open (N)`).
- Top **Select prompt version...** hidden until a message is selected; options
  identical to the per-message combobox (single data source).
- Beeper: full width, no right panel; message rows with optional analysis
  combobox (`Open (N)` + `{version} ({count})`); no combobox when sum is 0.
- Analysis: left results + right panel (~35–40%) with ±50px resize; top half
  conversation with red context frame (no extra labels); bottom half model
  select + Send new + numbered run history.
- Sections: Recommended directions, Mistakes, Proposal score, Previous
  messages score.
- Message proposals: grouped You + dynamic prompt versions; Send on the left;
  Save / msg for own proposals.
- Preserve Story 84 data/API patterns; message-level target IDs; append-only
  runs; no AI on mount; no fake scores; local runtime test; logical commit;
  no TEST/PROD deploy required for this task.

Mockup path: `examples/chad_message_creator_two_level_layout_mockup_v12.html`
