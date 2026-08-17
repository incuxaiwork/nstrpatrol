import 'dotenv/config';
import { storeBuffer, readStored, deleteStored } from '../src/services/storage';

async function main() {
  const buf = Buffer.from('nstrpatrol s3 e2e check ' + Date.now());
  const stored = await storeBuffer(buf, 'txt');
  console.log('stored key:', stored.key, '| size:', stored.size, '| sha256:', stored.sha256.slice(0, 12));
  const back = await readStored(stored.key);
  console.log('read back:', back ? back.toString() : null, '| matches:', back?.equals(buf));
  const gone = await deleteStored(stored.key);
  console.log('deleted:', gone);
  const after = await readStored(stored.key);
  console.log('read after delete (null expected):', after);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('FAILED:', e.message);
    process.exit(1);
  });