services:
  db:
    image: {{DB_IMAGE}}
    volumes:
      - db_data:/var/lib/mysql
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: password
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wordpress
      MYSQL_PASSWORD: wordpress

  wordpress:
    depends_on:
      - db
    image: wordpress:{{WP_VERSION}}
    volumes:
      - .:/var/www/html
    ports:
      - "8080:80"
    restart: always
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: wordpress
      WORDPRESS_DB_NAME: wordpress
      WORDPRESS_TABLE_PREFIX: {{TABLE_PREFIX}}

  phpmyadmin:
    image: phpmyadmin:latest
    platform: linux/amd64
    depends_on:
      - db
    ports:
      - "8081:80"
    restart: always
    environment:
      PMA_HOST: db
      PMA_USER: wordpress
      PMA_PASSWORD: wordpress

volumes:
  db_data:
