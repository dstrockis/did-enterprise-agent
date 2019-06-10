/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for
 * license information.
 */
'use strict';
var http = require('http');
const KeyVault = require('@azure/keyvault');
const MsRestAzure = require('@azure/ms-rest-nodeauth');

const options = MsRestAzure.MSIAppServiceOptions = {
  msiEndpoint: "http://127.0.0.1:41741/MSI/token/"
}

var server = http.createServer(function(request, response) {

  // get a token from MSI to call KeyVault
  // MsRestAzure.AzureCliCredentials.create().then((token) => {
  MsRestAzure.loginWithAppServiceMSI(options).then((token) => {

    // log output from MSI
    console.log(token);

    // get a secret from KeyVault
    const kvClient = new KeyVault.KeyVaultClient(token);
    const kvBaseUrl = "https://did-enterprise-vault.vault.azure.net/";
    const kvKeyName = "demo-secret";
    const kvKeyVersion = "ac8f444803da4b969e65e9cde7b804c8";
    kvClient.getKey(kvBaseUrl, kvKeyName, kvKeyVersion).then((kvKeyBundle) => {

      // write secret out to browser
      response.writeHead(200, {"Content-Type": "text/plain"});
      response.end(JSON.stringify(kvKeyBundle))

    }).catch((err) => { 
      console.log(err);
      response.writeHead(200, {"Content-Type": "text/plain"});
      response.end(JSON.stringify((err)));
    });
  
  // handle any errors during authentication to KeyVault
  }).catch((err) => {
    console.log(err);
    response.writeHead(200, {"Content-Type": "text/plain"});
    response.end(JSON.stringify((err)));
  });
});

var port = process.env.PORT || 1337;
server.listen(port);
console.log("Server running at http://localhost:%d", port);