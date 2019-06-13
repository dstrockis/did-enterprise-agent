/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for
 * license information.
 */
'use strict';
var http = require('http');
const KeyVault = require('@azure/keyvault');
const MsRestAzure = require('@azure/ms-rest-nodeauth');
const request = require('request');
const CryptoJS = require('crypto-js');
const base64url = require('base64url');

const Azure = require("@azure/storage-blob");
// const azBlobAccount = process.env.AZURE_STORAGE_ACCOUNT;
// const azBlobAccountKey = process.env.AZURE_STORAGE_KEY;


async function main() {

  // const token = await MsRestAzure.AzureCliCredentials.create({resource: 'https://storage.azure.com/'});
  const token = await MsRestAzure.loginWithAppServiceMSI({resource: 'https://storage.azure.com/'});

  // load Azure blob storage URLs
  const azBlobTokenCredential = new Azure.TokenCredential(token.tokenInfo.accessToken);
  const pipeline = new Azure.StorageURL.newPipeline(azBlobTokenCredential);
  const azAccountUrl = new Azure.ServiceURL('https://enterpriseagent.blob.core.windows.net', pipeline);
  const azContainerUrl = Azure.ContainerURL.fromServiceURL(azAccountUrl, 'did-enterprise-agent-config');
  const azBlobUrl = Azure.BlobURL.fromContainerURL(azContainerUrl, 'did-config.json');

  var didConfig;

  // try to read a DID config file from Azure blob storage
  try {
    
    const blobResponse = await azBlobUrl.download(Azure.Aborter.none, 0);
    const didConfigData = await streamToString(blobResponse.readableStreamBody);
    didConfig = JSON.parse(didConfigData);

  } catch(err) {

    if (err.statusCode != 404) {
      console.log('Error downloading DID config file from Azure Blob Storage: ' + err);
    }

  };

  // if file does not exist, we need to register a DID and create the config file
  if (!didConfig) {

    var kvClient;
    var kvKeyVersion;
    var kvPubJwk;
    const kvBaseUrl = "https://did-enterprise-vault.vault.azure.net/";
    const kvKeyName = "did-primary-signing-key";

    try {
      
    // get a token from the Azure CLI to call KeyVault
      // const token = await MsRestAzure.AzureCliCredentials.create({resource: 'https://vault.azure.net'});
      const token = await MsRestAzure.loginWithAppServiceMSI({resource: 'https://vault.azure.net'});

      // provision a secp256k1 key in keyvault, remember the public key that is returned
      kvClient = new KeyVault.KeyVaultClient(token);
      const keyResponse = await kvClient.createKey(kvBaseUrl, kvKeyName, 'EC', {curve: 'P-256K'});
      kvKeyVersion = keyResponse.key.kid.split('/').pop();
      kvPubJwk = keyResponse.key;

    } catch (err) {

      console.log('Error while creating a new key in keyvault:');
      console.log(err);

    }


    try {

      // make some edits to the JWK format to meet expected format from registration service
      kvPubJwk.kid = `#${kvKeyVersion}`;
      kvPubJwk.use = 'verify';
      kvPubJwk.defaultEncryptionAlgorithm = 'none';
      kvPubJwk.defaultSigningAlgorithm = 'ES256K';
      kvPubJwk.x = base64url(kvPubJwk.x);
      kvPubJwk.y = base64url(kvPubJwk.y);

      // format a DID document for the new DID to be registered
      const didDocument = {
        "@context": "https://w3id.org/did/v1",
        "publicKey": [
          {
            "id": kvPubJwk.kid,
            "type": "Secp256k1VerificationKey2018",
            "publicKeyJwk": kvPubJwk
          }
        ]
      }

      // form the signature input to pass to KeyVault to be signed
      const encodedBody = base64url(Buffer.from(JSON.stringify(didDocument)));
      const signatureInput = "" + "." + encodedBody;
      const hash = CryptoJS.SHA256(signatureInput);
      const buffer = Buffer.from(hash.toString(CryptoJS.enc.Hex), 'hex');
      const array = new Uint8Array(buffer);

      // sign the registration request with the private key in KeyVault
      const signResponse = await kvClient.sign(kvBaseUrl, kvKeyName, kvKeyVersion, 'ES256K', array);
      var signature = signResponse.result;
      var derSig = toDer([signature.slice(0, signature.byteLength / 2), signature.slice(signature.byteLength / 2, signature.byteLength)]);
      const encodedSignature = base64url(derSig);

      // format a registration request
      const requestBody = {
        "header": {
          "alg": "ES256K",
          "kid": kvPubJwk.kid,
          "operation": "create",
          "proofOfWork": "{}"
        },
        "payload": encodedBody,
        "signature": encodedSignature
      }

      // register the DID
      const registrationResult = await sendPost("https://beta.ion.microsoft.com/api/1.0/register", requestBody);

      // create the enterprise agent config file
      didConfig = {
        "did": registrationResult.id,
        "kvKeyName": kvKeyName,
        "kvKeyVersion": kvKeyVersion
      };


    } catch (err) {

      console.log('Error while registering a DID:');
      console.log(err);

    }


    try {

      console.log('Writing DID config fie to Azure Blob Storage...');
      const config = JSON.stringify(didConfig);
      const azBlockBlobUrl = Azure.BlockBlobURL.fromBlobURL(azBlobUrl);
      const uploadBlobResponse = await azBlockBlobUrl.upload(Azure.Aborter.none, config, config.length);

    } catch (err) {

      console.log('Error uploading DID config file to Azure Blob Storage: ' + err);

    }

  }
}

// Helper function for sending HTTP POST in async/await style
async function sendPost(url, json) {
  return new Promise(function (resolve, reject) {
    request.post(url, {json: json}, function (error, res, body) {
      if (!error && res.statusCode == 200) {
        resolve(body);
      } else {
        reject(error);
      }
    });
  });
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

// Run the script
main()
  .then(() => {
    console.log("Successfully executed registration script.");
  })
  .catch(err => {
    console.log(err.message);
  });