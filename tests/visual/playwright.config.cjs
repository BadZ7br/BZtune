const path=require('node:path');
module.exports={testDir:__dirname,testMatch:'*.spec.cjs',timeout:30000,workers:1,fullyParallel:false,
 snapshotPathTemplate:'{testDir}/snapshots/{projectName}/{arg}{ext}',outputDir:path.join(__dirname,'../../artifacts/desktop-visual-results'),
 projects:[{name:`chromium-${process.platform}`,use:{browserName:'chromium',launchOptions:process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:undefined}}]};
