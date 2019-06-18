### Already done
- Deploy DID bridge from Azure CLI
- Automatically register DID during setup
- Receive request, sign a fake claim, return it. 

### P0
- try to get it working using Azure templates, parameterize values
- add to demo: show DID got created via universal resolver via postman

```
https://beta.discover.did.microsoft.com/1.0/identifiers/did:ion:test:EiDRJGZldhJzjkpF3M6ITE0C0HA5BBCFElPmLcbg1SiUCg
```

### P1
- show verifying the signature of the fake claim
- tencent verifying the claim by copy & paste into new tencent portal
- showing a card instead of a signed JWT, use a fake png
- show student having to login before issuing the claim

### P2
- load policy from storage account, read policy URL, send request to policy URL, returns fake response

### P3
- create a harvard database, have it existing in the customer subscription prior to demo
  - populate it with fake students
  - have policy URL read from harvard DB to return response
  - post-deploy, configure DID bridge to talk to database via policy or somehow.