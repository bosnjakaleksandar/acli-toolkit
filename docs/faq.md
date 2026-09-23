# FAQ

## Do options skip every question?

No. Options (and `defaults` in your configuration) skip only the questions they answer. Missing values still use the normal prompts, or fail with `--yes`.

## Can I use HTTPS theme repositories?

Yes. HTTPS and SSH repository URLs are supported.

## Why is WordPress plugin installation a script?

New WordPress environments are not started during scaffolding. The script can be run after Docker or Lando starts.
