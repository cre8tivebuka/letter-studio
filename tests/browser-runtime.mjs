import {createRequire} from 'node:module';
import path from 'node:path';

const runtime=createRequire(process.env.LETTER_STUDIO_TEST_RUNTIME
 ? path.join(process.env.LETTER_STUDIO_TEST_RUNTIME,'package.json')
 : import.meta.url);
export const {chromium}=runtime('playwright');
export const launchOptions={headless:true,...(process.env.LETTER_STUDIO_TEST_CHANNEL?{channel:process.env.LETTER_STUDIO_TEST_CHANNEL}:{})};
export const testUrl=process.env.LETTER_STUDIO_TEST_URL||'http://127.0.0.1:5175/';
