# Česta pitanja i problemi

<AcliMascot state="warning" message="Nešto je krenulo naopako? Počni sa --verbose — pokazaću ti svaku komandu koju pokrećem." />

## Opšte {#general}

### Da li A-CLI menja nešto na staging serveru? {#does-a-cli-change-anything-on-the-staging-server}

Ne. Samo čita: fajlovi i baza se izvoze i preuzimaju, a Git se fetch-uje. Push, deploy i import na server su blokirani u kodu — pogledaj [pull-only garancije](./guide/import-and-pull#pull-only-guarantees).

### Da li mi treba profil da bih napravio projekat? {#do-i-need-a-profile-to-create-a-project}

Ne. Profili služe samo za import i pull postojećih WordPress sajtova.

### Može li jedan profil da se koristi za više projekata? {#can-one-profile-be-used-for-many-projects}

Da — u tome je i poenta. Profil opisuje server; projekat se bira pri importu. Pogledaj [Profile](./guide/profiles).

### Mogu li da podelim profil sa timom? {#can-i-share-a-profile-with-my-team}

Podeli komandu, ne fajl: [`acli profile create … --yes`](./guide/profiles#without-questions) sa korisnikom i ključem svake osobe. Profili žive u korisničkoj konfiguraciji svakog developera i nikada se ne čitaju iz repozitorijuma.

### Da li mi treba WP-CLI na računaru? {#do-i-need-wp-cli-on-my-machine}

Ne. Docker i Lando okruženja pokreću `wp` unutar kontejnera. SSH serveru ipak treba `wp` za izvoz baze.

### Zašto je terminal na engleskom? {#why-is-the-terminal-in-english}

Sam CLI je na engleskom, pa primeri iz terminala na ovom sajtu prikazuju tačno ono što ćeš videti. Objašnjenja oko njih su prevedena.

## Kada nešto pukne {#when-something-fails}

### Komanda je stala na pola {#a-command-stopped-half-way}

Pokreni resume komandu koju je A-CLI ispisao (npr. `acli import "Client Site" --resume --name client-site`). Ništa već preuzeto se ne briše, a završeni koraci se preskaču.

### „Missing or outdated tools" {#missing-or-outdated-tools}

Instaliraj ono što poruka navodi — uz svaki alat stoji uputstvo za instalaciju. A-CLI proverava samo ono što je potrebno komandi koju si pokrenuo.

### SSH traži lozinku ili se zaglavi {#ssh-asks-for-a-password-or-hangs}

A-CLI koristi tvoj uobičajeni SSH. Proveri da `ssh -i <key> <user>@<host>` radi bez lozinke i da se `identityFile` i `username` iz profila poklapaju. Sa politikom host ključa `strict`, jednom se uloguj ručno da bi server bio u `known_hosts`.

### Git fetch puca sa „Permission denied (publickey)" {#git-fetch-fails-with-permission-denied-publickey}

Tvoj Git nalog verovatno koristi alias iz `~/.ssh/config`. Postavi ga na profil — `acli profile git-alias <profile> <alias>` — i nastavi. [Detalji →](./guide/profiles#git-accounts-and-ssh-aliases)

### „Could not detect the WordPress table prefix" {#could-not-detect-the-wordpress-table-prefix}

Dodaj `database.tablePrefix: wp_` (prefiks tvog sajta) u profil i nastavi.

### Coolify: „has several database containers" {#coolify-has-several-database-containers}

Server je pitao koju bazu da koristi. Pokreni istu komandu bez `--yes` i izaberi onu koju WordPress koristi (proveri `DB_HOST` u `wp-config.php` ili projekat u Coolify-ju). Odgovor se pamti za projekat.

### Moja konfiguracija se odbija posle prelaska na 3.0 {#my-configuration-is-rejected-after-updating-to-3-0}

3.0 je uklonio nekoliko starijih funkcija. Poruka navodi polje i šta treba uraditi:

| Poruka pominje | Uradi ovo |
| --- | --- |
| `profiles` u `.acli/config.yaml` projekta | Ponovo napravi profil sa `acli profile create`, ukloni blok. |
| `coolify.project` ili `coolify.database` | Ukloni ih — projekat se bira pri importu. |
| `database.driver` / `files.transport` | Ukloni ih — SSH serveri koriste wp-cli i rsync. |
| `${ENV_VAR}` ili `{command: …}` | Upiši samu vrednost. |
| `presets` | Premesti zajedničke vrednosti u `defaults`; ostalo prosledi kao opcije za `acli create`. |
