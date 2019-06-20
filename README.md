Prototype DID Enterprise Agent
===========================================

## Steps to deploy via Azure portal

1. Click the Deploy to Azure button below.
2. Fill out the details in the Azure portal with your own values.
3. Click Deploy, and wait for deployment to complete!

[![Deploy to Azure](http://azuredeploy.net/deploybutton.png)](https://azuredeploy.net/)

<a href="http://armviz.io/#/?load=https://github.com/dstrockis/did-enterprise-agent/tree/master/azuredeploy.json" target="_blank">
<img src="https://raw.githubusercontent.com/Azure/azure-quickstart-templates/master/1-CONTRIBUTION-GUIDE/images/visualizebutton.png"/>
</a>


<a href="https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fgithub.com%2Fdstrockis%2Fdid-enterprise-agent%2Ftree%2Fmaster%2Fazuredeploy.json" target="_blank">
    <img src="http://azuredeploy.net/deploybutton.png"/>
</a>
<a href="http://armviz.io/#/?load=https%3A%2F%2Fgithub.com%2Fdstrockis%2Fdid-enterprise-agent%2Ftree%2Fmaster%2Fazuredeploy.json" target="_blank">
    <img src="http://armviz.io/visualizebutton.png"/>
</a>


## Steps to deploy using Azure CLI

1. Clone the repo
2. Change the values in `azuredeploy.parameters.json` to your own values.
3. Login to the Azure CLI:

```bash
az login
```

4. Choose a resource group in which to create your enterprise agent. If you don't have one, the following command creates a new resource group:

```bash
az group create --location eastus --name my-new-resource-group
```

5. Run the command below to create the enterprise agent and all associated resources in the resource group:

```bash
az group deployment create --resource-group my-new-resouce-group --template-file azuredeploy.json --parameters '@azuredeploy.parameters.json'
```

## Using the enterprise agent

The enterprise agent currently only has one function. Simply hit the home page of your web service to have a hard-coded verifiable credential returned from the enterprise agent. The URL for your web service will be something like:

```
https://my-enterprise-agent.azurewebsites.net
``` 

Where `my-enterprise-agent` is the name of the web app you provided during deployment.

##  Gotchas

- Occasionally, you may get an error during deployment of authorization rules that says "Principal <guid> does not exist in directory <guid>." You can simply retry the deployment, usually the error goes away.
- Sometimes, the Azure Deploy website gets stuck near the end of a deployment. To check the status of your deployment, you can go to your resource group in the Azure Portal and click **Deployments**. 