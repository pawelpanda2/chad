# Forms & Views GUI standards

Status: 2026-08-03. Obowiązkowe przy każdym nowym / restylowanym formularzu
add/edit i odpowiadającej mu liście w Views (lub równoważnej liście domenowej).

Referencyjne implementacje (kopiuj układ, nie wymyślaj od zera):

- Forms: `packages/dashboard/app/(dashboard)/dashboard/forms/page.tsx`
  (Add Lead, Add Action, Add Daily Entry),
  `components/forms/audio-recording-form.tsx`,
  `components/msg-automation/prompt-form.tsx`
- Views: `packages/dashboard/app/(dashboard)/dashboard/views/page.tsx`
  (Leads, Recordings, Daily Tracker)

Tokeny: `packages/dashboard/components/shared/layout-tokens.ts`.

---

## 1. Struktura strony formularza

1. **`DashboardPageShell`** z `title` (np. `"Add Lead"`) i
   `contentClassName={FRAME_SECTION_GAP_CLASS}`.
2. **Bez duplikatu tytułu wewnątrz** — tytuł jest tylko w shellu.
3. Formularz: `FRAME_SECTION_SPACE_Y_CLASS` (10px między ramkami wewnętrznymi).
4. Dwie (lub więcej) **wewnętrzne ramki** w standardzie Story 62:
   - **Save frame** (góra) — akcje + opcjonalna wygenerowana nazwa
   - **Fields frame** — tabela pól
   - (opcjonalnie) kolejne ramki, np. Contacts w Add Lead

---

## 2. Save frame — Save + Full View + nazwa w jednej linii

### Obowiązkowa zawartość (gdy formularz ma zapis)

W kolejności, od lewej:

1. **`Save`** (primary `Button`, type submit / zapis)
2. **`Full View`** (outline `Button`) — **obowiązkowo obok Save**, nie w
   innym wierszu, nie tylko jako strzałka wstecz w shellu
3. **Wygenerowana nazwa / tytuł** (readonly `Input`, `font-mono`,
   `bg-muted`) — gdy nazwa jest generowana z pól (Lead, Action, Recording,
   Prompt). **Nie** dubluj tej nazwy jako osobnego wiersza „Title” w tabeli
   pól.

Opcjonalnie zaraz za nimi: wynik zapisu (success/error), Delete w trybie
edycji, itd. — nadal w tej samej linii, jeśli się mieści; komunikat może
być `whitespace-nowrap`.

### Jedna linia — nawet gdy ramka jest szersza niż fields frame

- Kontener Save frame: `flex w-fit flex-nowrap items-center gap-3` +
  `SAVE_FRAME_PADDING_CLASS` (`p-[8px]`) + `rounded-lg border bg-muted/10`.
- **Zakaz** `flex-wrap` i **zakaz** sztucznego `max-w-[460px]` na Save
  frame — ramka **może i powinna** być dłuższa niż ramka z polami, żeby
  utrzymać jedną linię.
- Przyciski i pole nazwy: `shrink-0` (nazwa zwykle `w-[260px]`).
- Ramka pól może zostać węższa (`max-w-[460px]` jest OK dla tabeli pól).

### Full View — nawigacja

- **Musi** prowadzić do **pełnego widoku / listy** danego typu rekordu,
  **nie** do menu Forms (`/dashboard/forms` bez `?form=`).
- Preferowany mechanizm: query `returnTo` (URL-encoded), ustawiany przy
  wejściu z listy:
  ```
  /dashboard/forms?form=lead&returnTo=${encodeURIComponent("/dashboard/views?view=leads")}
  ```
- Fallback gdy brak `returnTo` w URL: stały URL listy (np.
  `/dashboard/views?view=leads`, `/dashboard/views?view=recordings`,
  `/dashboard/msg-automation/ai-prompts`).
- To samo miejsce docelowe używaj dla **upLevel** (strzałka wstecz), gdy
  użytkownik wszedł z listy — nie cofaj do menu Forms, jeśli istnieje
  sensowna lista.
- Po udanym Save (gdy automatyczny redirect): ten sam `returnTo` / lista.

Przykłady docelowe:

