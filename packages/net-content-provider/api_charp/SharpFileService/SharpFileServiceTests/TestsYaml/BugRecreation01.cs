using FileServiceCoreApp;
using SharpFileServiceProg.Operations.Headers;
using SharpFileServiceProg.Service;
using SharpRepoServiceProg.AAPublic;
using OutBorder1 = SharpFileServiceProg.AAPublic.OutBorder;

namespace SharpFileServiceTests
{
    [TestClass]
    public class BugRecreation01
    {
        private readonly IFileService fileService;
        private readonly IRepoService repoService;
        private readonly HeadersOperations headersOp;

        public BugRecreation01()
        {
            fileService = OutBorder1.FileService();
            repoService = OutBorder.RepoService(fileService);
            headersOp = fileService.Header;
        }

        [TestMethod]
        public void TestMethod1()
        {
            // arrange
            var yaml = GetYaml01();
            //var elementsList01 = GetElementsList01();
            //var cellsIndexes01 = GetCellsIdexes01();
            //var neededIndexes01 = GetNeededIdexes01();
            //var finalIndexes01 = GetFinalIndexes01();

            // act
            //var convertedList = headersOp.Convert.ToLinesList(elementsList01);
            //var neededIndexes = headersOp.Select.GetNeededIndexes(cellsIndexes01, convertedList);
        }

