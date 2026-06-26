name: {{PROJECT_NAME}}
recipe: wordpress
config:
  webroot: .
  php: 8.3
  database: {{DB_IMAGE}}
services:
  appserver:
    ssl: true
    scanner: false
    overrides:
      environment:
        DB_USER: user
        DB_PASSWORD: user
        DB_NAME: wordpress
        DB_HOST: database
        TABLE_PREFIX: {{TABLE_PREFIX}}
    ports:
      - 5173:5173
    build_as_root:
      - curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
      - apt-get install -y nodejs
    run:
      - if [ ! -d "wp-content" ] || [ ! -d "wp-includes" ] || [ ! -d "wp-admin" ]; then wp core download; fi
      - if [ ! -f "wp-config.php" ]; then wp config create --dbname="wordpress" --dbuser="user" --dbpass="user" --dbhost="database" --dbprefix="{{TABLE_PREFIX}}"; fi
  database:
    creds:
      user: user
      password: user
      database: wordpress
  pma:
    type: phpmyadmin
  mail:
    type: mailhog
    portforward: true
    hogfrom:
      - appserver
tooling:
  node:
    service: appserver
  npm:
    service: appserver
  npx:
    service: appserver
proxy:
  appserver:
    - {{PROJECT_NAME}}.lndo.site
    - vite.{{PROJECT_NAME}}.lndo.site:5173
  pma:
    - pma.{{PROJECT_NAME}}.lndo.site
  mail:
    - mail.{{PROJECT_NAME}}.lndo.site
