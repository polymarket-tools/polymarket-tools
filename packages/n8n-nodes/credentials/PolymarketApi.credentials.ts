import type { ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class PolymarketApi implements ICredentialType {
  name = 'polymarketApi';
  displayName = 'Polymarket API';
  documentationUrl = 'https://docs.polymarket.com/developers/CLOB/introduction';

  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      description: 'CLOB API key from polymarket.com/settings?tab=builder',
    },
    {
      displayName: 'API Secret',
      name: 'apiSecret',
      type: 'string',
      typeOptions: { password: true },
      default: '',
    },
    {
      displayName: 'API Passphrase',
      name: 'apiPassphrase',
      type: 'string',
      typeOptions: { password: true },
      default: '',
    },
    {
      displayName: 'Private Key',
      name: 'privateKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      description: 'Ethereum wallet private key for signing orders',
    },
    {
      displayName: 'Builder Code',
      name: 'builderCode',
      type: 'string',
      default: '',
      description: 'Builder code for volume attribution (optional)',
    },
  ];

  test: ICredentialTestRequest = {
    request: {
      baseURL: 'https://clob.polymarket.com',
      url: '/time',
      method: 'GET',
    },
  };
}
