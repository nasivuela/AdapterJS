(function () {

  'use strict';

  var baseGetUserMedia = null;

  AdapterJS.TEXT.EXTENSION = {
    REQUIRE_INSTALLATION_FF: 'To enable screensharing you need to install the Skylink WebRTC tools Firefox Add-on.',
    REQUIRE_INSTALLATION_CHROME: 'To enable screensharing you need to install the Skylink WebRTC tools Chrome Extension.',
    REQUIRE_REFRESH: 'Please refresh this page after the Skylink WebRTC tools extension has been installed.',
    BUTTON_FF: 'Install Now',
    BUTTON_CHROME: 'Go to Chrome Web Store',
    CHROME_EXTENSION_ID: 'ncpocaejmldniphcnieejjaadcfhebii'//'ljckddiekopnnjoeaiofddfhgnbdoafc'
  };

  var clone = function(obj) {
    if (null === obj || 'object' !== typeof obj) {
      return obj;
    }
    var copy = obj.constructor();
    for (var attr in obj) {
      if (obj.hasOwnProperty(attr)) {
        copy[attr] = obj[attr];
      }
    }
    return copy;
  };

  if (window.navigator.mozGetUserMedia) {
    baseGetUserMedia = window.navigator.getUserMedia;

    navigator.getUserMedia = function (constraints, successCb, failureCb) {

      if (constraints && constraints.video && !!constraints.video.mediaSource) {
        // intercepting screensharing requests

        // Invalid mediaSource for firefox, only "screen" and "window" are supported
        if (constraints.video.mediaSource !== 'screen' && constraints.video.mediaSource !== 'window') {
          failureCb(new Error('GetUserMedia: Only "screen" and "window" are supported as mediaSource constraints'));
          return;
        }

        var updatedConstraints = clone(constraints);

        //constraints.video.mediaSource = constraints.video.mediaSource;
        updatedConstraints.video.mozMediaSource = updatedConstraints.video.mediaSource;

        // so generally, it requires for document.readyState to be completed before the getUserMedia could be invoked.
        // strange but this works anyway
        var checkIfReady = setInterval(function () {
          if (document.readyState === 'complete') {
            clearInterval(checkIfReady);

            baseGetUserMedia(updatedConstraints, successCb, function (error) {
              if (['PermissionDeniedError', 'SecurityError'].indexOf(error.name) > -1 && window.parent.location.protocol === 'https:') {
                AdapterJS.renderNotificationBar(AdapterJS.TEXT.EXTENSION.REQUIRE_INSTALLATION_FF,
                  AdapterJS.TEXT.EXTENSION.BUTTON_FF,
                  'https://addons.mozilla.org/en-US/firefox/addon/skylink-webrtc-tools/', true, true);
              } else {
                failureCb(error);
              }
            });
          }
        }, 1);

      } else { // regular GetUserMediaRequest
        baseGetUserMedia(constraints, successCb, failureCb);
      }
    };

    AdapterJS.getUserMedia = window.getUserMedia = navigator.getUserMedia;
    navigator.mediaDevices.getUserMedia = function(constraints) {
      return new Promise(function(resolve, reject) {
        window.getUserMedia(constraints, resolve, reject);
      });
    };

  } else if (window.navigator.webkitGetUserMedia) {
    baseGetUserMedia = window.navigator.getUserMedia;

    navigator.getUserMedia = function (constraints, successCb, failureCb) {
      if (constraints && constraints.video && !!constraints.video.mediaSource) {
        if (window.webrtcDetectedBrowser !== 'chrome') {
          // This is Opera, which does not support screensharing
          failureCb(new Error('Current browser does not support screensharing'));
          return;
        }

        // Check if extension is installed first
        var image = document.createElement('img');

        image.src = 'chrome-extension://' + AdapterJS.TEXT.EXTENSION.CHROME_EXTENSION_ID + '/icon.png';

        image.onload = function () {
          var extensionVersion = null,
              terminated = false;

          var checkEnabledTimeout = setTimeout(function () {
            if (!extensionVersion) {
              terminated = true;
              failureCb(new Error('Failed retrieving selected screen as connection to extension is not active'));
            }
          }, 2500);

          chrome.runtime.sendMessage(AdapterJS.TEXT.EXTENSION.CHROME_EXTENSION_ID, {
            action: 'get-version'
          }, function (versionResult) {
            console.info('result1', versionResult);
            extensionVersion = versionResult ? versionResult.version : null;

            if (!terminated && extensionVersion) {
              clearTimeout(checkEnabledTimeout);

              // Obtain chromeMediaSourceId
              chrome.runtime.sendMessage(AdapterJS.TEXT.EXTENSION.CHROME_EXTENSION_ID, {
                action: 'get-source',
                requireAudio: !!constraints.audio,
                browserName: window.webrtcDetectedBrowser,
                browserVersion: window.webrtcDetectedVersion

              }, function (sourceResult) {
                console.info('result', sourceResult);

                if (!(sourceResult && !!sourceResult.sourceId)) {
                  failureCb(new Error('Permission denied for screen retrieval'));
                  return;
                }

                if (!!constraints.audio && !hasAudioSupport) {
                  log.warn('Audio is disabled for selected screen as current browser version does not support it');
                }

                var updatedConstraints = {
                  video: {
                    mandatory: {
                      chromeMediaSource: 'desktop',
                      chromeMediaSourceId: sourceResult.sourceId,
                      minFrameRate: 30,
                      maxFrameRate: 64,
                      maxWidth: 1920,
                      maxHeight: 1080,
                      minAspectRatio: 1.77
                    },
                    optional: [{
                      bandwidth: 1920 * 8 * 1024
                    }]
                  },
                  audio: false
                };

                // Check if audio is supported first
                if (sourceResult.hasAudioSupport) {
                  updatedConstraints.audio = {
                    mandatory: {
                      chromeMediaSource: 'desktop',
                      chromeMediaSourceId: sourceResult.sourceId,
                    },
                    optional: [{
                      bandwidth: updatedConstraints.video.mandatory.maxWidth * 8 * 1024
                    }]
                  };
                }

                baseGetUserMedia(updatedConstraints, successCb, failureCb);
              });
            }
          });
        };

        image.onerror = function () {
          AdapterJS.renderNotificationBar(AdapterJS.TEXT.EXTENSION.REQUIRE_INSTALLATION_CHROME,
            AdapterJS.TEXT.EXTENSION.BUTTON_CHROME,
            'https://chrome.google.com/webstore/detail/skylink-webrtc-tools/' +
            AdapterJS.TEXT.EXTENSION.CHROME_EXTENSION_ID, true, true);
        };

      } else {
        baseGetUserMedia(constraints, successCb, failureCb);
      }
    };

    AdapterJS.getUserMedia = window.getUserMedia = navigator.getUserMedia;
    navigator.mediaDevices.getUserMedia = function(constraints) {
      return new Promise(function(resolve, reject) {
        window.getUserMedia(constraints, resolve, reject);
      });
    };

  } else if (navigator.mediaDevices && navigator.userAgent.match(/Edge\/(\d+).(\d+)$/)) {
    // nothing here because edge does not support screensharing
    console.warn('Edge does not support screensharing feature in getUserMedia');

  } else {
    baseGetUserMedia = window.navigator.getUserMedia;

    navigator.getUserMedia = function (constraints, successCb, failureCb) {
      if (constraints && constraints.video && !!constraints.video.mediaSource) {
        // would be fine since no methods
        var updatedConstraints = clone(constraints);

        // wait for plugin to be ready
        AdapterJS.WebRTCPlugin.callWhenPluginReady(function() {
          // check if screensharing feature is available
          if (!!AdapterJS.WebRTCPlugin.plugin.HasScreensharingFeature &&
            !!AdapterJS.WebRTCPlugin.plugin.isScreensharingAvailable) {
            // set the constraints
            updatedConstraints.video.optional = updatedConstraints.video.optional || [];
            updatedConstraints.video.optional.push({
              sourceId: AdapterJS.WebRTCPlugin.plugin.screensharingKey || 'Screensharing'
            });

            delete updatedConstraints.video.mediaSource;
          } else {
            failureCb(new Error('Your version of the WebRTC plugin does not support screensharing'));
            return;
          }
          baseGetUserMedia(updatedConstraints, successCb, failureCb);
        });
      } else {
        baseGetUserMedia(constraints, successCb, failureCb);
      }
    };

    AdapterJS.getUserMedia = getUserMedia =
       window.getUserMedia = navigator.getUserMedia;
    if ( navigator.mediaDevices &&
      typeof Promise !== 'undefined') {
      navigator.mediaDevices.getUserMedia = requestUserMedia;
    }
  }
})();