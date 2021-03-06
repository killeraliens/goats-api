const express = require('express')
const path = require('path')
const UserService = require('../services/user-service')
const UserUtils = require('../utils/user.utils')
const authUser = require('../mws/auth-user')
const bodyParser = express.json()
const logger = require('../utils/logger.utils')
const { check, validationResult } = require('express-validator');
const { CLIENT_ENDPOINT } = require('../config/config')
const authRouter = express.Router()

authRouter
  .route('/signin')
  .post(bodyParser, signin)

authRouter
  .route('/signup')
  .post(
    bodyParser,
    [
      check('username')
        .custom((value, { req }) => {
        const knexI = req.app.get('db')
        return UserService.getByUsername(knexI, value).then(user => {
            if (user) {
              return Promise.reject(`Username ${value} is already in use.`);
            }
        })
      }),
      check('password')
        .isLength({ min: 5, max: 20})
        .withMessage('password length must be between 5 and 20 characters')
    ],
    signup
  )

authRouter
  .route('/recover')
  .post(
    bodyParser,
    [
      check('username').custom((value, { req }) => {
        const knexI = req.app.get('db')
        return UserService.getByUsername(knexI, value).then(user => {
          if (!user) {
            return Promise.reject(`Username ${value} does not exist.`);
          }
        })
      })
    ],
    sendRecoveryEmail
  )

authRouter
  .route('/reset')
  .post(
    bodyParser,
    authUser.resetPassword,
    [
      check('password')
        .isLength({ min: 5, max: 20 })
        .withMessage('password length must be between 5 and 20 characters')
    ],
    resetPassword
  )

authRouter
  .route('/signout')
  .get(signout)


function signout(req, res) {
  if(req.user && Object.keys(req.user).length !== 0) {
    logger.info(`successful GET /signout by ${req.user.id}`)
    delete req.user
    return res.status(204).end()
  }
  delete req.user
  logger.error('unauthed req.user GET /signout')
  res.status(404).end()
}

function signup(req, res, next) {
  const validErrors = validationResult(req)
  if (!validErrors.isEmpty()) {
    logger.error(`POST /signup 400 error ${validErrors.errors[0].msg}`)
    return res.status(400).json({ message: validErrors.errors[0].msg })
  }

  const knexI = req.app.get('db')
  const { username, password, email } = req.body
  const requiredFields = { username, password, email }

  for (const [key, value] of Object.entries(requiredFields)) {
    if (!value) {
      logger.error(`POST /signup missing required value ${key}`)
      return res.status(400).json({ error: { message: `${key} required in post body` } })
    }
  }

  const regex = new RegExp(/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/);
  if (!regex.test(email)) {
    logger.error(`POST /signup ${url} is not a valid url`)
    return res.status(400).json({ error: { message: 'email is invalid' } })
  }

  const newUser = {
    username: username,
    email: email
  }

  UserUtils.hashPassword(password)
    .then(hashedPassword => {
      newUser.password_digest = hashedPassword
    })
    .then(() => UserUtils.createToken())
    .then(token => {
      newUser.token = token
      let now = Date.now()
      let last_login = new Date(now)
      newUser.last_login = last_login
    })
    .then(() => {
      return UserService
        .insertUser(knexI, newUser)
        .then(user => {
          const mailOptions = {
            to: user.email,
            from: 'admin@unholygrail.org',
            subject: `You created an account on UNHOLYGRAIL.`,
            vars: {
              username: user.username,
              token: encodeURIComponent(user.token),
              client_endpoint: CLIENT_ENDPOINT
            },
            htmlFile: 'welcome-email.pug'
          }

          return UserUtils
            .sendEmail(mailOptions)
            .then(response => {
              return res
                .status(201)
                .location(path.posix.join('/api/user', `/${user.id}`))
                .json(UserUtils.sanitizeAuthed(user))
            })
            .catch(error => {
              logger.error(`/auth/signup sendgrid error: ${JSON.stringify(error.sgError)}`)
            })
        })
        .catch(next)
    })
    .catch(next)

}

function signin(req, res, next) {
  const knexI = req.app.get('db')
  const { username, password } = req.body
  const requiredFields = { username, password }

  for (const [key, value] of Object.entries(requiredFields)) {
    if (!value) {
      logger.error(`POST /signin missing required value ${key}`)
      return res.status(400).json({ error: { message: `${key} required for signin` } })
    }

  }
  let user;

  UserService
    .getByUsername(knexI, username)
    .then(foundUser => {
      if (!foundUser) {
        logger.error(`POST /signin username ${username} does not exist`)
        return res.status(401).json({ message: `Bad login credentials` })
      }
      user = foundUser

      return UserUtils.checkPassword(password, foundUser)
        .then(res => res)
        .catch(err => res.status(401).json(err))
    })
    .then(result => UserUtils.createToken())
    .then(token => {
      let now = Date.now()
      let last_login = new Date(now)
      user.token = token
      user.last_login = last_login
      const patchBody = { token, last_login }
      return UserService
        .updateUser(knexI, user.id, patchBody)
        .catch(next)
    })
    .then(() => {
      delete user.password_digest
      logger.info(`Successful POST /signin by username ${user.username}`)
      res.status(201).json(UserUtils.sanitizeAuthed(user))
    })
    .catch(next)

}

function sendRecoveryEmail(req, res, next) {
  const validErrors = validationResult(req)
  if (!validErrors.isEmpty()) {
    logger.error(`POST /recover 401 error ${validErrors.errors[0].msg}`)
    return res.status(401).json({ message: validErrors.errors[0].msg })
  }

  const knexI = req.app.get('db')
  const { username } = req.body

  UserService
    .getByUsername(knexI, username)
    .then(user => {
      logger.info(`Preparing to send recovery to ${user.email}`)
      const mailOptions = {
        to: user.email,
        from: 'admin@unholygrail.org',
        subject: `Your UNHOLYGRAIL password reset request`,
        vars: {
          username: user.username,
          token: encodeURIComponent(user.token),
          client_endpoint: CLIENT_ENDPOINT
        },
        htmlFile: 'recover-email.pug'
      }

      UserUtils
        .sendEmail(mailOptions)
        .then(response => {
          logger.info(`Recovery email sent sendgrid response ${response}`)
          return res.status(202).json({ message: `An email has been sent to the account associated with ${user.username}` })
        })
        .catch(error => {
          logger.error(`/auth/recover sendgrid error: ${JSON.stringify(error.sgError)}`)
          return res.status(400).json({ message: 'There was a problem with sending your password recovery email.' })
        })

    })
    .catch(next)
}

function resetPassword(req, res, next) {
  const validErrors = validationResult(req)
  if (!validErrors.isEmpty()) {
    logger.error(`POST /reset 400 error ${validErrors.errors[0].msg}`)
    return res.status(400).json({ message: validErrors.errors[0].msg })
  }

  const knexI = req.app.get('db')
  const  { id } = req.user
  const { password } = req.body

  const patchBody = {}
  UserUtils.hashPassword(password)
    .then(hashedPassword => {
      patchBody.password_digest = hashedPassword
      let now = Date.now()
      let last_login = new Date(now)
      patchBody.last_login = last_login
    })
    .then(() => {
      return UserService
       .updateUser(knexI, id, patchBody)
       .then(numOfRowsAffected => {
         return UserService.getById(knexI, id)
           .then(user => {
             delete user.password_digest
             res.status(200).json(UserUtils.sanitizeAuthed(user))
           })
           .catch(next)
       })
       .catch(next)
    })

}


module.exports = authRouter;
