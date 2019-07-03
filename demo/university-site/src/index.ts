import { Identifier, UserAgentSession } from '@microsoft/useragent-sdk';
import Crypto from 'crypto';
import Koa from 'koa';
import getRawBody from 'raw-body';
import Helmet from 'koa-helmet';
import KoaRouter from 'koa-router';
import Session from 'koa-session';
import Static from 'koa-static';
import path from 'path';
import University from './University';
import { formVerifiedStudent } from './verifiedStudent';
import base64url from 'base64url';

const application = new Koa();
var router = new KoaRouter(); //Instantiate the router

const CONFIG = {
  key: 'koa:sess', /** (string) cookie key (default is koa:sess) */
  /** (number || 'session') maxAge in ms (default is 1 days) */
  /** 'session' will result in a cookie that expires when session/browser is closed */
  /** Warning: If a session cookie is stolen, this cookie will never expire */
  maxAge: 86400000,
  autoCommit: true, /** (boolean) automatically commit headers (default true) */
  overwrite: true, /** (boolean) can overwrite or not (default true) */
  httpOnly: true, /** (boolean) httpOnly or not (default true) */
  signed: true, /** (boolean) signed or not (default true) */
  rolling: false, /** (boolean) Force a session identifier cookie to be set on every response. The expiration is reset to the original maxAge, resetting the expiration countdown. (default is false) */
  renew: false, /** (boolean) renew session when session is nearly expired, so we can always keep user logged in. (default is false)*/
};

// Set up the decentralized identifier for the method
let universityIdentifier: Identifier;
let issuerSession: UserAgentSession;
University.provision().then((identifier: Identifier) => {
  universityIdentifier = identifier;
  console.log(`Identifier generated and registered on ION: '${universityIdentifier.id}'`)
  universityIdentifier.getPublicKey()
  .then(publicKey => {
    issuerSession = new UserAgentSession(universityIdentifier, 'did:ion-did:ion-ES256K-sig', University.resolver);
  })
})
.catch((error: Error) => {
  console.error(error);
});

// Setup the routes
router.get('/document', async (context, next) => {
  const document = await universityIdentifier.getDocument();
  context.body = document.toJSON();
  await next();
});

// ajax request to get an OpenID Connect request (OIDC section 6.2)
router.get('/auth-selfissue', async (context, next) => { 
  // the URI for the signed auth request
  const host = context.get('host');
  const requestUrl = `https://${host}/req`;
  const selfIssuedRequest = `openid://useragent?request_uri=${requestUrl}`;
  context.body = selfIssuedRequest;
  await next();
 });

// ajax request to get an OpenID Connect request (OIDC section 6.2)
router.get('/req', async (context, next) => {
  const nonce = Buffer.from(Crypto.randomBytes(27)).toString('base64');
  const host = context.get('host');
  const redirectUrl = `https://${host}/res`;
  const manifestUrl = `https://${host}/manifest.json`;
  context.body = await issuerSession.signRequest(redirectUrl, nonce, undefined, undefined, manifestUrl);
  await next();
});

// ajax request to receive auth response from user agent
// expects incoming response in JWS format
router.post('/res', async (context, next) => {
  const requestBody = JSON.parse(context.body.toString());
  if (requestBody.error) {
    console.log(`UserAgent responded with error '${requestBody.error}`);
  }

  // if no error occurred, validate the id_token
  if (requestBody) {
    let selfIssuedToken: any;
    try {
      selfIssuedToken = await issuerSession.verify(requestBody);
      console.log(selfIssuedToken);
    } catch (error) {
      console.error(error);
      // fallback, in case of verify failure. Just do it anyways.
      selfIssuedToken = JSON.parse(base64url.decode(requestBody.payload));
    }
    // Form a student Id
    let studentClaim = await formVerifiedStudent(selfIssuedToken.did);

    // Create the verified credential and return
    context.body = studentClaim;
    context.status = 200;
  } else {
    // we need an id_token for this to work
    context.status = 400;
  }

  await next();
});

// Setup the application
application
.use(Static(path.join(__dirname, 'public')))
.use(async (ctx, next) => {
  ctx.body = await getRawBody(ctx.req);
  await next();
 })
.use(Session(CONFIG, application))
.use(router.routes())
.use(Helmet())
.use(
  Helmet.hsts({
    maxAge: 31536000,
    includeSubdomains: true
  })
);

// Start listening for requests
const port = process.env.PORT || 1337;
application.listen(port);
console.log(`Application listening on port ${port}`);