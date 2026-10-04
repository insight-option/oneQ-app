// Seeds the approved catalogue and the preset sections into the deployed backend by invoking its
// `seed-catalogue` function, then migrates facilities from before sections (approved gyms).
// Idempotent: records are keyed by their fixed ids, so running it again never duplicates anything.
//
//   AWS_PROFILE=oneq-dev npm run seed            (PowerShell: $env:AWS_PROFILE='oneq-dev'; npm run seed)
//   npm run seed -- --overwrite                   reset existing records to the approved catalogue (default: create missing only)
//   npm run seed -- --stack <root stack>          a branch deployment, or when more than one OneQ sandbox exists
//   npm run seed -- --samples                     test branches only: sample facility data for the dashboards
//   npm run seed -- --publish-samples             test branches only: make the sample facilities visible to customers
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { invokeSandboxFunction, region } from './lib/sandbox-function.mjs';

// Facilities without an owner are temporarily owned by the platform admin (first member of the `admin` group of
// the user pool in ./amplify_outputs.json), when there is one.
function adminOwnerKey() {
  try {
    const { auth } = JSON.parse(readFileSync(new URL('../amplify_outputs.json', import.meta.url), 'utf8'));
    const args = ['cognito-idp', 'list-users-in-group', '--user-pool-id', auth.user_pool_id, '--group-name', 'admin', '--region', region, '--output', 'json'];
    const user = JSON.parse(execFileSync('aws', args, { encoding: 'utf8' })).Users?.[0];
    const sub = user?.Attributes?.find((a) => a.Name === 'sub')?.Value;
    return user && sub ? `${sub}::${user.Username}` : null;
  } catch {
    return null;
  }
}

const owner = adminOwnerKey();
const { stack, result } = invokeSandboxFunction('seedcatalogue', {
  overwrite: process.argv.includes('--overwrite'),
  adminOwnerKey: owner,
  samples: process.argv.includes('--samples'),
  publishDemo: process.argv.includes('--publish-samples'),
});
console.log(`Seeded ${stack} (${region}): ${JSON.stringify(result)} · temporary owner: ${owner ? 'admin account' : 'none (no admin in this user pool)'}`);
