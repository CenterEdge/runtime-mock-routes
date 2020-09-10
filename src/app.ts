import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';

interface RuntimeRequestBody {
    path: string;
    body: any;
}

const isRuntimeRequestBody = (obj: any): obj is RuntimeRequestBody => {
    return typeof obj.path === 'string' && obj.hasOwnProperty('body')
}

interface RuntimeRequestCollection {
    [path: string]: any
}


export const appFactory = (runtimeCollection?: RuntimeRequestCollection) => {
    const app = express();

    app.use(cors());
    app.use(bodyParser.json());

    let runtimeRequestCollection: RuntimeRequestCollection = runtimeCollection || {};

    app.get('/', (_req, res) => res.send(runtimeRequestCollection));

    app.post('/', (req, res) => {
        const { body } = req;
        if (isRuntimeRequestBody(body)) {
            const fixedPath = `/${body.path}`.replace(/\/\//g, '/');
            runtimeRequestCollection = {
                ...runtimeRequestCollection,
                [fixedPath]: body.body
            }
            return res.status(202).send();
        }
        return res.status(400).send();
    })

    app.get('/*', (req, res) => {
        const query = Object.keys(req.query).reduce((acc, key) => ({
            ...acc,
            [key]: Array.isArray(req.query[key]) ? req.query[key] : [req.query[key]]
        }), {} as any);

        if (runtimeRequestCollection[req.path]) {
            return res.send(runtimeRequestCollection[req.path]);
        }

        return res.status(404).send(req.path);
    });

    return app;
}

const app = appFactory();
export default app;