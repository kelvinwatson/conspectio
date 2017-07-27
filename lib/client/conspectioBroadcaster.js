const send = require('./send.js');
// const {coldBrewRTC} = require('cold-brew/rtc');

// custom wrapper class over RTCPeerConnection object
class ConspectioBroadcaster {
  constructor(viewerId, stream, originId) {
    this.viewerId = viewerId;
    this.pc;
    this.stream = stream;
    this.originId = originId;
  }

  init() {
    // this.pc = coldBrewRTC({

    //add same stun server for chrome
    var servers = {
      iceServers: [{
        urls: 'stun:stun.services.mozilla.com'
      }]
    };

    if (typeof DetectRTC !== 'undefined' && DetectRTC.browser.isFirefox && DetectRTC.browser.version <= 38) {
        servers[0] = {
            url: servers[0].urls
        };
    }

    this.pc = new RTCPeerConnection(servers, null, {label: this.originId + this.broadcasterId});
    this.pc.viewerId = this.viewerId; // add custom attribute
    this.pc.originId = this.originId; // add custom attribute
    this.pc.onicecandidate = this.handleIceCandidate;
    this.pc.addStream(this.stream);
    this.pc.oniceconnectionstatechange = this.handleIceConnectionChange;
  }

  handleIceCandidate(event) {
    if(event.candidate) {
      send(this.viewerId, {
        type: "candidate",
        candidate: event.candidate
      }, this.originId);
    }
  }

  handleIceConnectionChange() {
    if(this.pc) {
      console.log('inside handleIceCandidateDisconnect', this.pc.iceConnectionState);
    }
  }

  createOfferWrapper(toId) {
    this.pc.createOffer( (offer) => {
      var toId = toId || this.viewerId;
      send(toId, {
        type: "offer",
        offer: offer
      }, this.originId);

      var tmp = new RTCSessionDescription(offer);
      // set bandwidth constraints for webrtc peer connection
      var bandwidth = this.setSDPBandwidth(tmp.sdp);
      var sdpObj = {
        type: 'offer',
        sdp: bandwidth
      };
      var sessionDescription = new RTCSessionDescription(sdpObj);
      this.pc.setLocalDescription(sessionDescription);
    }, (error) => {
      console.log('Error with creating broadcaster offer', error);
    },{
      iceRestart: true
    });
  }

  receiveAnswer(answer) {
    this.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  addCandidate(candidate) {
    this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  removeStreamWrapper() {
    this.pc.removeStream(this.stream);
  }

  replaceStreamWrapper(sourceStream) {
    this.pc.removeStream(this.stream);
    this.pc.addStream(sourceStream);
  }

  closeWrapper() {
    this.pc.close();
  }

  setSDPBandwidth(sdp) {
    sdp = sdp.replace( /b=AS([^\r\n]+\r\n)/g , '');
    sdp = sdp.replace( /a=mid:audio\r\n/g , 'a=mid:audio\r\nb=AS:50\r\n');
    sdp = sdp.replace( /a=mid:video\r\n/g , 'a=mid:video\r\nb=AS:256\r\n');
    return sdp;
  }
}

module.exports = ConspectioBroadcaster;
