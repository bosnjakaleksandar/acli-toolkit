# =================================================================== #
# Wordpress - ignore core, configuration, examples, uploads and logs. #
# =================================================================== #

# -------------------------------------- #
# Core                                   #
# -------------------------------------- #

/wp-admin/
/wp-content/index.php
/wp-content/languages
/wp-includes/
/index.php
/license.txt
/readme.html
/wp-*.php
/xmlrpc.php
vendor
node_modules

# -------------------------------------- #
# IDE / EDITOR                           #
# -------------------------------------- #

.vscode/
.idea/
*.sublime-project
*.sublime-workspace
start.sh

# -------------------------------------- #
# OS Files                               #
# -------------------------------------- #

.DS_Store
Thumbs.db
*.swp
*.swo
*.tmp

# -------------------------------------- #
# SQL                                    #
# -------------------------------------- #

*.sql

# -------------------------------------- #
# Themes                                 #
# -------------------------------------- #

/wp-content/themes/twenty*/
/wp-content/themes/index.php

# -------------------------------------- #
# Plugins                                #
# -------------------------------------- #

/wp-content/plugins/
/wp-content/plugins/hello.php

# -------------------------------------- #
# Uploads                                #
# -------------------------------------- #

/wp-content/uploads/

# -------------------------------------- #
# Log files                              #
# -------------------------------------- #

*.log

# -------------------------------------- #
# Others                                 #
# -------------------------------------- #

upgrade
upgrade-temp-backup
/.htaccess
/wp-cli
wp.bat
dist
