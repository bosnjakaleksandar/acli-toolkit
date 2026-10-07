# Komande

Svaka komanda se pokreće i iz `acli` menija. Opcije označene sa **→** mogu zameniti pitanje; `--yes` (alias `--non-interactive`) svako preostalo pitanje pretvara u grešku, za skripte i CI.

**Globalne opcije** (bilo koja komanda): `--verbose` prikazuje komande koje A-CLI pokreće · `--debug` ispisuje stack trace · `--quiet` sakriva baner i animacije · `--skip-update` preskače proveru ažuriranja · `-v, --version` · `-h, --help`.

## `acli create` {#acli-create}

Pravi nov projekat. [Uputstvo →](../guide/create)

| Opcija | |
| --- | --- |
| `--name <name>` | → Ime projekta i foldera. |
| `--type <application\|wordpress>` | → Tip projekta. |
| `--framework <react\|nextjs>` | → Framework aplikacije (radi i `next`). |
| `--laravel` | → Dodaj Laravel backend. |
| `--wp-type <theme\|woo\|react>` | → WordPress postavka (rade i `wp-theme`, `wp-woo`, `wp-react`). |
| `--environment <docker\|lando\|none>` | → Lokalno okruženje (alias `--env`). `none` pokreće aplikaciju nativno (podrazumevano za aplikacije); WordPress zahteva `docker` ili `lando`. |
| `--mysql <version>` | → Verzija MySQL-a ili MariaDB-a, npr. `8.0`, `mariadb:11.4`. |
| `--wp-version <version>` | → Verzija WordPress-a, ili `latest`. |
| `--theme-repo <url>` | → Repozitorijum teme (HTTPS ili SSH). |
| `--theme-branch <branch>` | → Grana teme. |
| `--ssh-key <path>` | → Ključ za kloniranje privatnog repozitorijuma teme. |
| `--skip-git` | Ne pravi Git repozitorijum. |
| `--dry-run` | Ispiši plan i ništa ne menjaj. |
| `--resume` | Nastavi prekinuto pokretanje (sa istim `--name`). |
| `--config <path>` | Koristi jedan eksplicitan konfiguracioni fajl. |
| `--yes` | Bez pitanja. |

## `acli import [project]` {#acli-import}

Prebacuje WordPress sajt sa staging-a u nov lokalni projekat. `[project]` je ime projekta na serveru; izostavi ga da biraš sa serverske liste (Coolify). [Uputstvo →](../guide/import-and-pull)

| Opcija | |
| --- | --- |
| `--profile <name>` | → Koji profil (server). Podrazumevano: tvoj podrazumevani ili jedini profil. |
| `--name <name>` | → Ime lokalnog foldera. |
| `--environment <docker\|lando>` | → Lokalno okruženje (alias `--env`). |
| `--mysql <version>` | Lokalna verzija MySQL/MariaDB (podrazumevano `8.0`). |
| `--wp-version <version>` | Verzija WordPress-a za lokalno okruženje. |
| `--remote-url <url>` | Još jedan URL koji se zamenjuje lokalnim. |
| `--skip-files` | Ne kopiraj fajlove. |
| `--skip-database` | Ne importuj bazu. |
| `--skip-git-link` | Ne povezuj Git origin sajta. |
| `--skip-git` | Uopšte ne pravi Git repozitorijum. |
| `--keep-dump` | Zadrži `staging.sql` posle importa. |
| `--dry-run` | Ispiši plan i ništa ne menjaj. |
| `--resume` | Nastavi prekinuti import (A-CLI ispiše tačnu komandu). |
| `--config <path>` | Koristi jedan eksplicitan konfiguracioni fajl. |
| `--yes` | Bez pitanja. |

## `acli pull [targets...]` {#acli-pull}