| Formularz | Full View → |
|-----------|-------------|
| Add / Edit Lead | `/dashboard/views?view=leads` |
| Add Recording | `/dashboard/views?view=recordings` |
| Add / Edit Prompt | `/dashboard/msg-automation/ai-prompts` |
| Edit Daily Entry | `/dashboard/views?view=tracker` |
| Edit Date Entry | `/dashboard/views?view=dates` |
| Add Action | lista Actions w Views (gdy powstanie); **nie** menu Forms jako docelowy „Full View” na stałe |
| Add Report | `/dashboard/views?view=reports` — trzy ramki: Save/Full View/nazwa · pola (amber) · Record (voice + body). **Create → Save**; bez etykiety „Generated name”. |

---

## 3. Fields frame — tabela (amber cells)

Wzorzec Daily Entry / Add Lead / Add Action:

```tsx
<div className="max-w-[460px] rounded-lg border bg-muted/10 p-2">
  <table className="w-full border-collapse text-sm">
    <tbody>
      <tr>
        <td className="whitespace-nowrap border bg-muted/60 px-3 py-2 font-semibold">
          Label
        </td>
        <td className="border bg-amber-50 px-2 py-1.5 dark:bg-amber-950/30">
          {/* Input / Select — bez własnej ramki */}
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

Zasady:

- **Lewa kolumna:** etykieta, `bg-muted/60`, `font-semibold`,
  `whitespace-nowrap`.
- **Prawa kolumna:** edytowalne pole, `bg-amber-50` /
  `dark:bg-amber-950/30`.
- Kontrolki w komórce: `h-8` (lub `h-9`), `border-0 bg-transparent
  shadow-none`, focus tylko `ring-1` — **bez** osobnego bordered inputa
  wyglądającego jak druga ramka w komórce.
- Select: `SelectTrigger` z tymi samymi klasami przezroczystości.
- **Bez wiersza Title / Name**, jeśli nazwa jest już w Save frame.
- Osobne grupy pól (np. Contacts) = **osobna** wewnętrzna ramka pod spodem,
  nie jeden gigantyczny formularz bez ramek.

---

## 4. Views — lista + `+ Add` + drafty

### `+ Add` z listy

- Przycisk **`+ Add`** na liście Views (Leads, Recordings, Tracker, …)
  otwiera formularz z **`returnTo`** wskazującym **tę samą** listę.
- Nie otwieraj „gołego” `/dashboard/forms?form=…` bez `returnTo`, jeśli
  wejście jest z listy — Full View i po-save wrócą wtedy poprawnie.

### Wiersze listy

- Wrapper: `LIST_ROW_WRAPPER_CLASS`, wiersze: `LIST_ROW_CLASS` (+
  `divide-y`), jak w Leads / Recordings / Beeper Groups Manage.

### Drafty nagrań (Recordings)

Kolejność w wierszu draftu (od lewej):

1. Badge statusu (`Draft` / `Finalizing` / `Error`)
2. Przycisk **`Continue`**
3. Nazwa / meta draftu

Nie: Draft → nazwa → Continue.

---

## 5. Tokeny layoutu (nie hardcoduj innych wartości)

| Token | Użycie |
|-------|--------|
| `FRAME_SECTION_GAP_CLASS` | gap między ramkami w shellu (`gap-[10px]`) |
| `FRAME_SECTION_SPACE_Y_CLASS` | `space-y-[10px]` w `<form>` |
| `SAVE_FRAME_PADDING_CLASS` | padding Save frame (`p-[8px]`) — ciaśniejszy niż content |
| `LIST_ROW_CLASS` / `LIST_ROW_WRAPPER_CLASS` | listy klikalnych wierszy |

Nie zmniejszaj odstępów ad-hoc poniżej tych tokenów (Story 62).

---

## 6. Checklista przed merge / zakończeniem zadania UI

- [ ] Shell z tytułem; brak drugiego tytułu w treści
- [ ] Save frame u góry: Save + **Full View** (+ nazwa generowana jeśli dotyczy)
- [ ] Save / Full View / nazwa **w jednej linii** (`flex-nowrap`, `w-fit`)
- [ ] Full View → lista / pełny widok, **nie** menu Forms
- [ ] `returnTo` z listy Views; upLevel zgodny z Full View gdy sensowne
- [ ] Pola w tabeli amber; bez bordered inputów w komórkach
- [ ] Brak wiersza Title, jeśli nazwa jest w Save frame
- [ ] Tokeny `FRAME_*` / `SAVE_FRAME_*` / `LIST_ROW_*`
- [ ] Z listy: `+ Add` z `returnTo`; drafty: Draft → Continue → nazwa
