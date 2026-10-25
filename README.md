# NTrition

Persoonlijk voedingsdagboek als installeerbare web-app (PWA). Werkt offline; alle gegevens blijven op het toestel.

- Dagboek per maaltijd met automatische totalen (kcal, koolhydraten, eiwit, vet)
- Zoeken, recente items en favorieten
- Maaltijd of hele dag kopiëren naar een andere dag
- Weekoverzicht met gemiddelden
- Eigen voedingsmiddelen toevoegen en bestaande aanpassen
- Optionele dagdoelen en back-up/terugzetten

Ingebouwde voedingsmiddelen staan in `foods.js` (waarden per 100 g). De Jumbo-producten komen uit
"Productinformatie bake-off broodjes en snacks" (versie 23-09-2025). Correcties t.o.v. dat document:
tosti ham/kaas koolhydraten per 100 g afgeleid uit de portiewaarde (2,8 was een tikfout), en bij
zeven producten is het portiegewicht afgeleid uit de opgegeven waarden per portie omdat het vermelde
gewicht daar niet mee klopte.

Na een wijziging: verhoog `VERSION` in `sw.js` zodat geïnstalleerde apps de update ophalen.

Het app-icoon wordt gemaakt uit `icons/icon-bron.html` (SVG, wit op marineblauw).
