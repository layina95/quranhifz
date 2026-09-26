const {test}=require('node:test');
const assert=require('node:assert/strict');
const appConfig=require('../app.config.js');
const staticConfig=require('../app.json').expo;

test('le build Android relie le fichier Firebase privé à Expo',()=>{
  const previous=process.env.GOOGLE_SERVICES_JSON_PATH;
  try{
    process.env.GOOGLE_SERVICES_JSON_PATH='/tmp/private/google-services.json';
    const configured=appConfig({config:staticConfig});
    assert.equal(configured.android.package,'fr.quranhifz.app');
    assert.equal(configured.android.googleServicesFile,'/tmp/private/google-services.json');
    assert.equal(configured.extra.eas.projectId,staticConfig.extra.eas.projectId);
  }finally{
    if(previous===undefined)delete process.env.GOOGLE_SERVICES_JSON_PATH;
    else process.env.GOOGLE_SERVICES_JSON_PATH=previous;
  }
});
