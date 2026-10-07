# Import i pull WordPress-a

<AcliMascot state="working" message="Pokaži mi sajt na staging-u i doneću ga kući — fajlove, bazu, Git, sve." />

`acli import` pretvara WordPress sajt sa staging servera u funkcionalan lokalni projekat. `acli pull` ga posle toga održava ažurnim. Obe komande zahtevaju [profil](./profiles) za server.

::: tip Vizuelni pregled
Ceo put od instalacije do sajta koji radi lokalno, sa animiranim terminalima, je u [vodiču od nule do lokalnog sajta](./walkthrough).
:::

## Import sajta {#import-a-site}

```bash
acli import
```

(ili **Import an existing WordPress site** u `acli` meniju)

<ol class="step-list">
<li>

**Profil** — A-CLI koristi `--profile`, inače tvoj podrazumevani profil, inače jedini profil; u suprotnom pita.

</li>
<li>

**Projekat** — sa Coolify profilom A-CLI izlista projekte koje ti server daje i ti izabereš jedan. Možeš ga i direktno navesti: `acli import "Client Site"`. Sa SSH profilom projekat je lokalno ime koje uneseš u sledećem koraku.

</li>
<li>

**Local project directory/name** — folder koji se pravi, npr. `client-site`. Predlaže se na osnovu projekta na serveru („Client Site" → `client-site`).

</li>
<li>

**Lokalno okruženje** — Docker (`docker-compose.yaml`) ili Lando (`.lando.yml`).

</li>
<li>

**Pregled** — server, korisnik i projekat koji će se koristiti. Zatim A-CLI prolazi kroz korake ispod.

</li>
</ol>

<AcliReplay session="import" title="acli import" />

### Šta se dešava {#what-happens}

<AcliPullDiagram />

| Korak | Šta A-CLI radi |
| --- | --- |
| Validating requirements | Proverava tvoje lokalne alate i da su server i projekat dostupni. Ništa se ne pravi dok ovo ne prođe. |
| Fetching WordPress files | Kopira `wp-content` (uploads, plugins, themes, a na Coolify-ju i languages). |
| Fetching database dump | Izvozi bazu na serveru i preuzima je kao `staging.sql`. |
| Detecting table prefix | Čita ga sa servera (SSH/wp-cli) ili iz dump-a, da bi lokalni sajt koristio prave tabele. |
| Scaffolding local environment | Piše `docker-compose.yaml` ili `.lando.yml` za ovaj sajt. |
| Linking project to its profile | Čuva vezu u `.acli/config.yaml`, pa `acli pull` kasnije ne traži argumente. |
| Linking Git repository | Povezuje Git origin sajta, samo za pull ([detalji](#git)). |
| Preparing Git ignore rules | Piše A-CLI-jev WordPress `.gitignore`. Pravila koja je imao samo repozitorijum zadržavaju se na kraju, pa ništa što je ranije bilo ignorisano ne postaje praćeno. `acli pull` radi isto, pa to dobijaju i stariji importi. |
| Importing database and replacing URLs | Pokreće okruženje, importuje dump i zamenjuje staging URL-ove tvojim lokalnim. |

Na kraju A-CLI nudi da instalira zavisnosti teme (kada ima `package.json` ili `composer.json`) i ispiše pregled sa sledećim koracima. Okruženje ostaje pokrenuto: sajt je na `http://localhost:8080` (Docker) ili `https://<name>.lndo.site` (Lando). Dump sadrži stvarne podatke korisnika, pa se `staging.sql` briše posle uspešnog importa (`--keep-dump` ga zadržava).

### Ako stane na pola {#if-it-stops-half-way}

Ništa što je već preuzeto se ne briše. A-CLI ispiše tačnu komandu za nastavak od koraka koji je pukao, npr.:

```bash
acli import "Client Site" --resume --name client-site
```

Završeni koraci — kao preuzimanje `uploads` foldera od 1 GB — se ne ponavljaju.

### Korisne opcije {#useful-options}

| Opcija | Efekat |
| --- | --- |
| `--dry-run` | Prikaži šta bi se desilo (server, projekat, prenosi, alati) i ništa ne menjaj. |
| `--skip-files` / `--skip-database` | Izostavi fajlove ili bazu. |
| `--skip-git-link` / `--skip-git` | Ne povezuj Git origin / uopšte ne pravi Git repozitorijum. |
| `--remote-url <url>` | Još jedan URL za zamenu, npr. URL produkcionog sajta. |
| `--yes` | Bez pitanja; sve mora doći iz opcija. |

Sve opcije: [referenca komandi](../reference/commands#acli-import).

## Šta sadrži folder projekta {#what-the-project-folder-contains}

```text
client-site/
├── .acli/config.yaml     ← veza sa profilom (i projektom na serveru)
├── docker-compose.yaml   ← ili .lando.yml
├── wp-content/           ← uploads, plugins, themes, languages
└── .gitignore
```

Veza izgleda ovako — obično je nikad ne menjaš:

```yaml
version: 1
project:
  name: client-site
  environment: docker
  profile: coolify
  remoteProject: Client Site          # samo kada se razlikuje od imena
  selections:
    database: gk6zccy4rbmh5dlbruv9ypnj # odgovori na pitanja servera, vidi ispod
```

## Kasnije povuci izmene {#pull-updates-later}

Unutar importovanog projekta (radi iz bilo kog podfoldera):

```bash
acli pull db                 # samo baza
acli pull uploads plugins    # samo neki folderi
acli pull full --yes         # sve, bez pitanja
acli pull                    # izaberi sa liste
```

<AcliReplay session="pull" title="~/Sites/client-site — acli pull db" />

Ciljevi su `db` plus folderi profila: `uploads`, `plugins`, `themes` (i `languages` na Coolify-ju, ili tvoji sopstveni na SSH profilima). Pull `db` zamenjuje tvoju lokalnu bazu, pa A-CLI prvo pita, osim ako proslediš `--yes`. `--dry-run` prikazuje šta bi se povuklo.

## Poveži folder koji već imaš {#link-a-folder-you-already-have}

Sam si klonirao repozitorijum? Poveži ga sa profilom da bi `acli pull` radio u njemu:

```bash
cd client-site
acli link --profile coolify --environment docker
acli link --remote-project "Client Site"   # kada se ime na serveru razlikuje
```

`acli link` nudi da generiše Docker/Lando fajl ako ga nema. `--force` ponovo povezuje folder koji je već povezan.

## Coolify serveri {#coolify-servers}

Coolify server nudi komandu `project` umesto direktnog pristupa fajlovima i bazama. A-CLI preko SSH-a pokreće samo njene podkomande koje samo čitaju:

| A-CLI-ju treba | Serverska komanda |
| --- | --- |
| tvoji projekti | `project list` |
| status projekta, Git repo i grana | `project status <project>` |
| baza | `project db-export <project> sql.gz` |
| folder | `project wp-export <project> uploads` (plugins, themes, languages) |

Svaki izvoz se preuzima `scp`-om, proverava, raspakuje i lokalno briše.

**Kada server postavi pitanje** — neki projekti imaju više od jednog kontejnera baze ili WordPress kontejnera, pa server pita koji da koristi. A-CLI ti prikaže isto pitanje, pošalje tvoj odgovor i zapamti ga u `.acli/config.yaml`, pa te pita samo jednom po projektu. Sa `--yes` ne može da pita, pa staje i izlista izbore. Izaberi onaj koji WordPress koristi — proveri `DB_HOST` u `wp-config.php` sajta ili projekat u Coolify-ju.

**Izvozi ostaju na serveru** u njegovom backup folderu; developeri ne mogu da ih brišu. Pitaj administratora servera koliko se čuvaju.

## Git {#git}

Kada je Git povezivanje uključeno, importovani projekat dobija Git repozitorijum čiji je `origin` repozitorijum sajta, a osnova mu je grana koja je stvarno deploy-ovana (na Coolify-ju) ili podrazumevana grana repozitorijuma. Importovani fajlovi se **ne** prepisuju — odmah vidiš po čemu se staging razlikuje od repozitorijuma.

A-CLI nikada ne pravi commit niti push. Ako fetch pukne sa *Permission denied (publickey)*, postavi svoj [Git SSH alias](./profiles#git-accounts-and-ssh-aliases) i nastavi.

## Kako baza ispadne ispravna {#how-the-database-comes-out-right}

- **URL-ovi:** sopstveni URL sajta čita se iz importovane baze i zamenjuje tvojim lokalnim URL-om, plus staging URL iz profila, `--remote-url` i `urls.additionalSearchReplace` — i `http://` i `https://`.
- **Prefiks tabela:** čita se sa servera kad god je moguće, inače iz dump-a prepoznavanjem WordPress core tabela. Postavi `database.tablePrefix` u profilu ako ne može da se prepozna.
- **Prenosivi dump-ovi:** linije `CREATE DATABASE`/`USE` i MariaDB sandbox marker se uklanjaju, a novije kolacije se prepisuju za lokalni MySQL/MariaDB (`database.normalizeCollations: false` to isključuje).
- **Spremno pre importa:** A-CLI čeka dok WordPress stvarno ne može da dođe do baze i jednom popravi zastareli lokalni volume baze ako treba.

## Pull-only garancije {#pull-only-guarantees}

A-CLI ne menja ništa na serveru, i to je sprovedeno u kodu, a ne dogovorom:

- Svaka komanda ide kroz jedan runner koji odbija `git push` / `git send-pack` i svaku SSH komandu koja bi pokrenula `project wp-import`, `db-import`, `db-backup`, `branch`, `deploy`, `shell`, `logs` ili administratorsku podkomandu.
- Coolify provider dodatno šalje samo `list`, `info`, `status`, `db-export` i `wp-export`.
- Preuzete arhive se proveravaju pre raspakivanja: bez apsolutnih putanja, bez `..`, bez linkova, ništa van očekivanog foldera.
- Profili se čitaju samo iz tvoje korisničke konfiguracije — repozitorijum ne može da preusmeri tvoj pull na drugi server.