Osvežava importovani (ili povezani) projekat. Pokreni je bilo gde unutar projekta. [Uputstvo →](../guide/import-and-pull#pull-updates-later)

Ciljevi: `db`, folderi profila (`uploads`, `plugins`, `themes`, i `languages` na Coolify-ju), ili `full`. Bez ciljeva: biraš sa liste (sa `--yes` sve).

| Opcija | |
| --- | --- |
| `--dry-run` | Prikaži šta bi se povuklo. |
| `--keep-dump` | Zadrži `staging.sql` posle pull-a baze. |
| `--yes` | Ne pitaj pre zamene lokalne baze. |
| `--config <path>` | Koristi jedan eksplicitan konfiguracioni fajl. |

## `acli link` {#acli-link}

Povezuje postojeći folder sa profilom, da bi `acli pull` radio u njemu.

| Opcija | |
| --- | --- |
| `--name <name>` | Ime projekta (podrazumevano: ime foldera). |
| `--remote-project <name>` | Ime projekta na serveru, kada se razlikuje. |
| `--profile <name>` | → Koji profil. |
| `--environment <docker\|lando>` | → Lokalno okruženje. |
| `--force` | Ponovo poveži folder koji je već povezan. |
| `--config <path>` | Koristi jedan eksplicitan konfiguracioni fajl. |
| `--yes` | Bez pitanja. |

## `acli profile` {#acli-profile}

Upravljanje staging profilima. [Uputstvo →](../guide/profiles)

| Komanda | |
| --- | --- |
| `acli profile create [name]` | Napravi profil (opcije ispod). |
| `acli profile list [--json]` | Izlistaj profile; `*` označava podrazumevani. |
| `acli profile current` | Prikaži podrazumevani profil. |
| `acli profile use [name] [--clear]` | Postavi ili ukloni podrazumevani profil. |
| `acli profile git-alias <name> [alias] [--clear]` | Postavi ili ukloni Git SSH Host alias. |
| `acli profile inspect <name>` | Ispiši profil (tajni podaci sakriveni). |
| `acli profile validate <name>` | Proveri profil. |
| `acli profile delete <name> [--yes] [--force]` | Obriši profil (`--force` uklanja i reference na njega). |

### Opcije za `acli profile create` {#acli-profile-create-options}

| Opcija | |
| --- | --- |
| `--provider <ssh\|coolify-cli>` | → Kako A-CLI stiže do servera (podrazumevano `ssh`). |
| `--host <host>` | → SSH host. |
| `--port <port>` | → SSH port (podrazumevano `22`). |
| `--username <user>` | → SSH korisnik; može sadržati `{projectName}`. |
| `--identity-file <path>` | → SSH privatni ključ. |
| `--host-key-policy <strict\|accept-new\|insecure>` | → Provera host ključa (podrazumevano `strict`). |
| `--project-root <path>` | → SSH: folder projekta, npr. `/srv/projects/{projectName}`. |
| `--wordpress-root <path>` | → SSH: WordPress folder unutar njega, npr. `wordpress`. |
| `--directories <list>` | → SSH: `wp-content` folderi, npr. `uploads,plugins,themes`. |
| `--staging-url <url>` | → Dodatni URL za zamenu pri importu. |
| `--git` / `--no-git` | → Poveži Git repozitorijum sajta posle importa. |
| `--git-ssh-host-alias <alias>` | → Lokalni alias iz `~/.ssh/config` za Git. |
| `--force` | Zameni postojeći profil sa istim imenom. |
| `--yes` | Bez pitanja. |

## `acli config` {#acli-config}

| Komanda | |
| --- | --- |
| `acli config path` | Ispiši gde su korisnički i projektni konfiguracioni fajlovi. |
| `acli config init [--scope user\|project] [--force]` | Napiši početni konfiguracioni fajl. |
| `acli config show` | Ispiši spojenu konfiguraciju (tajni podaci sakriveni). |
| `acli config validate` | Proveri svaki konfiguracioni fajl. |

## `acli update` {#acli-update}

| Komanda | |
| --- | --- |
| `acli update` | Instaliraj najnoviju verziju globalno. |
| `acli update --check` | Samo javi; izlazni kod 1 kada postoji ažuriranje. |
