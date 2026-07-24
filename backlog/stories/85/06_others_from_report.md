# Story 85 — Others / decisions

## Message ID algorithm

WhatsApp export lines lack provider message IDs. Stable id =
FNV-1a-32 hex of `timestamp|sender|rawLine`, with `-2`, `-3`, … suffix when the
same key repeats in one conversation body. Changing only list position does
not change the id.

## Models

No shared OpenAI model registry in repo. Seeded Message Creator model list
until a later Story wires real catalog / keys.

## Send (Beeper)

Outbound Beeper send from Dashboard is not available → **Send** stays disabled
with title “Not configured”.
