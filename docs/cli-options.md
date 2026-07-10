# CLI Options

Interactive mode is still the default:

```bash
acli create
```

Pass partial options to skip prompts for values you already know. The CLI asks only for missing choices:

```bash
acli create --name my-app
acli create --name my-app --preset react --environment docker
acli create --name salon --preset wordpress --environment lando
```

Use `--yes` or `--non-interactive` when automation should fail instead of asking questions:

```bash
acli create --existing --name client-site --environment lando --yes
acli create --type application --framework nextjs --laravel --name booking-app --environment docker --yes
```

Presets and CLI options can be combined. CLI options override preset values:

```bash
acli create --preset react --name my-app --environment lando
```

## Examples

```bash
acli create --name my-app --preset react --environment docker
acli create --name salon --preset wordpress --environment lando
acli create --existing --name client-site --environment lando
acli create --type application --framework nextjs --laravel --name booking-app --environment docker
```

## Reference

- `--name <name>`
- `--environment <docker|lando>` or `--env <docker|lando>`
- `--preset <preset>`
- `--existing`
- `--type <application|wordpress>`
- `--framework <react|nextjs|next>`
- `--laravel`
- `--wp-type <theme|woo|react|wp-theme|wp-woo|wp-react>`
- `--mysql <version>`
- `--wp-version <version>`
- `--theme-repo <url>`
- `--theme-branch <branch>`
- `--staging-url <url>`
- `--ssh-key <path>`
- `--skip-git`
- `--skip-knowledge-base`
- `--yes` or `--non-interactive`
