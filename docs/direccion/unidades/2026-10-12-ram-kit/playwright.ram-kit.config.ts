import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'ramkit-browser.test.ts',
  timeout:60000,workers:1,fullyParallel:false,outputDir:'./ramkit-browser-results',
  reporter:[['list'],['json',{outputFile:'tmp/ramkit-browser-report.json'}]],
  use:{baseURL:'http://127.0.0.1:3132',viewport:{width:1280,height:900},headless:true,
    channel:'chrome',trace:'retain-on-failure'},
});
