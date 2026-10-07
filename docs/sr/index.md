---
layout: home

hero:
  name: A-CLI
  text: Developer Toolkit
  tagline: Pokreni novi projekat jednom komandom i povuci bilo koji WordPress sajt sa staging servera u lokalni Docker ili Lando — bez ijedne izmene na serveru.
  actions:
    - theme: brand
      text: Prvi koraci
      link: /sr/guide/getting-started
    - theme: alt
      text: Vodič korak po korak
      link: /sr/guide/walkthrough
    - theme: alt
      text: GitHub
      link: https://github.com/bosnjakaleksandar/acli-toolkit

features:
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09"/><path d="M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05"/></g></svg>'
    title: Kreiranje projekata
    details: React (Vite), Next.js, Laravel sa React-om ili Next.js-om i WordPress teme — uz opciono Docker ili Lando okruženje, Git repozitorijum i spremne sledeće korake.
    link: /sr/guide/create
    linkText: Kreiraj projekat
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/></g></svg>'
    title: Jedan profil po serveru
    details: Jednom opiši kako se stiže do staging servera — SSH sa wp-cli-jem ili project CLI na Coolify serveru — i koristi to za svaki projekat na njemu.
    link: /sr/guide/profiles
    linkText: Podesi profil
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M12 15V3m9 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10l5 5l5-5"/></g></svg>'
    title: Import i pull WordPress-a
    details: Fajlovi, baza, prefiks tabela, zamena URL-ova, lokalno okruženje i Git — u jednom koraku. Kasnije <code>acli pull db</code> osvežava samo ono što ti treba.
    link: /sr/guide/import-and-pull
    linkText: Importuj sajt
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12l2 2l4-4"/></g></svg>'
    title: Samo pull, po dizajnu
    details: A-CLI nikada ništa ne push-uje, ne deploy-uje niti importuje na server. Ta garancija je sprovedena u kodu, a ne prepuštena dogovoru.
    link: /sr/guide/import-and-pull#pull-only-guarantees
    linkText: Kako je to obezbeđeno
---
