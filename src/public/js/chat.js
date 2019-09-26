// This file is executed in the browser, when people visit /chat/<random id>

console.log('VERSION 00-05');

//
var DEBUG = true;

//
var tickCount = 0;

// getting the id of the room from the url
var id = Number(window.location.pathname.match(/\/chat\/(\d+)$/)[1]);

//
var WebRTC_SERVER = 'https://appr.tc/r/';
var TEST_MODE = false;
var TEST_MODE_START_WebRTC = false;

// status of the video chat
const avNoting = -1;
const avInitiated = 1;
const avAcknoledged = 2;
const avRejected = 3;
const avActive = 4;
const avClosing = 5;
const avClosed = 6;
const avTimeout = 10;
// config for the audio video stream
const mediaconf = { audio: true, video: true };
var avStream = undefined;
var avAvailable = true;
var avDisabled = false;
var avSessionState = avNoting; // -1: nothing; 1:initiated; 2:acknoledged; 3:rejected; 4:active; 5:closing; 6:closed; 10:timeout
var avSessionTimeout = -1;
var avSessionKey = undefined;
var avSessionActiveTime = -1;
var timeoutLimit = 30;
var avSessionCaller = undefined;
var avDestinationPeople = undefined;

//
detectWebRtcSupport();

// connect to the socket, namespace is 'chat'
console.log(' will get io');
var socket = io('/');
//var socket = undefined;
console.log('  -> got io');

// variables which hold the data for each person
var name = '',
  email = '',
  img = '',
  friend = '',
  otherPeoples = [],
  newMessages = 0,
  hasFocus = false,
  origTitle = '';

// cache some jQuery objects
var section = $('.section'),
  banner = $('.banner'),
  usersOnline = $('#users_online'),
  usersList = $('#users_list'),
  noAvCheckbox = $('#noAvCheckbox'),
  noAvSpan = $('#noAvSpan'),
  avVideo = $('#avVideo'),
  avIcon = $('#avIcon'),
  avScreen = $('#avScreen'),
  videoImg = $('#videoImg'),
  avControl = $('#avControl'),
  answerImg = $('#answerImg'),
  declineImg = $('#declineImg'),
  avMessage = $('#avMessage'),
  footer = $('#footer'),
  toast = $('#toast'),
  connectForm = $('.connected'),
  inviteSomebody = $('.inviteSomebody'),
  personInside = $('.personInside'),
  chatScreen = $('.chatScreen'),
  tooManyPeople = $('.tooManyPeople');

// some more jquery objects
var bannertext = $('.bannertext'),
  chatNickname = $('.nickname-chat'),
  loginForm = $('.loginForm'),
  yourName = $('#yourName'),
  yourEmail = $('#yourEmail'),
  hisName = $('#hisName'),
  hisEmail = $('#hisEmail'),
  chatForm = $('#chatform'),
  messageInput = $('#messageInput'),
  messageTimeSent = $('.timesent'),
  chats = $('.chats');

// these variables hold images
var ownerImage = $('#ownerImage'),
  noMessagesImage = $('#noMessagesImage');

// test if the audio/video is available
getCameraStream();

// when user enable/disable the AV. checked is disabled
function onChangeAvCheckbox(checkbox) {
  if (checkbox.checked) {
    console.log('AV disabled');
    // Send the message to the other person in the chat
    socket.emit('sys', { type: 'avEnabled', value: false, user: name, img: img });
  } else {
    console.log('AV enabled');
    // Send the message to the other person in the chat
    socket.emit('sys', { type: 'avEnabled', value: true, user: name, img: img });
  }
}

// will start a video chat with user xxx
// called from propleImg onclick
function startVideoChat(peopleImg) {
  console.log('startVideoChat with: ' + peopleImg.getAttribute('user') + '; avSessionKey=' + avSessionKey);
  if (avDisabled) {
    alert('Your AV is disabled, so you can not initiate a video session, sorry...');
    return;
  }
  if (!avAvailable) {
    alert('Your AV is not available , so you can not initiate a video session, sorry...');
    return;
  }
  var destPeople = peopleImg.getAttribute('user');
  if (destPeople == name) {
    banner.notify('Cannot video chat with yourself !', 'error');
  } else {
    avSessionKey = 'glAvChat_' + Math.round(Math.random() * 1000);
    console.log('### avSessionKey=' + avSessionKey);
    socket.emit('sys', {
      type: 'initiateVideoChat',
      sender: name,
      receiver: destPeople,
      img: img,
      avSessionKey: avSessionKey,
    });
  }
}