        public string GetYaml01()
        {
            string yamlString =
            $$"""
            //inne
            	przećwiczyć dzień wcześniej wystawienie wszystkie za drzwi
            	zamknięcie drzwi
            	wszystko przygotowane za drzwiami
            	nawet jeżeli miałbym leżeć oparty o drzwi i zasnąć pod nimi
            	myślenie to dla mnie to nagroda

            	telefon w sejfie w ciągu dnia
            	kontakt z promieniami
            	zaciemnienie pomieszczenia
            	18-20
            	brak kontaktu z niebieskim światłem

            //elementy
            	//wstawanie
            		//myślenie-muszę
            			- tu ojciec miał rację jedyne sposoby na to żeby wstać to albo świadomość że musisz albo zbudowanie rytuału, który jest nawykiem

            		//myślenie-oszustwo
            			- mój mózg oszukuje mnie rano, żebym pozostał w nieświadomości pozostał w śnie
            			- zapisuje typowe oszustwa żeby móc je później przeanalizować i sprawdzić czy ta analiza ma sens, coś może pomóc
            			- nikt na razie nie wymyślił innego sposobu niż zbudowanie rytuału, który zadziała zanim kora przed-czołowa odpowiedzialna za podejmowanie skomplikowanych decyzji zacznie podsuwać miliony wymówek 
            			- temat ten określam jednym słowem "oszustwo". Chodzi oczywiście oczywiście o oszustwo mojego własnego mózgu

            		//myślenie-rytuał-klubu-5-rano
            			1. wyzwalacz
            			2. rytuał
            			3. nagroda
            			4. powtarzanie

            		//typowe-wymówki
            			@wkręcanie-strachu

            			@nie-mam-siły
            			jestem zbyt słaby żeby wstać
            			mój układ krwionośny, limfatyczny jest chory
            			muszę to wyleżeć

            			@nie-wytrzymam
            			o boże budzik, dlaczego!?

            			@ciało-jest-chore
            			??

            			@muszę-pomyśleć
            			muszę to przemyśleć
            			o fajnym śnie
            			co zrobić, jaki plan

            			@jest-zbyt
            			przyjemnie
            			zimno

            		//myślenie-chwyt
            			jeżeli uda mi się wstać pierwszą rzeczą jaką potrzebuje przeanalizować to to jaki chwyt próbował zastosować na mnie mózg. dopóki mam to jeszcze w pamięci potrzebuje chwycić telefon i nagrać to jakie były myśli. później sobie to odsłucham i przeanalizuje

            		//myślenie-procedura
            			po przejściu przez oszustwo i zapisanie chwytu, nawet jeżeli nie mam siły powinno być odczytanie dalszej części tej procedury. jeżeli rzeczywiście jest coś nie tak po przeczytaniu mogę nawet pójść dalej spać

            		//rozwiązania-oszustwa
            			@nie-ma-rozwiązania
            			tak naprawdę nie ma rozwiązania. trzeba po prostu wstać i to sprawdzić. i nigdy nie dać się wkręcić w myślenie o rozwiązaniach. dopiero jak wstanę to mogę spróbować wytworzyć anty-schemat który zawczasu zablokuje złe myślenie

            			@nie-mam-siły
            			to przejdę się tylko do kuchni i sprawdzimy czy rzeczywiście nie mam siły]

            			@muszę-coś-ustalić
            			[w tym podejściu od razu ucinamy głupie stwierdzenia mózgu - "muszę pomyśleć co zrobić". i odpowiadam - "słuchaj głupi mózgu miałem już ustalone tysiąc razy co mam zrobić rano. wczoraj też ustaliłem dokładnie co mam zrobić rano. jeżeli nie ogarniasz to ustalamy to teraz. zabieraj się do działania i skończ pierdolić]

            	//emocjonalność
            		//myślenie-ustawienie-emocjonalności
            			w co ja inwestuje emocje? względem czego chce kształtować emocje? ramy to pierwsza rzecz do uświadomienia sobie że codziennie rano potrzebuję ustawić swoją emocjonalność. pętle też są bardzo ważne

            		//myślenie-ustalenia
            			rano jest dużo do zrobienia
            			wychodzę do kawiarni
            			wybieram procedure
            			co zrobię rano jest najważniejsze

            		//jedyne
            			myśli to jedyna rzecz jaką ma człowiek, którą może kontrolować

            		//pozytywne-źródła
            			jakie są moje pozytywne źródła?

            		//głupi-mózg
            			czy to już jest choroba psychiczna? jestem już z tego chory psychicznie? możesz przestać mielić do chuja? moja źle ukształtowana emocjonalność powoduje niekorzystny over-thinking. to jest mega problem bo powoduje że niewiele robię. nawet niewielka ilość sensownej pracy spowodowałaby że miałbym mega rezultaty w życiu. to jest bardzo dużo przeszkoda powodująca nadmiernie myślenie o nieistotnych rzeczach, zabiera mi dużo energii, powodujące złe emocje, stresuje całe moje ciało i organy

            		//nieobudzony-mózg
            			najprościej zrobić to wychodząc z domu. jeżeli to jest trudne do zrobienia to użyć wszystkich innych metod do obudzenia mózgu - zimy prysznic, muzyka, bieganie itp. muszę obudzić swój mózg. mój mózg jest zepsuty i to on jest największa przeszkodą. (w pierwszej kolejności to jest do naprawy) celem jest nie myśleć. to mój mózg jest problemem

            		//programy-do-załadowania
            			@cele
            			@podstawowa struktura dnia
            			@polska
            			@ćwiczenia przed lustrem emocji

            	//wyjście
            		zaraz przed wyjściem zajrzyj na dodatkową listę

            	//plan
            		//myślenie-plan
            			Jeżeli mam plan ustalony wieczorem to mogę od razu przejść do odblokowywania rzeczy które nie zostały odblokowane. Jeżeli wszystko jest odblokowane to działam. Jeżeli jednak nie ma planu to muszę go ustalić

            //procedury-wyjścia
            	@opis
            	żeby wyjść z mieszkania potrzebuję zrobić naprawdę dużo rzeczy. i to tak się tylko wydaje i mój mózg mnie oszukuje że to nie jest dużo i nie wolno mi wpaść w to oszustwo

            	@pr-01-kuchnia
            	[biorę oba peny, ubieram się, zabieram plecak, zamykam pokój na klucz i idę do kuchni. jem śniadanie, sprawdzam apką poziom glukozy, z plecaka biorę szczoteczkę, myję zęby i wychodzę]

            	@pr-02-łóżko
            	łóżko
            	[zakładam słuchawki na uszy i słucham muzyki, ładuję swoją wolę do tego, żeby podnieść się z łóżka, wstaję i wychodzę do łazienki]

            	@pr-03-łazienka
            	[biorę zimny prysznic na stopy i policzki i robię wszystkie inne rzeczy które mogą obudzić mózg]

            	@pr-04
            	Zjeść kanapki (to też budzi mózg)
            	Pościelić łóżko i ubrać się (to też budzi mózg)
            	Ogarnac wszystko dookoła siebie, pokój (to też budzi mózg)
            	Od razu przygotować drugie śniadanie
            	Sprawdzić czy jestem gotowy do wyjścia (np. jakby zaraz miała być randka)

            	@pr-05
            	oczy otwieram, słuchawki, prysznic głowy i stup, dalej muzyka, śniadanie, sprzątanie, medtacja

            //dodatkowa-lista
            	@opis
            	tutaj są istotne rzeczy o które koniecznie trzeba zadbać a mógłbym o nich zapomnieć. tuż przed wyjściem warto spojrzeć jeszcze na istotne rzeczy do zadbania

            	@zdrowie
            	wypić od razu słodki sok z rana
            	(Dostarczyć węglowodany)
            	Woda niegazowana
            	(Po całej nocy organizm potrzebuje uzupełnić płyny)

            	@insulina
            	zaczytać pomiar z freestyle-libre

            	@ładowanie sprzętów
            	Sprawdzić czy nie zapomniałem wieczorem załadować sprzętów
            	(Jeżeli tak to teraz je połaczyć z rana)

            //błędy
            	@opis
            	tuż przed wyjściem warto tutaj zajrzeć. mogę tutaj zapisywać powtarzające się błędy.

            	@zakupy
            	zakupy rano w sklepie i zapomniałem o sokach albo innych składnikach

            	@triki
            	otwieram oczy, budzik w sejfie

            //materiały
            	//przeciętny-człowiek
            		@name
            		5 Porad JAK WSTAĆ RANO bez problemu? Klub 5:00

            		@link
            		https://www.youtube.com/watch?v=QBfTMTsKdpY

            		@wyzwalacz
            		Jest to nastawienie budzika. Co ważne o odpowiednim tonie, budzącym skutecznie i bez możliwości włączenia drzemki. Najlepiej sprawdzi się tu staroświecki budzik z tarczą zegara. Zrezygnuj z telefonu. Zostaw go daleko od sypialni. Niech nie będzie pierwszą rzeczą po którą sięgasz rano

            		@zbudowanie-rytuału
            		Jest to czynność jaką wykonasz zaraz po wyzwalaczu w postaci budzika. Powinno to być natychmiastowe wstanie z łóżka najlepiej bosymi stopami na chłodną podłogę. Ważne jest żeby zrobić to w miarę szybko bez zbędnego zwlekania. Po prostu zanim kora przed-czołowa odpowiedzialna za podejmowanie skomplikowanych decyzji zacznie Ci podsuwać miliony wymówek żeby jednak nie wstawać rano. Twoim zadaniem jest poprzez powtarzanie tej czynności wyrobić odruch, nawyk pozwalający działać automatycznie. Czyli z łatwością wstawać na dźwięk budzika uznając to za oczywistość

            		@nagroda
            		Nie musi to być nic fizycznego. Wystarczy świadomość że robisz coś niesamowitego. Coś co jest bardzo ważne dla Ciebie. Jeżeli masz ładny nietypowy widok z okna. Albo szansę na smaczne śniadanie w absolutnym spokoju. Doceń to potrójnie!

            		@powtarzanie
            		Nie zbudujesz nawyku powtarzać coś kilku-krotnie. Prawdopodobnie będzie to kilkutygodniowy proces. Musisz zatem uzbroić się w cierpliwość. Każdego dnia podążać za tymi czterema punktami. I nie zapomnij o pójściu spać najpóźniej o 22. Bez 7-8 godzin snu nieważne do jakiego klubu dołączysz czy 5:00 rano czy 10:00 rano będziesz niewyspany i nie do życia

            	//
            		@link
            		https://www.youtube.com/watch?v=YvuLV06JZUg
            """;
            return yamlString;
        }
    }
}