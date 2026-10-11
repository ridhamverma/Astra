import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const production = process.env.PLAYBACK_QA_PRODUCTION === '1' || existsSync('.next/BUILD_ID');
export default defineConfig({
  testDir:'./tests/e2e',outputDir:'./test-results',fullyParallel:false,workers:1,timeout:60000,
  expect:{toHaveScreenshot:{maxDiffPixelRatio:.005}},
  use:{baseURL:'http://127.0.0.1:3100',browserName:'chromium',channel:'chrome',locale:'en-GB',timezoneId:'UTC',colorScheme:'dark',trace:'retain-on-failure'},
  webServer:{command:production ? 'ASTRA_PLAYBACK_QA=1 npm run start -- --hostname 127.0.0.1 --port 3100' : 'npm run dev -- --hostname 127.0.0.1 --port 3100',url:'http://127.0.0.1:3100/playback-demo',reuseExistingServer:true,timeout:60000},
});