// called by ws callback, when I initiate a video chat
function initiateVideoChat(destPeople, img) {
  console.log('startVideoChat with: ' + destPeople);
  avSessionCaller = true;
  startAvSession(destPeople);
}

// called by ws callback, when someone initiate a video chat with me
function askVideoChat(destPeople, img, avKey) {
  avSessionKey = avKey;
  console.log('askVideoChat from: ' + destPeople + '; avSessionKey=' + avSessionKey);
  avSessionCaller = false;
  avDestinationPeople = destPeople;
  startAvSession(destPeople);
}

// called by ws callback, when someone accept a video chat with me
function acceptVideoChat(destPeople, img) {
  console.log('acceptVideoChat from: ' + destPeople + '; avSessionKey=' + avSessionKey);
  avSessionState = avActive;
  startLocalVideo();
}

// called by ws callback, when someone reject a video chat with me
function rejectVideoChat(destPeople, img) {
  console.log('rejectVideoChat from: ' + destPeople + '; avSessionKey=' + avSessionKey);
  avSessionState = avRejected;
}

// beep sound and play method
var snd = new Audio(
  'data:audio/wav;base64,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qJrx4KOQjahZxWbcZgztj2c49nKmkId44S71j0c8eV9yDK6uPRzx5X18eDvjvQ6yKo9ZSS6l//8elePK/Lf//IInrOF/FvDoADYAGBMGb7FtErm5MXMlmPAJQVgWta7Zx2go+8xJ0UiCb8LHHdftWyLJE0QIAIsI+UbXu67dZMjmgDGCGl1H+vpF4NSDckSIkk7Vd+sxEhBQMRU8j/12UIRhzSaUdQ+rQU5kGeFxm+hb1oh6pWWmv3uvmReDl0UnvtapVaIzo1jZbf/pD6ElLqSX+rUmOQNpJFa/r+sa4e/pBlAABoAAAAA3CUgShLdGIxsY7AUABPRrgCABdDuQ5GC7DqPQCgbbJUAoRSUj+NIEig0YfyWUho1VBBBA//uQZB4ABZx5zfMakeAAAAmwAAAAF5F3P0w9GtAAACfAAAAAwLhMDmAYWMgVEG1U0FIGCBgXBXAtfMH10000EEEEEECUBYln03TTTdNBDZopopYvrTTdNa325mImNg3TTPV9q3pmY0xoO6bv3r00y+IDGid/9aaaZTGMuj9mpu9Mpio1dXrr5HERTZSmqU36A3CumzN/9Robv/Xx4v9ijkSRSNLQhAWumap82WRSBUqXStV/YcS+XVLnSS+WLDroqArFkMEsAS+eWmrUzrO0oEmE40RlMZ5+ODIkAyKAGUwZ3mVKmcamcJnMW26MRPgUw6j+LkhyHGVGYjSUUKNpuJUQoOIAyDvEyG8S5yfK6dhZc0Tx1KI/gviKL6qvvFs1+bWtaz58uUNnryq6kt5RzOCkPWlVqVX2a/EEBUdU1KrXLf40GoiiFXK///qpoiDXrOgqDR38JB0bw7SoL+ZB9o1RCkQjQ2CBYZKd/+VJxZRRZlqSkKiws0WFxUyCwsKiMy7hUVFhIaCrNQsKkTIsLivwKKigsj8XYlwt/WKi2N4d//uQRCSAAjURNIHpMZBGYiaQPSYyAAABLAAAAAAAACWAAAAApUF/Mg+0aohSIRobBAsMlO//Kk4soosy1JSFRYWaLC4qZBYWFRGZdwqKiwkNBVmoWFSJkWFxX4FFRQWR+LsS4W/rFRb/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////VEFHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAU291bmRib3kuZGUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMjAwNGh0dHA6Ly93d3cuc291bmRib3kuZGUAAAAAAAAAACU=',
);
function beep() {
  // In browsers that don’t yet support this functionality,
  // playPromise won’t be defined.
  var playPromise = snd.play();
  if (playPromise !== undefined) {
    playPromise
      .then(function() {
        // Automatic playback started!
        if (DEBUG) {
          console.log(' audio automatic play started');
        }
      })
      .catch(function(error) {
        // Automatic playback failed.
        // Show a UI element to let the user manually start playback.
        console.log(' audio automatic play disabled');
      });
  }
}

