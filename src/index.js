#!/usr/bin/env node

import childProcess from 'child_process';
import fileExists from 'file-exists';
import fs from 'fs';
import name from 'project-name';
import generator from 'generate-password';
import os from 'os';

const projectName = name();

fs.readFile('./android/app/build.gradle', 'utf8', (err, config) => {
  if (err === null) {
    if (config.indexOf('signingConfigs.release') !== -1) {
      throw new Error('Project is already configured for Android release');
    }

    // Step 1 - Generate a new keystore
    console.log('Generating a release keystore');
    var keytool = childProcess.spawn('keytool', [
      '-genkey', '-v', '-keystore', `./android/app/${projectName}-release-key.keystore`,
      '-alias', projectName, '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000'
    ]);

    const password = generator.generate({
      length: 10,
      numbers: true
    });
    keytool.stdout.on('data', (data) => {
      process.stdout.write(data);
    });
    process.stdin.pipe(keytool.stdin);
    keytool.stderr.on('data', (data) => {
      if (data.toString() == 'Enter keystore password:  ' ||
        data.toString() == 'Re-enter new password: ') {
        keytool.stdin.write(password + '\n');
      } else {
        process.stdout.write(data);
      }
    });
    keytool.on('close', (code) => {
      if (code !== 0) {
        throw new Error('Unable to generate release keystore');
      }

      // Step 2 Update gradle properties
      console.log('Updating your local gradle properties file');
      const gradleKey = projectName.toUpperCase().replace('-', '_');
      fileExists(os.homedir() + '/.gradle/gradle.properties', (err, exists) => {
        if (err || !exists) {
          throw new Error('You do not seem to have a local gradle properties file');
        } else {
          fs.appendFileSync(
            os.homedir() + '/.gradle/gradle.properties',
            `
${gradleKey}_RELEASE_STORE_FILE=${projectName}-release-key.keystore
${gradleKey}_RELEASE_KEY_ALIAS=${projectName}
${gradleKey}_RELEASE_STORE_PASSWORD=${password}
${gradleKey}_RELEASE_KEY_PASSWORD=${password}
            `
          );

          // Step 3 Update gradle config
          config = config.substr(0, config.indexOf('buildTypes')) +
        `signingConfigs {
            release {
                storeFile file(${gradleKey}_RELEASE_STORE_FILE)
                storePassword ${gradleKey}_RELEASE_STORE_PASSWORD
                keyAlias ${gradleKey}_RELEASE_KEY_ALIAS
                keyPassword ${gradleKey}_RELEASE_KEY_PASSWORD
            }
        }\n    ` + config.substr(config.indexOf('buildTypes'));
          fs.writeFile('./android/app/build.gradle', config, (err) => {
            if (err) {
              throw new Error('Unable to write to your app\'s gradle config');
            } else {
              // Success
              console.log('You can now build a release version of your app for Android');
              process.exit();
              return;
            }
          })
        }
      });
    });
  } else if (err.code === 'ENOENT') {
    return console.log('Directory should be created using "react-native init"');
  } else {
    return console.log('Something went wrong: ', err.code);
  }
})
