# Story 77 — Input

## Input 1

dalej to menu nie wyglada: http://localhost:12020/dashboard/history?view=google-sheets
opisalem Ci wyzej co chce miec tam, jak nie mozesz znalzec to dopytaj
ale ma przedewszystkich wygladac jak to:
http://localhost:12020/dashboard/leads/details?leadName=26-07-10_ni_zosia&leadLoca=03%2F06%2F91&returnTo=%2Fdashboard%2Fstatuses%3Fmode%3Dmatrix
czyli takie okragle ramki
1) pierwsza z nazwa uzytkownika np. pawel_f zamiast nazyw leada i linkiem do google sheet
2) inforamcje o koncie gmail login i haslo

## Clarification (via AskUserQuestion)

Q1: Karta 2 (dane konta) — oprócz loginu/hasła do Google (viewer account), czy zostawić też wiersz
'Service account' (adres e-mail konta serwisowego, bez hasła, tylko do edycji) jako osobną, trzecią ramkę?
A1: Login+hasło + osobna 3. ramka na service account.

Q2: Wiersz 'CHAD login' (nazwa użytkownika CHAD, dziś osobny wiersz nad 'Test account') — skoro
username ma teraz być w nagłówku (karta 1), czy usunąć ten zdublowany wiersz z reszty widoku?
A2: Usuń duplikat (Recommended).