// on socket error
socket.on('error', function(err) {
  console.log('Socket Error: ' + err.message);
});

// on connection to server get the id of person's room
socket.on('connect', function() {
  if (DEBUG) {
    console.log(' connected; clear messages area');
  }
  banner.notify('Connected', 'info');
  chats.empty();
  socket.emit('load', id);
});

// on disconnect from server
socket.on('disconnect', function() {
  if (DEBUG) {
    console.log(' disconnect');
  }
  banner.notify('Disonnected', 'info');
});

// save the gravatar url
socket.on('img', function(data) {
  img = data;
});

// receive the names and avatars of all people in the chat room
// when the
socket.on('peopleinchat', function(data) {
  if (DEBUG) {
    console.log("socket.on 'peopleinchat';  number other peoples=" + data.number);
  }

  if (data.number == 0) {
    if (DEBUG) {
      console.log("  socket.on 'peopleinchat'; number other peoples 0 case");
    }
    handleStatusChange('alone');

    loginForm.on('submit', function(e) {
      console.log('loginForm submit pressed');

      e.preventDefault();

      name = $.trim(yourName.val());

      if (name.length < 1) {
        alert('Please enter a nick name longer than 1 character!');
        return;
      }

      email = yourEmail.val();

      if (!isValid(email)) {
        alert('Please enter a valid email!');
      } else {
        bannertext.text("Chat room, logged in as '" + name + "'");
        setTitle("Chat room, as '" + name + "'");
        if (DEBUG) {
          console.log('  @@@@@@@@@@@@@@@@@@@@@@@@@ 0 bannertext.text set to:' + name);
        }

        // call the server-side function 'login' and send user's parameters
        socket.emit('login', { user: name, avatar: email, id: id });
      }
    });
  } else if (data.number == 1) {
    if (DEBUG) {
      console.log("  socket.on 'peopleinchat'; data.number 1 case");
    }
    handleStatusChange('personinchat', data);

    loginForm.on('submit', function(e) {
      e.preventDefault();

      name = $.trim(hisName.val());

      if (name.length < 1) {
        alert('Please enter a nick name longer than 1 character!');
        return;
      }

      if (name == data.user) {
        alert('There already is a "' + name + '" in this room!');
        return;
      }
      email = hisEmail.val();

      if (!isValid(email)) {
        alert('Wrong e-mail format!');
      } else {
        bannertext.text("Chat room, logged in as '" + name + "'");
        setTitle("Chat room, as '" + name + "'");
        if (DEBUG) {
          console.log('  @@@@@@@@@@@@@@@@@@@@@@@@@  1 bannertext.text set to:' + name);
        }
        socket.emit('login', { user: name, avatar: email, id: id });
      }
    });
  } else if (data.number > 1 && data.number < 10) {
    if (DEBUG) {
      console.log("  socket.on 'peopleinchat'; data.number >1 && < 10 case");
    }
    handleStatusChange('personsinchat', data);

    loginForm.on('submit', function(e) {
      e.preventDefault();

      name = $.trim(hisName.val());

      if (name.length < 1) {
        alert('Please enter a nick name longer than 1 character!');
        return;
      }

      if (name == data.user) {
        alert('There already is a "' + name + '" in this room!');
        return;
      }
      email = hisEmail.val();

      if (!isValid(email)) {
        alert('Wrong e-mail format!');
      } else {
        bannertext.text("Chat room, logged in as '" + name + "'");
        setTitle("Chat room, as '" + name + "'");
        if (DEBUG) {
          console.log('  @@@@@@@@@@@@@@@@@@@@@@@@@  2 bannertext.text set to:' + name);
        }
        socket.emit('login', { user: name, avatar: email, id: id });
      }
    });
  } else if (data.number >= 10) {
    if (DEBUG) {
      console.log("  socket.on 'peopleinchat'; tooManyPeople case");
    }
    handleStatusChange('tooManyPeople');
  } else {
    if (DEBUG) {
      console.log("  socket.on 'peopleinchat'; impossible case");
    }
    handleStatusChange('impossible case');
  }
});

