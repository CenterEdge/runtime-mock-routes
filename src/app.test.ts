import request from 'supertest'
import { appFactory, RuntimeRequestBody, RuntimeRequestCollection } from './app'

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
        const seed: RuntimeRequestCollection = {
            "/test": {
                path: "/test",
                body: { test: true },
                method: 'GET'
            }
        }
        const app = appFactory(seed);
        expect(app).toBeDefined();
        expect(app["runtimeRequestCollection"]).toEqual(seed);
    });

    test('Creates app with semi-properly configured seed', () => {
        const seed: RuntimeRequestCollection = {
            "/test": {
                path: "/test",
                body: { test: true },
                method: 'GET'
            }
        }
        const semiSeed: RuntimeRequestCollection = {
            "/test": {
                path: "/test1",
                body: { test: true },
                method: 'GET'
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
    const empty: RuntimeRequestCollection = {};
    const seeded: RuntimeRequestCollection = {
        "/test": {
            path: "/test",
            body: { test: true },
            method: 'GET'
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
            [reqeustBody.path]: reqeustBody
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

describe('DELETE /?path=<path>', () => {
    test('should remove an existing path', async () => {
        const body: RuntimeRequestBody = {
            path: '/test',
            body: {},
            method: 'GET'
        };
        const collection: RuntimeRequestCollection = {
            [body.path]: body
        };
        const app = appFactory(collection);
        await request(app)
            .delete('/')
            .query({ path: [body.path] })
            .expect(204);


        expect(app["runtimeRequestCollection"]).toEqual(expect.not.objectContaining({
            [body.path]: body
        }));
    })

    test('should return 204 when nothing needs to be removed', async () => {
        const body: RuntimeRequestBody = {
            path: '/test',
            body: {},
            method: 'GET'
        };
        const collection: RuntimeRequestCollection = {

        };
        const app = appFactory(collection);
        await request(app)
            .delete('/')
            .query({ path: [body.path] })
            .expect(204);


        expect(app["runtimeRequestCollection"]).toEqual(expect.not.objectContaining({
            [body.path]: body
        }));
    })
});

describe('GET /*', () => {
    test('should render JSON hbs template', async () => {
        const requestBody: RuntimeRequestBody = {
            path: '/test/:id',
            body: `{"id": {{params.id}} }`,
            method: 'GET'
        }

        const collection: RuntimeRequestCollection = {
            [requestBody.path]: requestBody
        };
        const id = 42;

        const app = appFactory(collection);

        const response = await request(app)
            .get(`/test/${id}`)
            .expect(200)
            .expect('Content-Type', /json/);

        expect(response.body).toEqual({ id })
    });
});

describe('POST /*', () => {
    test('should render JSON hbs template', async () => {
        const requestBody: RuntimeRequestBody = {
            path: '/test/:id',
            body: `{"id": {{params.id}}, "item": "{{body.item}}" }`,
            method: 'POST'
        }

        const collection: RuntimeRequestCollection = {
            [requestBody.path]: requestBody
        };
        const id = 42;
        const body = { item: "yes" }

        const app = appFactory(collection);

        const response = await request(app)
            .post(`/test/${id}`)
            .send(body)
            .expect(200)
            .expect('Content-Type', /json/);

        expect(response.body).toEqual({ ...body, id })
    });
})