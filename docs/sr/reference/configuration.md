# Konfiguracija

Većina ljudi nikada ne menja konfiguraciju ručno: `acli profile create` i `acli import` je pišu umesto tebe. Ova stranica je za kada želiš da pogledaš šta je unutra.

## Dva fajla {#two-files}

| Fajl | Sadrži | Piše ga |
| --- | --- | --- |
| **Korisnička konfiguracija** — `acli config path` je ispisuje (macOS `~/Library/Application Support/a-cli/config.yaml`, Linux `~/.config/a-cli/config.yaml`, Windows `%APPDATA%\a-cli\config.yaml`) | Tvoje [profile](../guide/profiles), podrazumevani profil i `defaults` za `acli create`. | `acli profile …`, `acli config init` |
| **Projektna konfiguracija** — `.acli/config.yaml` u projektu | Vezu sa profilom (`project:`) i, opciono, `defaults` za taj projekat. | `acli import`, `acli link`, `acli pull` |

Profili žive **samo** u korisničkoj konfiguraciji: opisuju kako *tvoj* računar stiže do servera, sa tvojim korisnikom i ključem. Projektna konfiguracija koja deklariše profile ili podrazumevani profil se odbija, pa repozitorijum koji si klonirao ne može da preusmeri `acli pull` na drugi server.

Kasniji izvori imaju prednost: ugrađene podrazumevane vrednosti → korisnička konfiguracija → projektna konfiguracija → opcije komande. `--config <path>` koristi jedan fajl umesto oba.

Svaki fajl počinje sa `version: 1`. Proveri ih sa `acli config validate`, a spojeni rezultat ispiši sa `acli config show`.

## Korisnička konfiguracija {#user-config}

```yaml
version: 1

defaults:
  profile: coolify            # podrazumevani profil (acli profile use)
  environment: docker         # koristi ga acli create kada ne proslediš --environment
  themeRepo: git@github.com:your-org/starter-theme.git
  plugins: [advanced-custom-fields]

profiles:
  coolify:
    provider: coolify-cli
    ssh: { host: cloud.example.com, username: developer, identityFile: ~/.ssh/cloud, hostKeyPolicy: accept-new }
    git: { enabled: true, sshHostAlias: github-work }
    urls: { staging: "https://{projectName}.cloud.example.com" }
```

### `defaults` za `acli create` {#defaults-for-acli-create}

Bilo koja od ovih vrednosti preskače odgovarajuće pitanje. Vrednosti su obični stringovi, brojevi, boolean-i ili liste.

| Ključ | Primer |
| --- | --- |
| `environment` | `docker`, `lando` ili `none` (samo aplikacije) |
| `mysqlVersion` | `"8.0"`, `mariadb:11.4` |
| `wpVersion` | `"6.8"` ili `latest` |
| `themeRepo` / `themeBranch` | Git URL / grana |
| `plugins` | `[advanced-custom-fields, wordpress-seo]` |
| `installWpCli` | `true` |
| `appType`, `framework`, `useLaravel`, `wpType` | odgovori o tipu projekta |

### Polja profila {#profile-fields}

| Polje | Provideri | Značenje |
| --- | --- | --- |
| `provider` | — | `ssh` (podrazumevano) ili `coolify-cli`. |
| `ssh.host`, `ssh.port`, `ssh.username` | oba | Kako se loguješ. `username` može sadržati `{projectName}`. |
| `ssh.identityFile` | oba | Putanja privatnog ključa (opciono). |
| `ssh.hostKeyPolicy` | oba | `strict` (podrazumevano), `accept-new` ili `insecure`. |
| `remote.projectRoot`, `remote.wordpressRoot` | ssh | Folder projekta na serveru (sa `{projectName}`) i WordPress folder unutar njega. |
| `files.directories`, `files.excludes` | ssh | `wp-content` folderi za sinhronizaciju i šabloni koji se preskaču. `files.targets` daje svakom cilju sopstvenu putanju. |
| `coolify.gitHost` | coolify-cli | Git host za origin koji prijavi server (podrazumevano `github.com`). |
| `git.enabled` | oba | Poveži Git repozitorijum sajta posle importa. |
| `git.sshHostAlias` | oba | Lokalni alias iz `~/.ssh/config` za Git. |
| `git.discoveryPaths` | ssh | Gde tražiti Git repozitorijum sajta (podrazumevano: WordPress root i `wp-content/themes/{projectName}`). |
| `urls.staging` | oba | Dodatni URL koji se zamenjuje lokalnim. |
| `urls.additionalSearchReplace` | oba | Još URL-ova za zamenu. |
| `database.tablePrefix` | oba | Prefiks tabela, kada ne može da se prepozna. |
| `database.normalizeCollations` | oba | `false` ostavlja kolacije iz dump-a nepromenjene. |
| `local.url` | oba | Lokalni URL sajta (podrazumevano `http://localhost:8080`). |

## Projektna konfiguracija (`.acli/config.yaml`) {#project-config}

```yaml
version: 1
project:
  name: client-site            # lokalno ime projekta
  type: wordpress
  environment: docker
  profile: coolify             # profil iz tvoje korisničke konfiguracije
  remoteProject: Client Site   # ime na serveru, kada se razlikuje
  selections:                  # zapamćeni odgovori na pitanja servera
    database: gk6zccy4rbmh5dlbruv9ypnj
    wordpressContainer: wordpress
  linkedAt: 2026-09-23T17:26:26.330Z
```

`.acli/` se automatski dodaje u `.gitignore` projekta.

## Promenljive okruženja {#environment-variables}

A-CLI ne učitava `.env` fajlove i ne razrešava promenljive unutar konfiguracije — vrednosti se koriste onako kako su napisane. Iz tvog shell-a čita sledeće:

| Promenljiva | Efekat |
| --- | --- |
| `ACLI_VERBOSE=1`, `ACLI_DEBUG=1`, `ACLI_QUIET=1` | Isto kao `--verbose`, `--debug`, `--quiet`. |
| `ACLI_CONFIG_HOME` | Koristi drugi folder za korisničku konfiguraciju. |
| `ACLI_REDUCED_MOTION=1`, `NO_COLOR=1` | Bez animacija / bez boja (automatski i u CI-ju i sa `TERM=dumb`). |
| `WP_THEME_REPO` | Starter tema koju nudi `acli create`. |
| `WP_WOO_BRANCH`, `WP_REACT_BRANCH` | Grane starter teme za WooCommerce i React postavke. |