//
socket.on('startChat', function(data) {
  banner.notify('Chat started', 'info');
  if (DEBUG) {
    console.log("socket.on 'startChat'");
  }
  if (!data.boolean) {
    // set to false when there is a problem
    if (DEBUG) {
      console.log("socket.on 'startChat' ###################### data.boolean:" + data.boolean);
    }
    console.log("socket.on 'startChat'; data.id=" + data.id + '; data.users.length=' + data.users.length);
    if (data.id == id) {
      chats.empty();
      handleStatusChange('chatStarted');
      // tell my AV capability
      socket.emit('sys', { type: 'avAvailable', value: avAvailable, user: name, avatar: data.avatar });
    }
  } else {
    if (DEBUG) {
      console.log("socket.on 'startChat' ###################### data.boolean:" + data.boolean);
    }
    //handleStatusChange('chatStarted');
  }
});

//
socket.on('tooMany', function(data) {
  if (DEBUG) {
    console.log(
      "socket.on 'tooMany'; name='" + name + "'; name.length=" + name.length + '; data.boolean=' + data.boolean,
    );
  }
  handleStatusChange('tooManyPeople');
});

// get list of peoples
socket.on('peoplesList', function(data) {
  if (DEBUG) {
    console.log("socket.on 'peoplesList'; data.users=" + data.users + '; avPossibleList:' + data.avPossible);
    console.dir(data);
  }
  if (data.users.length == 0) {
    //usersOnline.text("Online: nobody");
    usersList.html('<li>nobody</li>');
  } else {
    var n = 0;
    var allUsers = '';
    var allLi = '';
    for (item in data.users) {
      if (DEBUG) {
        console.log('  peoplesList one user[' + n + ']=' + data.users[item]);
      }
      if (allUsers.length > 0) {
        allUsers = allUsers + ', ';
      }
      allUsers = allUsers + data.users[item];
      if (data.users[item] in data.avPossible) {
        console.log('  @@@@ av possible for user:' + data.users[item]);
        allLi =
          allLi +
          '<li>' +
          data.users[item] +
          '&nbsp;<img src="/img/videoChat_small.png" id="avStartImg-' +
          data.users[item] +
          '" user="' +
          data.users[item] +
          '" title="Start video chat" onclick="startVideoChat(this)"></li>';
      } else {
        console.log('  @@@@ av not possible for user:' + data.users[item]);
        allLi =
          allLi +
          '<li>' +
          data.users[item] +
          '&nbsp;<img src="/img/noVideoChat_small.png" id="avStartImg-' +
          data.users[item] +
          '" user="' +
          data.users[item] +
          '" title="Start video chat" onclick="startVideoChat(this)"></li>';
      }
      n = n + 1;
    }
    //usersOnline.text("Online: "+allUsers);
    usersList.html(allLi);

    if (data.users.length == 1) {
      console.log('  peoplesList I am alone, should invite somebody...');
      handleStatusChange('inviteSomebody');
    }
  }
});

// receive people messages
socket.on('receive', function(data) {
  if (DEBUG) {
    console.log("socket.on 'receive'");
  }

  if (data.msg.trim().length) {
    checkUserhasLeft(data.msg, data.user);

    createChatMessage(data.msg, data.user, data.img, data.font, moment());
    scrollToBottom();
    newMessages += 1;
    increaseMsgCounterInTitle();
    beep();
  }
});

// receive  system messages
socket.on('sys', function(data) {
  if (DEBUG) {
    console.log("socket.on 'sys';  data=" + data);
    console.log('  sys msg of type:' + data.type);
  }
  if (data.type == 'avAvailable') {
    console.log('  avAvailable ' + data.value + ' for user:' + data.user);
    handleAvEnabledMsg(data.user, data.value);
  } else if (data.type == 'avEnabled') {
    console.log('  avEnabled ' + data.value + ' for user:' + data.user);
    handleAvEnabledMsg(data.user, data.value);
  } else if (data.type == 'initiateVideoChat') {
    // will show the video chat panel, and send video chat request to dest people
    initiateVideoChat(data.receiver, data.img);
  } else if (data.type == 'askVideoChat') {
    // some ask me to start a video chat
    askVideoChat(data.sender, data.img, data.avSessionKey);
  } else if (data.type == 'acceptVideoChat') {
    // dest people has accepted the video chat
    acceptVideoChat(data.receiver, data.img, data.avSessionKey);
  } else if (data.type == 'rejectVideoChat') {
    // dest people to rejected the video chat
    rejectVideoChat(data.receiver, data.img, data.avSessionKey);
  } else if (data.type == 'closeVideoChat') {
    stopAvSession();
  }
});

