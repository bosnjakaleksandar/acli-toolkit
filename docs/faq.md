# FAQ

## Do presets skip every question?

No. Presets skip only questions that have values. Missing values still use the normal prompts.

## Can I use HTTPS theme repositories?

Yes. HTTPS and SSH repository URLs are supported.

## Why is WordPress plugin installation a script?

New WordPress environments are not started during scaffolding. The script can be run after Docker or Lando starts.
