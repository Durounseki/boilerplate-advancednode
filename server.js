'use strict';
require('dotenv').config();
const express = require('express');
const myDB = require('./connection');
const routes = require('./routes.js');
const auth = require('./auth.js');

const session = require('express-session');
const passport = require('passport');

const fccTesting = require('./freeCodeCamp/fcctesting.js');

const app = express();

const http = require('http').createServer(app);
const io = require('socket.io')(http);

const passportSocketIo = require('passport.socketio');
const MongoStore = require('connect-mongo')(session);
const cookieParser = require('cookie-parser');

const URI = process.env.MONGO_URI;
const store = new MongoStore({url: URI});


app.set('view engine','pug');
app.set('views','./views/pug');

//Set up session
app.use(session({
  secret: process.env.SESSION_SECRET,
  key: 'express.sid',
  resave: true,
  store: store,
  saveUninitialized: true,
  cookie: { secure: false}
}))

function onAuthorizeSuccess(data,accept){
  console.log('successful connection to socket.io');
  accept(null,true);
}

function onAuthorizeFail(data,message,error,accept){
  if(error) throw new Error(message);
  console.log('failed connection to socket.io: ', message);
  accept(null,false);
}

app.use([passport.initialize(),passport.session()]);

fccTesting(app); //For FCC testing purposes
app.use('/public', express.static(process.cwd() + '/public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

myDB(async client => {
  const myDataBase = await client.db('database').collection('users');
  let currentUsers = 0;
  io.use(
    passportSocketIo.authorize({
      cookieParser: cookieParser,
      key: 'express.sid',
      secret: process.env.SeSSION_SECRET,
      store: store,
      success: onAuthorizeSuccess,
      fail: onAuthorizeFail
    })
  )
  io.on('connection',socket => {
    console.log('A user has connected');
    ++currentUsers;
    io.emit('user', {
      username: socket.request.user.username,
      currentUsers,
      connected: true
    });
    console.log('user ' + socket.request.user.username + ' connected');
    socket.on('disconnect',() => {
      console.log('A user has disconnected');
      currentUsers -= 1;
      io.emit('user count', currentUsers);
    })
    socket.on('chat message', (message) => {
      io.emit('chat message',{
        username: socket.request.user.username,
        message
      });
    })
  });
  routes(app,myDataBase);
  auth(app,myDataBase);

  app.use((req,res,next) => {
    res.status(404).type('text').send('Not Found');
  })

}).catch(err => {
  app.route('/').get((req,res)=>{
    res.render('index',{title: err, message: 'Unable to connect to database'})
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log('Listening on port ' + PORT);
});
