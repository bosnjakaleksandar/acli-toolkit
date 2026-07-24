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
        DB_USER: wordpress
        DB_PASSWORD: wordpress
        DB_NAME: wordpress
        DB_HOST: database
        TABLE_PREFIX: {{TABLE_PREFIX}}
    ports:
      - 5173:5173
    build_as_root:
      # Installs Node from the official nodejs.org release tarball, checksum-verified
      # against the matching SHASUMS256.txt before extraction — rather than piping a
      # third-party installer script (NodeSource's setup_20.x) into a root shell, which
      # runs a script we never verify and which NodeSource can change at any time.
      - >-
        NODE_VERSION=20.18.1 &&
        case "$(dpkg --print-architecture)" in amd64) NODE_ARCH=x64 ;; arm64) NODE_ARCH=arm64 ;; *) echo "Unsupported architecture" >&2; exit 1 ;; esac &&
        curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" &&
        curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" &&
        grep " node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz\$" SHASUMS256.txt | sha256sum -c - &&
        tar -xJf "node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -C /usr/local --strip-components=1 &&
        rm -f "node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" SHASUMS256.txt
    run:
      - if [ ! -d "wp-content" ] || [ ! -d "wp-includes" ] || [ ! -d "wp-admin" ]; then wp core download; fi
      - if [ ! -f "wp-config.php" ]; then wp config create --dbname="wordpress" --dbuser="wordpress" --dbpass="wordpress" --dbhost="database" --dbprefix="{{TABLE_PREFIX}}"; fi
  database:
    creds:
      user: wordpress
      password: wordpress
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
