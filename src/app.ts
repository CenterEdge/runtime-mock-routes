import bodyParser from 'body-parser';
import Chance from 'chance';
import cors from 'cors';
import express from 'express';
import faker from 'faker';
import createMatcher from 'feather-route-matcher';
import Handlebars from 'handlebars';
import { cloneDeep, get } from 'lodash';
import sortKeys from 'sort-keys';

const chance = new Chance();

Handlebars.registerHelper('faker', (funcName: string, ...rest: any[]) => {
    try {
        const func = get(faker, funcName, () => '');
        return func(...rest);
    } catch (err) {
        return err;
    }
});

Handlebars.registerHelper('chance', (funcName: string, ...rest: any[]) => {
    try {
        const func = get(chance, funcName, () => '');
        return func.call(chance, ...rest);
    } catch (err) {
        return err
    }
})

type SupportedMethodsType = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const SupportedMethodsColection: SupportedMethodsType = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
export type SupportedMethod = SupportedMethodsType[number];

export const isSupportedMethod = (obj: any): obj is SupportedMethod => SupportedMethodsColection.includes(obj);

export interface RuntimeRequestBody {
    path: string;
    body: any;
    method: SupportedMethod;
    status?: number;
}

export const isRuntimeRequestBody = (obj: any): obj is RuntimeRequestBody => {
    return typeof obj.path === 'string'
        && obj.hasOwnProperty('body')
        && (obj.status === undefined || !isNaN(Number(obj.status)))
        && isSupportedMethod(obj.method)
}

export interface RuntimeRequestCollection {
    [path: string]: RuntimeRequestBody
}

export const isRuntimeRequestCollection = (obj: any): obj is RuntimeRequestCollection => {
    return !Object.keys(obj).some(k => !isRuntimeRequestBody(obj[k]))
}

export type MethodBasedRuntimeRequestCollection = Partial<Record<SupportedMethod, RuntimeRequestCollection>>;

export const appFactory = (runtimeCollection?: RuntimeRequestCollection) => {
    let runtimeRequestCollection: RuntimeRequestCollection = runtimeCollection || {};
    if (!isRuntimeRequestCollection(runtimeRequestCollection)) {
        throw new Error('Intial requests JSON is invalid')
    }

    Object.keys(runtimeRequestCollection).forEach(key => {
        runtimeRequestCollection[key].path = `/${key}`.replace(/\/\//g, '/')
    });

    const app = express();

    app.use(cors());
    app.use(bodyParser.json());

    app.get('/', (_req, res) => res.send(sortKeys(runtimeRequestCollection, { deep: true })));

    app.post('/', (req, res) => {
        const { body } = req;
        if (isRuntimeRequestBody(body)) {
            const fixedPath = `/${body.path}`.replace(/\/\//g, '/');
            runtimeRequestCollection = {
                ...runtimeRequestCollection,
                [fixedPath]: body
            }
            return res.status(204).send();
        }
        return res.status(400).send();
    })

    app.delete('/', (req, res) => {
        let { path } = req.query;

        if (!path) {
            return res.status(204).send();
        }

        if (!Array.isArray(path)) {
            path = [`${path}`];
        }

        const newCollection: RuntimeRequestCollection = (path as any[]).reduce(
            (acc, curr) => {
                const { [`${curr}`]: _, ...restOfObj } = acc;
                return restOfObj;
            },
            runtimeRequestCollection
        );

        runtimeRequestCollection = newCollection;

        return res.status(204).send();
    });

    const catchAllHandler = (req, res) => {
        const matcher = createMatcher(runtimeRequestCollection);

        const routeMatch = matcher(req.path);

        if (routeMatch) {
            const reqInfo: RuntimeRequestBody = routeMatch.value;
            const params = routeMatch.params;

            const tokenParams = {
                query: req.query,
                params,
                body: req.body
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
    }

    app.get('/*', catchAllHandler)
    app.post('/*', catchAllHandler)

    Object.defineProperty(app, 'runtimeRequestCollection', {
        get: () => {
            return cloneDeep(runtimeRequestCollection);
        }
    })

    return app;
}

const app = appFactory();
export default app;