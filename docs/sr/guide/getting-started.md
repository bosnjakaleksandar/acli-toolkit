# Prvi koraci

<AcliMascot state="idle" message="Zdravo! Ja sam A-CLI Bot. Biću uz tebe u terminalu sve vreme." />

A-CLI radi dve stvari:

| | Šta radi | Komande |
| --- | --- | --- |
| **Novi projekti** | Pravi React, Next.js, Laravel ili WordPress projekat sa svim povezanim: lokalno okruženje (WordPress), Git, formatiranje, sledeći koraci. | `acli create` |
| **Postojeći WordPress sajtovi** | Kopira sajt sa staging servera — fajlove, bazu, Git — u funkcionalno lokalno Docker ili Lando okruženje i održava ga ažurnim. Prema serveru samo čita. | `acli profile`, `acli import`, `acli pull`, `acli link` |

::: tip Prvi put ovde?
[Vodič od nule do lokalnog sajta](./walkthrough) prolazi ceo put — instalaciju, profil i import postojećeg sajta — korak po korak, sa prikazom onoga što ćeš videti u terminalu.
:::

## Instalacija

A-CLI zahteva **Node.js 22.18 ili noviji**.

```bash
npm install --global acli-toolkit
```

Ili ga pokreni bez instalacije:

```bash
npx acli-toolkit
```

Proveri da radi:

```bash
acli --version
```

## Šta ti još treba

A-CLI sam proverava ove alate pre pokretanja i kaže ti šta nedostaje i kako da ga instaliraš — ne moraš posebno da proveravaš.

| Za | Potrebno ti je |
| --- | --- |
| Sve | Node.js 22.18+, npm, Git |
| WordPress projekte (nove ili importovane) ili aplikaciju sa lokalnim okruženjem | Docker sa Compose v2, **ili** Lando |
| Laravel projekte | Composer i PHP 8.2+ |
| Import sa SSH servera | `ssh` i `rsync` lokalno; `wp` (wp-cli) na serveru |
| Import sa Coolify servera | `ssh`, `scp` i `tar` lokalno |

WP-CLI ti ne treba na računaru: Docker i Lando okruženja pokreću `wp` unutar kontejnera.

## Prvo pokretanje

Pokreni `acli` bez argumenata da otvoriš meni:

<AcliTerminal title="~ acli">
<AcliBanner compact />
<AcliMascot state="idle" message="Ready to build something awesome?" />
<pre>◆  What would you like to do?
│  ● Create a project
│  ○ Import an existing WordPress site
│  ○ Profiles
│  ○ Link an existing project to a staging profile
│  ○ Pull files/database from a linked profile
│  ○ Show command help</pre>
</AcliTerminal>

Svaka stavka menija je i komanda koju možeš direktno pokrenuti, sa opcijama za skripte i CI. (CLI je na engleskom, pa su i primeri iz terminala na ovom sajtu na engleskom.)

## Komande na jednom mestu

| Komanda | Služi za |
| --- | --- |
| `acli create` | Pravljenje novog projekta. [Uputstvo →](./create) |
| `acli profile create` | Čuvanje podataka o tome kako se stiže do staging servera. [Uputstvo →](./profiles) |
| `acli import [project]` | Prebacivanje WordPress sajta sa staging-a u novi lokalni projekat. [Uputstvo →](./import-and-pull) |
| `acli pull [targets...]` | Osvežavanje baze i/ili fajlova importovanog projekta. [Uputstvo →](./import-and-pull#pull-updates-later) |
| `acli link` | Povezivanje foldera koji već imaš (npr. kloniranog repozitorijuma) sa profilom. |
| `acli config` | Gde se nalazi konfiguracija, validacija, ispis. |
| `acli update` | Instalacija najnovije verzije. |

Globalne opcije za svaku komandu: `--verbose` (prikazuje komande koje A-CLI pokreće), `--debug` (stack trace), `--quiet` (bez banera i animacija), `--skip-update` (preskače proveru ažuriranja).

## Gde dalje

- Prvi put? → [Od nule do lokalnog sajta](./walkthrough) — instalacija, profil i import, korak po korak.
- Počinješ nešto novo? → [Kreiranje projekta](./create)
- Radiš na postojećem WordPress sajtu? → Prvo [napravi profil](./profiles), pa ga [importuj](./import-and-pull).

::: tip Ažuriranja
`acli` najviše jednom dnevno proverava npm za noviju verziju i nudi da je instalira. `acli update` je odmah instalira; `acli update --check` samo javlja (izlazni kod 1 kada postoji ažuriranje). Provere se preskaču u CI-ju, sa `--yes` i kada izlaz nije terminal.
:::