//

//
messageInput.keypress(function(e) {
  // Submit the form on enter

  if (e.which == 13) {
    e.preventDefault();
    chatForm.trigger('submit');
  }
});

//
chatForm.on('submit', function(e) {
  e.preventDefault();

  //var submit_type = document.getElementById('chatform');
  if (typeof e.explicitOriginalTarget != 'undefined') {
    //
    submitButton = e.explicitOriginalTarget;
  } else if (typeof document.activeElement.value != 'undefined') {
    // IE
    submitButton = document.activeElement;
  }
  console.log('submit button used:' + submitButton.value);

  if (submitButton.value == 'Clear') {
    console.log('clear chat');
    inviteSomebody.fadeOut();
    chats.empty();
  } else {
    if (messageInput.val().trim().length > 0) {
      console.log('submit button used; message=' + messageInput.val().trim());
      createChatMessage(messageInput.val(), name, img, undefined, moment());
      scrollToBottom();

      // Send the message to the other person in the chat
      socket.emit('msg', { msg: messageInput.val(), user: name, img: img });
    } else {
      console.log('submit button used empty message');
    }

    // Empty the textarea
    messageInput.val('');
  }
});

// Update the relative time stamps on the chat messages every minute
setInterval(function() {
  messageTimeSent.each(function() {
    var each = moment($(this).data('time'));
    $(this).text(each.fromNow());
  });
}, 60000);

// Function that creates a new chat message
function createChatMessage(msg, user, imgg, font, now) {
  if (DEBUG) {
    console.log('createChatMessage: user=' + user);
  }
  var who = '';

  if (user === name) {
    who = 'me';
  } else {
    who = 'you';
  }
  if (DEBUG) {
    console.log(' createChatMessage: who=' + who);
  }
  var li = $(
    '<li class=' +
      who +
      '>' +
      '<div class="image">' +
      '<img src=' +
      imgg +
      ' />' +
      '<b class="messageBox"></b>' +
      '<i class="timesent" data-time=' +
      now +
      '></i> ' +
      '</div>' +
      '<p></p>' +
      '</li>',
  );

  // use the 'text' method to escape malicious user input
  // if font used: set bold ( it is for join leave messages)
  if (font != undefined && font == 'bold') {
    li.find('p').css('font-weight', 'bold');
    li.find('p').text(msg);
  } else {
    li.find('p').text(msg);
  }
  li.find('b').text(user);

  chats.append(li);

  messageTimeSent = $('.timesent');
  messageTimeSent.last().text(now.fromNow());
}

//
function scrollToBottom() {
  $('html, body').animate({ scrollTop: $(document).height() - $(window).height() }, 250);
}

//
function isValid(thatemail) {
  var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(thatemail);
}

//
function setTitle(msg) {
  origTitle = msg;
  $(document).attr('title', msg);
}

//
function resetTitle() {
  $(document).attr('title', origTitle);
}

//
function increaseMsgCounterInTitle(num) {
  $(document).attr('title', '[+' + newMessages + '] ' + origTitle);
}

//
$(window).on('blur', function() {
  // do whatever you want
  console.log('  lost focus');
  hasFocus = false;
});
$(window).on('focus', function() {
  // do whatever you want
  console.log('  get focus');
  hasFocus = true;
  newMessages = 0;
  resetTitle();
});

// check that:
// user is in video chat
function checkUserhasLeft(msg, user) {
  if (msg == 'Has left the room') {
    if (user == avDestinationPeople) {
      stopAvSession();
    }
  }
}

