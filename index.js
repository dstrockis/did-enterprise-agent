/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for
 * license information.
 */
'use strict';
var http = require('http');
const KeyVault = require('@azure/keyvault');
const MsRestAzure = require('@azure/ms-rest-nodeauth');
const Azure = require("@azure/storage-blob");
const base64url = require('base64url');
const CryptoJS = require('crypto-js');
const register_script = require('./register.js');

var didConfig;

// Function to read config from blob storage when the server first starts up
async function setup_agent() {

  // first, perform DID registration and ensure necessary keys are provisioned
  await register_script.Register();

  // get a token from MSI to call Azure Blob Storage
  // const token = await MsRestAzure.AzureCliCredentials.create({resource: 'https://storage.azure.com/'});
  // const tokenResp = token.tokenInfo;
  const msiCred = await MsRestAzure.loginWithAppServiceMSI({resource: 'https://storage.azure.com/'});
  const tokenResp = await msiCred.getToken();

  // get pointers to Azure blob storage from environment variables
  const azBlobAccount = process.env.AZURE_STORAGE_ACCOUNT;
  const azBlobContainer = process.env.AZURE_STORAGE_CONTAINER;

  // load Azure blob storage URLs
  const azBlobTokenCredential = new Azure.TokenCredential(tokenResp.accessToken);
  const pipeline = new Azure.StorageURL.newPipeline(azBlobTokenCredential);
  const azAccountUrl = new Azure.ServiceURL(`https://${azBlobAccount}.blob.core.windows.net`, pipeline);
  const azContainerUrl = Azure.ContainerURL.fromServiceURL(azAccountUrl, azBlobContainer);
  const azBlobUrl = Azure.BlobURL.fromContainerURL(azContainerUrl, 'did-config.json');

  // try to read a DID config file from Azure blob storage
  try {
    
    const blobResponse = await azBlobUrl.download(Azure.Aborter.none, 0);
    const didConfigData = await streamToString(blobResponse.readableStreamBody);
    didConfig = JSON.parse(didConfigData);

  } catch(err) {

    console.log('Error downloading DID config file from Azure Blob Storage: ' + err);
    
  };
};

async function main() {

  // perform pre-run operations
  await setup_agent();

  var server = http.createServer(async function(request, response) {

    try {

      console.log('Got a request');

      // get a token from MSI to call KeyVault
      // const token = await MsRestAzure.AzureCliCredentials.create({resource: 'https://vault.azure.net'});
      const token = await MsRestAzure.loginWithAppServiceMSI({resource: 'https://vault.azure.net'});

      // get pointer to KeyVault from environment variables
      const kvVaultName = process.env.AZURE_KEY_VAULT;

      // setup KeyVault client
      const kvClient = new KeyVault.KeyVaultClient(token);
      const kvBaseUrl = `https://${kvVaultName}.vault.azure.net/`;
      const kvKeyName = didConfig.kvKeyName;
      const kvKeyVersion = didConfig.kvKeyVersion;

      // construct the claim to be issued
      const jwtHeader = {
        "alg": "ES256K",
        "typ": "JWT",
        "kid": `${didConfig.did}#${didConfig.kvKeyVersion}`
      } 
      const jwtBody = {
        "sub": "did:alice",
        "iss": didConfig.did,
        "iat": Date.now(),
        "vc": {
          "@context": ["https://schema.org/"],
          "@type": ["Diploma"],
          "credentialSubject": {
            "student_name": "Alice Smith",
            "graduation_year": "2013",
            "university_name": "University of California, Los Angeles"
          }
        }
      }

      // form the signature input to pass to KeyVault to be signed
      const encodedBody = base64url(Buffer.from(JSON.stringify(jwtBody)));
      const encodedHeader = base64url(Buffer.from(JSON.stringify(jwtHeader)));
      const signatureInput = encodedHeader + "." + encodedBody;
      const hash = CryptoJS.SHA256(signatureInput);
      const buffer = Buffer.from(hash.toString(CryptoJS.enc.Hex), 'hex');
      const array = new Uint8Array(buffer);

      // sign the claim with the private key in KeyVault
      const signResponse = await kvClient.sign(kvBaseUrl, kvKeyName, kvKeyVersion, 'ES256K', array);
      var signature = signResponse.result;
      var derSig = toDer([signature.slice(0, signature.byteLength / 2), signature.slice(signature.byteLength / 2, signature.byteLength)]);
      const encodedSignature = base64url(derSig);

      // finally, form the claim as a JWT
      const claimDetails = `${encodedHeader}.${encodedBody}.${encodedSignature}`;

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

  var port = process.env.PORT || 1337;
  server.listen(port);
  console.log("Server running at http://localhost:%d", port);
}

// Helper function for reading files from blob storage
async function streamToString(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on("data", data => {
      chunks.push(data.toString());
    });
    readableStream.on("end", () => {
      resolve(chunks.join(""));
    });
    readableStream.on("error", reject);
  });
}

// Helper function for converting from KeyVault signature 
// format into signature format expected by registration service
function toDer(elements) {
  
  var index = 0;

  // calculate total size. 
  let lengthOfRemaining = 0;
  for (let element = 0 ; element < elements.length; element++) {

    // Add element format bytes
    lengthOfRemaining += 2;
    const buffer = new Uint8Array(elements[element]);
    const size = (buffer[0] & 0x80) === 0x80 ? buffer.length + 1 : buffer.length;
    lengthOfRemaining += size;
  }

  // Prepare output
  index = 0;
  const result = new Uint8Array(lengthOfRemaining + 2);
  result.set([0x30, lengthOfRemaining], index);
  index += 2;
  for (let element = 0 ; element < elements.length; element++) {
  
    // Add element format bytes
    const buffer = new Uint8Array(elements[element]);
    const size = (buffer[0] & 0x80) === 0x80 ? buffer.length + 1 : buffer.length;
    result.set([0x02, size], index);
    index += 2;
    
    if (size > buffer.length) {
      result.set([0x0], index++);
    }
    
    result.set(buffer, index);
    index += buffer.length;
  }
  return result;
}

main();
