import Chance from 'chance';
import cors from 'cors';
import express, { Request, Response } from 'express';
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

export interface RuntimeRequestMethodBody {
    body: any;
    status?: number;
    headers?: Record<string, string>;
}

export interface RequestParameters {
    query: any,
    params: any,
    body: any,
    headers: any
}

export const isRuntimeRequestMethodBody = (obj: any): obj is RuntimeRequestMethodBody => {
    try {
        return !!obj.body && (!obj.status || !isNaN(Number(obj.status)))
    } catch (_) {
        return false;
    }
}

export type RuntimeRequestMethodBodyCollection = Partial<Record<SupportedMethod, RuntimeRequestMethodBody>>;

export const isRuntimeRequestMethodBodyCollection = (obj: any): obj is RuntimeRequestMethodBodyCollection => {
    try {
        return !Object.keys(obj).some(k => !(isSupportedMethod(k) && isRuntimeRequestMethodBody(obj[k])))
    } catch (_) { return false; }
}

export interface RuntimeRequestBody {
    path: string;
    methods: RuntimeRequestMethodBodyCollection;
}

export const isRuntimeRequestBody = (obj: any): obj is RuntimeRequestBody => {
    try {
        return typeof obj.path === 'string'
            && isRuntimeRequestMethodBodyCollection(obj.methods)
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

export const appFactory = (runtimeCollection?: RuntimeRequestCollection) => {
    let runtimeRequestCollection: RuntimeRequestCollection = runtimeCollection || {};
    if (!isRuntimeRequestCollection(runtimeRequestCollection)) {
        throw new Error('Intial requests JSON is invalid')
    }

    runtimeRequestCollection = Object.keys(runtimeRequestCollection).reduce(
        (acc, curr) => {
            const fixedPath = `/${curr}`.replace(/\/\//g, '/');
            const body = {
                ...runtimeCollection[curr],
                path: fixedPath
            }
            return {
                ...acc,
                [fixedPath]: body
            };
        },
        {} as RuntimeRequestCollection
    );

    const app = express();

    app.use(cors());
    app.use(express.json());

    app.get('/', (_req, res) => res.send(sortKeys(runtimeRequestCollection, { deep: true })));

    app.post('/', (req, res) => {
        const { body } = req;
        if (isRuntimeRequestBody(body)) {
            const fixedPath = `/${body.path}`.replace(/\/\//g, '/');
            body.path = fixedPath;

            runtimeRequestCollection = {
                ...runtimeRequestCollection,
                [fixedPath]: body
            }
            return res.status(204).send();
        }
        return res.status(400).send();
    });

    app.put('/', (req, res) => {
        const { body } = req;
        if (!isRuntimeRequestCollection(body)) {
            return res.status(400).send('BAD_REQUEST_BODY')
        }

        const cleanBody = Object.keys(body).reduce(
            (acc, curr) => {
                const fixedPath = `/${curr}`.replace(/\/\//g, '/');
                const newBody = {
                    ...body[curr],
                    path: fixedPath
                }
                return {
                    ...acc,
                    [fixedPath]: newBody
                };
            },
            {} as RuntimeRequestCollection
        );

        runtimeRequestCollection = cleanBody;
        return res.status(204).send();
    });

    app.delete('/', (req, res) => {
        let { path } = req.query;

        if (!path) {
            return res.status(400).send();
        }

        const cleanPath = Array.isArray(path) ? (path as any[]).map(p => `${p}`) : [`${path}`]

        runtimeRequestCollection = cleanPath.reduce(
            (acc, curr) => {
                const { [curr]: _, ...rest } = acc;
                return rest;
            },
            runtimeRequestCollection
        );

        return res.status(204).send();
    });

    const catchAllHandler = (req: Request, res: Response) => {
        const matcher = createMatcher(runtimeRequestCollection);
        const routeMatch = matcher(req.path);

        if (routeMatch) {
            const reqInfo: RuntimeRequestBody = routeMatch.value;
            const params = routeMatch.params;

            const method: RuntimeRequestMethodBody = reqInfo.methods[req.method];
            if (!method) {
                return res.status(404).send()
            }

            const tokenParams = {
                query: req.query,
                params,
                body: req.body,
                headers: req.headers
            }

            if (method.status) {
                res.status(method.status);
            }

            if (method.headers) {
                const processedHeaders = Object.keys(method.headers).reduce(
                    (acc, curr) => ({
                        ...acc,
                        [curr]: Handlebars.compile(method.headers[curr])(tokenParams)
                    }),
                    {} as Record<string, string>
                );
                res.set(processedHeaders);
            }

            let { body } = method;

            // if body is a function, execute and then process the response
            if (typeof body === 'function') {
                body = body(tokenParams);
            }

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