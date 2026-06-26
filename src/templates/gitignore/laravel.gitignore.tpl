# =================================================================== #
# Laravel - ignore vendor, storage, and local environment config.     #
# =================================================================== #

# -------------------------------------- #
# Core / Dependencies                    #
# -------------------------------------- #

/vendor/
node_modules/

# -------------------------------------- #
# Storage / Cache                        #
# -------------------------------------- #

/public/hot
/public/storage
/storage/*.key
/storage/framework/cache/data/*
/storage/framework/sessions/*
/storage/framework/testing/*
/storage/framework/views/*
/storage/logs/*

# -------------------------------------- #
# IDE / EDITOR                           #
# -------------------------------------- #

.vscode/
.idea/
*.sublime-project
*.sublime-workspace

# -------------------------------------- #
# OS Files                               #
# -------------------------------------- #

.DS_Store
Thumbs.db
*.swp
*.swo
*.tmp

# -------------------------------------- #
# Environment / Local                    #
# -------------------------------------- #

.env
.env.backup
.env.production
.phpunit.result.cache
docker-compose.override.yml
Homestead.json
Homestead.yaml

# -------------------------------------- #
# SQL / Logs                             #
# -------------------------------------- #

*.sql
*.log
npm-debug.log
yarn-error.log
