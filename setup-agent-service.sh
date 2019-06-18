# Create resource group
az group create --name "did-enterprise-agent" --location "East US"

# Create a new key vault
az keyvault create --name "did-enterprise-vault" --resource-group "did-enterprise-agent" --location "East US"

# Allow signing using keys
az keyvault set-policy --name "did-enterprise-vault" --object-id "c86fea70-c1ad-4eae-85d2-763c34f069f7" --key-permissions create sign

# Create Azure blob storage account
az storage account create --name "agent-storage" --resource-group "did-enterprise-agent" --location "East US" --sku Standard_LRS --encryption blob

# List out storage account keys (blob storage doesn't use user creds)
az storage account keys list --account-name "enterpriseagent" --resource-group "did-enterprise-agent" --output json

# Set storage account environment variables
export AZURE_STORAGE_ACCOUNT="enterpriseagent"
export AZURE_STORAGE_KEY="kEmrbBp71Kl3dL7LTHAD88HOBLfP6YQBduPQkVj6BggPhA494E/65L9zmtWUs7Jk0ug6zHOXrDXBtn0ZIktfPA=="

# Create a blob storage container
az storage container create --name "did-enterprise-agent-config"

# Create app service plan
az appservice plan create --name "did-enterprise-agent-plan" --resource-group "did-enterprise-agent"

# Create web app & setup deployment from local git
az webapp create --resource-group "did-enterprise-agent" --plan "did-enterprise-agent-plan" --name "did-enterprise-agent" --runtime "NODE|6.9" --deployment-local-git

# Setup git deployment
git remote add azure https://identitydocsninja@did-enterprise-agent.scm.azurewebsites.net/did-enterprise-agent.git

# Create an MSI for the web app
az webapp identity assign --name "did-enterprise-agent" --resource-group "did-enterprise-agent"

# Create a policy that allows the MSI creds to be used to read secrets from the keyvault
az keyvault set-policy --name "did-enterprise-vault" --object-id "c86fea70-c1ad-4eae-85d2-763c34f069f7" --secret-permissions get

# Create a role assignment that allows the MSI creds to be used to read blobs from the container
az role assignment create \
  --role "Storage Blob Data Contributor" \
  --assignee "c86fea70-c1ad-4eae-85d2-763c34f069f7" \
  --scope "/subscriptions/3bffb807-683e-4510-96ff-c016d9d64d17/resourceGroups/did-enterprise-agent/providers/Microsoft.S
torage/storageAccounts/enterpriseagent/blobServices/default/containers/did-enterprise-agent-config"

# Deploy web app (requires entering deployment password)
git push azure master