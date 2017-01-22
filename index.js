'use strict';
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const morgan  = require('morgan')

/* APP CONFIGS */
let app = express();
app.use(morgan('dev'))
app.listen(8888);
const bodyParser = require('body-parser');
app.use(bodyParser.json()); // support JSON-encoded bodies
app.use(bodyParser.urlencoded({ // support URL-encoded bodies
  extended: true
}));

let db = new sqlite3.cached.Database('./db.sqlite3');
let onlineUsers = [];

app.get('/', (req, res) => {
    res.send({
        online_users: onlineUsers.length
    });
});

/**
 * /scores route has no restrictions.
 * Anyone can see scores.
 */
app.get('/scores', (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods","GET");

    let response = [];
    db.each('SELECT * from users ORDER BY highscore DESC', (err, row) => response.push(row), () => {
        console.log('inside', response)
        res.send(response);
    });
    console.log(response)
});

app.post('/score', (req, res) => {
    if (!req.body.username || !req.body.highscore) res.status(403).end('Invalid parameters');
    let found = onlineUsers.find(user => {
        if (user.ip !== req.ip) return;
        // TODO: add authorization needed to add score
        // if (!isAuthorizedUser(user.ip, req.body.token)) return;
        addScore(req.body,() => {
            res.status(200).end('Score added!');
        }, err => res.status(500).end('There was an error!'));
        return true;
    })
    
    if (!found) res.status(403).end('No matching IP and unique token');
});

app.post('/session', (req, res) => {
    const userIp = req.ip;
    const usertoken = generateKey();

    let found = onlineUsers.find(user => {
        if (user.ip !== userIp) return;
        user.token = usertoken;
        return true;
    });

    if (!found) onlineUsers.push({ip: userIp, token: usertoken});
    res.header('token', usertoken).send();
});

app.delete('/session', (req, res) => {
    if (!req || !req.body || !req.body.token) res.status(400).end({token:'invalid'});
    
    const deleted = onlineUsers.find((user, index) => {
        if (user.ip !== req.ip) return;
        let isAuthorized = isAuthorizedUser(user.id, req.body.token);
        if (!isAuthorized) return;
        onlineUsers.splice(index, 1);
        return true;
    });

    (!!deleted) ? res.status(200).send({deleted:true}) : res.status(404).send({deleted:false});
});

function generateKey() {
    let sha = crypto.createHash('sha256');
    sha.update(Math.random().toString());
    return sha.digest('hex');
};

/**
 * Search all online users if those credentials belong to any of them.
 * @returns {undefined|integer} Undefined for non found user, or the index of user in "onlineUsers"
 */
function isAuthorizedUser(id, token) {
    let is = onlineUsers.find(user => user.id === id && user.token === token);
    return (!!is);
}

function addScore(data, cb) {
    db.serialize(() => {
        db.run('INSERT INTO users(username, highscore) VALUES (?,?)',[data.username, data.highscore]);
        cb();
    });
}
