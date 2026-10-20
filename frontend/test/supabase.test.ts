import {expect,it} from 'vitest';
import {isPublicKey} from '../src/supabase';
const jwt=(role:string)=>`header.${btoa(JSON.stringify({role}))}.signature`;
it('accepts public keys and rejects server-only secrets',()=>{
  expect(isPublicKey('sb_publishable_example_public_key')).toBe(true);
  expect(isPublicKey(jwt('anon'))).toBe(true);
  expect(isPublicKey(jwt('service_role'))).toBe(false);
  expect(isPublicKey('sb_secret_never_in_browser')).toBe(false);
  expect(isPublicKey('invalid')).toBe(false);
});
