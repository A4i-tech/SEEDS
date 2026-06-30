#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Variables (Modify these according to your setup)
RESOURCE_GROUP="seeds"
WEB_APP_NAME="confv2wsservice" # Ensures a unique name
ZIP_FILE="app.zip"

# Ensure Azure CLI is logged in
echo "Checking Azure CLI login status..."
az account show > /dev/null 2>&1 || az login

# Package the application into a zip file
echo "Packaging application..."
rm -f $ZIP_FILE
zip -r $ZIP_FILE * -x "*.git*" "*.vscode*" "node_modules/*" ".env"

# Deploy the zip file to the Web App
echo "Deploying application..."
az webapp deploy --resource-group $RESOURCE_GROUP --name $WEB_APP_NAME --src-path "$ZIP_FILE"

# Clean up the zip file after successful deployment
echo "Cleaning up the zip file..."
rm "$ZIP_FILE"

echo "Deployment completed successfully!"
echo "Web App URL: https://$WEB_APP_NAME.azurewebsites.net"
