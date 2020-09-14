import request from 'supertest';
import { appFactory, isMethodBasedRuntimeRequestCollection, MethodBasedRuntimeRequestCollection, RuntimeRequestBody, SupportedMethodsColection } from './app';

describe('appFactory', () => {
    test('Creates app with no seed', () => {
        const app = appFactory();
        expect(app).toBeDefined();
    });

    test('Creates app with empty seed', () => {
        const app = appFactory({});
        expect(app).toBeDefined();
    });

    test('Creates app with properly configured seed', () => {
        const seed: MethodBasedRuntimeRequestCollection = {
            GET: {
                "/test": {
                    path: "/test",
                    body: { test: true },
                    method: 'GET'
                }
            }
        }
        const app = appFactory(seed);
        expect(app).toBeDefined();
        expect(app["runtimeRequestCollection"]).toEqual(seed);
    });

    test('Creates app with semi-properly configured seed', () => {
        const seed: MethodBasedRuntimeRequestCollection = {
            GET: {
                "/test": {
                    path: "/test",
                    body: { test: true },
                    method: 'GET'
                }
            }
        }
        const semiSeed: MethodBasedRuntimeRequestCollection = {
            GET: {
                "/test": {
                    path: "/test1",
                    body: { test: true },
                    method: 'PUT'
                }
            }
        }
        const app = appFactory(semiSeed);
        expect(app).toBeDefined();
        expect(app["runtimeRequestCollection"]).toEqual(seed);
    });

    test('throws error on improperly configured seed', () => {
        const seed = {
            "/test": {
                path: "/test",
            }
        }

        expect(() => appFactory(seed as any)).toThrowError('Intial requests JSON is invalid')
    });
});

describe('GET /', () => {
    const empty: MethodBasedRuntimeRequestCollection = {};
    const seeded: MethodBasedRuntimeRequestCollection = {
        GET: {
            "/test": {
                path: "/test",
                body: { test: true },
                method: 'GET'
            }
        }
    }
    test.each([['empty', empty], ['seeded', seeded]])('should get current collection - %s', async (_, seed) => {
        const app = appFactory(seed);
        const response = await request(app).get('/')
            .expect('Content-Type', /json/)
            .expect(200);

        expect(response.body).toEqual(app["runtimeRequestCollection"]);
    })
});

describe('POST /', () => {
    test('should accept a valid RuntimeRequestBody', async () => {
        const app = appFactory();
        const reqeustBody: RuntimeRequestBody = {
            path: '/test',
            body: { hello: 'world' },
            method: 'POST'
        };
        await request(app)
            .post('/')
            .send(reqeustBody)
            .expect(204);

        expect(app["runtimeRequestCollection"]).toEqual(expect.objectContaining({
            [reqeustBody.method]: { [reqeustBody.path]: reqeustBody }
        }));
    });

    test('should deny an invalid RuntimeRequestBody', async () => {
        const app = appFactory();
        const reqeustBody = {
            path: '/test',
        };
        await request(app)
            .post('/')
            .send(reqeustBody)
            .expect(400)
            .catch(() => { });
    });
});

describe('DELETE /?path=<path>&method=<method>', () => {
    test('should remove an existing path', async () => {
        const body: RuntimeRequestBody = {
            path: '/test',
            body: {},
            method: 'GET'
        };
        const collection: MethodBasedRuntimeRequestCollection = {
            [body.method]: { [body.path]: body }
        };
        const app = appFactory(collection);
        await request(app)
            .delete('/')
            .query({ path: [body.path], method: body.method })
            .expect(204);


        expect(app["runtimeRequestCollection"]).toEqual(expect.not.objectContaining({
            [body.method]: expect.objectContaining({ [body.path]: body })
        }));
    })

    test('should return 204 when nothing needs to be removed', async () => {
        const body: RuntimeRequestBody = {
            path: '/test',
            body: {},
            method: 'GET'
        };
        const collection: MethodBasedRuntimeRequestCollection = {

        };
        const app = appFactory(collection);
        await request(app)
            .delete('/')
            .query({ path: [body.path], method: body.method })
            .expect(204);


        expect(app["runtimeRequestCollection"]).toEqual(expect.not.objectContaining({
            [body.path]: body
        }));
    })
});

describe('METHOD /*', () => {
    const methods = SupportedMethodsColection.map(m => [m])
    test.each(methods)('%s should render JSON hbs template', async (method) => {
        const requestBody: RuntimeRequestBody = {
            path: '/test/:id',
            body: `{"id": {{params.id}} }`,
            method
        }

        const collection: MethodBasedRuntimeRequestCollection = {
            [requestBody.method]: { [requestBody.path]: requestBody }
        };
        const id = 42;

        const app = appFactory(collection);

        const response = await request(app)[method.toLocaleLowerCase()](`/test/${id}`)
            .expect(200)
            .expect('Content-Type', /json/);

        expect(response.body).toEqual({ id })
    });
});

describe('isMethodBasedRuntimeRequestCollection', () => {
    test('should be true', () => {
        const obj: MethodBasedRuntimeRequestCollection = {
            GET: {
                '/test': {
                    path: '/test',
                    method: 'GET',
                    body: {},
                    status: 200
                }
            }
        };
        expect(isMethodBasedRuntimeRequestCollection(obj)).toBeTruthy();
    });

    test('should be false', () => {
        const obj = {
            GETter: {
                '/test': {
                    path: '/test',
                    method: 'GET',
                    body: {},
                    status: 200
                }
            }
        };
        expect(isMethodBasedRuntimeRequestCollection(obj)).toBeFalsy();
    });
});