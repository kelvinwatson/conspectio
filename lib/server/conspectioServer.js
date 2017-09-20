const DB = {
  ALASQL: 0,
  FIREBASE: 1
}

const CURR_DB = DB.FIREBASE;

const valuesPolyfill = function values(object) {
  return Object.keys(object).map(key => object[key]);
};

const values = Object.values || valuesPolyfill;

function debugLog(tag, msg, db){
  const DEBUG = 1;
  if (!DEBUG) return;
  switch(db){
    case DB.ALASQL:
      console.log('*****ALASQL DB LOGGING***** ' + tag, msg);
      break;
    case DB.FIREBASE:
      console.log('*****FIREBASE DB LOGGING***** ' + tag, msg);
      break;
    default:
      console.log(tag, msg);
  }
}

module.exports = (http) => {
  const firebaseConfig = {
    apiKey: "AIzaSyBasS6sOUVDRuHhWsaMEtL3DjT3jnHeZ_E",
    authDomain: "bearforceapp.firebaseapp.com",
    databaseURL: "https://bearforceapp.firebaseio.com",
    projectId: "bearforceapp",
    storageBucket: "bearforceapp.appspot.com",
    messagingSenderId: "188655595764"
  };
  let firebase = require('firebase').initializeApp(firebaseConfig);
  let nodeTrackerRef = firebase.database().ref('nodeTracker');

  const maxRelayers = 1; //max number of leechers per broadcast relayer
  const maxBroadcasters = 1;
  const io = require ('socket.io')(http);
  const ConspectioNode = require('./conspectioNode.js');
  const alasql = require('alasql');

  if (CURR_DB === DB.ALASQL){
    alasql.fn.arrlen = function(arr) { return arr.length; }; //custom function that returns array length
    alasql('CREATE TABLE nodeTracker');    //create nodeTracker table instead of nodeTracker[] due to compatiability with alasql CRUD operations
    //debugLog('after CREATE TABLE, nodeTracker is:', alasql('SELECT * FROM nodeTracker'), DB.ALASQL);
  }

  io.on('connection', (socket) => {

    //debugLog('*****SOCKET CONNECTED*****', socket.id);

    /*
     * listens for event tag from broadcaster
     */
    socket.on('addBroadcaster', (eventId) => {

      //debugLog('*****addBroadcaster*****', eventId);

      var newBroadcaster = new ConspectioNode(socket.id, eventId); // add a new broadcaster asssociated with that event id into nodeTracker table

      if (CURR_DB === DB.FIREBASE){
        firebase.database().ref('eventTracker/'+eventId).set(eventId); //record unique eventIds

        let newBroadcasterFirebase = new ConspectioNode(socket.id, eventId);; // add a new broadcaster asssociated with that event id into nodeTracker table
        newBroadcasterFirebase['eventId_origin'] = newBroadcaster['eventId'] + '_' + newBroadcaster['origin'];
        newBroadcasterFirebase['socketId_origin'] = newBroadcaster['socketId'] + '_' + newBroadcaster['origin'];
        newBroadcasterFirebase['socketId_eventId_origin'] = newBroadcaster['socketId'] + '_' + newBroadcaster['eventId'] + '_' + newBroadcaster['origin'];

        nodeTrackerRef.push(newBroadcasterFirebase, function(err){
          if (err){
            //debugLog('error pushing newBroadcaster',newBroadcasterFirebase, DB.FIREBASE);
          } else {
            //debugLog('successfully pushed newBroadcaster', newBroadcasterFirebase, DB.FIREBASE);
          }
          nodeTrackerRef.once('value').then(function(snap){
            if (snap && snap.val()){
              //debugLog('after push, nodeTracker ref is', snap.val(), DB.FIREBASE);
            } else {
              //debugLog('after push, nodeTracker ref is', snap, DB.FIREBASE);
            }
          });

          let otherBroadcastersFirebase = {};
          nodeTrackerRef.orderByChild('eventId_origin').equalTo(otherBroadcastersFirebase.eventId + '_' + newBroadcasterFirebase.origin).once('value').then(function(snap){
            let potentialOtherBroadcasters = snap.val();
            let otherBroadcasters = {};
            if (potentialOtherBroadcasters){
              for(let k in potentialOtherBroadcasters){
                if (potentialOtherBroadcasters.hasOwnProperty(k)){
                  let b = potentialOtherBroadcasters[k];
                  if (b.socketId !== newBroadcasterFirebase.socketId){
                    otherBroadcastersFirebase[k] = b;
                  }
                }
              }
            }
            //debugLog('otherBroadcastersFirebase', otherBroadcastersFirebase, DB.FIREBASE);
            var noMoreBroadcastersFirebase = !Object.keys(otherBroadcastersFirebase).length; //length of object
            //debugLog('noMoreBroadcastersFirebase', noMoreBroadcastersFirebase, DB.FIREBASE)
            if (!noMoreBroadcastersFirebase){
              // pick 1 existing broadcaster and recurse through it - each leecher needs a new node where the origin is this new broadcaster
              //emit msg to client-side which is this new broadcaster 'initiateConnection' to create a connections obj. to all leechers
              //debugLog('otherBroadcastersFirebase[Object.keys(otherBroadcastersFirebase)[0]]::', otherBroadcastersFirebase[Object.keys(otherBroadcastersFirebase)[0]], DB.FIREBASE)
              //debugLog('newBroadcasterFirebase.socketId::',newBroadcasterFirebase.socketId, DB.FIREBASE);
              //debugLog('newBroadcasterFirebase::', newBroadcasterFirebase, DB.FIREBASE)
              //debugLog('about to recurse on otherBroadcastersFirebase[Object.keys(otherBroadcastersFirebase)[0]]', otherBroadcastersFirebase[Object.keys(otherBroadcastersFirebase)[0]], DB.FIREBASE);
              recurseCreateNodes(otherBroadcastersFirebase[Object.keys(otherBroadcastersFirebase)[0]], newBroadcasterFirebase.socketId, newBroadcasterFirebase, true, nodeTrackerRef);
            } else {
              //debugLog('noMoreBroadcastersFirebase', 'NO MORE BROADCASTERS', DB.FIREBASE);
            }
          });
        });
      } else if (CURR_DB === DB.ALASQL){
        alasql('INSERT into nodeTracker VALUES ?', [newBroadcaster]);
        //debugLog('[newBroadcaster]', [newBroadcaster], DB.ALASQL)
        //debugLog('LOGGING after INSERT, nodeTracker is:', alasql('SELECT * FROM nodeTracker'), DB.ALASQL);
        var otherBroadcasters = alasql('SELECT * FROM nodeTracker WHERE eventId = ? AND origin = ? AND socketId NOT IN @(?)', [newBroadcaster.eventId, '', [newBroadcaster.socketId]]);
        //debugLog('otherBroadcasters', otherBroadcasters, DB.ALASQL);
        var noMoreBroadcasters = (otherBroadcasters.length) ? false : true;
        //debugLog('noMoreBroadcasters', noMoreBroadcasters, DB.ALASQL)
        // if there's already a broadcaster for this eventId, need to inform all viewers and their leechers (DFS recursive notifications) of new broadcaster
        if(! noMoreBroadcasters) {
          // pick 1 existing broadcaster and recurse through it - each leecher needs a new node where the origin is this new broadcaster
          //emit msg to client-side which is this new broadcaster 'initiateConnection' to create a connections obj. to all leechers
          //debugLog('otherBroadcasters[0]::', otherBroadcasters[0], DB.ALASQL)
          //debugLog('newBroadcaster.socketId::',newBroadcaster.socketId, DB.ALASQL);
          //debugLog('newBroadcaster::', newBroadcaster, DB.ALASQL)
          //debugLog('about to recurse on otherBroadcasters[0]', otherBroadcasters[0], DB.ALASQL);
          recurseCreateNodes(otherBroadcasters[0], newBroadcaster.socketId, newBroadcaster, true);
        } else {
          //debugLog('noMoreBroadcasters', 'NO MORE BROADCASTERS', DB.ALASQL);
        }
        // print out the nodeTracker to ensure all new nodes added correctly
        //debugLog('addBroadcaster event done, nodeTracker state: ', alasql('SELECT * FROM nodeTracker'), DB.ALASQL);
      }

    })

    /*
     * listens for broadcaster when they stop streaming
     */
    socket.on('removeBroadcaster', (eventTag) => {
      //debugLog('*****removeBroadcaster',eventTag);
      // lookup this broadcaster node based on eventId and socketId

      if (CURR_DB === DB.ALASQL){
        let currNode = alasql('SELECT * FROM nodeTracker WHERE socketId = ? AND eventId = ? AND origin = ?', [socket.id, eventTag, ''])[0];
        //debugLog('LOGGING currNode', currNode, DB.ALASQL);
        if(currNode) {
          // determine if any broadcasters left for this event?  if so, emit 'broadcasterLeft', else emit 'noMoreBroadcasters'
          let otherBroadcasters = alasql('SELECT * FROM nodeTracker WHERE eventId = ? AND origin = ? AND socketId NOT IN @(?)', [currNode.eventId, '', [currNode.socketId]]);
          let noMoreBroadcasters = (otherBroadcasters.length) ? false : true;

          //recursively trace through the leechers, if any, and remove reference (delete leechers' nodes from the end to beginning) to this broadcaster
          //***TODO: check for the case where noMoreBroadcasters is false!
          recurseRemoveNodes(currNode, currNode.socketId, noMoreBroadcasters);
          //debugLog('broadcaster clicked stop stream', alasql('SELECT * FROM nodeTracker'), DB.ALASQL);
        }
      } else if (CURR_DB === DB.FIREBASE){
        nodeTrackerRef.orderByChild('socketId_eventId_origin').equalTo(socket.id + '_' + eventTag + '_' + '').once('value').then(function(snap){
          let nodes = snap && snap.val();
          if (nodes){
            let currNode = nodes[Object.keys(nodes)[0]]; //first node
            if (currNode){
              nodeTrackerRef.orderByChild('eventId_origin').equalTo(currNode.eventId + '_' + '').once('value').then(function(snap){
                let potentialOtherBroadcasters = snap.val();
                let otherBroadcasters = {};
                if (potentialOtherBroadcasters){
                  for(let k in potentialOtherBroadcasters){
                    if (potentialOtherBroadcasters.hasOwnProperty(k)){
                      let b = potentialOtherBroadcasters[k];
                      if (b.socketId !== currNode.socketId){
                        otherBroadcastersFirebase[k] = b;
                      }
                    }
                  }
                }
                var noMoreBroadcastersFirebase = !Object.keys(otherBroadcastersFirebase).length; //length of object
                //recursively trace through the leechers, if any, and remove reference (delete leechers' nodes from the end to beginning) to this broadcaster
                //***TODO: check for the case where noMoreBroadcasters is false!
                recurseRemoveNodes(currNode, currNode.socketId, noMoreBroadcasters, nodeTrackerRef);
                //debugLog('otherBroadcastersFirebase', otherBroadcastersFirebase, DB.FIREBASE);
              });
            }
          }
        });
      }
    });

    /*
     * listens for eventList request from viewer
     */
    socket.on('getEventList', () => {
      // query nodeTracker for a list of all active unique events
      if (CURR_DB === DB.ALASQL){
        let events = alasql('SELECT DISTINCT eventId from nodeTracker');

        // use map to extract the eventId from events results
        let eventsList = events.map((eventObj) => {
          return eventObj.eventId;
        });

        // emits list of events to ConspectioManager
        socket.emit('sendEventList', eventsList);
      } else if (CURR_DB === DB.FIREBASE){
        firebase.database().ref('eventTracker').once('value').then(function(snap){
          let eventIds = snap && snap.val();
          if (eventIds){
            socket.emit('sendEventList', values(eventIds));
          }
        });
      }
    });

    // listens for initiate view request from viewer
    socket.on('initiateView', (eventId) => {

      if (CURR_DB === DB.ALASQL){
        // check #1: find broadcaster(s) for this eventId - we need this as the origin socketId// LIMIT 2
        var sqlString = 'SELECT * FROM nodeTracker WHERE eventId=? AND origin="" LIMIT ' + maxBroadcasters;
        var broadcastersList = alasql(sqlString, [eventId]);

        broadcastersList.forEach((broadcaster) => {
          var sourcesToCheck = [broadcaster.socketId];
          var foundCapacity = false;
          var originId = '';
          while(!foundCapacity){
            //Store broadcaster node with the min amout of leechers
            //debugLog('SOURCESTOCHECK:', sourcesToCheck, DB.ALASQL);
            //debugLog('originid:', originId, DB.ALASQL);
            var broadcasterNode = alasql('SELECT * FROM nodeTracker WHERE arrlen(leechers) < ? AND socketId IN @(?) AND origin = ? ORDER BY arrlen(leechers) LIMIT 1', [maxRelayers, sourcesToCheck, originId])[0];
            //debugLog('broadcasterNODE with capacity:', broadcasterNode);
              // if there is capacity, connect newViewer to this broadcaster - take the broadcaster's socketId and make it newViewer's source and origin
            if(broadcasterNode) {
              // check #2: determine broadcasterid with min amount of leechers
              var broadcasterIdWithCapacity = broadcasterNode.socketId;
              foundCapacity = true;
              // make a new Node for this viewer
              var newViewer = new ConspectioNode(socket.id, eventId);
              //update source of newViewer
              newViewer.source = broadcasterIdWithCapacity;
              //update degree of newViewer //query broadcasterId's degree
              newViewer.degree = broadcasterNode.degree + 1;
              //update origin depending on degree
              if(broadcasterNode.origin === ''){
                newViewer.origin = broadcasterIdWithCapacity;
              } else {
                newViewer.origin = broadcasterNode.origin;
              }
              //debugLog('NEW VIEWER', newViewer, DB.ALASQL);
              //finally, insert viewer node into table
              alasql('INSERT INTO nodeTracker VALUES ?', [newViewer]);

              //firebase increment viewer count
              //debugLog('*****FIREBASE***** incrementing viewer count',firebase, DB.FIREBASE);

              firebase.database().ref('liveStreams/'+eventId).once('value').then(function(snap){
                var numViewers = snap && snap.val() || 0;
                numViewers = numViewers + 1;
                firebase.database().ref('liveStreams/'+eventId).set(numViewers);
              });

              // take the newViewer socketId and add it to the broadcaster's leecher's array
              //debugLog('attempt push to leechers array', broadcasterNode.leechers, DB.FIREBASE);
              broadcasterNode.leechers.push(socket.id);

              //check broadcaster origin and to decide who to connect to
              if(broadcasterNode.origin === ''){
                io.to(broadcasterIdWithCapacity).emit('initiateConnection', socket.id, broadcasterIdWithCapacity);
              } else {
                io.to(broadcasterIdWithCapacity).emit('initiateRelay', socket.id, broadcasterNode.source, broadcasterNode.origin);
              }
            } else {
              //every relayer in sourcesToCheck is at capacity. get their leechers array and check those for capacity next with another iteration in the while loop
              console.log('SOURCESTOCHECK:', sourcesToCheck, 'broadcaster.socketid:', broadcaster.socketId);
              //helper function to get an array of leechers for 1 relayer
              function getLeechers(socketId, originId){
                return alasql('SELECT leechers FROM nodeTracker WHERE socketId=? AND origin= ?',[socketId, originId])[0];
              }

              var result = [];
              var newRelayersToCheck = sourcesToCheck.map( (relayerId) => {
                result.push(getLeechers(relayerId, originId).leechers);
              });
              sourcesToCheck = flattenDeep(result);
              //for any degree > 0, originId is not an empty string
              originId = broadcaster.socketId;
            }
          } //end while loop
        });//end of forEach
      } else if (CURR_DB === DB.FIREBASE){
        //debugLog('initiateView','',DB.FIREBASE);
        nodeTrackerRef.orderByChild('eventId_origin').equalTo(eventId + '_' + '').once('value').then(function(snap){
          //debugLog('initiateView', 'found eventId_origin', DB.FIREBASE);
          let broadcasters = snap && snap.val();
          if (broadcasters){
            let broadcastersList = values(broadcasters);
            broadcastersList.forEach((broadcaster) => {
              var sourcesToCheck = [broadcaster.socketId];
              var foundCapacity = false;
              var originId = '';

              //REMOVED THE WHILE LOOP...

              //Store broadcaster node with the min amout of leechers
              //debugLog('SOURCESTOCHECK:', sourcesToCheck, DB.FIREBASE);
              //debugLog('originid:', originId, DB.FIREBASE);

              nodeTrackerRef.orderByChild('origin').equalTo(originId).once('value').then(function(bSnap){

                //debugLog('searched by origin:', originId, DB.FIREBASE);

                let broadcasterNodes = bSnap && bSnap.val();

                //debugLog('bSnap:', bSnap.val(), DB.FIREBASE);


                if (broadcasterNodes){
                  let broadcasterNodeList = values(broadcasterNodes);
                  //filter down to broadcasterNode:
                    //sort/order by length of leechers (lowest to highest)
                    //filter by length of leechers < 1, socketId in sourcesToCheck and origin == originId
                    //limit to 1 result

                  broadcasterNodeList.sort(function(a,b){
                    if (!a.leechers){
                      a.leechers = [];
                    }
                    if (!b.leechers){
                      b.leechers = [];
                    }
                    return a.leechers.length - b.leechers.length;
                  });

                  let potentials = [];
                  for (let i=0; i<broadcasterNodeList.length; i+=1){
                    let potentialbroadcasterNode = broadcasterNodeList[i];
                    if (potentialbroadcasterNode.leechers < 1 && sourcesToCheck.includes(potentialbroadcasterNode.socketId) && potentialbroadcasterNode.origin == originId){ //warrants further consideration
                      potentials.push(potentialbroadcasterNode);
                    }
                  }

                  //this replaces the while loop
                  let i = 0;
                  let broadcasterNode;
                  do{
                    broadcasterNode = potentials[i++]
                  }while(!broadcasterNode && i<potentials.length);


                  if(broadcasterNode) {
                    //debugLog('broadcasterNODE with capacity found:', broadcasterNode, DB.FIREBASE);
                    // check #2: determine broadcasterid with min amount of leechers
                    var broadcasterIdWithCapacity = broadcasterNode.socketId;
                    foundCapacity = true;
                    // make a new Node for this viewer
                    var newViewer = new ConspectioNode(socket.id, eventId);
                    //update source of newViewer
                    newViewer.source = broadcasterIdWithCapacity;
                    //update degree of newViewer //query broadcasterId's degree
                    newViewer.degree = broadcasterNode.degree + 1;
                    //update origin depending on degree
                    if(broadcasterNode.origin === ''){
                      newViewer.origin = broadcasterIdWithCapacity;
                    } else {
                      newViewer.origin = broadcasterNode.origin;
                    }
                    //debugLog('NEW VIEWER', newViewer, DB.FIREBASE);
                    nodeTrackerRef.push(newViewer); //finally, insert viewer node into table

                    //debugLog('*****FIREBASE***** incrementing viewer count', firebase, DB.FIREBASE);//firebase increment viewer count
                    firebase.database().ref('liveStreams/'+eventId).once('value').then(function(snap){
                      var numViewers = snap && snap.val() || 0;
                      numViewers = numViewers + 1;
                      firebase.database().ref('liveStreams/'+eventId).set(numViewers);
                    });

                    //debugLog('attempt push to leechers array, broadcasterNode.leechers:', broadcasterNode.leechers, DB.FIREBASE);
                    broadcasterNode.leechers.push(socket.id); // take the newViewer socketId and add it to the broadcaster's leecher's array

                    //check broadcaster origin and to decide who to connect to
                    if(broadcasterNode.origin === ''){
                      io.to(broadcasterIdWithCapacity).emit('initiateConnection', socket.id, broadcasterIdWithCapacity);
                    } else {
                      io.to(broadcasterIdWithCapacity).emit('initiateRelay', socket.id, broadcasterNode.source, broadcasterNode.origin);
                    }
                  } else {
                    //debugLog('NO broadcasterNODE with capacity:', broadcasterNode, DB.FIREBASE);

                    //every relayer in sourcesToCheck is at capacity. get their leechers array and check those for capacity next with another iteration in the while loop
                    //debugLog('SOURCESTOCHECK:', sourcesToCheck, DB.FIREBASE);
                    //debugLog('broadcaster.socketid:', broadcaster.socketId, DB.FIREBASE);

                    function getRelayersPromise(socketId, originId){
                      return nodeTrackerRef.orderByChild('socketId_origin').equalTo(socketId + '_' + originId).once('value');
                    }

                    var relayerPromises = [];
                    var newRelayersToCheck = sourcesToCheck.map( (relayerId) => {
                      relayerPromises.push(getRelayersPromise(relayerId, originId));
                    });

                    Promise.all(relayerPromises).then((relayersSnapshots) => {
                      let result = [];
                      for(let i=0; i<relayersSnapshots.length; i+=1){
                        let snap = relayersSnapshots[i];
                        let relayers = snap && snap.val();
                        if (relayers){
                          let leechers = relayers[Object.keys(relayers)[0]].leechers; //per alasql call above, only take the first record
                          result.push(leechers);
                        }
                      }

                      sourcesToCheck = flattenDeep(result);
                      //for any degree > 0, originId is not an empty string
                      originId = broadcaster.socketId;
                    });
                  }
                }
              });

              // if there is capacity, connect newViewer to this broadcaster - take the broadcaster's socketId and make it newViewer's source and origin


            });//end of forEach
          }
        })
      }
    });

    socket.on('signal', (toId, message, originId) => {
      // send the peerObj to the peerId
      io.to(toId).emit('signal', socket.id, message, originId);
    });

    /*
     * Listens
     */
    socket.on('receivedStream', (sourceId, originId) => {
      //debugLog('*****receivedStream***** server received stream - sourceid:', sourceId, 'originId:', originId)

      //look up leechers of this viewer
      let currNodeId = socket.id;

      if (CURR_DB === DB.ALASQL){
        //debugLog('NODETRACKER:', alasql('SELECT * FROM nodeTracker'), DB.ALASQL);
        let currNode = alasql('SELECT * FROM nodeTracker WHERE socketId = ? AND source = ? AND origin = ?', [currNodeId, sourceId, originId])[0];
        console.log('receivedStream currNode:::::::', currNode);
        //if no leechers, don't do anything
        //if leechers, for each leecher, emit 'relayStream' with 2 params: this node's sourceId & this node's leecher's socketId
        for (let i = 0; i < currNode.leechers.length; i++){
          io.to(currNodeId).emit('relayStream', sourceId, currNode.leechers[i], originId);
        }
      } else if (CURR_DB === DB.FIREBASE){
        nodeTrackerRef.orderByChild('socketId_source_origin').equalTo(currNodeId + '_' + sourceId + '_' + originId).once('value').then(function(snap){
          let nodes = snap && snap.val();
          if (nodes){
            let currNode = nodes[Object.keys(nodes)[0]]; //first node
            if (currNode){
              for (let i = 0; i < currNode.leechers.length; i++){
                io.to(currNodeId).emit('relayStream', sourceId, currNode.leechers[i], originId);
              }
            }
          }
        });
      }
    });

    /*
     * Listens for disconnection
     */
    socket.on('disconnect', () => {
      debugLog('*****disconnect*****','');

      if (CURR_DB === DB.ALASQL){
        // lookup Node with this socket.id - there can be multiple results because one viewer node per broadcaster
        let currNodeList = alasql('SELECT * FROM nodeTracker WHERE socketId = ?', [socket.id]);
        debugLog('inside disconnect currNodeList', currNodeList, DB.ALASQL);

        for(let i = 0; i < currNodeList.length; ++i) {
          let currNode = currNodeList[i];

          // determine whether Node is Viewer or Broadcaster
          if(currNode.origin) { // this is a VIEWER
            //CASE 1: Viewer has no leechers and disconnects
            // retrieve the sourceNode. sourceOrigin is currNode's source's origin value.
            let sourceOrigin = (currNode.degree === 1) ? '': currNode.origin; // directly connected to broadcaster or not
            let sourceNode = alasql('SELECT * FROM nodeTracker WHERE socketId = ? AND origin = ?', [currNode.source, sourceOrigin])[0];

            // remove this dropped viewer's socketId from sourceNode's leechers
            let index = sourceNode.leechers.indexOf(currNode.socketId);
            sourceNode.leechers.splice(index, 1);

            // remove viewer node from nodeTracker -- should this be called after recurse function???
            alasql('DELETE FROM nodeTracker WHERE socketId = ? AND origin = ?', [currNode.socketId, currNode.origin]);

            //firebase decrement viewer count
            firebase.database().ref('liveStreams/' + currNode.eventId).once('value').then(function(snap){
              let numViewers = snap && snap.val() || 0;
              numViewers = numViewers > 0 ? numViewers - 1 : 0;
              firebase.database().ref('liveStreams/' + currNode.eventId).set(numViewers);
            });

            debugLog('viewer without leechers left. nodeTracker:',alasql('SELECT * FROM nodeTracker'), DB.ALASQL);
            // client side notification - emit message to broadcaster/relayBroadcaster that viewer left to clean up conspectio.connections{}
            io.to(sourceNode.socketId).emit('viewerLeft', currNode.socketId, currNode.origin);

            //CASE 2: Viewer has leechers and disconnects (Viewer is a Relay Broadcaster)
              //find viewer's source and update their leechers array
              //for all leechers in the relayBroadcaster's leechers array
                //recursively trace through the leechers and find new source (broadcaster or relayBroadcaster), update degree of leechers
                // client side notification - emit message to leechers that viewer (relayBroadcaster in the eyes of leechers) left to clean up conspectio.connections{}
              //remove viewer node from nodeTracker
              // client side notification - emit message to broadcaster/relay broadcaster that viewer left to clean up conspectio.connections{}

            // recursively update leechers of currNode - pass in sourceNode
            recurseUpdateNodes(currNode, currNode.origin, sourceNode, true);

          } else { // this is a BROADCASTER
            // CASE 3: Broadcaster disconnects with leechers
            // CASE 4: Broadcaster disconnects with NO leechers

            // determine if any broadcasters left for this event?  if so, emit 'broadcasterLeft', else emit 'noMoreBroadcasters'
            let otherBroadcasters = alasql('SELECT * FROM nodeTracker WHERE eventId = ? AND origin = ? AND socketId NOT IN @(?)', [currNode.eventId, '', [currNode.socketId]]);
            let noMoreBroadcasters = (otherBroadcasters.length) ? false : true;
            //recursively trace through the leechers, if any, and remove reference (delete leechers' nodes from the end to beginning) to this broadcaster
            recurseRemoveNodes(currNode, currNode.socketId, noMoreBroadcasters);
            debugLog('nodeTracker after broadcaster disconnects',alasql('SELECT * FROM nodeTracker'), DB.ALASQL);
            //firebase remove the entry in the liveStreams and liveMembers tables
            firebase.database().ref('liveStreams/' + currNode.eventId).set(null);
            firebase.database().ref('liveMembers/' + currNode.eventId).set(null);
          }
        }
      } else if (CURR_DB === DB.FIREBASE){
        nodeTrackerRef.orderByChild('socketId').equalTo(socket.id).once('value').then(function(snap){
          let currNodes = snap && snap.val();
          if (currNodes){
            for (let k in currNodes){
              if (currNodes.hasOwnProperty(k)){
                let currNode = currNodes[k];
                if (currNode.origin){
                  //CASE 1: Viewer has no leechers and disconnects
                  // retrieve the sourceNode. sourceOrigin is currNode's source's origin value
                  let sourceOrigin = (currNode.degree === 1) ? '': currNode.origin; // directly connected to broadcaster or not
                  nodeTrackerRef.orderByChild('socketId_origin').equalTo(currNode.source + '_' + sourceOrigin).once('value').then(function(nodeSnap){
                    let sourceNode = nodeSnap && nodeSnap.val();
                    if (!sourceNode.leechers){
                      sourceNode.leechers = [];
                    }
                    let index = sourceNode.leechers.indexOf(currNode.socketId); //remove this dropped viewer's socketId from sourceNode's leechers
                    sourceNode.leechers.splice(index, 1);

                    // remove viewer node from nodeTracker -- should this be called after recurse function???
                    nodeTrackerRef.orderByChild('socketId_origin').equalTo(currNode.socketId + '_' + currNode.origin).once('value').then(function(deleteSnap){
                      let found = deleteSnap && deleteSnap.val();
                      debugLog('disconnect found', found, DB.FIREBASE);
                      let foundKey = deleteSnap.key;
                      debugLog('disconnect foundKey', deleteSnap.key, DB.FIREBASE);
                      // debugLog('disconnect foundRef', deleteSnap.ref, DB.FIREBASE);
                      nodeTrackerRef.child(foundKey).set(null);

                      io.to(sourceNode.socketId).emit('viewerLeft', currNode.socketId, currNode.origin);

                      //CASE 2: Viewer has leechers and disconnects (Viewer is a Relay Broadcaster)
                        //find viewer's source and update their leechers array
                        //for all leechers in the relayBroadcaster's leechers array
                          //recursively trace through the leechers and find new source (broadcaster or relayBroadcaster), update degree of leechers
                          // client side notification - emit message to leechers that viewer (relayBroadcaster in the eyes of leechers) left to clean up conspectio.connections{}
                        //remove viewer node from nodeTracker
                        // client side notification - emit message to broadcaster/relay broadcaster that viewer left to clean up conspectio.connections{}

                      // recursively update leechers of currNode - pass in sourceNode
                      recurseUpdateNodes(currNode, currNode.origin, sourceNode, true);
                    });

                    //firebase decrement viewer count
                    firebase.database().ref('liveStreams/' + currNode.eventId).once('value').then(function(snap){
                      let numViewers = snap && snap.val() || 0;
                      numViewers = numViewers > 0 ? numViewers - 1 : 0;
                      firebase.database().ref('liveStreams/' + currNode.eventId).set(numViewers);
                    });
                  });
                } else {
                  // CASE 3: Broadcaster disconnects with leechers
                  // CASE 4: Broadcaster disconnects with NO leechers
                  // determine if any broadcasters left for this event?  if so, emit 'broadcasterLeft', else emit 'noMoreBroadcasters'
                  let otherBroadcastersFirebase = {};
                  nodeTrackerRef.orderByChild('eventId_origin').equalTo(currNode.eventId + '_' + '').once('value').then(function(snap){
                    let potentialOtherBroadcasters = snap.val();
                    debugLog('potentialOtherBroadcasters', potentialOtherBroadcasters, DB.FIREBASE);
                    let otherBroadcasters = {};
                    if (potentialOtherBroadcasters){
                      for(let k in potentialOtherBroadcasters){
                        if (potentialOtherBroadcasters.hasOwnProperty(k)){
                          let b = potentialOtherBroadcasters[k];
                          if (b.socketId !== currNode.socketId){
                            otherBroadcastersFirebase[k] = b;
                          }
                        }
                      }
                    }
                    debugLog('otherBroadcastersFirebase', otherBroadcastersFirebase, DB.FIREBASE);
                    var noMoreBroadcastersFirebase = !Object.keys(otherBroadcastersFirebase).length; //length of object
                    debugLog('noMoreBroadcastersFirebase', noMoreBroadcastersFirebase, DB.FIREBASE)
                    recurseRemoveNodes(currNode, currNode.socketId, noMoreBroadcastersFirebase);
                    nodeTrackerRef.once('value').then(function(nodeTrackerSnap){
                      if (nodeTrackerSnap && nodeTrackerSnap.val()){
                        debugLog('nodeTracker after broadcaster disconnects', nodeTrackerSnap.val())
                      } else {
                        debugLog('nodeTracker after broadcaster disconnects no data', snap)
                      }
                    });
                    //firebase remove the entry in the liveStreams and liveMembers tables
                    firebase.database().ref('liveStreams/' + currNode.eventId).set(null);
                    firebase.database().ref('liveMembers/' + currNode.eventId).set(null);
                  });
                }
              }
            }
          }
        });
      }
    });
  });

  /*
   * Helper function to recursively create new nodes for all leechers for new broadcaster
   */
  function recurseCreateNodes(currNode, targetOrigin, targetNode, isFirstConnect, nodeTrackerRef) {
    debugLog('*****recurseCreateNodes*****', '', DB.ALASQL);
    debugLog('*****recurseCreateNodes*****', '', DB.FIREBASE);

    if (CURR_DB === DB.ALASQL){
      for(var i = 0; i < currNode.leechers.length; ++i) { //for each leecher, create a new Node
        var currLeecherOrigin = (currNode.degree === 0) ? currNode.socketId: currNode.origin; // directly connected to broadcaster or not
        //debugLog('currLeecherOrigin', currLeecherOrigin, DB.ALASQL);
        var currLeecher = alasql('SELECT * FROM nodeTracker WHERE socketId = ? AND origin = ?', [currNode.leechers[i], currLeecherOrigin])[0]; //retrieve the currLeecher
        //debugLog('currLeecher', currLeecher, DB.ALASQL);
        var newNode = new ConspectioNode(currLeecher.socketId, currLeecher.eventId); //create a new Node for each leecher - copy the leecher for the otherBroadcasters
        newNode.degree = currLeecher.degree;
        newNode.origin = targetOrigin;
        var newNodeSource = (currLeecher.degree === 1) ? targetOrigin: currLeecher.source; // directly connected to broadcaster or not
        newNode.source = newNodeSource;
        targetNode.leechers.push(newNode.socketId); //push newNode into targetNode.leechers
        //insert newNode into nodeTracker table
        alasql('INSERT INTO nodeTracker VALUES ?', [newNode]);
        if(isFirstConnect) {
          io.to(targetNode.socketId).emit('initiateConnection', newNode.socketId, targetOrigin);
        }
        // recurse call on the currLeecher passing in targetOrigin and the newNode to update the nodeTracker table
        recurseCreateNodes(currLeecher, targetOrigin, newNode, false);
      }
    } else if (CURR_DB === DB.FIREBASE){
      let currLeecherPromisesFirebase = [];
      for(var i = 0; i < currNode.leechers.length; ++i) { //for each leecher, create a new Node
        var currLeecherOrigin = (currNode.degree === 0) ? currNode.socketId: currNode.origin; // directly connected to broadcaster or not
        //debugLog('currLeecherOrigin', currLeecherOrigin, DB.FIREBASE);
        currLeecherPromisesFirebase.push(nodeTrackerRef.orderByChild('socketId_origin').equalTo(currNode.leechers[i] + '_' + currLeecherOrigin).once('value')); //retrieve the currLeecher
      }

      Promise.all(currLeecherPromisesFirebase).then((snapshots) => {
        for(let i=0; i<snapshots.length; i++){
          let snap = snapshots[i];
          let leechers = snap && snap.val();
          if (leechers){
            let currLeecher = leechers[Object.keys(leechers)[0]]; //per alasql call above, only take the first record
            //debugLog('currLeecher', currLeecher, DB.FIREBASE);
            let newNode = new ConspectioNode(currLeecher.socketId, currLeecher.eventId); //create a new Node for each leecher - copy the leecher for the otherBroadcasters
            newNode.degree = currLeecher.degree;
            newNode.origin = targetOrigin;
            var newNodeSource = (currLeecher.degree === 1) ? targetOrigin: currLeecher.source; // directly connected to broadcaster or not
            newNode.source = newNodeSource;

            //debugLog('attempt push to leechers array, targetNode.leechers:', targetNode.leechers, DB.FIREBASE);

            targetNode.leechers.push(newNode.socketId); //push newNode into targetNode.leechers
            nodeTrackerRef.push(newNode);
            if(isFirstConnect) {
              io.to(targetNode.socketId).emit('initiateConnection', newNode.socketId, targetOrigin);
            }
            recurseCreateNodes(currLeecher, targetOrigin, newNode, false);
          }
        }
      });
    }
  }

  /*
   * Helper function to recursively update node's source after relayBroadcaster drops - targetSource is a Node
   * @param isFirstReconnect is true if currNode is the head of the dropped portion
   */
  function recurseUpdateNodes(currNode, targetOriginId, targetSourceNode, isFirstReconnect, nodeTrackerRef) {
    if (CURR_DB === DB.ALASQL){
      for(var i = 0; i < currNode.leechers.length; ++i) { //iterate through currNode's leechers
        var currLeecher = alasql('SELECT * FROM nodeTracker WHERE socketId = ? AND origin = ?', [currNode.leechers[i], targetOriginId])[0];

        if(isFirstReconnect) { // 1st - reconnecting head leecher to a new source
          currLeecher.source = targetSourceNode.socketId; //update currLeecher's source to be targetSource
          currLeecher.degree = targetSourceNode.degree + 1; // update currLeecher's degree

          // pseudo UPDATE - delete currLeecher Node and then insert it back
          //TODO: make a function for UPDATE
          alasql('DELETE from nodeTracker WHERE socketId = ? AND origin = ?', [currLeecher.socketId, currLeecher.origin]);
          alasql('INSERT INTO nodeTracker VALUES ?', [currLeecher]);

          // update targetSource's leechers to include currLeecher
          targetSourceNode.leechers.push(currLeecher.socketId);

          //check targetSource origin and to decide who to connect to
          if(targetSourceNode.origin === ''){
            // emit message to targetSource to 'initiateConnection' with currLeecher
            io.to(targetSourceNode.socketId).emit('initiateConnection', currLeecher.socketId, currLeecher.origin);
          } else {
            // io.to(targetSourceNode.socketId).emit('initiateRelay', currLeecher.socketId, targetSourceNode.source); //??is this line needed??

            io.to(targetSourceNode.socketId).emit('initiateRelay', currLeecher.socketId, targetSourceNode.source, targetSourceNode.origin);
          }

          // emit message to currLeecher that 'broadcasterLeft' which is currNode
          io.to(currLeecher.socketId).emit('broadcasterLeft', currNode.socketId, currNode.origin);
          recurseUpdateNodes(currLeecher, targetOriginId, targetSourceNode, false);
        } else { // not 1st update
          // need to increment currLeecher's degree by 1 based on its sourceNode's degree
          currLeecher.degree = currNode.degree + 1;

          // pseudo UPDATE - delete currLeecher Node and then insert it back
          alasql('DELETE FROM nodeTracker WHERE socketId = ? AND origin = ?', [currLeecher.socketId, currLeecher.origin]);
          alasql('INSERT INTO nodeTracker VALUES ?', [currLeecher]);

          // recursively update the nodeTracker table only, no emitting events
          recurseUpdateNodes(currLeecher, targetOriginId, currNode, false);
        }
      }
    } else if (CURR_DB === DB.FIREBASE){

      debugLog('!!!!! CURRNODE.LEEACHERS !!!!! ', currNode.leechers, DB.FIREBASE)

      if (currNode.leechers === undefined) return;

      for(let i = 0; i < currNode.leechers.length; ++i) { //iterate through currNode's leechers

        let currLeecherPromisesFirebase = [];

        for(let i = 0; i < currNode.leechers.length; ++i) {
          currLeecherPromisesFirebase.push(nodeTrackerRef.orderByChild('socketId_origin').equalTo(currNode.leechers[i] + '_' + targetOrigin).once('value'));
        }

        Promise.all(currLeecherPromisesFirebase).then((snapshots) => {
          for(let i=0; i<snapshots.length; i++){
            let snap = snapshots[i];
            let leechers = snap && snap.val();
            if (leechers){
              let currLeecher = leechers[Object.keys(leechers)[0]]; //per alasql call above, only take the first record
              if(isFirstReconnect) { // 1st - reconnecting head leecher to a new source
                currLeecher.source = targetSourceNode.socketId; //update currLeecher's source to be targetSource
                currLeecher.degree = targetSourceNode.degree + 1; // update currLeecher's degree

                // pseudo UPDATE - delete currLeecher Node and then insert it back
                //TODO: make a function for UPDATE

                nodeTrackerRef.orderByChild('socketId_origin').equalTo(currLeecher.socketId + '_' + currLeecher.origin).once('value').then(function(snap){
                  let found = snap && snap.val();
                  debugLog('found', found, DB.FIREBASE);
                  let foundKey = snap.key;
                  debugLog('foundKey', snap.key, DB.FIREBASE);
                  // debugLog('foundRef', snap.ref, DB.FIREBASE);
                  nodeTrackerRef.child(foundKey).set(currLeecher, function (err){
                    if (err){
                      debugLog('currLeecher update err 1', err);
                    } else {
                      debugLog('currLeecher updated successfully 1');
                    }
                  });
                  // snap.ref.set(currLeecher)

                  // update targetSource's leechers to include currLeecher
                  debugLog('attempt push to leechers array targetSourceNode.leechers:', targetSourceNode.leechers, DB.FIREBASE);
                  targetSourceNode.leechers.push(currLeecher.socketId);

                  //check targetSource origin and to decide who to connect to
                  if(targetSourceNode.origin === ''){
                    // emit message to targetSource to 'initiateConnection' with currLeecher
                    io.to(targetSourceNode.socketId).emit('initiateConnection', currLeecher.socketId, currLeecher.origin);
                  } else {
                    // io.to(targetSourceNode.socketId).emit('initiateRelay', currLeecher.socketId, targetSourceNode.source); //??is this line needed??

                    io.to(targetSourceNode.socketId).emit('initiateRelay', currLeecher.socketId, targetSourceNode.source, targetSourceNode.origin);
                  }

                  // emit message to currLeecher that 'broadcasterLeft' which is currNode
                  io.to(currLeecher.socketId).emit('broadcasterLeft', currNode.socketId, currNode.origin);
                  recurseUpdateNodes(currLeecher, targetOriginId, targetSourceNode, false);
                });
              } else { // not 1st update
                // need to increment currLeecher's degree by 1 based on its sourceNode's degree
                currLeecher.degree = currNode.degree + 1;

                // pseudo UPDATE - delete currLeecher Node and then insert it back
                nodeTrackerRef.orderByChild('socketId_origin').equalTo(currLeecher.socketId + '_' + currLeecher.origin).once('value').then(function(snap){
                  let found = snap && snap.val();
                  debugLog('found', found, DB.FIREBASE);
                  let foundKey = snap.key;
                  debugLog('foundKey', snap.key, DB.FIREBASE);
                  // debugLog('foundRef', snap.ref, DB.FIREBASE);
                  nodeTrackerRef.child(foundKey).set(currLeecher, function(err){
                    if (err){
                      debugLog('currLeecher update err 2', err);
                    } else {
                      debugLog('currLeecher updated successfully 2');
                    }

                  });
                  // snap.ref.set(currLeecher)
                  recurseUpdateNodes(currLeecher, targetOriginId, currNode, false); //recursively update the nodeTracker table only, no emitting events
                });

              }
            }
          }
        });
      }
    }
  }

  /*
   * Helper function for recursively tracing through the leechers and removing reference (delete leechers' nodes from the end to beginning) to this broadcaster
   */
  function recurseRemoveNodes(currNode, targetOrigin, noMoreBroadcasters, nodeTrackerRef) {

    if (CURR_DB === DB.ALASQL){
      // iterate through leechers - for each leecher do recursive call
      for(var i = 0; i < currNode.leechers.length; ++i) {
        var currLeecher = alasql('SELECT * FROM nodeTracker WHERE socketId = ? AND origin = ?', [currNode.leechers[i], targetOrigin])[0];
        debugLog('recurseRemoveNodes currLeecher', currLeecher, DB.ALASQL);
        recurseRemoveNodes(currLeecher, targetOrigin, noMoreBroadcasters);
      }

      // done processing leechers - remove this node from nodeTracker
      alasql('DELETE FROM nodeTracker WHERE socketId = ? AND origin = ?', [currNode.socketId, currNode.origin]);
      debugLog('DELETED. nodeTracker:',alasql('SELECT * FROM nodeTracker'), DB.ALASQL);
      // client side notification - emit message to leechers that noMoreBroadcasters or broadcasterLeft to clean up conspectio.connections{}
      if(currNode.origin) {
        if(noMoreBroadcasters) {
          io.to(currNode.socketId).emit('noMoreBroadcasters', currNode.source, currNode.origin);
          //emit to currNode.source that 'viewerLeft' for currNode where origin is currNode.origin
          io.to(currNode.source).emit('viewerLeft', currNode.socketId, currNode.origin);
        } else {
          io.to(currNode.socketId).emit('broadcasterLeft', currNode.source, currNode.origin);
        }
      }
    } else if (CURR_DB === DB.FIREBASE){
      let currLeecherPromisesFirebase = [];

      debugLog('!!!!! RECURSE REMOVE CHECKING currNode.leechers', currNode.leechers, DB.FIREBASE);
      if (currNode.leechers === undefined){
        return;
      }

      debugLog('!!!!! RECURSE REMOVE CHECKING MADE IT!!!', currNode.leechers, DB.FIREBASE);

      for(let i = 0; i < currNode.leechers.length; ++i) {
        currLeecherPromisesFirebase.push(nodeTrackerRef.orderByChild('socketId_origin').equalTo(currNode.leechers[i] + '_' + targetOrigin).once('value'));
      }

      Promise.all(currLeecherPromisesFirebase).then((snapshots) => {
        for(let i=0; i<snapshots.length; i++){
          let snap = snapshots[i];
          let leechers = snap && snap.val();
          if (leechers){
            let currLeecher = leechers[Object.keys(leechers)[0]]; //per alasql call above, only take the first record
            debugLog('recurseRemoveNodes currLeecher', currLeecher, DB.FIREBASE);
            recurseRemoveNodes(currLeecher, targetOrigin, noMoreBroadcasters); //create a new Node for each leecher - copy the leecher for the otherBroadcasters
          }
        }

        // done processing leechers - remove this node from nodeTracker https://stackoverflow.com/a/38684411
        nodeTrackerRef.orderByChild('socketId_origin').equalTo(currNode.socketId + '_' + currNode.origin).once('value').then(function(snap){
          let updates = {};
          snap.forEach(child => updates[child.key] = null);
          //debugLog('NODES TO BE DELETED', updates);
          nodeTrackerRef.update(updates, function(err){ //peform deletions
            if (err){
              //debugLog('recurseRemoveNodes ERROR DELETING NODES', err, DB.FIREBASE);
            } else {
              //debugLog('recurseRemoveNodes', 'NODES DELETED SUCCESSFULLY', DB.FIREBASE);
              if(currNode.origin) { //client side notification - emit message to leechers that noMoreBroadcasters or broadcasterLeft to clean up conspectio.connections{}
                if(noMoreBroadcasters) {
                  io.to(currNode.socketId).emit('noMoreBroadcasters', currNode.source, currNode.origin);
                  io.to(currNode.source).emit('viewerLeft', currNode.socketId, currNode.origin); //emit to currNode.source that 'viewerLeft' for currNode where origin is currNode.origin
                } else {
                  io.to(currNode.socketId).emit('broadcasterLeft', currNode.source, currNode.origin);
                }
              }
            }
          });
        })
      });
    }
  }
}

/*
 * Helper function flattens an array to one level
 */
function flattenDeep(array) {
  function recurse(array, finalArr){
    for (var i = 0; i < array.length; i++) {
      if (array[i].constructor !== Array) {
        finalArr.push(array[i]);
      } else {
        recurse(array[i], finalArr);
      }
    }
    return finalArr;
  }
  return recurse(array, []);
}
