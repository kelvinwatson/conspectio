// require in jquery
const $ = require("jquery");

const setupGetUserMedia = (videoEl, userChosenVideoDeviceId, callback) => {

  // retrieve getUserMedia
  navigator.getUserMedia = (navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia);

  //use the device chosen by the user
  if (userChosenVideoDeviceId) {
    if (navigator.getUserMedia) {
      console.log('in setupGetUserMedia: userChosenVideoDeviceId',userChosenVideoDeviceId);
      navigator.getUserMedia({video: {deviceId: userChosenVideoDeviceId ? {exact: userChosenVideoDeviceId} : undefined}, audio: true}, handleVideo, videoError);
    }
  } else {   //uses FRONT facing camera by default if one is available
    navigator.mediaDevices.enumerateDevices().then(function(devices){
      var videoList = [];
      var videoSource;
      for (var i = 0; i < devices.length; i++){
        if (devices[i].kind === 'videoinput'){
          videoList.push(devices[i].deviceId);
          if(devices[i].kind.length > 1){
            videoSource = videoList[0]; //front cam
          } else {
            videoSource = videoList[1];
          }
        }
      }
      if (navigator.getUserMedia) {
        navigator.getUserMedia({video: {deviceId: videoSource ? {exact: videoSource} : undefined}, audio: true}, handleVideo, videoError);
      }
    }).catch(function(err){console.log('Error in retrieving MediaDevices:', err);});
  }

  //TODO: WHY DOES DIANA NEED THIS???
  // if (navigator.getUserMedia) {
  //   navigator.getUserMedia({video: true, audio: true}, handleVideo, videoError);
  // }

  function handleVideo(stream) {
    // grab the broadcasterStream dom element and set the src
    videoEl.src = window.URL.createObjectURL(stream);

    // invoke callback - which will call broadcasterRTCEndpoint(stream) on the conspectioConnection
    callback(stream);
  }

  function videoError(e) {
      // log video error
      console.log('Unable to get stream from getUserMedia', e);
  }

};

module.exports = setupGetUserMedia;
