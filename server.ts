import fs from 'fs';
import http from 'http';
import https from 'https';
import { Express } from 'express'
import { program } from 'commander';
import { resolve } from 'path';
import { appFactory as appFactoryV1 } from './src/app';
import { appFactory as appFactoryV2 } from './src/appV2';
import { NodeSDK } from '@opentelemetry/sdk-node';

export enum AppVersion {
    v1 = 'v1',
    v2 = 'v2'
}

const runServer = (sdk: NodeSDK) => {
    program.version("2.1.0")
        .option("-p, --port <port>", "Port to run the server one", process.env.RUNTIME_MOCK_ROUTES_PORT || "8080")
        .option("--https-port <httpsPort>", "Enable TLS for the server", process.env.RUNTIME_MOCK_ROUTES_HTTPS_PORT || "8443")
        .option("--tlsCert <tlsCertPath>", "Path to the TLS certificate file", process.env.HTTPS_CERT_FILE)
        .option("--tlsKey <tlsKeyPath>", "Path to the TLS key file", process.env.HTTPS_CERT_KEY_FILE)
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

    // Setup HTTPS options
    const httpsOptions = program.tlsCert && program.tlsKey && fs.existsSync(program.tlsCert) && fs.existsSync(program.tlsKey)
        ? {
            cert: fs.readFileSync(program.tlsCert),
            key: fs.readFileSync(program.tlsKey),
            enabled: true
        }
        : { enabled: false };

    const httpServer = http.createServer(app);
    const httpsServer = httpsOptions.enabled ? https.createServer(httpsOptions, app) : null;  

    httpServer.listen(program.port, () => {
        console.log(`⚡️[server]: Server is running at http://localhost:${program.port}`);
    });
    if (httpsServer) {
    httpsServer.listen(program.httpsPort, () => {
        console.log(`⚡️[server]: Server is running at https://localhost:${program.httpsPort}`);
    });
    }

    // Register signal handlers
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    // Graceful shutdown handler
    let isShuttingDown = false;
    async function gracefulShutdown(signal) {
        if (isShuttingDown) return;
        isShuttingDown = true;

        // Close servers
        const closePromises = [];
        closePromises.push(closeServer(httpServer));
        closePromises.push(closeServer(httpsServer));
        await Promise.all(closePromises);

        try {
            await sdk.shutdown();
        } catch (err) {
            console.log("Error shutting down OTEL SDK", err);
        }

        console.log('Shutdown complete, exiting process');
        process.exit(0);

        function closeServer(httpServer) {
            if (!httpServer) return Promise.resolve();
            const serverType = httpServer instanceof https.Server ? 'HTTPS' : 'HTTP'
            return new Promise<void>(resolve => {
                httpServer.close(() => {
                    resolve();
                });
                httpServer.closeAllConnections();
            });
        }
    }
}

export { runServer };