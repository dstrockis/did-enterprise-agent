/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for
 * license information.
 */
'use strict';
const KeyVault = require('@azure/keyvault');
const MsRestAzure = require('@azure/ms-rest-nodeauth');
const request = require('request');
const CryptoJS = require('crypto-js');
const base64url = require('base64url');
const Azure = require("@azure/storage-blob");


// Constants
const didConfigFileName = 'did-config.json';
const kvKeyName = 'did-primary-signing-key';

// In-Memory Variables
var didConfig;



// Reads a DID configuration JSON object from Azure Blob Storage
// Azure blob storage location stored in environment variables
// Azure blob storage credentials provided by Azure managed identities
async function FetchDidConfig() {

  // get a token from MSI to call Azure Blob Storage
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
  const azBlobUrl = Azure.BlobURL.fromContainerURL(azContainerUrl, didConfigFileName);

  // try to read a DID config file from Azure blob storage
  const blobResponse = await azBlobUrl.download(Azure.Aborter.none, 0);
  const didConfigData = await StreamToString(blobResponse.readableStreamBody);
  return JSON.parse(didConfigData);

}



// Writes a DID configuration object to Azure Blob Storage
// Azure blob storage location stored in environment variables
// Azure blob storage credentials provided by Azure managed identities
async function UploadDidConfig(config) {

  // get a token from MSI to call Azure Blob Storage
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
  const azBlobUrl = Azure.BlobURL.fromContainerURL(azContainerUrl, didConfigFileName);

  // try to write DID config file to Azure blob storage
  const azBlockBlobUrl = Azure.BlockBlobURL.fromBlobURL(azBlobUrl);
  const uploadBlobResponse = await azBlockBlobUrl.upload(Azure.Aborter.none, config, config.length);
  return;

}




// Registers a DID for the enterprise, if one has not already been registered
// Creates a Secp256K1 key in Azure Key Vault
// Registers a DID with the created key using Microsoft DID services
// Stores DID & key details in DID configuration file in Azure blob storage
// Azure blob storage & key vault locations stored in environment variables
// Azure blob storage & key vault credentials provided by Azure managed identities
async function EnsureDidRegistered() {

  try {

    // try to read a DID config file from Azure blob storage
    didConfig = await FetchDidConfig();

  } catch(err) {

    if (err.statusCode != 404)
      throw err;

  };
  
  // if file exists with a registered DID, no need to re-register
  if (didConfig && didConfig.did)
    return;

  console.log('No existing DID found, proceeding with DID registration');

  // get pointer to KeyVault from environment variables
  const kvVaultName = process.env.AZURE_KEY_VAULT;

  var kvClient;
  var kvKeyVersion;
  var kvPubJwk;
  const kvBaseUrl = `https://${kvVaultName}.vault.azure.net/`;

  // get a token from the Azure CLI to call KeyVault
  const token = await MsRestAzure.loginWithAppServiceMSI({resource: 'https://vault.azure.net'});

  // provision a secp256k1 key in keyvault, remember the public key that is returned
  kvClient = new KeyVault.KeyVaultClient(token);
  const keyResponse = await kvClient.createKey(kvBaseUrl, kvKeyName, 'EC', {curve: 'P-256K'});
  kvKeyVersion = keyResponse.key.kid.split('/').pop();
  kvPubJwk = keyResponse.key;

  console.log('Successfully created a key in key vault.');

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
  const encodedSignature = await GetSignatureForString(signatureInput, kvKeyName, kvKeyVersion);

  console.log('Successfully signed a DID registration request using a key in key vault.');  

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
  const registrationResult = await SendPost("https://beta.ion.microsoft.com/api/1.0/register", requestBody);

  // create the enterprise agent config file
  didConfig = {
    "did": registrationResult.id,
    "kvKeyName": kvKeyName,
    "kvKeyVersion": kvKeyVersion
  };

  console.log('Successfully registered a DID.');  

  // upload the new DID configuration document to Azure Blob Storage
  UploadDidConfig(JSON.stringify(didConfig));

  console.log('Successfully uploaded a new DID config file to Azure blob storage.');  

  return;

}





// Accepts a string as input, hashes the string, and sends the hash to
//  Key Vault to be signed using the DID's' private key.
async function GetSignatureForString(inputString, keyName, keyVersion) {

  // get a token from MSI to call KeyVault
  const token = await MsRestAzure.loginWithAppServiceMSI({resource: 'https://vault.azure.net'});

  // get pointer to KeyVault from environment variables
  const kvVaultName = process.env.AZURE_KEY_VAULT;

  // setup KeyVault client
  const kvClient = new KeyVault.KeyVaultClient(token);
  const kvBaseUrl = `https://${kvVaultName}.vault.azure.net/`;
  const kvKeyName = keyName;
  const kvKeyVersion = keyVersion;

  // construct the hash of the input string
  const hash = CryptoJS.SHA256(inputString);
  const buffer = Buffer.from(hash.toString(CryptoJS.enc.Hex), 'hex');
  const array = new Uint8Array(buffer);

  // sign the registration request with the private key in KeyVault
  const signResponse = await kvClient.sign(kvBaseUrl, kvKeyName, kvKeyVersion, 'ES256K', array);
  var signature = signResponse.result;
  var derSig = ToDer([signature.slice(0, signature.byteLength / 2), signature.slice(signature.byteLength / 2, signature.byteLength)]);
  const encodedSignature = base64url(derSig);
  return encodedSignature;
}






// Accepts a properly formatted verfiable credential JSON object as input, 
// formats it into a JWT, signs the JWT, and returns the compact serialization
// of a JWT.
async function GenerateVerifiableCredential(contents) {

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
      "vc": contents
    }

    // form the signature input to pass to KeyVault to be signed
    const encodedBody = base64url(Buffer.from(JSON.stringify(jwtBody)));
    const encodedHeader = base64url(Buffer.from(JSON.stringify(jwtHeader)));
    const signatureInput = encodedHeader + "." + encodedBody;
    const encodedSignature = await GetSignatureForString(signatureInput, didConfig.kvKeyName, didConfig.kvKeyVersion);

    // finally, form the claim as a JWT
    const claimDetails = `${encodedHeader}.${encodedBody}.${encodedSignature}`;
    return claimDetails;
}





// Helper function for sending HTTP POST in async/await style
async function SendPost(url, json) {
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
async function StreamToString(readableStream) {
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
function ToDer(elements) {
  
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





module.exports = {
  EnsureDidRegistered: EnsureDidRegistered,
  GenerateVerifiableCredential: GenerateVerifiableCredential
}