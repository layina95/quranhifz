const {test}=require('node:test');
const assert=require('node:assert/strict');
const chemin=require('node:path');
const {readFileSync}=require('node:fs');
const appConfig=require('../app.config.js');
const staticConfig=require('../app.json').expo;

const racine=chemin.join(__dirname,'..');
const flux=['.github/workflows/android-apk.yml','.github/workflows/ios-unsigned.yml'];

test('le build Android relie le fichier Firebase privé à Expo',()=>{
  const previous=process.env.GOOGLE_SERVICES_JSON_PATH;
  try{
    process.env.GOOGLE_SERVICES_JSON_PATH='/tmp/private/google-services.json';
    const configured=appConfig({config:staticConfig});
    assert.equal(configured.android.package,'fr.quranhifz.app');
    assert.equal(configured.android.googleServicesFile,'/tmp/private/google-services.json');
  }finally{
    if(previous===undefined)delete process.env.GOOGLE_SERVICES_JSON_PATH;
    else process.env.GOOGLE_SERVICES_JSON_PATH=previous;
  }
});

// Le projet Expo d'origine ne doit plus figurer nulle part dans la configuration :
// les jetons de notification des utilisateurs y seraient enregistres, chez un tiers.
test('aucun projet Expo etranger n est ecrit en dur dans la configuration',()=>{
  assert.equal(staticConfig.extra?.eas?.projectId,undefined);
  assert.equal(staticConfig.owner,undefined);
});

test('sans variable d environnement, la configuration ne porte aucun projet Expo',()=>{
  const previous=process.env.EXPO_PUBLIC_EXPO_PROJECT_ID;
  try{
    delete process.env.EXPO_PUBLIC_EXPO_PROJECT_ID;
    const configured=appConfig({config:staticConfig});
    assert.equal(configured.extra?.eas?.projectId,undefined);
  }finally{
    if(previous===undefined)delete process.env.EXPO_PUBLIC_EXPO_PROJECT_ID;
    else process.env.EXPO_PUBLIC_EXPO_PROJECT_ID=previous;
  }
});

test('la variable d environnement devient le projet Expo de la configuration',()=>{
  const previous=process.env.EXPO_PUBLIC_EXPO_PROJECT_ID;
  try{
    process.env.EXPO_PUBLIC_EXPO_PROJECT_ID='00000000-1111-2222-3333-444444444444';
    const configured=appConfig({config:staticConfig});
    assert.equal(configured.extra.eas.projectId,'00000000-1111-2222-3333-444444444444');
    assert.equal(configured.android.package,'fr.quranhifz.app');
    assert.equal(configured.ios.bundleIdentifier,'fr.quranhifz.app');
  }finally{
    if(previous===undefined)delete process.env.EXPO_PUBLIC_EXPO_PROJECT_ID;
    else process.env.EXPO_PUBLIC_EXPO_PROJECT_ID=previous;
  }
});

// Sans cette transmission, la variable n existe qu en local et les binaires
// compiles par GitHub n en heritent jamais.
test('les deux flux transmettent la variable du projet Expo a la compilation',()=>{
  for(const relatif of flux){
    const source=readFileSync(chemin.join(racine,relatif),'utf8');
    assert.match(
      source,
      /EXPO_PUBLIC_EXPO_PROJECT_ID:\s*\$\{\{\s*vars\.EXPO_PROJECT_ID\s*\}\}/,
      `${relatif} ne transmet pas EXPO_PUBLIC_EXPO_PROJECT_ID`,
    );
  }
});
