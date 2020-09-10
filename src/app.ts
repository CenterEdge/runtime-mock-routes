import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import createMatcher from 'feather-route-matcher';
import Handlebars from 'handlebars';

interface RuntimeRequestBody {
    path: string;
    body: any;
    status?: number;
}

const isRuntimeRequestBody = (obj: any): obj is RuntimeRequestBody => {
    return typeof obj.path === 'string'
        && obj.hasOwnProperty('body')
        && (obj.status === undefined || !isNaN(Number(obj.status)))
}

interface RuntimeRequestCollection {
    [path: string]: RuntimeRequestBody
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
                [fixedPath]: body
            }
            return res.status(202).send();
        }
        return res.status(400).send();
    })

    app.get('/*', (req, res) => {

        const matcher = createMatcher(runtimeRequestCollection);

        const query = Object.keys(req.query).reduce((acc, key) => ({
            ...acc,
            [key]: Array.isArray(req.query[key]) ? req.query[key] : [req.query[key]]
        }), {} as any);

        const routeMatch = matcher(req.path);

        if (routeMatch) {
            const reqInfo: RuntimeRequestBody = routeMatch.value;
            const params = routeMatch.params;

            const tokenParams = {
                ...query,
                ...params
            }

            if (reqInfo.status) {
                res.status(reqInfo.status);
            }

            const { body } = reqInfo;

            if (typeof body !== 'string') {
                return res.send(body);
            }

            const template = Handlebars.compile(body);
            const result = template(tokenParams)

            try {
                const jsonResult = JSON.parse(result);
                return res.send(jsonResult);
            } catch (_) {
                return res.send(result)
            }
        }

        return res.status(404).send();
    });

    return app;
}

const app = appFactory();
export default app;