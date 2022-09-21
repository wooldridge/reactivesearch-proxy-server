const express = require('express');
const axios = require('axios');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');
const btoa = require('btoa');
const app = express();
const bodyParser = require('body-parser');
const cors = require('cors');
const {XMLParser} = require("fast-xml-parser");

const elasticResponse = require('./elastic-response.json')

app.use(cors());

/* This is where we specify options for the http-proxy-middleware
 * We set the target to appbase.io backend here. You can also
 * add your own backend url here */
const proxy = createProxyMiddleware({
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
    },
    selfHandleResponse: true,
    /**
    * Intercept response and transform
    **/
    onProxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
        const response = responseBuffer.toString('utf8'); // convert buffer to string
        //console.log("responseInterceptor", JSON.stringify(response, null, 2));
        return response;
    }),
});

const baseUrl = "http://localhost:8099";

// fast-xml-parser: https://github.com/NaturalIntelligence/fast-xml-parser
const options = {
    ignoreAttributes: false,
    ignoreDeclaration: true,
    attributeNamePrefix: "",
    allowBooleanAttributes: true,
    // isArray: (name, jpath, isLeafNode, isAttribute) => { 
    //     if (alwaysArray.indexOf(jpath) !== -1) return true;
    // }
};
const parser = new XMLParser(options);

const xmlToJson = xml => {
  const json = parser.parse(xml);
  return json;
};

const getSearchResults = async (query) => { 
    try {
        let url = baseUrl + "/v1/search?format=json&options=search-options&q=" + query;
        const response = await axios.get(url, {
          auth: {
            username: "admin",
            password: "admin"
          }
        });
        if (response && response.status === 200) {
          return response.data;
        }
    } catch (error) {
      let message = error;
      console.error("Error: getSearchResults", message);
    }
};

/* Parse the ndjson as text */
app.use(bodyParser.text({ type: 'application/x-ndjson' }));

app.post('/good-books-ds/_msearch', (req, res) => {
    try {
        const { body } = req;
        // Request body comes in two lines, get second line
        const splitBody = body.split(/\r?\n/);
        let parsed = JSON.parse(splitBody[1]);

        // Transform request, Elasticsearch -> MarkLogic
        let q = "";
        if (parsed.query.bool) {
            q = parsed.query.bool.must[0].bool.must.bool.should[0]["multi_match"].query;
        }

        const response = getSearchResults(q); // Call to backend
        response.then(result => {

            // Transform results, MarkLogic -> Elasticsearch
            let resultsTransformed = result.results.map(r => {
                r["_id"] = r.uri;
                r["_index"] = "good-books-ds";
                r["_score"] = 1.0;
                if (r.extracted.content[0]) {
                  const json = xmlToJson(r.extracted.content[0]);
                  r.content = json;
                  // Add entity type as property to each result
                  const entityType = Object.keys(json)[0];
                  r.entityType = entityType;
                }
                return r;
            })
            elasticResponse.responses[0].hits.hits = resultsTransformed;
            elasticResponse.responses[0].hits.total.value = result.total;

            // Transform facets, MarkLogic -> Elasticsearch
            let aggregations = {};
            if (result.facets) {
                Object.keys(result.facets).forEach(key => {
                    aggregations[key] = { buckets: [] };
                    result.facets[key].facetValues.forEach(fVal => {
                        aggregations[key].buckets.push(
                            {key: fVal.name, doc_count: fVal.count}
                        )
                    })
                })
            }
            elasticResponse.responses[0].aggregations = aggregations;

            res.json(elasticResponse);

        }).catch(error => {
            console.error(error);
        });
        
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
app.use('*', proxy);

app.listen(7777, () => console.log('Server running at http://localhost:7777 🚀'));
