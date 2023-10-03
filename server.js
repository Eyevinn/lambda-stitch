const { LambdaELB } = require("@eyevinn/dev-lambda");
const { handler } = require('./index.js');

(new LambdaELB({ handler })).run();