/*
 * Copyright (c) 2014 by Center Open Middleware. All Rights Reserved.
 * Titanium Appcelerator 3.2.0GA
 * Licensed under the terms of the Apache Public License
 * Please see the LICENSE included with this distribution for details.
 */

"use strict";

/**
 * Response indicating the operation status and result
 * @typedef ResponseCallback
 * @property {String} status It should be "SUCCESS" or "FAILURE"
 * @property {String} data It should be the resulted data.
 */

/**
 * @callback ShowCameraCallback
 * @param {ResponseCallback} response
 */

/* FYI: http://docs.appcelerator.com/titanium/3.0/#!/api/Titanium.Media*/
var Camera = (function() {

    var CALL_FAILURE = "call failed: ";

    var TiError = function TiError (msg) {
        this.name = "TiError";
        this.message = msg;
    };

    TiError.prototype = new Error();

    /** It returns the result of Ti.Media native call.
     *  @private
     *  @param {String} funcName : The function name.
     *  @return Object : Native result. */
    var returnFunction = function returnFunction(funcName){
        var result;

        try {
            result = Ti.Media[funcName]();
        } catch (e) {
            throw new TiError(funcName + " " + CALL_FAILURE + e.message);
        }

        return result;
    };

    /** It calls Ti.Media native method.
     *  @private
     *  @param {String} funcName : The function name.
     *  @param {String} params : An array of params. */
    var process = function process (funcName, params) {
        try {
            if (!params) {
                Ti.Media[funcName].apply(Ti.Media[funcName]);
            } else {
                var paramsIsArray = params instanceof Array;
                if (!paramsIsArray) {
                    throw new TypeError("returnFunction call failed. 'params' is not an Array.");
                }
                Ti.Media[funcName].apply(Ti.Media[funcName], params);
            }
        } catch (e) {
            throw new TiError(funcName + " " + CALL_FAILURE + e.message);
        }
    };

    /** It allows to take pictures from native camera.
     * @author Santiago Blanco
     * @version 1.0.0
     * @alias API.Camera
     * @namespace */
    var self = {};

    /** Gets the value of the availableCameras property.
     * @return {Number[]} : CAMERA_FRONT, CAMERA_REAR or both*/
    self.getAvailableCameras = function getAvailableCameras() {
        return returnFunction("getAvailableCameras");
    };

    /** Gets the value of the isCameraSupported property.
     * @return {Boolean} */
    self.isCameraSupported = function isCameraSupported() {
        return returnFunction("isCameraSupported");
    };

    /** Shows the camera. The native camera controls are displayed. A photo can
     * be taken and it will returned in callback first parameter.
     * @param {ShowCameraCallback} callback
     * @param {Object} [options] Aditional options that should be passed as
     *  parameter of native call */
    self.showCamera = function showCamera(callback, options) {
        var key;
        var showCameraOptions = {
            success: function (e) {
                if (e.mediaType === Titanium.Media.MEDIA_TYPE_PHOTO) {
                    callback({
                        status: "SUCCESS",
                        data: Ti.Utils.base64encode(e.media).toString()
                    });
                }
            },
            error: function (e) {
                callback({
                    status: "ERROR"
                });
            },
            cancel: function (e) {
                callback({
                    status: "CANCEL"
                });
            },
            allowEditing: false,
            autoHide: false,
            saveToPhotoGallery: false,
            mediaTypes: [Ti.Media.MEDIA_TYPE_PHOTO]
        };
        if (options) {
            for (key in options) {
                if (options.hasOwnProperty(key)) {
                    showCameraOptions[key] = options[key];
                }
            }
        }
        Ti.Media.showCamera(showCameraOptions);
    };

    return self;

}());

module.exports = Camera;
