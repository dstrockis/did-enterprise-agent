import { Identifier, UserAgentOptions, KeyStoreInMemory, HttpResolver, SidetreeRegistrar, SecretKey } from '@microsoft/useragent-sdk';
import SubtleCryptoNodeOperations from '@microsoft/useragent-sdk/dist/src/crypto/plugin/SubtleCryptoNodeOperations';
import uuid from 'uuid/v4';
import IResolver from '@microsoft/useragent-sdk/dist/src/resolvers/IResolver';
import CryptoFactory from '@microsoft/useragent-sdk/dist/src/crypto/plugin/CryptoFactory';

/**
 * @class for provisioning a service
 * with a decentralized identifier and 
 * associated keys
 */
export default class University {

  public static resolver: IResolver;

  /**
   * Initializes the service.
   */
  public static async provision(): Promise<Identifier> {
    const options = new UserAgentOptions();
    
    // Create a new keystore instance
    const keyStore = new KeyStoreInMemory();
    options.keyStore = keyStore;
    // Save a master seed in keystore for key generation.
    const secretKey = new SecretKey(uuid());
    await options.keyStore.save('masterSeed', secretKey);

    // Create a cryptoFactory using Node subtle crypto
    const factory = new CryptoFactory(keyStore, new SubtleCryptoNodeOperations());
    options.cryptoFactory = factory;

    // Set up HttpResolver with discovery service url. 
    this.resolver = new HttpResolver('https://beta.discover.did.microsoft.com');
    options.resolver = this.resolver;

    const registrar = new SidetreeRegistrar('https://beta.ion.microsoft.com/api/1.0/register', options);
    options.registrar = registrar;

    // Should return a new Identifier Object.
    return Identifier.create(options);
  }
}