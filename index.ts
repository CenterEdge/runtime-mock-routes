#!/usr/bin/env node
import { program } from 'commander';
import { resolve } from 'path';
import { appFactory as appFactoryV1 } from './src/app';
import { appFactory as appFactoryV2 } from './src/appV2';
import { Express } from 'express'

enum AppVersion {
    v1 = 'v1',
    v2 = 'v2'
}

program.version("2.0.0")
    .option("-p, --port <port>", "Port to run the server one", process.env.RUNTIME_MOCK_ROUTES_PORT || "8080")
    .option("-s, --seed <filePath>", "File path to seed the application", process.env.RUNTIME_MOCK_ROUTES_FILE_PATH)
    .option("-a, --appVersion <appVersion>", "App Version to use", AppVersion.v2)

program.parse(process.argv);
let initialRequests: any = {};
if (program.seed) {
    const filePath = resolve(program.seed);
    const funcOrJson = require(filePath);
    initialRequests = typeof funcOrJson === 'function' ? funcOrJson() : funcOrJson;
}

type AppFactory = (...args: any[]) => Express;

const appVersions: Record<AppVersion, AppFactory> = {
    v1: appFactoryV1,
    v2: appFactoryV2
}
const appFactory = appVersions[program.appVersion] || appFactoryV2;


const app = appFactory(initialRequests);

app.listen(program.port, () => {
    console.log(`⚡️[server]: Server is running at http://localhost:${program.port}`);
});