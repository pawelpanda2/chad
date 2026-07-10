# Lead Contacts In Info

## Goal

Show lead contacts in a compact, practical form at the top of the Lead Info view.

The section should prioritize readability and direct actions (clickable links), instead of raw YAML display.

## Where The Feature Is Visible

- Dashboard tab: `Leads`
- Lead details page: `Info` (after opening a specific lead)
- UI location: top area of the Lead Info content

## Data Source

Contacts are loaded through Content Provider access in `chad-dba`.

Key rules:

- Use logical names from `config.yaml`.
- Do not read filesystem directly.
- Do not construct physical paths manually.
- Read contacts via CP (`GetByNames`) under logical path:
  - `leads / all items / [leadName] / contacts`

## YAML Format

Supported contacts body format includes both scalar and list values.

Examples:

```yaml
instagram:
  - https://www.instagram.com/moranditaa/
phone: +48 123 456 789
whatsapp:
  - https://wa.me/48123456789
```

Also supported (inline list-item style):

```yaml
instagram: - https://www.instagram.com/moranditaa/
```

## Fetch Flow

1. User opens `Lead Info` page.
2. Frontend calls: `GET /api/leads-dashboard/details?leadName=...&leadLoca=...`.
3. API calls `getLeadDetails(leadName, leadLoca)` from `chad-dba`.
4. `chad-dba` resolves contacts by logical names (`GetByNames`) and reads contacts body.
5. Contacts YAML-like content is parsed to structured values (`string` or `string[]`).
6. API returns lead details with parsed contacts and optional parse error metadata.
7. Frontend renders compact contact rows with clickable links.

## Link Rendering

Rendered links are concise and actionable:

- Instagram can be displayed in compact form (for example `@username`),
- `href` always points to full normalized URL,
- external links use:
  - `target="_blank"`
  - `rel="noopener noreferrer"`

Raw YAML text is not shown as the main contact presentation.

## Edge Cases

Handled cases:

- Missing `contacts` child item: show concise `No contacts` state.
- Empty contacts body: show concise `No contacts` state.
- Invalid/unparseable YAML-like content: return and display parse warning.
- Missing instagram key: render other available contact keys only.
- Multiple links under one key: render all items for that key.
- Future contact keys (`phone`, `whatsapp`, `facebook`, `telegram`, `email`, etc.):
  - supported by generic key/value rendering path,
  - known keys can use custom normalization/link behavior.

## Next Steps

1. Add optional icon mapping for additional contact keys (for stronger visual scanning).
2. Add contact ordering customization per team preference.
3. Add validation hints for malformed contact values.
4. Add optional copy-to-clipboard action near rendered links.
