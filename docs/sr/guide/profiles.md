# Profili

<AcliMascot state="thinking" message="Profil mi govori kako da stignem do staging servera. Podesi ga jednom — i svaki projekat na tom serveru je udaljen jednu komandu." />

**Profil** opisuje staging **server**, a ne projekat: njegovu adresu, tvog SSH korisnika i ključ, i kako A-CLI sa njega uzima fajlove i bazu. Jedan profil služi za sve projekte na tom serveru. Koji projekat želiš bira se kasnije, pri [importu](./import-and-pull).

Profil ti treba pre `acli import`, `acli pull` ili `acli link`. Za `acli create` ti ne treba.

## Dve vrste servera {#two-kinds-of-servers}

Kada praviš profil, A-CLI prvo pita kako stiže do servera. Izaberi ono što odgovara tvom:

| | **SSH with wp-cli** (`ssh`) | **Coolify project CLI** (`coolify-cli`) |
| --- | --- | --- |
| Koristi kada | možeš SSH-om na server i WordPress fajlovi su tamo | server vrti sajtove u Coolify-ju i developerima daje komandu `project` |
| Fajlovi | kopiraju se `rsync`-om iz WordPress foldera | izvozi ih `project wp-export`, preuzimaju se `scp`-om |
| Baza | `wp db export` na serveru | izvozi je `project db-export`, preuzima se `scp`-om |
| Koji projekat | iz šablona putanje u profilu, npr. `/srv/projects/{projectName}` | bira se sa serverske liste `project list` pri importu |
| Git | origin se pronalazi u folderu sajta | repozitorijum i deploy-ovana grana iz `project status` |

