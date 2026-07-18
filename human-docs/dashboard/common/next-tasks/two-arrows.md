Cline task — edytor: usunąć podwójną strzałkę taba i naprawić caret/focus

Bug wrócił w edytorze tabów.

Aktualne zachowanie:

* Przy tabie widać dwie strzałki:

  * małą strzałkę,
  * dużą strzałkę doczepioną do niej.
* Po ręcznym wpisaniu taba caret / migająca pionowa kreska ustawia się za małą strzałką.
* Gdy kliknę kolejny `Tab`, duża strzałka pojawia się dalej, ale caret zostaje w złym miejscu.
* Wygląda to tak, jakby edytor renderował tab na dwa różne sposoby jednocześnie albo jakby overlay whitespace kolidował z natywnym tekstem.

Najważniejsze:

* NIE wolno zamieniać tabów `\t` na spacje.
* NIE wolno zepsuć wcześniejszych napraw:

  * Enter ma kopiować dokładny prefix białych znaków z poprzedniej linii.
  * Tab ręczny ma wstawiać prawdziwy `\t`.
  * Save/reload ma zachować realne `\t`.
* Można usunąć wcześniejsze wymaganie, że tab ma być krótszy niż normalnie, jeśli to powoduje bug.
* Priorytet: brak małej strzałki i poprawna pozycja caret.

Co sprawdzić:

1. Gdzie jest implementowane pokazywanie białych znaków.
2. Czy tab jest renderowany jednocześnie przez:

   * CodeMirror extension,
   * własny overlay,
   * CSS pseudo-element,
   * replace w preview,
   * decoration/widget.
3. Czy istnieje custom render dla `\t`, który dodaje dodatkową małą strzałkę.
4. Czy `tab-size` albo overlay nie przesuwa caret względem tekstu.
5. Czy input/edit layer i visual layer nie mają innej szerokości taba.

Wymagane rozwiązanie:

* Usuń źródło małej strzałki.
* Zostaw tylko jeden czytelny marker taba albo tymczasowo wyłącz marker taba całkowicie, jeśli to jedyny bezpieczny sposób.
* Caret musi zawsze trafiać w realną pozycję tekstu.
* Nie może być sytuacji, że kliknięcie Tab dodaje znak, ale caret zostaje w miejscu.
* Jeżeli pokazywanie whitespace psuje caret, wyłącz pokazywanie whitespace w trybie edycji i zostaw je tylko w preview/debug, ale nie kosztem edytora.

Akceptowalny kompromis:

* Realne taby `\t` są zachowane.
* Enter zachowuje taby.
* Nie ma podwójnej strzałki.
* Caret działa normalnie.
* Whitespace marker taba może być prostszy albo wyłączony w edytorze.

Test ręczny:

1. Otwórz edytor z linią zaczynającą się od `\t`.
2. Sprawdź, że nie ma dwóch strzałek dla jednego taba.
3. Kliknij na końcu linii i wpisz literę — litera pojawia się dokładnie tam, gdzie jest caret.
4. W nowej linii kliknij `Tab`.
5. Sprawdź, że pojawia się realny `\t`, a caret przechodzi za niego.
6. Kliknij `Tab` drugi raz.
7. Sprawdź, że powstają dwa realne taby `\t\t`, caret jest za nimi, nie zostaje w miejscu.
8. Kliknij `Enter`.
9. Sprawdź, że nowa linia kopiuje dokładny prefix `\t` / `\t\t`.
10. Zapisz, odśwież i sprawdź raw body — taby nadal są `\t`, nie spacje.
11. Zaktualizuj dokumentację buga i dopisz root cause podwójnej strzałki.
