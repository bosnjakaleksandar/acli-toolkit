---
flow:
  - icon: wrench
    title: Proveri računar
    text: Node.js, Git i Docker ili Lando.
    link: "#check"
  - icon: package
    title: Instaliraj A-CLI
    command: npm i -g acli-toolkit
    link: "#install"
  - icon: key-round
    title: Napravi profil
    text: Jednom po serveru.
    command: acli profile create
    link: "#profile"
  - icon: download
    title: Importuj sajt
    text: Fajlovi, baza, Git.
    command: acli import
    link: "#import"
  - icon: globe
    title: Otvori ga lokalno
    command: localhost:8080
    link: "#open"
  - icon: refresh-cw
    title: Održavaj ga ažurnim
    command: acli pull db
    link: "#pull"
---

# Od nule do lokalnog sajta

<AcliMascot state="idle" boot message="Idemo od praznog računara do WordPress sajta sa staging-a koji radi na tvom laptopu. Pokazaću ti kako izgleda svaki korak." />

Ova stranica prati jedan stvaran put od početka do kraja: instaliraš A-CLI, jednom opišeš staging server, importuješ postojeći sajt i održavaš ga ažurnim. Svaki terminal ispod reprodukuje ono što A-CLI ispisuje — klikni **Ponovo** da ga pogledaš još jednom. CLI je na engleskom, pa je i tekst u terminalima na engleskom; objašnjenja su ispod.

<AcliFlow :steps="$frontmatter.flow" />

::: tip Praviš potpuno nov projekat?
Za to ti ne trebaju ni server ni profil — pokreni `acli create` i prati [Kreiranje projekta](./create).
:::

## 1. Proveri računar {#check}

A-CLI pre svake komande sam proverava šta mu treba i kaže šta nedostaje, ali brže je da znaš unapred. Za import WordPress sajta potrebno ti je:

| Alat | Proveri sa | Zašto |
| --- | --- | --- |
| **Node.js 22.18+** i npm | `node --version` | A-CLI radi na Node-u. |
| **Git** | `git --version` | Importovani sajt dobija Git repozitorijum. |
| **Docker** sa Compose v2 — *ili* **Lando** | `docker compose version` / `lando version` | Sajt se na tvom računaru vrti u kontejnerima. |
| **ssh** | `ssh -V` | A-CLI do servera stiže preko SSH-a. |
| **rsync** (SSH serveri) ili **scp** + **tar** (Coolify serveri) | `rsync --version` | Tako se fajlovi kopiraju na tvoj računar. |

PHP, MySQL i WP-CLI ti **ne trebaju** lokalno — rade unutar kontejnera.

## 2. Instaliraj A-CLI {#install}

<AcliReplay session="install" title="~ install" />

Zatim pokreni `acli` bez argumenata. Bot se podigne i prikaže glavni meni — svaka stavka je i komanda koju možeš direktno da pokreneš:

<AcliTerminal title="~ acli">
<AcliBanner compact />
<AcliMascot state="idle" message="Ready to build something awesome?" />
<pre>◆  What would you like to do?
│  ○ Create a project
│  ○ Import an existing WordPress site
│  ● Profiles
│  ○ Link an existing project to a staging profile
│  ○ Pull files/database from a linked profile
│  ○ Show command help</pre>
</AcliTerminal>

| Stavka menija | Značenje |
| --- | --- |
| Create a project | Novi projekat (`acli create`) |
| Import an existing WordPress site | Import postojećeg sajta (`acli import`) |
| Profiles | Profili servera (`acli profile …`) |
| Link an existing project to a staging profile | Poveži postojeći folder sa profilom (`acli link`) |
| Pull files/database from a linked profile | Povuci fajlove/bazu (`acli pull`) |
| Show command help | Pomoć za komande |

## 3. Proveri da možeš da pristupiš serveru {#ssh}

Profil koristi tvoje uobičajeno SSH podešavanje, pa prvo proveri da možeš ručno da se uloguješ sa korisnikom i ključem koje si dobio:

```bash
ssh -i ~/.ssh/cloud developer@cloud.example.com
```

- <AcliIcon name="circle-check" class="acli-status is-ok" /> **Dobiješ shell** → nastavi. Na Coolify serveru `project list` treba da prikaže tvoje projekte.
- <AcliIcon name="circle-x" class="acli-status is-bad" /> **Traži lozinku** ili javlja `Permission denied (publickey)` → zamoli administratora servera da doda tvoj javni ključ (ili da ti dodeli projekat) pre nego što nastaviš.
- <AcliIcon name="triangle-alert" class="acli-status is-warn" /> **„The authenticity of host … can't be established"** → jednom odgovori `yes`. Time se server upisuje u `~/.ssh/known_hosts`, što je potrebno za preporučenu *Strict* politiku host ključeva.

## 4. Napravi profil {#profile}

Profil opisuje **server**, a ne jedan sajt — napraviš ga jednom i koristiš za svaki projekat na tom serveru. Pokreni `acli profile create` (ili u meniju izaberi **Profiles → Create a profile**) i odgovori na pitanja:

<AcliReplay session="profile" title="~ acli profile create" />

Šta znači svaki odgovor:

