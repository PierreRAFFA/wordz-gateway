const express = require('express');
const request = require('request');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const assign = require('lodash/assign');
const get = require('lodash/get');

//////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////
const app = express();

app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}));

// use for the ssl
app.use(express.static('static'));

app.listen(3000, function () {
  console.log('Example app listening on port 3000!')
});
//////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////// MIDDLEWARES

/**
 * Authenticates the user before calling any microservices.
 * Authentication is done by calling the Authentication service
 * @param req
 * @param res
 * @param next
 */
const authenticateUser = (req, res, next) => {
  req.user = null;

  console.log('authenticateUser');
  const accessToken = req.query.access_token;
  const url = `http://wordz-authentication:3010/api/users/me?access_token=${accessToken}`;

  request(url, (error, response, body) => {
    if(error) {
      res.status(500).send(error);
    }else {

      let json;
      try {
        json = JSON.parse(body);
      }catch (parsingError) {
        res.status(500).send(parsingError.message);
        return;
      }

      if (response.statusCode !== 200) {
        res.status(response.statusCode).send(json);
      }else{
        req.user = assign({}, json, {accessToken});
        next();
      }
    }
  });
};
//////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////// CUSTOM ROUTES
// Returns the app version
/**
 * Returns information about the app
 * Can be used to :
 *  - specify a new version available
 *  - put the game in maintenance mode
 */
app.get('/api/v:version/app/settings', function(req, res) {
  const major = 0;
  const minor = 0;
  const patch = 3;
  const version = major + '.' + minor + '.' + patch;
  const store = {
    apple: 'itms-apps:itunes.apple.com/app/wordz/id1208567317'
  };

  const maintenance = {
    enable: false,
    message: 'Sorry, WordZ is down for maintenance for several minutes'
  };

  res.send({version, major, minor, patch, store, maintenance});
});

/**
 * Logs in the user
 * Not used by the app
 */
app.post('/api/v:version/authentication/users/login', (req, res) => {
  let options = {
    url: `http://wordz-authentication:3010/api/users/login`,
    form: req.body
  };

  return request.post(options, (error, response, body) => {
    const statusCode = get(response, 'statusCode') || 500;
    if (error) {
      res.status(statusCode).send(error);
    } else {
      res.json(JSON.parse(body));
    }
  });
});

/**
 * Logs in the user via Facebook
 * This url is called by Facebook server and send a token
 */
app.post('/api/v:version/authentication/facebook/token', (req, res) => {

  let options = {
    url: `http://wordz-authentication:3010/facebook/token`,
    form: req.body
  };

  return request.post(options, (error, response, body) => {
    const statusCode = get(response, 'statusCode') || 500;
    if (error) {
      res.status(statusCode).send(error);
    } else {
      try {
        res.status(statusCode).json(JSON.parse(body));
      }catch (parsingError) {
        res.status(500).send(parsingError.message);
      }
    }
  });
});

//////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////// CLASSIC ROUTES
app.get('/api/v:version/:service/(*)', authenticateUser, (req, res) => {
  console.log(req.originalUrl);
  const search = getUrlSearch(req.originalUrl);

  /* Todo: Separate the authentication/autorization and the user services */
  if (req.params.service === 'user') {
    req.params.service = 'authentication';
  }
  /**/

  const host = `wordz-${req.params.service}`;
  let options = {
    url: `http://${host}:3010/api/${req.params['0']}${search}`,
    headers: {},
  };

  if (req.user) {
    options.headers = setAuthorization(req.user);
    console.log(options.headers);

    return request(options, (error, response, body) => {
      const statusCode = get(response, 'statusCode') || 500;
      if (error) {
        res.status(statusCode).send(error);
      } else {
        try {
          res.status(statusCode).json(JSON.parse(body));
        }catch (parsingError) {
          res.status(500).send(parsingError.message);
        }
      }
    });
  }else{
    let error = new Error('Authorization Required');
    error.statusCode = 401;
    res.send(error);
  }
});

app.post('/api/v:version/:service/(*)', authenticateUser, (req, res) => {
  const search = getUrlSearch(req.originalUrl);
  console.log(req.body);
  console.log(req.body.productId);
  console.log(req.body.receipt);
  console.log(req.body.sandbox);

  /* Todo: Separate the authentication/autorization and the user services */
  if (req.params.service === 'user') {
    req.params.service = 'authentication';
  }
  /**/

  const host = `wordz-${req.params.service}`;

  let options = {
    url: `http://${host}:3010/api/${req.params['0']}${search}`,
    headers: {},
    form: req.body
  };

  if (req.user) {
    options.headers = setAuthorization(req.user);
    console.log(options.headers);

    return request.post(options, (error, response, body) => {
      const statusCode = get(response, 'statusCode') || 500;
      if (error) {
        res.status(statusCode).send(error);
      } else {
        try {
          res.status(statusCode).json(JSON.parse(body));
        }catch (parsingError) {
          res.status(500).send(parsingError.message);
        }
      }
    });
  }else{
    let error = new Error('Authorization Required');
    error.statusCode = 401;
    res.send(error);
  }
});

//////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////  UTILS
function getUrlSearch(url) {
  let search = null;
  const split = url.split('?');
  if (split.length === 2) {
    search = '?' + split[1];
  }
  return search;
}

function setAuthorization(user) {
  let header = {};
  const token = 'Bearer ' + jwt.sign(JSON.parse(JSON.stringify(user)), process.env.JWT_SECRET, {
      expiresIn: 1440 // expires in 24 hours
    });

  header.Authorization = token;
  return header;
}