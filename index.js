const express = require('express');
const proxy = require('http-proxy-middleware');
const btoa = require('btoa');
const app = express();
const bodyParser = require('body-parser')
const cors = require('cors');

app.use(cors());

/* This is where we specify options for the http-proxy-middleware
 * We set the target to appbase.io backend here. You can also
 * add your own backend url here */
const options = {
    target: 'http://localhost:8095/',
    changeOrigin: true,
    onProxyReq: (proxyReq, req) => {
        proxyReq.setHeader(
            'Authorization',
            `Basic ${btoa('admin:admin')}`
        );
        /* transform the req body back from text */
        const { body } = req;
        if (body) {
            if (typeof body === 'object') {
                proxyReq.write(JSON.stringify(body));
            } else {
                proxyReq.write(body);
            }
        }
    }
}

/* Parse the ndjson as text */
app.use(bodyParser.text({ type: 'application/x-ndjson' }));

app.post('/good-books-ds/_msearch', (req, res) => {
    try {
        const { body } = req;
        console.log("POST");
        //console.log(JSON.stringify(req.body, null, 2));
        console.log(body);
        res.sendStatus(200);
    } catch (error) {
        let message = error;
        console.error("Error: /good-books-ds/_msearch", message);
    }

});

/* This is how we can extend this logic to do extra stuff before
 * sending requests to our backend for example doing verification
 * of access tokens or performing some other task */
app.use((req, res, next) => {
    const { body } = req;
    console.log('Verifying requests ✔', body);
    /* After this we call next to tell express to proceed
     * to the next middleware function which happens to be our
     * proxy middleware */
    next();
})

/* Here we proxy all the requests from reactivesearch to our backend */
app.use('*', proxy(options));

app.listen(7777, () => console.log('Server running at http://localhost:7777 🚀'));