/*
/ status sequence is:
/ - nothing
/ - first one connected: connected state -> will show login form
/ - 2ndt one connected: personinchat state -> will show chat with XXX  form
/ - 3rd+ one connected: personsinchat state -> will show chat with XXX/YYY/ZZZ  form
/ - chatStarted state -> hide faded in forms
*/
function handleStatusChange(status, data) {
  //if(DEBUG){
  console.log(" handleStatusChange status='" + status + "'; data=" + data);
  //}

  if (status === 'connected') {
    console.log('  --> connected');
    // show only the connect form
    section.children().css('display', 'none');
    //connectForm.fadeIn(800);
  } else if (status === 'alone') {
    console.log('  --> alone');
    footer.css('display', 'none');
    // show only the connect form
    section.children().css('display', 'none');
    connectForm.fadeIn(800);
  } else if (status === 'inviteSomebody') {
    if (DEBUG) {
      console.log('  --> inviteSomebody');
    }
    // Set the invite link content
    $('#link').text(window.location.href);

    //onConnect.fadeOut(400, function(){
    inviteSomebody.fadeIn(800);
    //});
  } else if (status === 'personinchat') {
    if (DEBUG) {
      console.log('  --> personinchat');
    }
    //connectForm.fadeOut(400, function(){
    //	personInside.fadeIn(1000);
    //});
    personInside.fadeIn(800);

    chatNickname.text(data.user);
    ownerImage.attr('src', data.avatar);
  } else if (status === 'personsinchat') {
    if (DEBUG) {
      console.log('  --> personsinchat');
    }
    //onConnect.css("display", "none");
    //connectForm.fadeOut(400, function(){
    personInside.fadeIn(800);
    //});

    if (data.users.length > 1) {
      if (DEBUG) {
        console.log('personsinchat several users=' + data.users.length);
      }
      var allUsers = '';
      var n = 0;
      for (item in data.users) {
        if (DEBUG) {
          console.log('  personsinchat one user[' + n + ']=' + data.users[item]);
        }
        if (allUsers.length > 0) {
          allUsers = allUsers + ', ';
        }
        allUsers = allUsers + data.users[item];
        n = n + 1;
      }
      if (DEBUG) {
        console.log("personsinchat allUsers in room ='" + allUsers + "'");
      }
      chatNickname.text(allUsers);
    } else {
      chatNickname.text(data.users[0]);
      ownerImage.attr('src', data.avatars[0]);
    }
  } else if (status === 'chatStarted') {
    if (DEBUG) {
      console.log('  --> chatStarted');
    }
    // fade out the connect form
    // show messages_container
    // show footer
    connectForm.fadeOut(200);
    personInside.fadeOut(200);
    section.css('display', 'block');
    chatScreen.css('display', 'block');
    //inviteSomebody,fadeout(400);
    footer.css('display', 'block');
  } else if (status === 'tooManyPeople') {
    // shows only the too many people
    console.log('  --> tooManyPeople');
    section.children().css('display', 'none');
    tooManyPeople.fadeIn(800);
  } else {
    console.log("  --> unknown status='" + status + "'");
  }
}

// handle the system type 'av' messages
// set video/noVideo icon on involved user
function handleAvEnabledMsg(user, avEnabled) {
  var key = '#avStartImg-' + user;
  console.log(" ############# handleAvEnabledMsg img id to change:'" + key + "'");
  var theImg = usersList.find(key);
  console.log(' ############# theImg:' + theImg);
  console.log(' ############# theImg.length:' + theImg.length);
  if (theImg.length == 1) {
    console.log(' ############# theImg constructor name:' + theImg[0].constructor.name);
    if (avEnabled) {
      theImg[0].src = '/img/videoChat_small.png';
    } else {
      theImg[0].src = '/img/noVideoChat_small.png';
    }
  }
}

