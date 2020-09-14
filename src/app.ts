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
export const SupportedMethodsColection: SupportedMethodsType = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
export type SupportedMethod = SupportedMethodsType[number];

export const isSupportedMethod = (obj: any): obj is SupportedMethod => SupportedMethodsColection.includes(obj);

export interface RuntimeRequestBody {
    path: string;
    body: any;
    method: SupportedMethod;
    status?: number;
}

export const isRuntimeRequestBody = (obj: any): obj is RuntimeRequestBody => {
    try {
        return typeof obj.path === 'string'
            && obj.hasOwnProperty('body')
            && (obj.status === undefined || !isNaN(Number(obj.status)))
            && isSupportedMethod(obj.method)
    } catch (_) { return false; }
}

export interface RuntimeRequestCollection {
    [path: string]: RuntimeRequestBody
}

export const isRuntimeRequestCollection = (obj: any): obj is RuntimeRequestCollection => {
    try { return !Object.keys(obj).some(k => !isRuntimeRequestBody(obj[k])) }
    catch (_) {
        return false
    }
}

export type MethodBasedRuntimeRequestCollection = Partial<Record<SupportedMethod, RuntimeRequestCollection>>;

export const isMethodBasedRuntimeRequestCollection = (obj: any): obj is MethodBasedRuntimeRequestCollection => {
    try {
        return !Object.keys(obj).some(k => !(isSupportedMethod(k) && isRuntimeRequestCollection(obj[k])))
    } catch (_) {
        return false
    }
}

interface CleanRuntimeRequestCollectionParams {
    collection: RuntimeRequestCollection;
    method: SupportedMethod;
}
export const cleanRuntimeRequestCollection = (params: CleanRuntimeRequestCollectionParams): RuntimeRequestCollection => {
    return Object.keys(params.collection).reduce(
        (acc, curr) => {
            const sanitizedPath = `/${curr}`.replace(/\/\//g, '/')
            const fixedRequest: RuntimeRequestBody = {
                ...params.collection[curr],
                path: sanitizedPath,
                method: params.method
            }
            return {
                ...acc,
                [sanitizedPath]: fixedRequest
            }
        },
        {} as RuntimeRequestCollection
    );
};

export const cleanMethodBasedRuntimeRequestCollection = (obj: MethodBasedRuntimeRequestCollection): MethodBasedRuntimeRequestCollection => {
    return Object.keys(obj).reduce((acc, curr) => {
        const method = curr as SupportedMethod;
        const collection: RuntimeRequestCollection = obj[curr];
        return {
            ...acc,
            [curr]: cleanRuntimeRequestCollection({ method, collection })
        }
    },
        {} as MethodBasedRuntimeRequestCollection);
};

export const singleQueryParam = (obj: any) => Array.isArray(obj) ? `${obj[0]}` : `${obj}`;

export const appFactory = (runtimeCollection?: MethodBasedRuntimeRequestCollection) => {
    let runtimeRequestCollection: MethodBasedRuntimeRequestCollection = runtimeCollection || {};
    if (!isMethodBasedRuntimeRequestCollection(runtimeRequestCollection)) {
        throw new Error('Intial requests JSON is invalid')
    }

    runtimeRequestCollection = cleanMethodBasedRuntimeRequestCollection(runtimeRequestCollection);

    const app = express();

    app.use(cors());
    app.use(bodyParser.json());

    app.get('/', (_req, res) => res.send(sortKeys(runtimeRequestCollection, { deep: true })));

    app.post('/', (req, res) => {
        const { body } = req;
        if (isRuntimeRequestBody(body)) {
            const fixedPath = `/${body.path}`.replace(/\/\//g, '/');
            body.path = fixedPath;
            const method = body.method;
            runtimeRequestCollection = {
                ...runtimeRequestCollection,
                [method]: {
                    ...(runtimeRequestCollection[method] || {}),
                    [fixedPath]: body
                }
            }
            return res.status(204).send();
        }
        return res.status(400).send();
    })

    app.delete('/', (req, res) => {
        let { path, method } = req.query;

        if (!path || !method) {
            return res.status(400).send();
        }

        const cleanPath = singleQueryParam(path);
        const cleanMethod = singleQueryParam(method);

        if (!isSupportedMethod(cleanMethod)) {
            return res.status(400).send();
        }

        if (!Object.keys(runtimeRequestCollection).includes(cleanMethod)) {
            return res.status(204).send();
        }

        const { [cleanMethod]: oldCollection, ...otherMetods } = runtimeRequestCollection;
        const { [cleanPath]: _, ...newCollection } = oldCollection;

        runtimeRequestCollection = {
            ...otherMetods,
            [cleanMethod]: newCollection
        };

        return res.status(204).send();
    });

    const catchAllHandler = (req, res) => {
        const method = req.method;
        if (!isSupportedMethod(method)) {
            return res.status(400).send();
        }
        const collection = runtimeRequestCollection[method];
        if (!collection) {
            return res.status(404).send();
        }
        const matcher = createMatcher(collection);

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

    app.get('/*', catchAllHandler);
    app.post('/*', catchAllHandler);
    app.put('/*', catchAllHandler);
    app.patch('/*', catchAllHandler);
    app.delete('/*', catchAllHandler);

    Object.defineProperty(app, 'runtimeRequestCollection', {
        get: () => {
            return cloneDeep(runtimeRequestCollection);
        }
    })

    return app;
}

const app = appFactory();
export default app;