U oba slučaja A-CLI sa servera samo **čita** — pogledaj [pull-only garancije](./import-and-pull#pull-only-guarantees).

## Pre nego što počneš

Proveri da možeš sam da se uloguješ na server:

```bash
ssh -i ~/.ssh/your-key your-user@staging.example.com
```

Ako to radi, radiće i A-CLI sa istim hostom, korisnikom i ključem. Za Coolify server proveri i da `project list` prikazuje tvoje projekte. Ako traži lozinku ili javlja permission denied, prvo to reši (administrator servera može da doda tvoj ključ ili ti dodeli projekte).

## Pravljenje profila, korak po korak {#create-a-profile-step-by-step}

```bash
acli profile create
```

(ili **Profiles → Create a profile** u `acli` meniju)

<ol class="step-list">
<li>

**Profile name** — tvoje ime za ovaj server, npr. `agency-staging` ili `coolify`. Mala slova, brojevi, `-` i `_`. Koristiš ga sa `--profile` i `acli profile use`.

</li>
<li>

**How does A-CLI reach this server?** — *SSH with wp-cli* ili *Coolify project CLI* (pogledaj [tabelu iznad](#two-kinds-of-servers)).

</li>
<li>

**SSH host** — adresa servera, npr. `staging.example.com`.

</li>
<li>

**SSH port** — pritisni Enter za `22`, osim ako server koristi drugi port.

</li>
<li>

**SSH username** — korisnik sa kojim se loguješ.
- *Coolify:* tvoj lični korisnik, npr. `developer`.
- *SSH:* može sadržati `{projectName}` kada svaki sajt ima svog korisnika, npr. `{projectName}` → `client-site` za projekat `client-site`. Podrazumevano: `{projectName}`.

</li>
<li>

**SSH private key** *(opciono)* — putanja do ključa, npr. `~/.ssh/staging`. Ostavi prazno da koristiš uobičajeno SSH podešavanje (`~/.ssh/config`, ssh-agent).

</li>
<li>

**SSH host-key policy** — šta raditi sa host ključem servera:
- **Strict** *(preporučeno)* — server već mora biti u `~/.ssh/known_hosts` (prvo se jednom uloguj ručno).
- **Accept new** — veruj serveru prvi put, a posle ga proveravaj svaki put.
- **Insecure** — nikad ne proveravaj. Samo za test servere koje ćeš baciti.

</li>
<li>

**Samo SSH — gde se sajtovi nalaze:**
- **Remote project root** — folder projekta na serveru, sa `{projectName}`, npr. `/srv/projects/{projectName}` ili `/var/www/{projectName}`.
- **WordPress root relative to project root** — gde je `wp-config.php` unutar njega, npr. `wordpress`, `public` ili `.`.
- **WordPress content directories** — šta kopirati iz `wp-content`: uploads, plugins, themes (podrazumevano) i opciono languages.

*Coolify profili preskaču ovaj korak* — server zna gde je svaki projekat.

</li>
<li>

**Staging URL** *(opciono)* — npr. `https://{projectName}.staging.example.com`. Pri importu se sopstveni URL sajta uvek zamenjuje tvojim lokalnim; ovim dodaješ još jedan URL za zamenu. Ostavi prazno ako nisi siguran.

</li>
<li>

**Link the site's Git repository after import?** — *Yes* povezuje importovani projekat sa Git origin-om sajta, samo za pull, pa odmah vidiš stvarne razlike. Pogledaj [Git](./import-and-pull#git).

</li>
<li>

**Local Git SSH Host alias** *(opciono)* — samo ako tvoj `~/.ssh/config` koristi alias za Git nalog (pogledaj [ispod](#git-accounts-and-ssh-aliases)). U suprotnom ostavi prazno.

</li>
</ol>

A-CLI sačuva profil i ispiše gde. Ako ti je to jedini profil, koristi se automatski; u suprotnom ga postavi kao podrazumevani:

```bash
acli profile use agency-staging
```

### Kako to izgleda

Coolify profil:

<AcliReplay session="profile" title="acli profile create" />

Čuva se kao običan YAML u tvojoj korisničkoj konfiguraciji:

::: code-group

```yaml [Coolify profil]
version: 1
profiles:
  coolify:
    type: wordpress
    provider: coolify-cli
    ssh:
      host: cloud.example.com
      port: 22
      username: developer
      identityFile: ~/.ssh/cloud
      hostKeyPolicy: accept-new
    git:
      enabled: true
      sshHostAlias: github-work
    urls:
      staging: https://{projectName}.cloud.example.com
defaults:
  profile: coolify
```

```yaml [SSH profil]
version: 1
profiles:
  agency-staging:
    type: wordpress
    ssh:
      host: staging.example.com
      port: 22
      username: "{projectName}"
      identityFile: ~/.ssh/staging
      hostKeyPolicy: strict
    remote:
      projectRoot: /srv/projects/{projectName}
      wordpressRoot: wordpress
    files:
      directories: [uploads, plugins, themes]
      excludes: ["*.log", node_modules]
    git:
      enabled: true
    urls:
      staging: https://{projectName}.staging.example.com
```

:::

Ovaj fajl možeš menjati i ručno; `acli profile validate <name>` ga proverava. `acli config path` ispisuje gde se nalazi:

| Sistem | Korisnička konfiguracija |
| --- | --- |
| macOS | `~/Library/Application Support/a-cli/config.yaml` |
| Linux | `~/.config/a-cli/config.yaml` (ili `$XDG_CONFIG_HOME/a-cli/`) |
| Windows | `%APPDATA%\a-cli\config.yaml` |

## `{projectName}` {#projectname}

`{projectName}` se pri importu ili pull-u zamenjuje **lokalnim imenom projekta** — imenom foldera, npr. `client-site`. Tako jedan profil opisuje svaki projekat na serveru koji prati isti šablon:

| U profilu | Za `client-site` |
| --- | --- |
| `username: "{projectName}"` | `client-site` |
| `projectRoot: /srv/projects/{projectName}` | `/srv/projects/client-site` |
| `staging: https://{projectName}.staging.example.com` | `https://client-site.staging.example.com` |

Coolify profilima to ne treba za sam projekat: projekat se bira sa serverske liste, a njegovo tačno ime na serveru („Client Site") pamti se u projektu.

## Bez pitanja {#without-questions}

Svako pitanje ima opciju, pa ceo tim može da napravi isti profil jednom komandom — svako menja samo svog korisnika i ključ:

::: code-group

```bash [Coolify]
acli profile create coolify --provider coolify-cli \
  --host cloud.example.com --username YOUR_USER --identity-file ~/.ssh/YOUR_KEY \
  --host-key-policy accept-new \
  --staging-url 'https://{projectName}.cloud.example.com' --yes
```

```bash [SSH]
acli profile create agency-staging --provider ssh \
  --host staging.example.com --username '{projectName}' --identity-file ~/.ssh/staging \
  --project-root '/srv/projects/{projectName}' --wordpress-root wordpress \
  --directories uploads,plugins,themes --host-key-policy accept-new --yes
```

:::

Stavi ovu komandu u internu dokumentaciju tima. Profili su namerno vezani za računar: sadrže korisnika i ključ svakog developera i nikada se ne čitaju iz repozitorijuma projekta.

## Git nalozi i SSH aliasi {#git-accounts-and-ssh-aliases}

Ako koristiš različite GitHub naloge preko `~/.ssh/config`, npr.

```ssh-config
Host github-work
  HostName github.com
  IdentityFile ~/.ssh/work
```

postavi isti alias na profil, da bi importovani projekat radio fetch pravim ključem:

```bash
acli profile git-alias coolify github-work
```

A-CLI tada za projekte tog profila pretvara `git@github.com:org/site.git` u `git@github-work:org/site.git`. HTTPS URL-ovi ostaju netaknuti. `acli profile git-alias coolify --clear` ga uklanja.

## Upravljanje profilima {#managing-profiles}

| Komanda | Radi |
| --- | --- |
| `acli profile list` | Svi profili; `*` označava podrazumevani. |
| `acli profile current` | Podrazumevani profil. |
| `acli profile use <name>` | Postavi profil kao podrazumevani (`--clear` da ukloniš). |
| `acli profile inspect <name>` | Ispiše profil (ključevi i lozinke sakriveni). |
| `acli profile validate <name>` | Proveri profil na greške. |
| `acli profile git-alias <name> [alias]` | Postavi ili `--clear` Git SSH alias. |
| `acli profile delete <name>` | Obriši ga (prvo pita; `--yes` preskače pitanje). |

Koji profil komanda koristi: `--profile <name>` ako je zadat, inače podrazumevani, inače jedini profil, inače A-CLI pita (ili, sa `--yes`, staje i traži da proslediš `--profile`).

## Kada nešto pođe naopako {#when-something-goes-wrong}

| Poruka | Šta uraditi |
| --- | --- |
| `Profile "x" was not found.` | Proveri `acli profile list`; napravi profil ili ispravi ime. |
| `Missing or outdated tools: rsync.` | Instaliraj ono što je navedeno — poruka kaže kako. |
| `Project "x" is not assigned to …` (Coolify) | Koristi ime sa liste koju ispiše, ili zamoli administratora da ti dodeli projekat. |
| `Permission denied (publickey)` | Proveri da `ssh -i <key> <user>@<host>` radi ručno. |
| `… declares profiles, which since A-CLI 3.0 live only in the user config` | `.acli/config.yaml` projekta ima blok `profiles:`. Ponovo napravi profil sa `acli profile create` i ukloni blok. |
| `coolify.project is no longer part of a profile` | Ukloni `coolify.project` / `coolify.database` iz profila — projekat se sada bira pri importu. |
| `database.driver "docker" is no longer supported` | A-CLI 3.0 izvozi SSH baze samo pomoću wp-cli-ja. Ukloni polje; serveru treba `wp`. |
| `uses a ${ENV_VAR} or {command: ...} reference` | Upiši stvarnu vrednost; reference se više ne razrešavaju. |