| Pitanje | Šta da uneseš |
| --- | --- |
| Profile name | Tvoje ime za server, npr. `coolify` ili `agency-staging`. |
| How does A-CLI reach this server? | **Coolify project CLI** kada ti server daje komandu `project`; **SSH with wp-cli** kada možeš SSH-om da uđeš u folder sajta. [Poređenje →](./profiles#two-kinds-of-servers) |
| SSH host / port / username / key | Tačno ono što je radilo u [koraku 3](#ssh). |
| SSH host-key policy | *Strict* ako si se već jednom ulogovao; *Accept new hosts* da mu veruješ pri prvom kontaktu. |
| Staging URL | Opciono. `{projectName}` se zamenjuje lokalnim imenom sajta. |
| Link the site's Git repository? | **Yes** — odmah vidiš po čemu se staging razlikuje od repozitorijuma. |
| Local Git SSH Host alias | Samo ako tvoj `~/.ssh/config` koristi alias poput `github-work` za Git nalog. |

SSH profili pitaju još i gde se sajtovi nalaze (`/srv/projects/{projectName}`) i koje `wp-content` foldere da kopiraju — pogledaj [Profile](./profiles#create-a-profile-step-by-step).

Ako ti je ovo jedini profil, koristi se automatski. Ako ih imaš više, izaberi podrazumevani:

```bash
acli profile use coolify
```

::: tip Podešavaš ceo tim?
Svako pitanje ima i opciju, pa možeš da podeliš jednu komandu koja pravi isti profil na svakom računaru — svako samo zameni svog korisnika i ključ. [Pogledaj kako →](./profiles#without-questions)
:::

## 5. Importuj sajt {#import}

Uđi u folder u kom držiš projekte i pokreni `acli import`. Sa Coolify profilom A-CLI izlista projekte koje ti server daje:

<AcliReplay session="import" title="~/Sites — acli import" />

Evo šta se upravo prenelo, i u kom smeru:

<AcliPullDiagram />

Iza tog spinnera A-CLI je proverio tvoje alate i server, preuzeo `wp-content`, izvezao i preuzeo bazu, prepoznao prefiks tabela, napisao `docker-compose.yaml`, povezao Git, pokrenuo kontejnere, importovao bazu i zamenio staging URL-ove tvojim lokalnim. Ceo spisak je u [Šta se dešava](./import-and-pull#what-happens).

Novi folder:

```text
client-site/
├── .acli/config.yaml     ← veza sa profilom — `acli pull` je čita
├── docker-compose.yaml   ← ili .lando.yml
├── wp-content/           ← uploads, plugins, themes, languages
├── .git/                 ← origin = repozitorijum sajta, samo pull
└── .gitignore
```

::: warning Ako import stane na pola
Ništa što je već preuzeto se ne briše. A-CLI ispiše tačnu komandu za nastavak — npr. `acli import "Client Site" --resume --name client-site` — i preskače korake koji su već završeni.
:::

## 6. Otvori sajt {#open}

Kontejneri su već pokrenuti. Otvori lokalni URL:

<div class="acli-browser">
<div class="acli-browser__bar"><span class="acli-terminal__dot"></span><span class="acli-terminal__dot"></span><span class="acli-terminal__dot"></span><span class="acli-browser__url">http://localhost:8080</span></div>
<div class="acli-browser__body">
<p class="acli-browser__icon"><AcliIcon name="party-popper" size="40" /></p>
<p><strong>Tvoj staging sajt, lokalno.</strong></p>
<p>Admin: <code>http://localhost:8080/wp-admin</code></p>
</div>
</div>

| Okruženje | Lokalni URL |
| --- | --- |
| Docker | `http://localhost:8080` |
| Lando | `https://client-site.lndo.site` |

U `/wp-admin` se uloguj **svojim staging nalogom** — baza je kopija, pa su i korisnici isti. Sajt pokrećeš i zaustavljaš sa `docker compose up -d` / `docker compose down` (ili `lando start` / `lando stop`) unutar projekta.

Ako tema ima `package.json`, A-CLI nudi da instalira njene zavisnosti i ispiše komandu `npm run dev` pod **Next**.

## 7. Održavaj ga ažurnim {#pull}

Staging ide dalje; povuci samo ono što ti treba, iz bilo kog foldera unutar projekta:

<AcliReplay session="pull" title="~/Sites/client-site — acli pull db" />

```bash
acli pull db                 # samo baza (prvo pita — zamenjuje tvoju)
acli pull uploads plugins    # samo neki folderi
acli pull full --yes         # sve, bez pitanja
```

Tvoje izmene koda idu kroz Git kao i obično — `git status` pokazuje šta se razlikuje od repozitorijuma. A-CLI nikada ne pravi commit niti push.

## Već si klonirao repozitorijum? {#link}

Ako repozitorijum sajta već imaš na disku, `acli import` ti ne treba — poveži folder sa profilom i povuci ostatak:

```bash
cd client-site
acli link --profile coolify --environment docker --remote-project "Client Site"
acli pull full
```

`acli link` nudi da generiše Docker/Lando fajl ako ga nema. Posle toga `acli pull` radi isto kao gore.

## Kontrolna lista

<ol class="step-list">
<li><code>node --version</code> prikazuje 22.18 ili noviji, a Docker ili Lando je pokrenut.</li>
<li><code>npm install --global acli-toolkit</code></li>
<li><code>ssh</code> do servera radi ručno.</li>
<li><code>acli profile create</code> — jednom po serveru.</li>
<li><code>acli import</code> — jednom po sajtu.</li>
<li>Otvori <code>http://localhost:8080</code>.</li>
<li><code>acli pull db</code> kad god ti trebaju sveži podaci.</li>
</ol>

<AcliMascot state="success" message="To je ceo krug. Zapeo si negde? Dodaj --verbose i pokazaću ti svaku komandu koju pokrećem — ili pogledaj česta pitanja." />

Dalje: [Profili detaljno](./profiles) · [Import i pull detaljno](./import-and-pull) · [Česta pitanja i problemi](../faq)
