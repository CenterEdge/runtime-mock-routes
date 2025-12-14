const mocks = {
    "/api/test": {
        path: "/api/test",
        methods: {
            "GET": {
                status: 200,
                body: { message: "Test successful" },
            },
        }
    }
}

module.exports = {
    ...mocks,
}