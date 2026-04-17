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
        .option("-w, --watch", "Watch the seed file for changes and reload routes without restarting", false)

    program.parse(process.argv);

    const seedFilePath = program.seed ? resolve(program.seed) : null;

    const seedIsDirectory = seedFilePath ? fs.statSync(seedFilePath).isDirectory() : false;

    function loadSeed(filePath: string): any {
        if (seedIsDirectory) {
            // Bust cache for every required file under the seed directory
            const dirPrefix = filePath.endsWith('/') || filePath.endsWith('\\') ? filePath : filePath + (process.platform === 'win32' ? '\\' : '/');
            for (const key of Object.keys(require.cache)) {
                if (key.startsWith(dirPrefix)) {
                    delete require.cache[key];
                }
            }
        } else {
            delete require.cache[require.resolve(filePath)];
        }
        const funcOrJson = require(filePath);
        return typeof funcOrJson === 'function' ? funcOrJson() : funcOrJson;
    }

    let initialRequests: any = {};
    if (seedFilePath) {
        initialRequests = loadSeed(seedFilePath);
    }

    type AppFactory = (...args: any[]) => Express;

    const appVersions: Record<AppVersion, AppFactory> = {
        v1: appFactoryV1,
        v2: appFactoryV2
    }
    const appFactory = appVersions[program.appVersion] || appFactoryV2;

    // Use a mutable handler so the servers don't need to rebind ports on reload
    let currentApp = appFactory(initialRequests);
    const handler: http.RequestListener = (req, res) => currentApp(req, res);

    // Setup HTTPS options
    const httpsOptions = program.tlsCert && program.tlsKey && fs.existsSync(program.tlsCert) && fs.existsSync(program.tlsKey)
        ? {
            cert: fs.readFileSync(program.tlsCert),
            key: fs.readFileSync(program.tlsKey),
            enabled: true
        }
        : { enabled: false };

    const httpServer = http.createServer(handler);
    const httpsServer = httpsOptions.enabled ? https.createServer(httpsOptions, handler) : null;

    httpServer.listen(program.port, () => {
        console.log(`⚡️[server]: Server is running at http://localhost:${program.port}`);
    });
    if (httpsServer) {
    httpsServer.listen(program.httpsPort, () => {
        console.log(`⚡️[server]: Server is running at https://localhost:${program.httpsPort}`);
    });
    }

    // Watch seed file or directory for changes
    if (program.watch && seedFilePath) {
        let watchDebounce: ReturnType<typeof setTimeout> | null = null;
        const watchOptions = { persistent: true, recursive: seedIsDirectory };

        fs.watch(seedFilePath, watchOptions, (eventType, filename) => {

            if (eventType !== 'change' && eventType !== 'rename') {
                return;
            }

            // For directory watches, only react to JS/JSON file changes
            if (seedIsDirectory && filename && !/\.(js|json)$/.test(filename)){
                return;
            }

            // Debounce: some editors write files multiple times in quick succession
            if (watchDebounce) clearTimeout(watchDebounce);
            watchDebounce = setTimeout(() => {
                watchDebounce = null;
                try {
                    const newRequests = loadSeed(seedFilePath);
                    currentApp = appFactory(newRequests);
                    const changedDesc = seedIsDirectory && filename ? ` (${filename})` : '';
                    console.log(`🔥[watch]: Seed reloaded — ${seedFilePath}${changedDesc}`);
                } catch (err) {
                    console.error('🔥[watch]: Failed to reload seed:', err);
                }
            }, 100);
        });
        console.log(`🔥[watch]: Watching seed ${seedIsDirectory ? 'directory' : 'file'} for changes — ${seedFilePath}`);
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