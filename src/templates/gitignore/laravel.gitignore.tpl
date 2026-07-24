# =================================================================== #
# Laravel - ignore vendor, storage, and local environment config.     #
# =================================================================== #

# -------------------------------------- #
# Core / Dependencies                    #
# -------------------------------------- #

# The Laravel app lives in backend/ (this project also has a separate
# frontend/), so paths meant to anchor at the app root must be prefixed
# accordingly — a bare /vendor/ here would only ever match a vendor/
# directory at the *project* root, which never exists.
/backend/vendor/
node_modules/
auth.json

# -------------------------------------- #
# Storage / Cache                        #
# -------------------------------------- #

/backend/public/hot
/backend/public/storage
/backend/storage/*.key
/backend/storage/framework/cache/data/*
/backend/storage/framework/sessions/*
/backend/storage/framework/testing/*
/backend/storage/framework/views/*
/backend/storage/logs/*

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
.env.*
!.env.example
.phpunit.result.cache
docker-compose.override.yml
Homestead.json
Homestead.yaml

# -------------------------------------- #
# A-CLI                                  #
# -------------------------------------- #

.acli/

# -------------------------------------- #
# SQL / Logs                             #
# -------------------------------------- #

*.sql
*.log
npm-debug.log
yarn-error.log
