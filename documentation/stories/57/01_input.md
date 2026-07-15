# Story 57 — Input

## Input 1

twoje zadanie to umiescic w chad dashboard w zakladce folders gui content providera
czyli takie panel do nawigacji a w nim przyciski repo loca wstecz w przod, go, bez logout,
przejrzyj jak to wyglada w aplikacji blazor
glowny plik widoku ktory to trzyma to repos.razor

i pod nimi sa przyciski ktore sa tutaj niepotrzebne
a pod nimi sa panele albo text-item albo folder-item

wpisz wedlug zasad w dokumentacji to jako story 57
nie pytaj o zatwierdzenie planu
zadnych pytan nie zdawaj po porostu dzialaj
bo ja ide spac
bo pozwolenie na wszystko wykonywanie wszysktich komend
podejmowanie decyzji samodzilnie nawet jezeli to ma byc losow jezeli naprawde nie wiem
analizuj projekt blazor i tam jest to guid go migruj do dashboardu w zakldce Folders

## Input 2

[Pasted a failed `docker compose build` log for the dashboard: `next build` failing with `Module not found: Can't resolve 'cp-entry'` and `Module not found: Can't resolve 'cp-core'` in `./app/api/folders/route.ts`.]

no to blad
Nie, nic więcej nie wdrożyłem — to tylko brakujący fragment w Dockerfile dashboardu. Dodałem cp-entry/cp-core jako zależności (potrzebne dla zakładki Folders), ale build Dockera nie kopiuje jeszcze folderu packages/content-provider/* do obrazu, więc pnpm nie może ich rozwiązać. Sprawdzam Dockerfile i naprawiam.
cp-entry i cp-core nie dodwaj
to guid ma dzialac wciaz ze starym net-content-provider
