'use strict'

var errors = require('./errors')
var extension = require('./extension')
const { customAlphabet } = require('nanoid')
const logger = require('winston')
const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 4)

module.exports = function (app) {
  app.get('/', function (req, res) {
    res.json({ success: true })
  })

  app.get('/healthCheck', function (req, res) {
    res.json({ success: true })
  })

  app.get('/livez', function (req, res) {
    if (app.get('__server_live__')) {
      return res.sendStatus(200)
    }
    return res.sendStatus(400)
  })

  app.get('/readyz', function (req, res) {
    if (app.get('__server_ready__')) {
      return res.sendStatus(200)
    }
    return res.sendStatus(400)
  })

  app.post('/function',
    authenticate,
    callFunction
  )

  app.get('/openConnections',
    noOfConnectionsFn
  )

  app.get('/stopServer',
    stopServerFn
  )
}

function authenticate (req, res, next) {
  if (extension.isAuthorized(req)) return next()
  res.set('WWW-Authenticate', 'invalid system token')
  return res.status(401).json({ errors: [errors.get('ROUTES_INVALID_SYSTEM_TOKEN')] })
}

function callFunction (req, res, next) {
  req.body._reqId = Date.now() + nanoid()
  extension.callFunction(req.body.options, req.body, function (err, result) {
    if (err) {
      return res.status(err.statusCode).json({errors: err.errors})
    }
    return res.json(result)
  })
}

function getNoOfActiveConnections(req, callback) {
  req.socket.server.getConnections((err, noOfOpenConnections) => {
    if (err) {
      logger.error(`logName=shouldNeverHappen, message=failedToFetchNoOfConnections, err=${nodeUtil.inspect(err, null, {depth: 4})}`)
    }
    return callback(noOfOpenConnections - 1)
  })
}

async function noOfConnectionsFn(req, res, next) {
  getNoOfActiveConnections(req, (noOfOpenConnections) => {
    logger.info(`logName=noOfOpenConnections, noOfOpenConnections=${noOfOpenConnections}`)
    res.end(noOfOpenConnections + '')
  })
}

async function stopServerFn(req, res, next) {
  logger.info('logName=serverHit, u=/stopServer')
  getNoOfActiveConnections(req, (noOfOpenConnections) => {
    if (noOfOpenConnections > 1) {
      logger.error(`logName=shouldNeverHappen, message=killServerCalledWhileConnectionStillOpen, noOfOpenConnections=${noOfOpenConnections}`)
      return res.status(422).json({
        errors: [{
          code: 'connections_still_open',
          message: `${noOfOpenConnections} connection(s) still open.`
        }]
      })
    }
    req.socket.server.close(() => {
      logger.info('logName=serverStopped')
      process.exit(1)
    })
    res.end('preparing to shut down.')
  })
}