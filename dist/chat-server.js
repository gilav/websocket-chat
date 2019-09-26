"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const socketIo = require("socket.io");
const http_1 = require("http");
const gravatar = require("gravatar");
const crypto = require("crypto");
class ChatServer {
    constructor() {
        this.sysIcon = gravatar.url('', { s: '140', r: 'x', d: 'retro' });
        // map of AV status: enables, disabled
        this.peoplesAvAvailableMap = new Map();
        this.peoplesAvDisabledMap = new Map();
        this.DEBUG = true;
        console.log('VERSION 00-05');
        this.createApp();
        this.config();
        this.createServer();
        this.sockets();
        this.listen();
    }
    listen() {
        this.server.listen(this.port, () => {
            console.log('Running server on port %s', this.port);
        });
        this.io.on('connection', socket => {
            let address = socket.handshake.address;
            console.log('>>>>got websocket connection: id=' + socket.id + 'from:' + address);
            socket.on('load', function (data) {
                if (this.DEBUG) {
                    console.log('\n >load on socket:' + socket.id + '; data=' + data + '; socket room=' + socket.room);
                }
                this.handleLoad(socket, data);
            }.bind(this));
            socket.on('login', function (data) {
                if (this.DEBUG) {
                    console.log('\n >login on socket:' + socket.id + '; data=' + data + '; socket room=' + socket.room);
                }
                this.handleLogin(socket, data);
            }.bind(this));
            socket.on('disconnect', function (data) {
                if (this.DEBUG) {
                    console.log('\n >disconnect on socket:' + socket.id + '; data=' + data + '; socket room=' + socket.room);
                }
                this.handleDisconnect(socket, data);
            }.bind(this));
            socket.on('msg', function (data) {
                console.log('\n msg; data=' + data + '; room=' + socket.room + "; from user:'" + this.username + "'");
                // When the server receives a message, it sends it to the other person in the room.
                if (this.DEBUG) {
                    console.log('\n >msg on socket:' + socket.id + '; will emit receive');
                }
                if (data.system) {
                    console.log('\n >msg on socket:' + socket.id + '; is a system message');
                }
                else {
                    socket.broadcast.to(socket.room).emit('receive', { msg: data.msg, user: data.user, img: data.img });
                }
            });
            socket.on('sys', function (data) {
                console.log('\n sys msg; data=' + data + '; room=' + socket.room + "; from user:'" + data.user + "'");
                console.log('  sys msg of type:' + data.type);
                if (data.type == 'avEnabled') {
                    // enabled/disabled by user
                    console.log(' >>> avEnabled ' + data.value + ' for users:' + data.users);
                    this.peoplesAvDisabledMap.set(data.users, data.value);
                    console.log(' ########## this.peoplesAvDisabledMap:');
                    console.dir(this.peoplesAvDisabledMap);
                    socket.emit('sys', data);
                    socket.broadcast.to(socket.room).emit('sys', data);
                }
                else if (data.type == 'avAvailable') {
                    // camera/mic available
                    console.log('  >>> avAvailable ' + data.value + ' for user:' + data.user);
                    // update map
                    this.peoplesAvAvailableMap.set(data.user, data.value);
                    console.log(' ###################### this.peoplesAvAvailableMap:');
                    console.dir(this.peoplesAvAvailableMap);
                    socket.emit('sys', data);
                    socket.broadcast.to(socket.room).emit('sys', data);
                }
                else if (data.type == 'initiateVideoChat') {
                    console.log('  >>> initiateVideoChat; sender=' + data.sender + '; receiver=' + data.receiver);
                    // emit to the caller (sender) itself, will show the video panel
                    socket.emit('sys', data);
                    let destSocket = this.getSocketFromUsername(socket.room, data.receiver);
                    console.log('  >>> initiateVideoChat; destSocket=' + destSocket + '; socket.username:' + destSocket.username);
                    // emit to the destination (receiver), will have to accepr/reject the call
                    destSocket.emit('sys', {
                        type: 'askVideoChat',
                        sender: data.sender,
                        img: data.img,
                        avSessionKey: data.avSessionKey,
                    });
                }
                else if (data.type == 'acceptVideoChat') {
                    // receiver has accepted the call
                    console.log('  >>> acceptVideoChat; sender=' + data.sender + '; receiver=' + data.receiver);
                    let destSocket = this.getSocketFromUsername(socket.room, data.sender);
                    console.log('  acceptVideoChat; destSocket=' + destSocket + '; socket.username:' + destSocket.username);
                    // emit to the sender
                    destSocket.emit('sys', {
                        type: 'acceptVideoChat',
                        receiver: data.receiver,
                        img: data.img,
                        avSessionKey: data.avSessionKey,
                    });
                }
                else if (data.type == 'rejectVideoChat') {
                    // receiver has rejected the call
                    console.log('  >>> rejectVideoChat; sender=' + data.sender + '; receiver=' + data.receiver);
                    let destSocket = this.getSocketFromUsername(socket.room, data.sender);
                    console.log('  rejectVideoChat; destSocket=' + destSocket + '; socket.username:' + destSocket.username);
                    // emit to the destination
                    destSocket.emit('sys', {
                        type: 'rejectVideoChat',
                        receiver: data.receiver,
                        img: data.img,
                        avSessionKey: data.avSessionKey,
                    });
                }
                else if (data.type == 'closeVideoChat') {
                    console.log('  >>> closeVideoChat; receiver=' + data.receiver); // whom will receive the close signel
                    let destSocket = this.getSocketFromUsername(socket.room, data.receiver);
                    console.log('  closeVideoChat; destSocket=' + destSocket + '; socket.username:' + destSocket.username);
                    // emit to the destination
                    destSocket.emit('sys', {
                        type: 'closeVideoChat',
                        receiver: data.receiver,
                        img: data.img,
                        avSessionKey: data.avSessionKey,
                    });
                }
                else {
                    console.log('  warning: sys msg with unknown type!');
                }
            }.bind(this));
        });
    }
    sockets() {
        this.io = socketIo(this.server);
    }
    createApp() {
        this.app = express();
    }
    config() {
        this.port = process.env.PORT || ChatServer.PORT;
    }
    createServer() {
        this.server = http_1.createServer(this.app);
    }
    getApp() {
        return this.app;
    }
    //
    // on the socket.load event.
    // when the chat page is loaded
    // - will emit 'peopleinchat' or 'tooMany' message
    //
    handleLoad(socket, data) {
        if (this.DEBUG) {
            console.log(' !! handleLoad; socket id:' + socket.id + '; socket room:' + socket.room + '; data:' + data);
        }
        //
        let socketsInRoom = this.getConnectedSocketInRoom(data);
        //
        // emit the 'peopleinchat' + info. If room not full
        if (socketsInRoom.length === 0) {
            if (this.DEBUG) {
                console.log(' <handleLoad.emit peopleinchat:0');
            }
            socket.emit('peopleinchat', { number: 0 });
        }
        else if (socketsInRoom.length === 1) {
            if (this.DEBUG) {
                console.log(' <handleLoad.emit peopleinchat:1');
            }
            socket.emit('peopleinchat', {
                number: 1,
                user: socketsInRoom[0].username,
                avatar: socketsInRoom[0].avatar,
                id: data,
            });
        }
        else if (socketsInRoom.length > 1 && socketsInRoom.length < 10) {
            // get list of username of people in room
            let usernames = [];
            let avatars = [];
            let n = 0;
            for (let item in socketsInRoom) {
                usernames.push(socketsInRoom[item].username);
                if (this.DEBUG) {
                    console.log('user[' + n + '] username=' + socketsInRoom[item].username);
                }
                avatars.push(socketsInRoom[item].avatars);
                if (this.DEBUG) {
                    console.log('user[' + n + '] avatar=' + socketsInRoom[item].avatar);
                }
                n = n + 1;
            }
            // emit peopleinchat with list of usernames and avatars
            if (this.DEBUG) {
                console.log(' <handleLoad.emit peopleinchat for ' + socketsInRoom.length + ' person');
            }
            socket.emit('peopleinchat', {
                number: socketsInRoom.length,
                users: usernames,
                avatars: avatars,
                id: data,
            });
        }
        else if (socketsInRoom.length >= 10) {
            console.log(' <handleLoad.emit tooMany:' + socketsInRoom.length);
            socket.emit('tooMany', { boolean: true });
        }
    }
    // on the socket.login event.
    // when the people submit the chat page login
    // - save his name and avatar,
    // - join to the room
    // - will emit:
    //      reveive broadcast to others
    //      peoplesList to itself + broadcast to others
    handleLogin(socket, data) {
        console.log(' !! handleLogin; socket id:' + socket.id + '; socket room:' + socket.room + '; data:' + data);
        if (socket.room != undefined) {
            console.log('  login; already done; return');
            return;
        }
        // find people in room
        //
        const socketsInRoom = this.getConnectedSocketInRoom(data.id);
        if (this.DEBUG) {
            console.log('  login; found socketsInRoom=' + socketsInRoom + '; length=' + socketsInRoom.length);
        }
        // Only 10 people per room are allowed
        if (socketsInRoom.length > 10) {
            console.log(' <handleLogin.emit tooMany');
            socket.emit('tooMany', { boolean: true });
        }
        else if (socketsInRoom.length <= 10) {
            // Use the socket object to store data. Each client gets
            // their own unique socket object
            socket.username = data.user;
            socket.room = data.id;
            socket.avatar = gravatar.url(data.avatar, { s: '140', r: 'x', d: 'identicon' });
            // let identiconHash: string = this.getIdenticonUrl(data.avatar);
            // console.log(" #### identiconHash of "+data.avatar+" is:"+identiconHash);
            // Tell the person what he should use for an avatar
            socket.emit('img', socket.avatar);
            // start chat for this user
            console.log(' <handleLogin.emit startChat');
            socket.emit('startChat', {
                boolean: false,
                id: data.id,
                users: data.user,
                avatars: socket.avatar,
            });
            // send the list of all people inside, and the list of other users to newly logged in
            let n = 0;
            const usersOnline = [];
            let present = 0;
            for (let item in socketsInRoom) {
                usersOnline.push(socketsInRoom[item].username);
                if (socketsInRoom[item].username != socket.username) {
                    if (this.DEBUG) {
                        console.log(' <handleLogin.emit receive[' +
                            n +
                            '] to ' +
                            socket.username +
                            ' with present user:' +
                            socketsInRoom[item].username);
                    }
                    present += 1;
                    socket.emit('receive', {
                        msg: 'Already present',
                        user: socketsInRoom[item].username,
                        img: socketsInRoom[item].avatar,
                        font: 'bold',
                    });
                }
                n = n + 1;
            }
            if (present == 0) {
                console.log(' <handleLogin.emit There are no other people in this chat!');
                socket.emit('receive', {
                    msg: 'There are no other people in this chat!',
                    user: 'System',
                    img: this.sysIcon,
                    font: 'bold',
                });
            }
            usersOnline.push(socket.username);
            usersOnline.sort();
            // bradcast join to everybody
            console.log(' <handleLogin.emit receive xxx Has joined the room');
            socket
                .in(data.id)
                .emit('receive', { msg: 'Has joined the room', user: data.user, img: socket.avatar, font: 'bold' });
            // Add the client to the room
            socket.join(data.id);
            // update the av maps
            let avPossibleList = this.updateAvMaps(socketsInRoom);
            console.log(' ############################ updateAvMaps returns:' + avPossibleList + '; length:' + avPossibleList.length);
            // bradcast usersOnline to everybody
            console.log(' <handleLogin.emit peoplesList usersOnline=' + usersOnline + '; length usersOnline=' + usersOnline.length);
            socket.emit('peoplesList', { users: usersOnline, avPossible: avPossibleList });
            socket.broadcast.to(socket.room).emit('peoplesList', { users: usersOnline, avPossible: avPossibleList });
            // what about the AV enabled map??
            console.log(' ## at login time of ' + data.user + '; peoplesAvAvailableMap:');
            console.dir(this.peoplesAvAvailableMap);
        }
    }
    // on the socket.disconnect event.
    // when the people leave the chat page
    // - leave the room
    // - will emit 'peoplesList' to others
    handleDisconnect(socket, data) {
        console.log(' !! handleDisconnect; socket id:' + socket.id + '; socket room:' + socket.room + '; data:' + data);
        // Notify the other persons in the chat room
        // that this person has left
        if (this.DEBUG) {
            console.log(' handleDisconnect.broadcast: emit leave message for user=' + socket.username);
        }
        socket.broadcast
            .to(socket.room)
            .emit('receive', { msg: 'Has left the room', user: socket.username, img: socket.avatar, font: 'bold' });
        // find socket in room
        //
        let socketsInRoom = this.getConnectedSocketInRoom(socket.room);
        if (this.DEBUG) {
            console.log('  login; found socketsInRoom=' + socketsInRoom + '; length=' + socketsInRoom.length);
        }
        // and get peoples
        let n = 0;
        let usersOnline = [];
        let present = 0;
        for (let item in socketsInRoom) {
            console.log(' @@@@@ disconnect.broadcast: test user[' + n + ']=' + socketsInRoom[item]);
            if (socketsInRoom[item].username != socket.username) {
                usersOnline.push(socketsInRoom[item].username);
                present += 1;
            }
            n = n + 1;
        }
        // leave the room
        socket.leave(socket.room);
        // update the av maps
        let avPossibleList = this.updateAvMaps(socketsInRoom);
        console.log(' ############################ updateAvMaps returns:' + avPossibleList + '; length:' + avPossibleList.length);
        // bradcast usersOnline to everybody
        console.log(' <handleDisconnect.emit peoplesList usersOnline');
        socket.broadcast.to(socket.room).emit('peoplesList', { users: usersOnline, avPossible: avPossibleList });
    }
    //
    // get the list of socket connected to this room
    getConnectedSocketInRoom(roomId) {
        console.log(' getConnectedIdsInRoom: roomId:' + roomId);
        let roomConnectedSockets = [];
        let namespace = this.io.of('/'); // the default namespace is "/chat"
        console.log('  getConnectedIdsInRoom: namespace:' + namespace);
        console.log('  getConnectedIdsInRoom: namespace type:' + namespace.constructor.name);
        if (namespace) {
            let n = 0;
            for (let id in namespace.connected) {
                console.log('  getConnectedIdsInRoom: test connected[' + n + ']; id:' + id);
                console.log(' ######### namespace.connected[id].rooms=' +
                    namespace.connected[id].rooms +
                    ' type:' +
                    namespace.connected[id].rooms.constructor.name);
                if (roomId) {
                    let aSocket = namespace.connected[id];
                    // console.log('    getConnectedIdsInRoom: namespace.connected[id]='+namespace.connected[id]+'; type:'+namespace.connected[id].constructor.name);
                    // console.log('    getConnectedIdsInRoom: index='+index.constructor.name);
                    console.log('    getConnectedIdsInRoom: aSocket[' + n + ']=' + aSocket.constructor.name);
                    console.log('    getConnectedIdsInRoom: aSocket[' + n + '].roomId=' + aSocket.roomId);
                    console.log('    getConnectedIdsInRoom: aSocket[' + n + '].room=' + aSocket.room);
                    if (aSocket.room && aSocket.room == roomId) {
                        console.log('    getConnectedIdsInRoom: connected[' + n + '] found in room:' + roomId);
                        roomConnectedSockets.push(aSocket);
                    }
                    else {
                        console.log('    getConnectedIdsInRoom: connected[' + n + '] not in room');
                    }
                }
                n = n + 1;
            }
            if (n == 0) {
                console.log('  getConnectedIdsInRoom: nobody connected to this namespace room');
            }
            else {
                console.log('  getConnectedIdsInRoom: ' + roomConnectedSockets.length + ' people(s) connected to this namespace room');
                n = 0;
                console.log('  getConnectedIdsInRoom result:');
                for (let item in roomConnectedSockets) {
                    console.log('    room connected id[' + n + ']:' + item.constructor.name);
                    n = n + 1;
                }
            }
        }
        else {
            console.log('  getConnectedIdsInRoom: no namespace?');
        }
        return roomConnectedSockets;
    }
    //
    // get the socket from user name
    getSocketFromUsername(roomId, name) {
        console.log(' getSocketFromUsername: name:' + name);
        let aSocket = undefined;
        let namespace = this.io.of('/'); // the default namespace is "/chat"
        console.log('  getSocketFromUsername: namespace:' + namespace);
        if (namespace) {
            let n = 0;
            for (let id in namespace.connected) {
                console.log('  getSocketFromUsername: test connected[' + n + ']; id:' + id);
                console.log(' ######### namespace.connected[id].rooms=' +
                    namespace.connected[id].rooms +
                    ' type:' +
                    namespace.connected[id].rooms.constructor.name);
                if (roomId) {
                    aSocket = namespace.connected[id];
                    console.log('    getSocketFromUsername: aSocket[' + n + '].username=' + aSocket.username);
                    if (aSocket.username == name) {
                        console.log('    getSocketFromUsername: connected[' + n + '] socket found ');
                        break;
                    }
                }
                n = n + 1;
            }
        }
        else {
            console.log('  getSocketFromUsername: no namespace?');
        }
        return aSocket;
    }
    // build gravatar identicon hash
    getIdenticonUrl(email) {
        email = email.trim().toLowerCase();
        let hash = crypto
            .createHash('md5')
            .update(email)
            .digest('hex');
        return hash;
    }
    //
    updateAvMaps(peoplesSocket) {
        // console.log(" ## updateAvMaps with peoples socket:"+peoplesSocket+"; length:"+peoplesSocket.length);
        let n = 0;
        let thePeoples = [];
        peoplesSocket.forEach(function (value) {
            console.log('  ## updateAvMaps; peoples[' + n + ']:' + value.username);
            thePeoples.push(value.username);
            n++;
        });
        console.log(' ## updateAvMaps; peoplesAvAvailableMap before:');
        console.dir(this.peoplesAvAvailableMap);
        // the final map of peoples with AV available and enable
        let avPossibleList = [];
        let theKeys = Array.from(this.peoplesAvAvailableMap.keys());
        theKeys.forEach(function (value) {
            if (thePeoples.includes(value)) {
                avPossibleList.push(value);
            }
            else {
                this.peoplesAvAvailableMap.delete(value);
            }
        }.bind(this));
        console.log(' ## updateAvMaps; peoplesAvAvailableMap after:');
        console.dir(this.peoplesAvAvailableMap);
        theKeys = Array.from(this.peoplesAvDisabledMap.keys());
        theKeys.forEach(function (value) {
            if (thePeoples.includes(value)) {
                if (this.peoplesAvDisabledMap.get(value) == false) {
                    const index = avPossibleList.indexOf(value, 0);
                    if (index > -1) {
                        avPossibleList.splice(index, 1);
                    }
                }
                else {
                    console.dir(' ## updateAvMaps; test add to avPossibleList step 2: dont remove because enabled:' + value);
                }
            }
            else {
                this.peoplesAvDisabledMap.delete(value);
            }
        }.bind(this));
        console.log(' ## updateAvMaps; peoplesAvDisabledMap after:');
        console.dir(this.peoplesAvDisabledMap);
        console.log(' ## updateAvMaps; avPossibleList:');
        console.dir(avPossibleList);
        return avPossibleList;
    }
}
exports.ChatServer = ChatServer;
ChatServer.PORT = 5000;
//# sourceMappingURL=chat-server.js.map