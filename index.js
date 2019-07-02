/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for
 * license information.
 */
'use strict';
var http = require('http');
var url = require('url');
const KeyVault = require('@azure/keyvault');
const MsRestAzure = require('@azure/ms-rest-nodeauth');
const Azure = require("@azure/storage-blob");
const base64url = require('base64url');
const CryptoJS = require('crypto-js');
const Agent = require('./agent.js');


async function main() {

  try {

    // when the server first starts, register a DID for the enterprise
    await Agent.EnsureDidRegistered();

  } catch (err) {
      
    console.log('Error while setting up enterprise agent: ' + err);
    return;
    
  }

  // listen for incoming requests for verifiable claims
  var server = http.createServer(async function(request, response) {

    console.log(`Request received at ${Date.now()}`);

    var query = url.parse(request.url, true).query;

    try {

       // create the contents of the claim (hard-coded for now)
       const credential = {
        "@context": "https://identiverse-university.azurewebsites.net/credential/v1",
        "@type": "VerifiedStudent",
        "givenName": "Alice",
        "familyName": "Smith",
        "identifier": "alice",
        "affiliation": "Contoso University",
        "email": "alice@contoso.edu",
        "did": query.did,
        "sub": query.did,
      };

      // Form the claim as a verifiable credential in JWT format
      const claimDetails = await Agent.GenerateVerifiableCredential(credential);

      // return the claim to the browser
      response.writeHead(200, {"Content-Type": "text/plain"});
      response.end(JSON.stringify(claimDetails));

    } catch (err) {

      console.log(err);

      // return the claim to the browser
      response.writeHead(200, {"Content-Type": "text/plain"});
      response.end(JSON.stringify(err.toString()));

    }

  });

  // Start the server
  var port = process.env.PORT || 1337;
  server.listen(port);
  console.log("Server running at http://localhost:%d", port);
}

main();
