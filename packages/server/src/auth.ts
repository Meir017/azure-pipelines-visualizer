import { DefaultAzureCredential } from '@azure/identity';

const ADO_SCOPE = '499b84ac-1321-427f-aa17-267ca6975798/.default';

let credential: DefaultAzureCredential | null = null;

function getCredential(): DefaultAzureCredential {
  if (!credential) {
    credential = new DefaultAzureCredential();
  }
  return credential;
}

/**
 * Gets a bearer token for Azure DevOps REST API calls.
 * Uses DefaultAzureCredential which supports:
 * - AzureCliCredential (local dev via `az login`)
 * - ManagedIdentityCredential (deployed environments)
 * - EnvironmentCredential (CI/CD)
 */
export async function getAzureDevOpsToken(): Promise<string> {
  const tokenResponse = await getCredential().getToken(ADO_SCOPE);
  return tokenResponse.token;
}
