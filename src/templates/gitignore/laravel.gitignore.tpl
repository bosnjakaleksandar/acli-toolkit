# -------------------------------------- #
# Laravel backend (backend/)             #
# -------------------------------------- #

# The Laravel app lives in backend/ (the frontend is in frontend/), so rules
# that must anchor at the app root are prefixed — a bare /vendor/ would only
# match a vendor/ directory at the project root, which never exists.
/backend/vendor/
/backend/public/hot
/backend/public/storage
/backend/public/build
/backend/storage/*.key
/backend/storage/pail
/backend/storage/framework/cache/data/*
/backend/storage/framework/sessions/*
/backend/storage/framework/testing/*
/backend/storage/framework/views/*
/backend/storage/logs/*
auth.json

# -------------------------------------- #
# Tests / local tooling                  #
# -------------------------------------- #

.phpunit.result.cache
.phpunit.cache
docker-compose.override.yml
Homestead.json
Homestead.yaml

# -------------------------------------- #
# Database dumps                         #
# -------------------------------------- #

*.sql
*.sql.gz
