// require in jquery
const $ = require("jquery");
const send = require('./send.js');
// const {coldBrewRTC} = require('cold-brew/rtc');

let pc;

// custom wrapper class over RTCPeerConnection object
class ConspectioViewer {
  constructor(broadcasterId, viewerHandlers, originId) {
    this.broadcasterId = broadcasterId;
    this.viewerHandlers = viewerHandlers;
    pc;
    this.remoteStream;
    this.originId = originId;
  }

  init() {
    // pc = coldBrewRTC({

    var servers = {
        iceServers: [{
            urls: 'stun:stun.services.mozilla.com'
        }]
    };

    if (typeof DetectRTC !== 'undefined' && DetectRTC.browser.isFirefox && DetectRTC.browser.version <= 38) {
        servers[0] = {
            url: servers[0].urls
        };
    };
    pc = new RTCPeerConnection(servers, null, {label: this.originId + this.broadcasterId});

    pc.broadcasterId = this.broadcasterId; // add custom attribute
    pc.viewerHandlers = this.viewerHandlers; // add custom attribute
    pc.originId = this.originId; // add custom attribute
    var that = this;
    console.log('initializing setRemoteStream');
    pc.setRemoteStream = (stream) => {
      that.remoteStream = stream;
      //informs server to look up potential leechers of viewer that just received stream
      //broadcasterId represents socketId of source of the node emitting 'receivedStream'
      console.log('INSIDE SET REMOTE STREAM - broadcasterId:', that.broadcasterId, 'originId:', that.originId);
      conspectio.socket.emit('receivedStream', that.broadcasterId, that.originId);
    };
    pc.onicecandidate = this.handleIceCandidate;
    pc.onaddstream = this.handleRemoteStreamAdded;
    console.log('initializing onAddStream');
    pc.onremovestream = this.handleRemoteStreamRemoved;
    pc.oniceconnectionstatechange = this.handleIceConnectionChange;
  }

  handleIceCandidate(event) {
    console.log('handleIceCandidate event: ', event);
    if(event.candidate) {
      send(this.broadcasterId, {
        type: "candidate",
        candidate: event.candidate
      }, this.originId);
    }
  }

  handleRemoteStreamAdded(event) {
    const compositeKey = pc.originId + pc.broadcasterId;
    // got remote video stream, now let's show it in a video tag
    var video;

    var video = document.createElement('video');
    if (window.safari){
      video.srcObject = event.stream;
    //   video = $('<video class="newVideo"></video>').attr(
    //     {
    //       'srcObject': event.stream,
    //       'autoplay': true,
    //       'id': compositeKey
    //     });
    // } else {
    //   video = $('<video class="newVideo"></video>').attr(
    //     {
    //       'src': window.URL.createObjectURL(event.stream),
    //       'autoplay': true,
    //       'id': compositeKey
    //     });
    } else {
      video.src = window.URL.createObjectURL(event.stream);
    }
    video.autoplay = true;
    video.id = compositeKey;


    debugger;

    pc.setRemoteStream(event.stream);
    console.log('STREAM:', event.stream);
    // invoke broadcasterAdded callback
    if(pc.viewerHandlers && pc.viewerHandlers.broadcasterAdded) {
      pc.viewerHandlers.broadcasterAdded(video);
    }
  }

  handleRemoteStreamRemoved(event) {
    // don't think this handler is being invoked
    console.log('broadcaster stream removed');
  }

  handleIceConnectionChange() {
    if(pc) {
      console.log('inside handleIceCandidateDisconnect', pc.iceConnectionState);
    }
  }

  receiveOffer(offer) {
    pc.setRemoteDescription(new RTCSessionDescription(offer));
  }

  createAnswerWrapper() {
    pc.createAnswer( (answer) => {

      // set bandwidth constraints for webrtc peer connection
      var tmp = new RTCSessionDescription(answer);
      var bandwidth = this.setSDPBandwidth(tmp.sdp);
      var sdpObj = {
        type: 'answer',
        sdp: bandwidth
      };
      var sessionDescription = new RTCSessionDescription(sdpObj);
      // sessionDescription.sdp = this.setSDPBandwidth(sessionDescription.sdp);
      pc.setLocalDescription(sessionDescription);

      send(this.broadcasterId, {
        type: "answer",
        answer: answer
      }, this.originId);
    }, (error) => {
      console.log('Error with creating viewer offer', error);
    });
  }

  addCandidate(candidate) {
    pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  closeWrapper() {
    pc.close();
  }

  setSDPBandwidth(sdp) {
    sdp = sdp.replace( /b=AS([^\r\n]+\r\n)/g , '');
    sdp = sdp.replace( /a=mid:audio\r\n/g , 'a=mid:audio\r\nb=AS:50\r\n');
    sdp = sdp.replace( /a=mid:video\r\n/g , 'a=mid:video\r\nb=AS:256\r\n');
    return sdp;
  }
}

module.exports = ConspectioViewer;