//
// check is audio and video are available
//
function setAvStream(avStream) {
  if (avStream == undefined) {
    console.log(' checkAv: !! no AV stream available.');
    if (!TEST_MODE) {
      avAvailable = false;
      setAvEnabledVisible(false);
    } else {
      console.log(' checkAv: run in TEST_MODE, simulate AV is available');
    }
    avIcon.attr('title', 'Not audio/video capable!');
  } else {
    console.log('  checkAv: AV stream available.');
    console.log('  checkAv: avStream constructor name:' + avStream.constructor.name);
    console.log('  checkAv: dir stream:');
    var n = 0;
    for (var item in avStream) {
      console.log('    dir[' + n + ']:' + item);
      n++;
    }
    avAvailable = true;
    setAvEnabledVisible(true);
    avIcon.attr('src', '/img/videoChat.png');
    avIcon.attr('title', 'Audio/video capable');
  }
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// Prepare Local Media Camera and Mic
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
function getCameraStream() {
  navigator.mediaDevices
    .getUserMedia(mediaconf)
    .then(stream => {
      console.log(' #### avStream inside:' + stream);
      if (!stream) {
        console.log('  !! cannot get video stream');
        setAvStream(undefined);
      } else {
        console.log('  got video stream');
        setAvStream(stream);
      }
    })
    .catch(info => {
      console.log('  !! navigator.mediaDevices.getUserMedia(FAIL): ' + info);
      setAvStream(undefined);
    });
}

//
//
//
function detectWebRtcSupport() {
  try {
    console.log('  starting detectWebRtcSupport...');
    var peerConnection =
      window.RTCPeerConnection ||
      window.mozRTCPeerConnection ||
      window.webkitRTCPeerConnection ||
      window.msRTCPeerConnection;

    var sessionDescription =
      window.RTCSessionDescription ||
      window.mozRTCSessionDescription ||
      window.webkitRTCSessionDescription ||
      window.msRTCSessionDescription;

    navigator.getUserMedia =
      navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
    console.log(
      '  detectWebRtcSupport done:\n    peerConnection=' +
        peerConnection +
        '\n    sessionDescription=' +
        sessionDescription +
        '\n    navigator.getUserMedia=' +
        navigator.getUserMedia,
    );
  } catch (err) {
    console.log('  !! detectWebRtcSupport error:' + err.message);
  }
}

//
// show or hide the Disable AV checkbox
//
function setAvEnabledVisible(flag) {
  console.log(' setAvEnabledVisible to:' + flag);
  if (flag) {
    noAvSpan.css('visibility', 'visible');
  } else {
    noAvSpan.css('visibility', 'hidden');
  }
}

//
// first step of video chat:
//
function startAvSession(destPeople) {
  showToast('start video chat with ' + destPeople + '; caller is myself?:' + avSessionCaller);
  avDestinationPeople = destPeople;
  avSessionState = avInitiated;
  avSessionTimeout = timeoutLimit;
  if (avSessionCaller) {
    // I am the call initiator
    answerImg.css('opacity', 0.1);
  } else {
  }
  avScreen.fadeIn(1000);
}

//
//
//
function stopAvSession() {
  avVideo.innerHTML = '<img src="/img/white-noise-1.gif" width="400" height="225" id="videoImg" title="nobody"/>';
  videoImg.attr('src', '/img/white-noise-1.gif');
  videoImg.attr('title', 'nobody');
  avDestinationPeople = undefined;
  avSessionState = avNoting;
  avSessionTimeout = -1;
  avScreen.fadeOut(2500, function() {
    answerImg.css('opacity', 1.0);
    declineImg.css('opacity', 1.0);
  });
}

// send accept to sender
// set session active
function answer(avControl) {
  console.log(' answer video chat call from:' + avDestinationPeople);
  if (!avSessionCaller) {
    banner.notify('accept video chat request', 'info');
    // emit accept to sender
    socket.emit('sys', { type: 'acceptVideoChat', receiver: name, sender: avDestinationPeople, img: img });
    avSessionState = avActive;
    avSessionActiveTime = 0;
    answerImg.css('opacity', 0.1);
    if (TEST_MODE) {
      if (TEST_MODE_START_WebRTC) {
        avVideo.innerHTML =
          '<iframe src="' +
          WebRTC_SERVER +
          avSessionKey +
          '" style="border: 0px none ;' +
          'left: 90px; top: 36px; position: absolute;' +
          'width: 400px;' +
          'height: 225px;" scrolling="no"></iframe>';
      } else {
        videoImg.attr('src', '/img/unnamed_video.jpg');
      }
    } else {
      avVideo.innerHTML =
        '<iframe src="' +
        WebRTC_SERVER +
        avSessionKey +
        '" style="border: 0px none ;' +
        'left: 90px; top: 36px; position: absolute;' +
        'width: 400px;' +
        'height: 225px;" scrolling="no"></iframe>';
    }
    videoImg.attr('title', avDestinationPeople);
  } else {
    /** 
		banner.notify("start video chat", "info");
		avSessionState=avActive;
		avSessionActiveTime=0;
		answerImg.css('opacity', 0.1);
		videoImg.css('opacity', 0.3);
		if(TEST_MODE){
			if( TEST_MODE_START_WebRTC){
				avVideo.innerHTML = '<iframe src="'+WebRTC_SERVER+avSessionKey+'" style="border: 0px none ;'+ 
				'left: 90px; top: 36px; position: absolute;'+ 
				'width: 400px;'+ 
				'height: 225px;" scrolling="no"></iframe>';
			}else{
				videoImg.attr("src", '/img/unnamed_video.jpg');
			}
		}else{
			avVideo.innerHTML = '<iframe src="'+WebRTC_SERVER+avSessionKey+'" style="border: 0pt none ;'+ 
			'left: 90px; top: 36px; position: absolute;'+ 
			'width: 400px;'+ 
			'height: 225px;" scrolling="no"></iframe>';
		}
		videoImg.attr("title", avDestinationPeople);*/
  }
}

// send decline to sender, or close the session
function decline(avControl) {
  if (avSessionState == avInitiated) {
    // if session is initiated, send reject
    console.log(' reject video chat request from:' + avDestinationPeople);
    banner.notify('reject video chat request', 'info');
    if (!avSessionCaller) {
      // emit reject to sender
      socket.emit('sys', { type: 'rejectVideoChat', receiver: name, sender: avDestinationPeople, img: img });
    }
    stopAvSession();
  } else if (avSessionState == avActive) {
    // if sessio is active: close it, notify other end
    console.log(' exit video chat with:' + avDestinationPeople);
    banner.notify('exit video chat', 'info');
    avSessionState = avClosing;
    if (avSessionCaller) {
      socket.emit('sys', { type: 'closeVideoChat', receiver: avDestinationPeople, img: img });
    } else {
      socket.emit('sys', { type: 'closeVideoChat', receiver: name, img: img });
    }
    stopAvSession();
  }
}

//
//
function startLocalVideo() {
  banner.notify('start video chat', 'info');
  avSessionState = avActive;
  avSessionActiveTime = 0;
  answerImg.css('opacity', 0.1);
  if (TEST_MODE) {
    if (TEST_MODE_START_WebRTC) {
      avVideo.innerHTML =
        '<iframe src="' +
        WebRTC_SERVER +
        avSessionKey +
        '" style="border: 0px none ;' +
        'left: 90px; top: 36px; position: absolute;' +
        'width: 400px;' +
        'height: 225px;" scrolling="no"></iframe>';
    } else {
      videoImg.attr('src', '/img/unnamed_video.jpg');
    }
  } else {
    avVideo.innerHTML =
      '<iframe src="' +
      WebRTC_SERVER +
      avSessionKey +
      '" style="border: 0px none ;' +
      'left: 90px; top: 36px; position: absolute;' +
      'width: 400px;' +
      'height: 225px;" scrolling="no"></iframe>';
  }
  videoImg.attr('title', avDestinationPeople);
}

//
//
//
function tick() {
  //console.log(" tick: "+ tickCount);

  //avDisabled=!avDisabled;
  //setAvEnabled(avDisabled);

  if (avSessionState != avNoting) {
    if (avSessionState == avClosed) {
      // closed
      console.log(' ## AV session: closed. reset avSessionState');
      avSessionState = -1;
    } else if (avSessionState == avInitiated) {
      // initiated
      // check for timeout
      if (avSessionTimeout < 0) {
        console.log(' ## AV session: timeout');
        avSessionState = avTimeout;
      } else {
        if (avSessionCaller) {
          avMessage.html(
            'calling ' + avDestinationPeople + ' ... waiting answer ' + (timeoutLimit - avSessionTimeout) + ' ...',
          );
        } else {
          avMessage.html(avDestinationPeople + ' is calling ... ' + (timeoutLimit - avSessionTimeout) + ' ...');
        }
        avSessionTimeout -= 1;
      }
    } else if (avSessionState == avAcknoledged) {
      avMessage.html('call avAcknoledged from user ' + avDestinationPeople);
      avSessionState = avActive;
    } else if (avSessionState == avRejected) {
      avMessage.html('call rejected from user ' + avDestinationPeople + '; ending call...');
      stopAvSession();
    } else if (avSessionState == avTimeout) {
      avMessage.html('no reply from user ' + avDestinationPeople + '; ending call...');
      stopAvSession();
    } else if (avSessionState == avActive) {
      avMessage.html('Session active ' + avSessionActiveTime + ' sec');
      avSessionActiveTime += 1;
    }
  }

  tickCount += 1;
}

//
//
//
setInterval(function() {
  tick();
}, 1000);

//
//
//
function showToast(mesg) {
  //var x = document.getElementById("snackbar");
  toast.html(mesg);
  toast.className = 'show';
  setTimeout(function() {
    toast.className = toast.className.replace('show', '');
  }, 3000);
}
