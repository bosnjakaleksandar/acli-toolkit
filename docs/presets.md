# Presets

Built-in presets:

- `wordpress`
- `wordpress-woo`
- `react`
- `next`
- `laravel-react`
- `laravel-next`

Custom preset:

```json
{
  "projectName": "acme-site",
  "projectType": "wordpress",
  "environment": "lando",
  "mysqlVersion": "8.0",
  "wpVersion": "latest",
  "themeRepo": "git@github.com:company/theme.git"
}
```

```bash
create-project --preset ./preset.json
```
