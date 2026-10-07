# Kreiranje projekta

<AcliMascot state="working" message="Reci mi šta praviš — ostalo podešavam ja." />

`acli create` pravi nov projekat i ostavlja ga spremnog za pokretanje: zavisnosti, formatiranje, Git repozitorijum i, ako želiš, lokalno Docker ili Lando okruženje.

## Šta možeš da napraviš {#what-you-can-create}

| Tip | Šta dobijaš |
| --- | --- |
| **React** | Vite aplikaciju sa ESLint-om, Prettier-om, `.editorconfig` i `.env.example`. |
| **Next.js** | App Router + TypeScript, ESLint, Prettier, `.editorconfig` i `.env.example`. |
| **Laravel + React / Next.js** | Pravu Laravel aplikaciju u `backend/` (preko `composer create-project`) i frontend u `frontend/`. |
| **WordPress tema** | WordPress u Docker-u ili Lando-u, sa tvojom starter temom ili repozitorijumom prilagođene teme. |
| **WordPress + WooCommerce** | Isto, sa WooCommerce-om. |
| **WordPress + React** | Isto, podešeno za temu zasnovanu na React-u. |

React, Next.js i Laravel se generišu njihovim zvaničnim alatima (`create-vite`, `create-next-app`, `composer`).

## Lokalno okruženje {#local-environment}

Svaki tip može dobiti lokalno okruženje. Aplikacije mogu da rade i nativno — to je podrazumevano — sa sopstvenim dev serverima (`npm run dev`, `php artisan serve`).

| Tip | Docker (`docker-compose.yaml`) / Lando (`.lando.yml`) |
| --- | --- |
| **React** | Node 22 kontejner koji vrti Vite dev server — `localhost:5173` (Docker) ili `http://<name>.lndo.site` (Lando). |
| **Next.js** | Node 22 kontejner koji vrti `next dev` — `localhost:3000` (Docker) ili `http://<name>.lndo.site` (Lando). |
| **Laravel + React / Next.js** | PHP 8.3 sa Composer-om koji servira `backend/` (migracije se pokreću pri startu), MySQL i Node kontejner za `frontend/`. Docker: backend na `localhost:8000`, frontend na 5173 ili 3000. Lando: `laravel` recept, sa `lando artisan`, `lando composer` i `lando npm`. |
| **WordPress** | WordPress, MySQL/MariaDB i, opciono, WP-CLI. WordPress uvek zahteva Docker ili Lando. |

Zavisnosti se instaliraju unutar kontejnera, a portovi su vezani samo za `127.0.0.1`. Pokreneš ga sa `docker compose up` ili `lando start`.

Svaki projekat dobija `.gitignore` sa pravilima svog framework-a (build izlaz, `vendor/`, WordPress core i uploads, …) plus ona koja dele svi projekti: zavisnosti, `.env` fajlovi (uz zadržavanje `.env.example`), logovi, fajlovi editora i OS-a, i `.acli/`. A-CLI-jev `.gitignore` uvek ima prednost: za React i Next.js zamenjuje fajl generatora, a pravila koja je imao samo generator zadržavaju se na kraju.

## Korak po korak {#step-by-step}

Pokreni:

```bash
acli create
```

A-CLI pita samo ono što mu treba za tip koji izabereš:

<ol class="step-list">
<li><strong>What is the name of your project?</strong> — ujedno i ime foldera. Mala slova, brojevi, <code>-</code> i <code>_</code>.</li>
<li><strong>Application or WordPress?</strong> — aplikacija ili WordPress.</li>
<li><strong>Aplikacija:</strong> React ili Next.js, pa da li dodati Laravel kao backend.<br><strong>WordPress:</strong> Standard theme, WordPress + WooCommerce ili WordPress + React.</li>
<li><strong>Lokalno okruženje:</strong> <strong>Docker</strong> ili <strong>Lando</strong> — ili, za aplikacije, <strong>None</strong> (podrazumevano) da radi nativno.</li>
<li><strong>Customize advanced settings?</strong> (WordPress) — samo ako želiš druge verzije MySQL/MariaDB ili WordPress-a od podrazumevanih (MySQL 8.0 i fiksirano WordPress izdanje).</li>
<li><strong>WordPress tema:</strong> starter tema tvog tima (kada je podešena), repozitorijum prilagođene teme (HTTPS ili SSH) ili minimalni fajlovi teme. Zatim opciona grana, opcioni plugin-ovi i da li instalirati WP-CLI u okruženje.</li>
<li><strong>Project plan</strong> — pregled svih odgovora. Izaberi <em>Create project</em>, <em>Change answers</em> (izmeni bilo koji) ili <em>Cancel</em>. Pre ove tačke ništa se ne upisuje.</li>
</ol>

Kada završi, A-CLI ispiše lokaciju projekta i sledeće komande koje treba pokrenuti.

## Bez pitanja {#without-questions}

Svaki odgovor ima opciju, pa možeš da preskočiš pitanja na koja već znaš odgovor — ili sva, sa `--yes`:

```bash
acli create --name my-app --type application --framework react
acli create --name booking --type application --framework nextjs --laravel --yes
acli create --name dashboard --type application --framework react --environment docker --yes
acli create --name shop --type wordpress --wp-type woo --environment docker --yes
acli create --name site --type wordpress --wp-type theme \
  --theme-repo git@github.com:your-org/starter-theme.git --theme-branch main
```

Sa `--yes`, odgovor koji nedostaje je greška umesto pitanja. Sve opcije su u [referenci komandi](../reference/commands#acli-create).

## Podrazumevane vrednosti tima {#team-defaults}

Vrednosti koje tvoj tim uvek koristi mogu ići u `defaults` u tvojoj [konfiguraciji](../reference/configuration) — A-CLI ih koristi bez pitanja, a opcije komande i dalje imaju prednost:

```yaml
version: 1
defaults:
  environment: docker
  themeRepo: git@github.com:your-org/starter-theme.git
  plugins: [advanced-custom-fields]
```

Za WordPress starter temu možeš postaviti i promenljive okruženja `WP_THEME_REPO`, `WP_WOO_BRANCH` i `WP_REACT_BRANCH`.

## Pregled i oporavak {#preview-and-recover}

- `--dry-run` ispisuje plan i ništa ne menja.
- Ako pravljenje pukne na pola, folder se zadržava i A-CLI ispiše tačnu komandu za nastavak, npr. `acli create --resume --name my-app`. Završeni koraci se ne ponavljaju.
