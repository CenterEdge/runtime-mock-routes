import request from 'supertest';
import { appFactory, isRuntimeRequestCollection, RuntimeRequestBody, RuntimeRequestCollection, SupportedMethodsColection, RequestParameters, RuntimeRequestMethodBody, isRuntimeRequestMethodBody } from './appV2';

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
                methods: {
                    GET: {
                        body: "Hello",
                        status: 200
                    }
                }
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
                methods: {
                    GET: {
                        body: "Hello",
                        status: 200
                    }
                }
            }
        }
        const semiSeed: RuntimeRequestCollection = {
            "/test": {
                path: "",
                methods: {
                    GET: {
                        body: "Hello",
                        status: 200
                    }
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

        expect(() => appFactory(seed as any)).toThrow('Intial requests JSON is invalid')
    });
});

describe('GET /', () => {
    const empty: RuntimeRequestCollection = {};
    const seeded: RuntimeRequestCollection = {
        "/test": {
            path: "/test",
            methods: {
                GET: {
                    body: "Hello",
                    status: 200
                }
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
            methods: {
                POST: {
                    body: { hello: 'world' }
                }
            }
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

describe('PUT', () => {
    test('should accept a valid RuntimeRequestCollection', async () => {
        const app = appFactory();
        const requestBody: RuntimeRequestBody = {
            path: '/test',
            methods: {
                POST: {
                    body: { hello: 'world' }
                }
            }
        };
        const collection: RuntimeRequestCollection = {
            [requestBody.path]: requestBody
        }
        await request(app)
            .put('/')
            .send(collection)
            .expect(204);

        expect(app["runtimeRequestCollection"]).toEqual(collection);
    });

    test('should deny an invalid RuntimeRequestCollection', async () => {
        const app = appFactory();
        const reqeustBody = {
            path: '/test',
        };
        const collection = {
            [reqeustBody.path]: reqeustBody
        }
        await request(app)
            .put('/')
            .send(collection)
            .expect(400)
            .catch(() => { });
    });


});

describe('DELETE /?path=<path>', () => {
    test('should remove an existing path', async () => {
        const body: RuntimeRequestBody = {
            path: '/test',
            methods: {
                GET: {
                    body: {}
                }
            }
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
            [body.path]: expect.objectContaining(body)
        }));
    })

    test('should return 204 when nothing needs to be removed', async () => {
        const body: RuntimeRequestBody = {
            path: '/test',
            methods: {
                GET: {
                    body: {}
                }
            }
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

describe('METHOD /*', () => {
    const methods = SupportedMethodsColection.map(m => [m])
    test.each(methods)('%s should render JSON hbs template', async (method) => {
        const requestBody: RuntimeRequestBody = {
            path: '/test/:id',
            methods: {
                [method]: {
                    body: `{"id": {{params.id}} }`
                }
            }
        }

        const collection: RuntimeRequestCollection = {
            [requestBody.path]: requestBody
        };
        const id = 42;

        const app = appFactory(collection);

        const response = await request(app)[method.toLocaleLowerCase()](`/test/${id}`)
            .expect(200)
            .expect('Content-Type', /json/);

        expect(response.body).toEqual({ id })
    });
});

describe('Body as Function', () => {
    test('executes the method for the result', async () => {
        const seed: RuntimeRequestCollection = {
            "/test": {
                path: "/test",
                methods: {
                    GET: {
                        body: function(rp: RequestParameters) {
                            if(rp.query.id == "2") {
                                return {id: 2};
                            } else {
                                return {id: 3};
                            }
                        },
                        status: 200
                    }
                }
            }
        }

        const app = appFactory(seed);
        expect(app).toBeDefined();

        var response = await request(app).get('/test?id=2');

        expect(response.body).toEqual({id: 2});

        var secondResponse = await request(app).get('/test?id=3');

        expect(secondResponse.body).toEqual({id: 3});
    })
});

describe('Body returns quoted JSON when sending raw', () => {
    test('Return JSON stringified string with quotes', async () => {
        const seed: RuntimeRequestCollection = {
            "/test": {
                path: "/test",
                methods: {
                    GET: {
                        body: function(rp: RequestParameters) { return JSON.stringify(`"<p>Test</p>"`) },
                        status: 200,
                        headers: () => { return { 'Content-Type': 'application/json; charset=utf-8' } },
                        raw: true
                    }
                }
            }
        }

        const app = appFactory(seed);
        expect(app).toBeDefined();

        var response = await request(app).get('/test');

        expect(response.body).toEqual(`"<p>Test</p>"`);
        expect(response.body).toHaveLength(13)
        expect(response.body[0]).toBe(`"`);
        expect(response.body[1]).toBe(`<`);
        expect(response.body[11]).toBe(`>`);
        expect(response.body[12]).toBe(`"`);
    })
});

describe('Request Body is Simple Type', () => {
    test('Send in string as JSON', async () => {
        const seed: RuntimeRequestCollection = {
            "/test": {
                path: "/test",
                methods: {
                    POST: {
                        body: JSON.stringify(true),
                        status: 200
                    }
                }
            }
        }

        const app = appFactory(seed);
        expect(app).toBeDefined();

        var response = await request(app)
                            .post('/test?id=2')
                            .set('Content-type', 'application/json')
                            .send('"test"');

        expect(response.body).toEqual(true);
    })
});

describe('isRuntimeRequestMethodBodyCollection', () => {
    test('is true for valid object', () => {
        const seed: RuntimeRequestCollection = {
            "/test": {
                path: "/test",
                methods: {
                    GET: {
                        body: "Hello",
                        status: 200
                    }
                }
            }
        }

        const valid = isRuntimeRequestCollection(seed);
        expect(valid).toBeTruthy();
    })
})

describe('Status as a function', () => {
    test('is true for status that is function', () => {
        const seed: RuntimeRequestMethodBody = {
            body: "test",
            status: () => {
                return 200;
            }
        };

        const valid = isRuntimeRequestMethodBody(seed);
        expect(valid).toBeTruthy();
    })

    test('Executes body and status functions', async () => {
        const seed: RuntimeRequestCollection = {
            "/test": {
                path: "/test",
                methods: {
                    GET: {
                        body: function(rp: RequestParameters) {
                            if(rp.query.id == "2") {
                                return {id: 2};
                            } else {
                                return {id: 3};
                            }
                        },
                        status: function(rp: RequestParameters) {
                            if(rp.query.id == "2") {
                                return 200;
                            } else {
                                return 400;
                            }
                        }
                    }
                }
            }
        }

        const app = appFactory(seed);
        expect(app).toBeDefined();

        var response = await request(app).get('/test?id=2');
        expect(response.body).toEqual({id: 2});
        expect(response.status).toEqual(200);

        var secondResponse = await request(app).get('/test?id=3');
        expect(secondResponse.body).toEqual({id: 3});
        expect(secondResponse.status).toEqual(400);
    })
})

describe('Headers as a function', () => {
    test('is true for headers that are a function', () => {
        const seed: RuntimeRequestMethodBody = {
            body: "test",
            status: 200,
            headers: () => {
                return {'test-header': 5}
            }
        };

        const valid = isRuntimeRequestMethodBody(seed);
        expect(valid).toBeTruthy();
    })

    test('Executes header functions', async () => {
        const seed: RuntimeRequestCollection = {
            "/test": {
                path: "/test",
                methods: {
                    GET: {
                        body: {id: 1},
                        status: 200,
                        headers: function(rp: RequestParameters) {
                            if(rp.query.id == "2") {
                                return {'test-header': '2'};
                            } else {
                                return {'test-header': '3'}
                            }
                        }
                    }
                }
            }
        }

        const app = appFactory(seed);
        expect(app).toBeDefined();

        var response = await request(app).get('/test?id=2');
        expect(response.headers['test-header']).toEqual('2');

        var secondResponse = await request(app).get('/test?id=3');
        expect(secondResponse.headers['test-header']).toEqual('3');
    })
})
