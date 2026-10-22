import test from 'node:test';
import assert from 'node:assert/strict';
import { blobConfigurado } from '../src/lib/blob-config.mjs';

test('Vercel Blob habilita nueva tienda enlazada mediante OIDC sin token permanente', () => {
  assert.equal(blobConfigurado({ BLOB_STORE_ID: 'store_example' }), true);
  assert.equal(blobConfigurado({ BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_example' }), true);
  assert.equal(blobConfigurado({
    BLOB_STORE_ID: 'store_example',
    BLOB_READ_WRITE_TOKEN: '',
  }), true);
  assert.equal(blobConfigurado({ BLOB_WEBHOOK_PUBLIC_KEY: 'public_key_only' }), false);
  assert.equal(blobConfigurado({}), false);
});
