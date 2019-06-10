# Create resource group
az group create --name "did-enterprise-agent" --location "East US"

# Create a new key vault
az keyvault create --name "did-enterprise-vault" --resource-group "did-enterprise-agent" --location "East US"

# Put a secret into key vault
az keyvault secret set --vault-name "did-enterprise-vault" --name "demo-secret" --value "hi-this-is-a-super-secret-secret"

# Create app service plan
az appservice plan create --name "did-enterprise-agent-plan" --resource-group "did-enterprise-agent"

# Create web app & setup deployment from local git
az webapp create --resource-group "did-enterprise-agent" --plan "did-enterprise-agent-plan" --name "did-enterprise-agent" --runtime "NODE|6.9" --deployment-local-git

# Setup git deployment
git remote add azure https://identitydocsninja@did-enterprise-agent.scm.azurewebsites.net/did-enterprise-agent.git

# Create an MSI for the web app
az webapp identity assign --name "did-enterprise-agent" --resource-group "did-enterprise-agent"

# Create a policy that allows the MSI creds to be used to read secrets from the keyvault
az keyvault set-policy --name "did-enterprise-vault" --object-id "c86fea70-c1ad-4eae-85d2-763c34f069f7" --secret-permissions "get"

# Deploy web app (requires entering deployment password)
git push azure master