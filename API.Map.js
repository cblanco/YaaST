/**
 * Copyright (c) 2014 by Center Open Middleware. All Rights Reserved.
 * Titanium Appcelerator 3.3.0GA
 * Licensed under the terms of the Apache Public License
 * Please see the LICENSE included with this distribution for details.
 */

"use strict";

var Cache = function Cache(size) {

    this._data = {};
    this._maxSize = size;
    this._nextElement = 0;

    this.get = function(key) {

        if (this._data[key] != null)
            return this._data[key].value;

    };

    this.add = function(key, value) {

        //If is full, remove the oldest
        if (this._nextElement >= this._maxSize) {
            var toBeRemoved = this._nextElement - this._maxSize;
            for (var key in this._data) {
                if (this._data[key].order == toBeRemoved) {
                    delete this._data[key];
                    break;
                }
            }

            this._nextElement++;
        }

        this._data[key] = {
            value : value,
            order : this._nextElement
        };
    };

};

/** 
 * Map API.
 * @class
 * @memberof API
 */
var Map = ( function() {

    var _self = {
        Map : require('ti.map')
    }, mapsId = 0, mapsList = {}, cache = new Cache(20);

    var freeElements = {
        "polygons" : {},
        "layers" : {},
        "routes" : {},
        "annotations" : {}
    };

    //Start event listener for the bridge
    var handlers = {};
    var eventHandler = function(event, elementType, elementId, e) {
        for (var key in e) {
            if (e[key].getId != null) {
                e[key] = e[key].getId();
            }
        }
        Ti.App.fireEvent("API_MAP_EVENT", {
            event : event,
            elementId : elementId,
            data : e,
            elementType : elementType
        });
    };
    Ti.App.addEventListener("API_MAP_EDIT_EVENT", function(data) {
        //TODO: check events?

        var element = getElement(data.elementType, data.elementId);
        if (element == null)
            return;

        if (data.action === "add") {
            if (handlers[data.elementId] == null || handlers[data.elementId][data.event] == null) {
            	if(handlers[data.elementId] == null){
            		handlers[data.elementId] = {};
            	}
                handlers[data.elementId][data.event] = {
                    count : 1,
                    handler : eventHandler.bind(null, data.event, data.elementType, data.elementId)
                };
                element.addEventListener(data.event, handlers[data.elementId][data.event].handler);
            } else
                handlers[data.elementId][data.event].count++;
        } else if (data.action === "remove") {

            if (handlers[data.elementId] != null && handlers[data.elementId][data.event] != null) {
                if (--handlers[data.elementId][data.event].count <= 0) {
                    element.removeEventListener(data.event, handlers[data.elementId][data.event].handler);
                    handlers[data.elementId][data.event].handler = null;
                    delete handlers[data.elementId][data.event];
                    
                    var count = 0;
                    for(var a in handlers[data.elementId]) 
                    	count++;
                	if(count === 0)
                		delete handlers[data.elementId];
                }
            }
        }
    });

    /*
     * ------------------------ PRIVATE UTILS -------------------------------
     */

    var getSetProperty = function(elementType, elementId, propertyName, propertyValue) {

        var element = getElement(elementType, elementId);

        // Check if the element was found
        if (element != null) {

            //Capitalize the first letter
            propertyName = propertyName.charAt(0).toUpperCase() + propertyName.slice(1);

            if (propertyValue === undefined) {//Getter

                // Check if the getter method exists
                if (element["get" + propertyName] != null) {

                    //Call the getter
                    return element["get"+ propertyName]();

                } else {
                     throw "Getter method not found";
                }

            } else {//Setter

                // Check if the getter method exists
                if (element["set" + propertyName] != null) {

                    //Call the setter
                    element["set"+ propertyName](propertyValue);
                    
                    //If the value has not changed, an error happened
                    if(element["get"+ propertyName]() != propertyValue)
                    	throw "Exception while setting value for " + propertyName;

                } else {
                    throw "Setter method not found";
                }

            }

        } else {
            throw "Unknown Element Id (" + elementId + ")";
        }

    };

    /**
     * ElementType: map | annotation | layer | polygon | route
     */
    var getElement = function(elementType, elementId) {

        //If it is a map, it does not need search, just return it
        if (elementType === "map")
            return mapsList[elementId];

        var element = null;

        //First search in the cache
        element = cache.get(elementId);

        //If found, return it;  otherwise, find it and add it to the cache
        if (element != null)
            return element;

        // Search in the maps
        for (var mapId in mapsList) {
            if (elementType === "annotation") {
                element = mapsList[mapId].getAnnotations()[elementId];
            } else if (elementType === "layer") {
                element = mapsList[mapId].getLayers()[elementId];
            } else if (elementType === "polygon") {
                element = mapsList[mapId].getPolygons()[elementId];
            } else if (elementType === "route") {
                element = mapsList[mapId].getRoutes()[elementId];
            } else {
                //TODO: Error Unknown element type
                return;
            }

            if (element != null)
                break;
        }

        // If not found, get it from the not added elements
        if (element == null) {
            if (elementType === "annotation") {
                element = freeElements["annotations"][elementId];
            } else if (elementType === "layer") {
                element = freeElements["layers"][elementId];
            } else if (elementType === "polygon") {
                element = freeElements["polygons"][elementId];
            } else if (elementType === "route") {
                element = freeElements["routes"][elementId];
            }
        }

        // If not found and is an annotation, search between the polygon annotations
        if (element == null && elementType === "annotation") {
            element = getAnnotationFromPolygons(elementId);
        }

        // Add it to the cache
        if (element != null)
            cache.add(elementId, element);

        return element;

    };

    var getProperty = function(elementType, elementId, propertyName) {
        getSetProperty(elementType, elementId, propertyName);
    };

    var setProperty = function(elementType, elementId, propertyName, propertyValue) {
        getSetProperty(elementType, elementId, propertyName, propertyValue);
    };

    var getAnnotationFromPolygons = function(annoId) {

        var annotation = null;

		//Search now between the polygon annotations added to the maps
        for (var mapId in mapsList) {

            var polygons = mapsList[mapId].getPolygons();
            for (var polyId in polygons) {
                var poly = polygons[polyId];
                if (poly.annotation != null && poly.annotation.getId() == annoId) {
                    return poly.annotation;
                }
            }
        }

        return annotation;
    };

    var handleParserResult = function(obj) {

        if (obj == null)
            return obj;

        var result = {
            "polygons" : [],
            "routes" : [],
            "annotations": []
        };

        for (var x in obj.polygons) {
            var id = obj.polygons[x].getId();
            freeElements["polygons"][id] = obj.polygons[x];
            result.polygons.push(id);
        }
        for (var x in obj.routes) {
            var id = obj.routes[x].getId();
            freeElements["routes"][id] = obj.routes[x];
            result.routes.push(id);
        }
        for (var x in obj.annotations) {
            var id = obj.annotations[x].getId();
            freeElements["annotations"][id] = obj.annotations[x];
            result.annotations.push(id);
        }

        return result;

    };

    /*
     * ------------------------ MAP -------------------------------
     */

    /*
     * CONSTANTS
     */
    
    
    /**
     * Block level accuracy is considered to be about 100 meter accuracy. Using a coarse accuracy such as this often consumes less power.
     * @constant
     * @memberof API.Map
     * @alias PRIORITY_BALANCED_POWER_ACCURACY
     */
    _self.PRIORITY_BALANCED_POWER_ACCURACY = _self.Map.PRIORITY_BALANCED_POWER_ACCURACY;
    
    /**
     * Request the most accurate locations available. This will return the finest location available. 
     * @constant
     * @memberof API.Map
     * @alias PRIORITY_HIGH_ACCURACY
     */
    _self.PRIORITY_HIGH_ACCURACY = _self.Map.PRIORITY_HIGH_ACCURACY;
    
    /**
     * Used to request "city" level accuracy. City level accuracy is considered to be about 10km accuracy. Using a coarse accuracy such as this 
     * often consumes less power. 
     * @constant
     * @memberof API.Map
     * @alias PRIORITY_LOW_POWER
     */
    _self.PRIORITY_LOW_POWER = _self.Map.PRIORITY_LOW_POWER;
    
    /**
     * Used to request the best accuracy possible with zero additional power consumption. No locations will be returned unless a different client 
     * has requested location updates in which case this request will act as a passive listener to those locations. 
     * @constant
     * @memberof API.Map
     * @alias PRIORITY_NO_POWER
     */
    _self.PRIORITY_NO_POWER = _self.Map.PRIORITY_NO_POWER;
    
    /**
     * Use the default accuracy.
     * @constant
     * @memberof API.Map
     * @alias PRIORITY_UNDEFINED
     */
    _self.PRIORITY_UNDEFINED = -1;
	
	
	
	
	/**
     * Normal layer.
     * @constant
     * @memberof API.Map
     * @alias NORMAL_TYPE
     */
    _self.NORMAL_TYPE = _self.Map.NORMAL_TYPE;
    
    /**
     * Terrain layer.
     * @constant
     * @memberof API.Map
     * @alias TERRAIN_TYPE
     */
    _self.TERRAIN_TYPE = _self.Map.TERRAIN_TYPE;
    
    /**
     * Satellite layer.
     * @constant
     * @memberof API.Map
     * @alias SATELLITE_TYPE
     */
    _self.SATELLITE_TYPE = _self.Map.SATELLITE_TYPE;
    
    /**
     * Hybrid layer.
     * @constant
     * @memberof API.Map
     * @alias HYBRID_TYPE
     */
    _self.HYBRID_TYPE = _self.Map.HYBRID_TYPE;
    
    
    
	/**
     * Predefined HUE azure color for the annotation.
     * @constant
     * @memberof API.Map
     * @alias ANNOTATION_AZURE
     */
    _self.ANNOTATION_AZURE = _self.Map.ANNOTATION_AZURE;
    
    /**
     * Predefined HUE blue color for the annotation.
     * @constant
     * @memberof API.Map
     * @alias ANNOTATION_BLUE
     */
    _self.ANNOTATION_BLUE = _self.Map.ANNOTATION_BLUE;
    
    /**
     * Predefined HUE cyan color for the annotation.
     * @constant
     * @memberof API.Map
     * @alias ANNOTATION_CYAN
     */
    _self.ANNOTATION_CYAN = _self.Map.ANNOTATION_CYAN;
    
    /**
     * Predefined HUE green color for the annotation.
     * @constant
     * @memberof API.Map
     * @alias ANNOTATION_GREEN
     */
    _self.ANNOTATION_GREEN = _self.Map.ANNOTATION_GREEN;
    
    /**
     * Predefined HUE magenta color for the annotation.
     * @constant
     * @memberof API.Map
     * @alias ANNOTATION_MAGENTA
     */
    _self.ANNOTATION_MAGENTA = _self.Map.ANNOTATION_MAGENTA;
    
    /**
     * Predefined HUE orange color for the annotation.
     * @constant
     * @memberof API.Map
     * @alias ANNOTATION_ORANGE
     */
    _self.ANNOTATION_ORANGE = _self.Map.ANNOTATION_ORANGE;
    
    /**
     * Predefined HUE red color for the annotation.
     * @constant
     * @memberof API.Map
     * @alias ANNOTATION_RED
     */
    _self.ANNOTATION_RED = _self.Map.ANNOTATION_RED;
    
    /**
     * Predefined HUE rose color for the annotation.
     * @constant
     * @memberof API.Map
     * @alias ANNOTATION_ROSE
     */
    _self.ANNOTATION_ROSE = _self.Map.ANNOTATION_ROSE;
    
    /**
     * Predefined HUE violet color for the annotation.
     * @constant
     * @memberof API.Map
     * @alias ANNOTATION_VIOLET
     */
    _self.ANNOTATION_VIOLET = _self.Map.ANNOTATION_VIOLET;
    
    /**
     * Predefined HUE yellow color for the annotation.
     * @constant
     * @memberof API.Map
     * @alias ANNOTATION_YELLOW
     */
    _self.ANNOTATION_YELLOW = _self.Map.ANNOTATION_YELLOW;




	/**
     * WMS 1.1.1 layer type.
     * @constant
     * @memberof API.Map
     * @alias LAYER_TYPE_WMS_1_1_1
     */
    _self.LAYER_TYPE_WMS_1_1_1 = _self.Map.LAYER_TYPE_WMS_1_1_1;
    
    /**
     * WMS 1.3.0 layer type.
     * @constant
     * @memberof API.Map
     * @alias LAYER_TYPE_WMS_1_3_0
     */
    _self.LAYER_TYPE_WMS_1_3_0 = _self.Map.LAYER_TYPE_WMS_1_3_0;
    
    /**
     * WMTS 1.0.0 layer type. Currently not supported.
     * @constant
     * @memberof API.Map
     * @alias LAYER_TYPE_WMTS_1_0_0
     */
    _self.LAYER_TYPE_WMTS_1_0_0 = _self.Map.LAYER_TYPE_WMTS_1_0_0;
    
    /**
     * PNG image format.
     * @constant
     * @memberof API.Map
     * @alias FORMAT_PNG
     */
    _self.FORMAT_PNG = _self.Map.FORMAT_PNG;
    
    /**
     * JPEG image format.
     * @constant
     * @memberof API.Map
     * @alias FORMAT_JPEG
     */
    _self.FORMAT_JPEG = _self.Map.FORMAT_JPEG;
    
    
    /**
     * Check if there is support for the map.
     * @memberof API.Map
     * @alias isMapAvailable
     * @return {Boolean} True if it can be used.
     */
    _self.isMapAvailable = function isMapAvailable(){
    	return _self.Map.isGooglePlayServicesAvailable() == 0; //0 for Android
    };

    /**
     * Creates a new map view.
     * @memberof API.Map
     * @alias createMap
     * @param {object} options See {@link http://docs.appcelerator.com/titanium/3.0/#!/api/Modules.Map.View}
     * @return {string} Id of the Map to be used in the methods of this API.
     */
    _self.createMap = function createMap(options) {
        delete options.width;
        delete options.height;
        delete options.top;
        delete options.left;

        mapsId++;
        mapsList[mapsId] = _self.Map.createView(options);

        return mapsId;
    };

    /**
     * Creates an Annotation.
     * @memberof API.Map
     * @alias createAnnotation
     * @param {object} options See {@link http://docs.appcelerator.com/titanium/3.0/#!/api/Modules.Map.Annotation}
     * @return {string} Id of the annotation to be used in the methods of this API.
     */
    _self.createAnnotation = function createAnnotation(options) {

        //If the ID is set, check that it does not exist
        if (options.id != null) {
            if (getElement("annotation", options.id) != null) {
                Ti.API.info('[API.Map.createAnnotation] Annotation ID already in use(' + options.id + ')');
                return;
            }
        } else
            delete options.id;

        var anon = _self.Map.createAnnotation(options);
        var id = anon.getId();
        freeElements["annotations"][id] = anon;
        return id;

    };

    /**
     * Creates a Route.
     * @memberof API.Map
     * @alias createRoute
     * @param {object} options See {@link http://docs.appcelerator.com/titanium/3.0/#!/api/Modules.Map.Route}
     * @return {string} Id of the route to be used in the methods of this API.
     */
    _self.createRoute = function createRoute(options) {

        //If the ID is set, check that it does not exist
        if (options.id != null) {
            if (getElement("route", options.id) != null) {
                Ti.API.info('[API.Map.createRoute] Route ID already in use(' + options.id + ')');
                return;
            }
        } else
            delete options.id;

        var route = _self.Map.createRoute(options);
        var id = route.getId();
        freeElements["routes"][id] = route;

        return id;

    };

    /**
     * Creates a Polygon.
     * @memberof API.Map
     * @alias createPolygon
     * @param {object} options 
     *      - id: optional. Must be unique.<br>
     *      - points: Array of points [{latitude: Number, longitude: Number}, ...]<br>
     *      - holePoints: Array with holes. A hole is an array of points.<br>
     *      - fillColor: Color<br>
     *      - strokeColor: Color<br>
     *      - strokeWidth: Number<br>
     *      - annotation: String Id of an Annotation.<br>
     *
     * @return {string} Id of the polygon to be used in the methods of this API.
     */
    _self.createPolygon = function createPolygon(options) {

        //If the ID is set, check that it does not exist
        if (options.id != null) {
            if (getElement("polygon", options.id) != null) {
                Ti.API.info('[API.Map.createPolygon] Polygon ID already in use(' + options.id + ')');
                return;
            }
        } else
            delete options.id;
            
        if(options.annotation != null){
        	var annotation = getElement("annotation", options.annotation);
        	if(annotation != null){
        		options.annotation = annotation;
        	}
        }

        var polygon = _self.Map.createPolygon(options);
        var id = polygon.getId();
        freeElements["polygons"][id] = polygon;

        return id;

    };

    /**
     * Creates a Layer.
     * @memberof API.Map
     * @alias createLayer
     * @param {object} options 
     *      - id: optional. Must be unique.<br>
     *      - baseUrl: String with the url of the service<br>
     *      - type: Type of service ({@link API.Map.LAYER_TYPE_WMS_1_1_1} | {@link API.Map.LAYER_TYPE_WMS_1_3_0})<br>
     *      - name: String with the name of the layer.<br>
     *      - srs: String with the srs of the layer.<br>
     *      - visible: Boolean<br>
     *      - zIndex: Number ZIndex of the layer.<br>
     *      - opacity: Number Percentage of opacity [0 - 100].<br>
     *      - format: Type of image of the tiles ({@link API.Map.FORMAT_PNG} | {@link API.Map.FORMAT_JPEG})<br>
     *
     * @return {string} Id of the layer to be used in the methods of this API.
     */
    _self.createLayer = function createLayer(options) {

        //If the ID is set, check that it does not exist
        if (options.id != null) {
            if (getElement("layer", options.id) != null) {
                Ti.API.info('[API.Map.createLayer] Layer ID already in use(' + options.id + ')');
                return;
            }
        } else
            delete options.id;

        var layer = _self.Map.createLayer(options);
        var id = layer.getId();
        freeElements["layers"][id] = layer;

        return id;

    };

    /**
     * Parses a given KML file or string  and returns an object with the polygons and routes of the file.
     * @memberof API.Map
     * @alias getShapesFromKml
     * @param {(fileObj|string)} data The KML file or string to parse
     * @return {object} An object {polygons: array, routes: array, annotations: array}. Null if there was an exception while parsing the KML file or string .
     */
    _self.getShapesFromKml = function getShapesFromKml(data) {
        return handleParserResult(_self.Map.getShapesFromKml(data));
    };

    /**
     * Parses a given GeoJson file or string and returns an object with the polygons and routes of the file.
     * @memberof API.Map
     * @alias getShapesFromGeoJson
     * @param {(fileObj|string)} data The GeoJson file or string to parse
     * @return {object} An object {polygons: array, routes: array, annotations: array}. Null if there was an exception while parsing the GeoJson file or string .
     */
    _self.getShapesFromGeoJson = function getShapesFromGeoJson(data) {
        return handleParserResult(_self.Map.getShapesFromGeoJson(data));
    };

    /**
     * Parses a given WKT file or string and returns an object with the polygons and routes of the file.
     * @memberof API.Map
     * @alias getShapesFromWkt
     * @param {(fileObj|string)} data The WKT file or string to parse
     * @return {object} An object {polygons: array, routes: array, annotations: array}. Null if there was an exception while parsing the WKT file or string .
     */
    _self.getShapesFromWkt = function getShapesFromWkt(data) {
        return handleParserResult(_self.Map.getShapesFromWkt(data));
    };

    /*
    * ----------------------------------- MAP VIEW -----------------------------------------------------------------
    */

    /**
     * Adds the map view to a view.
     * @memberof API.Map
     * @alias addBound
     * @param {string} mapId The id of the map.
     * @param {string} viewId The id of the view.
     * @param {object} options Top, left, right, bottom, height, width.
     */
    _self.addBound = function addBound(mapId, viewId, options) {

        if (mapsList[mapId] == null) {
            //TODO: error. Unknown Video Player ID
            Ti.API.info('[API.Map.setBound] Unknown Map id: ' + mapId);
            return false;
        }

        Yaast.Sandbox.tabView.add(mapsList[mapsId]);
        _self.setBound(mapId, viewId, options);
    };

    /**
     * Sets the bounds of the map view.
     * @memberof API.Map
     * @alias setBound
     * @param {string} mapIdThe id of the map.
     * @param {string} viewId The id of the view.
     * @param {object} options Top, left, right, bottom, height, width.
     */
    _self.setBound = function setBound(mapId, viewId, options) {
        if (mapsList[mapId] == null) {
            //TODO: error. Unknown Video Player ID
            Ti.API.info('[API.Map.setBound] Unknown Map id: ' + mapId);
            return false;
        }
        if ( typeof options.width === 'undefined' || typeof options.height === 'undefined') {
            options.width = parseInt(Yaast.Sandbox.tabView.rect.width * 0.7);
            options.height = parseInt(Yaast.Sandbox.tabView.rect.height * 0.5);
            options.top = 'undefined';
            options.left = 'undefined';
        } else {
            // Position
            if ( typeof options.top !== 'undefined' || typeof options.bottom !== 'undefined') {
                if ( typeof options.bottom === 'undefined') {
                    options.top = parseInt(options.top + Yaast.Sandbox.componentPos[viewId].top);
                } else {
                    options.top = parseInt(Yaast.Sandbox.componentPos[viewId].top + (Yaast.Sandbox.componentPos[viewId].height - options.bottom));
                }
            }
            if ( typeof options.left !== 'undefined' || typeof options.right !== 'undefined') {
                if ( typeof options.right === 'undefined') {
                    options.left = parseInt(options.left + Yaast.Sandbox.componentPos[viewId].left);
                } else {
                    options.left = parseInt(Yaast.Sandbox.componentPos[viewId].left + (Yaast.Sandbox.componentPos[viewId].width - options.right));
                }
            }
        }
        mapsList[mapId].height = options.height;
        mapsList[mapId].width = options.width;
        mapsList[mapId].top = options.top;
        mapsList[mapId].left = options.left;

        return true;
    };

    /**
     * Removes the map from the view that contains it
     * @memberof API.Map
     * @alias removeBound
     * @param {string} mapId Map in which execute the action.
     */
    _self.removeBound = function removeBound(mapId) {
        Yaast.Sandbox.tabView.remove(mapsList[mapId]);
    };

    /**
     * Zooms in or out by specifying a relative zoom level.
     * @memberof API.Map
     * @alias zoom
     * @param {string} mapId Map in which execute the action.
     * @param {number} delta A positive value increases the current zoom level and a negative value decreases the zoom level.
     */
    _self.zoom = function zoom(mapId, delta) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }

        mapsList[mapId].zoom(delta);

    };


    /**
     * Set how the map should follow the location of the device.
     * @memberof API.Map
     * @alias followLocation
     * @param {string} mapId Map
     * @param {boolean} followLocation True if the map camera must follow the location of the device.
     * @param {boolean} followBearing True if the map camera must follow the bearing of the device.
     * @param {object} options
     *      - interval: LocationRequest desired interval in milliseconds. Must be > 0; otherwise, default value is 1000.<br>
     *      - priority: LocationRequest priority ({@link API.Map.PRIORITY_BALANCED_POWER_ACCURACY}, {@link API.Map.PRIORITY_HIGH_ACCURACY}, 
     * 					{@link API.Map.PRIORITY_LOW_POWER}, {@link API.Map.PRIORITY_NO_POWER}, {@link API.Map.PRIORITY_UNDEFINED}).
     */
    _self.followLocation = function followLocation(mapId, followLocation, followBearing, options) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }

        var interval, priority;
        if (options != null) {
            interval = options.interval;
            priority = options.priority;

        }
        if (interval == null)
            interval = 1000;

        if (priority == null)
            priority = _self.PRIORITY_UNDEFINED;

        mapsList[mapId].followLocation(interval, priority, followLocation, followBearing);

    };

    /**
     * Gets the value of a property of the map.
     * @memberof API.Map
     * @alias getMapProperty
     * @param {string} mapId The map.
     * @param {string} propertyName String with the name of the property or array with a list of properties.
     * @return {object} The value of the property or an object with the properties and values requested in the property list.
     */
    _self.getMapProperty = function(mapId, propertyName) {
    	
    	if(propertyName instanceof Array){
    		
    		var result = {};
    		
    		for(var x = 0; x < propertyName.length; x++){
    			var val = _self.getMapProperty(mapId, propertyName[x]);
    			if(typeof(val) !== 'undefined'){
    				result[propertyName[x]] = val;
    			}
    		}
    		
    		return result;
    		
    	} else {
    		
    		var validProperties = ["userLocation", "userLocationButton", "mapType", "region", "animate", "traffic", "enableZoomControls", "rect", "region", "zoom"];
            var onlyIdProperties = ["annotations", "polygons", "layers", "routes"];

            if (validProperties.indexOf(propertyName) >= 0) {
                return getSetProperty("map", mapId, propertyName);

            } else if (onlyIdProperties.indexOf(propertyName) >= 0) {
                var values = getSetProperty("map", mapId, propertyName);
                var ids = [];
                for (var id in values)
                ids.push(id);
                return ids;

            } else {
                Ti.API.info("[API.Map.getMapProperty] Error Getter method not found");
                return;
            }
    		
    	}
        

    };

    /**
     * Sets the value of a property of the map.
     * @memberof API.Map
     * @alias setMapProperty
     * @param {string} mapId The map id.
     * @param {string} propertyName String with the name of the property.
     * @param {*} propertyValue The value to be set for the property.
     */
    _self.setMapProperty = function(mapId, propertyName, propertyValue) {

        var validProperties = ["userLocation", "userLocationButton", "mapType", "region", "animate", "traffic", "enableZoomControls", "rect"];

        if (validProperties.indexOf(propertyName) >= 0) {
            return getSetProperty("map", mapId, propertyName, propertyValue);
        } else {
            //TODO: Error Setter method not found
            return;
        }
    };

    /**
     * Adds a view to the map view.
     * @memberof API.Map
     * @alias add
     * @param {string} mapId The map id where the view should be added.
     * @param {object} view View to be added.
     */
    _self.add = function(mapId, view) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }

        mapsList[mapId].add(view);
    };

    /**
     * Removes a view from the map view.
     * @memberof API.Map
     * @alias remove
     * @param {string} mapId The map id where the view should be remove.
     * @param {object} view View to be removed.
     */
    _self.remove = function(mapId, view) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }

        mapsList[mapId].remove(view);
    };

    /**
     * Adds the map view into another view.
     * @memberof API.Map
     * @alias addToView
     * @param {string} mapId The map id whose view should be added to another.
     * @param {object} view View to be added to.
     */
    _self.addToView = function(mapId, view) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }

        view.add(mapsList[mapId]);
    };

    /**
     * Removes the map view from another view.
     * @memberof API.Map
     * @alias removeFromView
     * @param {string} mapId The map id whose view should be removed from another one.
     * @param {object} view View to be removed from.
     */
    _self.removeFromView = function(mapId, view) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }

        view.remove(mapsList[mapId]);
    };

    /**
     * Adds the specified callback as an event listener for the named event.
     * @memberof API.Map
     * @alias addEventListener
     * @param {string} mapId The map id.
     * @param {string} event Name of the event.
     * @param {function} func Callback function to invoke when the event is fired.
     */
    _self.addEventListener = function(mapId, event, func) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }

        mapsList[mapId].addEventListener(event, func);
    };

    /**
     * Removes the specified callback as an event listener for the named event.
     * Multiple listeners can be registered for the same event, so the callback parameter is used to determine which listener to remove.
     * @memberof API.Map
     * @alias removeEventListener
     * @param {string} mapId The map id.
     * @param {string} event Name of the event.
     * @param {function} func Callback function to invoke when the event is fired.
     */
    _self.removeEventListener = function(mapId, event, func) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }

        mapsList[mapId].removeEventListener(event, func);
    };

    /*
    * -------------------- ANNOTATIONS -------------------------------
    */

    /**
     * Add an annotation to a map.
     * @memberof API.Map
     * @alias addAnnotation
     * @param {string} mapId The id of the map.
     * @param {string} annotationId The id of the annotation.
     */
    _self.addAnnotation = function addAnnotation(mapId, annonId) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }

        if (freeElements["annotations"][annonId] === 'undefined') {
            //TODO: Error Unknown annotation or already added
            return;
        }

        mapsList[mapId].addAnnotation(freeElements["annotations"][annonId]);
        delete freeElements["annotations"][annonId];

    };

    /**
     * Selects an annotation in a map.
     * @memberof API.Map
     * @alias selectAnnotation
     * @param {string} mapId The id of the map.
     * @param {string} annotationId The id of the annotation.
     */
    _self.selectAnnotation = function selectAnnotation(mapId, annoId) {

        if ( typeof mapsList[mapId] === 'undefined') {
            Ti.API.info("[API.Map.selectAnnotation] Error: Unknown Map Id");
            return;
        }

        mapsList[mapId].selectAnnotation(annoId);

    };

    /**
     * Deselects an annotation in a map.
     * @memberof API.Map
     * @alias deselectAnnotation
     * @param {string} mapId The id of the map.
     * @param {string} annotationId The id of the annotation.
     */
    _self.deselectAnnotation = function deselectAnnotation(mapId, annoId) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }

        mapsList[mapId].deselectAnnotation(annoId);

    };

    //TODO: allow to remove annotations from polygons?
    /**
     * Removes an annotation from a map.
     * @memberof API.Map
     * @alias removeAnnotation
     * @param {string} mapId The id of the map.
     * @param {string} annotationId The id of the annotation.
     */
    _self.removeAnnotation = function removeAnnotation(mapId, annoId) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }

        mapsList[mapId].removeAnnotation(annoId);

    };

    /**
     * Removes multiple annotations from a map.
     * @memberof API.Map
     * @alias removeAnnotations
     * @param {string} mapId The id of the map.
     * @param {string} annotationId Array with the ids of the annotations.
     */
    _self.removeAnnotations = function removeAnnotations(mapId, annotations) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }
        var annonToRemove = [], i, j;

        while (annotations.length > 0) {
            var annId = annotations.pop();
            annonToRemove.push(annId);
        }
        mapsList[mapId].removeAnnotations(annonToRemove);
        annon = null;
        annonToRemove = null;
    };

    /**
     * Removes all the annotations from a map.
     * @memberof API.Map
     * @alias removeAllAnnotations
     * @param {string} mapId The id of the map.
     */
    _self.removeAllAnnotations = function removeAllAnnotations(mapId) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }
        mapsList[mapId].removeAllAnnotations();
    };

    /**
     * Gets the value of a property of an annotation.
     * @memberof API.Map
     * @alias getAnnotationProperty
     * @param {string} annotationId The annotation id.
     * @param {string} propertyName String with the name of the property or array with a list of properties.
     * @return {object} The value of the property or an object with the properties and values requested in the property list.
     */
    _self.getAnnotationProperty = function(annotationId, propertyName) {
    	
    	if(propertyName instanceof Array){
    		
    		var result = {};
    		
    		for(var x = 0; x < propertyName.length; x++){
    			var val = _self.getAnnotationProperty(annotationId, propertyName[x]);
    			if(typeof(val) !== 'undefined'){
    				result[propertyName[x]] = val;
    			}
    		}
    		
    		return result;
    		
    	} else {
    	
    		var validProperties = ["id", "subtitle", "subtitleid", "title", "titleid", "latitude", "longitude", "draggable", "image", "pincolor", "customView", "leftButton", "leftView", "rightButton", "rightView", "showInfoWindow", "visible"];

            if (validProperties.indexOf(propertyName) >= 0) {
                return getSetProperty("annotation", annotationId, propertyName);
            } else {
                //TODO: Error Getter method not found
                return;
            }
    		
    	}
    
        
    };

    /**
     * Sets the value of a property of an annotation.
     * @memberof API.Map
     * @alias setAnnotationProperty
     * @param {string} annotationId The annotation id.
     * @param {string} propertyName String with the name of the property.
     * @param {*} propertyValue The value to be set for the property.
     */
    _self.setAnnotationProperty = function(annotationId, propertyName, propertyValue) {

        var validProperties = ["subtitle", "subtitleid", "title", "titleid", "latitude", "longitude", "draggable", "image", "pincolor", "customView", "leftButton", "leftView", "rightButton", "rightView", "showInfoWindow", "visible"];

        if (validProperties.indexOf(propertyName) >= 0) {
            return getSetProperty("annotation", annotationId, propertyName, propertyValue);
        } else {
            //TODO: Error Setter method not found
            return;
        }
    };

    /**
     * Adds the specified callback as an event listener for the named event.
     * @memberof API.Map
     * @alias addAnnotationEventListener
     * @param {string} annotationId The annotation id.
     * @param {string} event Name of the event.
     * @param {function} func Callback function to invoke when the event is fired.
     */
    _self.addAnnotationEventListener = function(annotationId, event, func) {

        var annotation = getElement("annotation", annotationId);

        if (annotation == null) {
            //TODO: Error Unknown Annotation Id on Map Id
            return;
        } else {
            annotation.addEventListener(event, func);
        }

    };

    /**
     * Removes the specified callback as an event listener for the named event.
     * Multiple listeners can be registered for the same event, so the callback parameter is used to determine which listener to remove.
     * @memberof API.Map
     * @alias removeAnnotationEventListener
     * @param {string} annotationId The annotation id.
     * @param {string} event Name of the event.
     * @param {function} func Callback function to invoke when the event is fired.
     */
    _self.removeAnnotationEventListener = function(annotationId, event, func) {

        var annotation = getElement("annotation", annotationId);

        if (annotation == null) {
            //TODO: Error Unknown Polygon Id on Map Id
            return;
        } else {
            annotation.removeEventListener(event, func);
        }
    };

    /*
    * -------------------- ROUTES -------------------------------
    */

    /**
     * Add a route to a map.
     * @memberof API.Map
     * @alias addRoute
     * @param {string} mapId The id of the map.
     * @param {string} routeId The id of the route.
     */
    _self.addRoute = function addRoute(mapId, routeId) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }

        if (freeElements["routes"][routeId] === 'undefined') {
            //TODO: Error Unknown annotation or already added
            return;
        }

        mapsList[mapId].addRoute(freeElements["routes"][routeId]);
        delete freeElements["routes"][routeId];

    };

    /**
     * Removes a route from a map.
     * @memberof API.Map
     * @alias removeRoute
     * @param {string} mapId The id of the map.
     * @param {string} routeId The id of the route.
     */
    _self.removeRoute = function removeRoute(mapId, routeId) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }

        mapsList[mapId].removeRoute(routeId);
    };
    
    /**
     * Removes multiple routes from a map.
     * @memberof API.Map
     * @alias removeRoutes
     * @param {string} mapId The id of the map.
     * @param {Array} routes Array with the ids of the routes.
     */
    _self.removeRoutes = function removeRoutes(mapId, routes) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }
        var routesToRemove = [], i, j;

        while (routes.length > 0) {
            var routeId = routes.pop();
            routesToRemove.push(routeId);
        }
        mapsList[mapId].removeRoutes(routesToRemove);
        route = null;
        routesToRemove = null;
    };
    

    /**
     * Removes all the routes from a map.
     * @memberof API.Map
     * @alias removeAllRoutes
     * @param {string} mapId The id of the map.
     */
    _self.removeAllRoutes = function removeAllRoutes(mapId) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }
        mapsList[mapId].removeAllRoutes();
    };

    /**
     * Gets the value of a property of a route.
     * @memberof API.Map
     * @alias getRouteProperty
     * @param {string} routeId The route id.
     * @param {string} propertyName String with the name of the property or array with a list of properties.
     * @return {object} The value of the property or an object with the properties and values requested in the property list.
     */
    _self.getRouteProperty = function(routeId, propertyName) {
    	
    	if(propertyName instanceof Array){
    		
    		var result = {};
    		
    		for(var x = 0; x < propertyName.length; x++){
    			var val = _self.getRouteProperty(routeId, propertyName[x]);
    			if(typeof(val) !== 'undefined'){
    				result[propertyName[x]] = val;
    			}
    		}
    		
    		return result;
    		
    	} else {
    		
    		var validProperties = ["id", "points", "width", "color"];

            if (validProperties.indexOf(propertyName) >= 0) {
                return getSetProperty("route", routeId, propertyName);
            } else {
                //TODO: Error Getter method not found
                return;
            }
    		
    	}

    };

    /**
     * Sets the value of a property of a route.
     * @memberof API.Map
     * @alias setRouteProperty
     * @param {string} routeId The route id.
     * @param {string} propertyName String with the name of the property.
     * @param {*} propertyValue The value to be set for the property.
     */
    _self.setRouteProperty = function(routeId, propertyName, propertyValue) {

        var validProperties = ["points", "width", "color"];

        if (validProperties.indexOf(propertyName) >= 0) {
            getSetProperty("route", routeId, propertyName, propertyValue);
        } else {
            //TODO: Error Setter method not found
            return;
        }
    };

    /*
    * -------------------- POLYGONS -------------------------------
    */

    /**
     * Add a polygon to a map.
     * @memberof API.Map
     * @alias addPolygon
     * @param {string} mapId The id of the map.
     * @param {string} polygonId The id of the polygon. If it has the  annotation property defined, the annotation will be added to the map.<br>
 	 * 					If that annotation does not have its latitude or longitude defined, its location will be set at the centroid of the polygon.<br>
 	 * 					If that annotation does not have the property visible defined, its will be set as false by default.
     */
    _self.addPolygon = function addPolygon(mapId, polygonId) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }

        if (freeElements["polygons"][polygonId] === 'undefined') {
            //TODO: Error Unknown annotation or already added
            return;
        }

        mapsList[mapId].addPolygon(freeElements["polygons"][polygonId]);
        var annotation = freeElements["polygons"][polygonId].getAnnotation();
        if(annotation != null){
        	delete freeElements["annotations"][annotation.getId()];
        }
        delete freeElements["polygons"][polygonId];

    };

    /**
     * Removes a polygon from a map.
     * @memberof API.Map
     * @alias removePolygon
     * @param {string} mapId The id of the map.
     * @param {string} polygonId The id of the polygon.
     */
    _self.removePolygon = function removePolygon(mapId, polygonId) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }

        mapsList[mapId].removePolygon(polygonId);
    };
    
    /**
     * Removes multiple polygons from a map.
     * @memberof API.Map
     * @alias removePolygons
     * @param {string} mapId The id of the map.
     * @param {Array} polygons Array with the ids of the polygons.
     */
    _self.removePolygons = function removePolygons(mapId, polygons) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }
        var polygonsToRemove = [], i, j;

        while (polygons.length > 0) {
            var polygonId = polygons.pop();
            polygonsToRemove.push(polygonId);
        }
        mapsList[mapId].removePolygons(polygonsToRemove);
        polygons = null;
        polygonsToRemove = null;
    };
    

    /**
     * Removes all the polygons from a map.
     * @memberof API.Map
     * @alias removeAllPolygons
     * @param {string} mapId The id of the map.
     */
    _self.removeAllPolygons = function removeAllPolygons(mapId) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }
        mapsList[mapId].removeAllPolygons();
    };

    /**
     * Gets the value of a property of a polygon.
     * @memberof API.Map
     * @alias getPolygonProperty
     * @param {string} polygonId The polygon id.
     * @param {string} propertyName String with the name of the property or array with a list of properties.
     * @return {object} The value of the property or an object with the properties and values requested in the property list.
     */
    _self.getPolygonProperty = function(polygonId, propertyName) {
    	
    	if(propertyName instanceof Array){
    		
    		var result = {};
    		
    		for(var x = 0; x < propertyName.length; x++){
    			var val = _self.getPolygonProperty(polygonId, propertyName[x]);
    			if(typeof(val) !== 'undefined'){
    				result[propertyName[x]] = val;
    			}
    		}
    		
    		return result;
    		
    	} else {
    		
    		var validProperties = ["id", "points", "holePoints", "strokeWidth", "strokeColor", "fillColor", "annotation", "zIndex"];

            if (validProperties.indexOf(propertyName) >= 0) {

                if (propertyName === "annotation") {//Special case, this is a "virtual" method
                    var annotation = getSetProperty("polygon", polygonId, "annotation");
                    if (annotation != null) {
                        return annotation.getId();
                    } else {
                        return null;
                    }
                } else {
                    return getSetProperty("polygon", polygonId, propertyName);
                }

            } else {
                //TODO: Error Getter method not found
                return;
            }	
    			
    	}

    };

    /**
     * Sets the value of a property of a polygon.
     * @memberof API.Map
     * @alias setPolygonProperty
     * @param {string} polygonId The polygon id.
     * @param {string} propertyName String with the name of the property.
     * @param {*} propertyValue The value to be set for the property.
     */
    _self.setPolygonProperty = function(polygonId, propertyName, propertyValue) {

        var validProperties = ["points", "holePoints", "strokeWidth", "strokeColor", "fillColor", "annotation", "zIndex"];

        if (validProperties.indexOf(propertyName) >= 0) {
        	if(propertyName === 'annotation'){
        		var annotation = getElement("annotation", propertyValue);
        		getSetProperty("polygon", polygonId, propertyName, annotation);
        	} else {
        		getSetProperty("polygon", polygonId, propertyName, propertyValue);
        	}
            
        } else {
            //TODO: Error Setter method not found
            return;
        }
    };

    /**
     * Adds the specified callback as an event listener for the named event.
     * @memberof API.Map
     * @alias addPolygonEventListener
     * @param {string} polygonId The polygon id.
     * @param {string} event Name of the event.
     * @param {function} func Callback function to invoke when the event is fired.
     */
    _self.addPolygonEventListener = function(polygonId, event, func) {

        var polygon = getElement("polygon", polygonId);

        if (polygon == null) {
            //TODO: Error Unknown Polygon Id on Map Id
            return;
        } else {
            polygon.addEventListener(event, func);
        }

    };

    /**
     * Removes the specified callback as an event listener for the named event.
     * Multiple listeners can be registered for the same event, so the callback parameter is used to determine which listener to remove.
     * @memberof API.Map
     * @alias removePolygonEventListener
     * @param {string} polygonId The polygon id.
     * @param {string} event Name of the event.
     * @param {function} func Callback function to invoke when the event is fired.
     */
    _self.removePolygonEventListener = function(polygonId, event, func) {

        var polygon = getElement("polygon", polygonId);

        if (polygon == null) {
            //TODO: Error Unknown Polygon Id on Map Id
            return;
        } else {
            polygon.removeEventListener(event, func);
        }
    };

    /*
    * -------------------- LAYERS -------------------------------
    */

    /**
     * Add a layer to a map.
     * @memberof API.Map
     * @alias addLayer
     * @param {string} mapId The id of the map.
     * @param {string} layerId The id of the layer.
     */
    _self.addLayer = function addLayer(mapId, layerId) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }

        if (freeElements["layers"][layerId] === 'undefined') {
            //TODO: Error Unknown layer or already added
            return;
        }

        mapsList[mapId].addLayer(freeElements["layers"][layerId]);
        delete freeElements["layers"][layerId];

    };

    /**
     * Removes a layer from a map.
     * @memberof API.Map
     * @alias removeLayer
     * @param {string} mapId The id of the map.
     * @param {string} layerId The id of the layer.
     */
    _self.removeLayer = function removeLayer(mapId, layerId) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }

        mapsList[mapId].removeLayer(layerId);
    };
    
    /**
     * Removes multiple layers from a map.
     * @memberof API.Map
     * @alias removeLayers
     * @param {string} mapId The id of the map.
     * @param {Array} layers Array with the ids of the layers.
     */
    _self.removeLayers = function removeLayers(mapId, layers) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }
        var layersToRemove = [], i, j;

        while (layers.length > 0) {
            var layerId = layers.pop();
            layersToRemove.push(layerId);
        }
        mapsList[mapId].removeLayers(layersToRemove);
        layers = null;
        layersToRemove = null;
    };

    /**
     * Removes all the layers from a map.
     * @memberof API.Map
     * @alias removeAllLayers
     * @param {string} mapId The id of the map.
     */
    _self.removeAllLayers = function removeAllLayers(mapId) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }
        mapsList[mapId].removeAllLayers();
    };

    /**
     * Gets the base layer
     * @memberof API.Map
     * @alias getBaseLayer
     * @param {object} mapId Can be a layer id (String) or a google layer id (Integer).
     */
    _self.getBaseLayer = function getBaseLayer(mapId) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }

        return mapsList[mapId].getBaseLayer().getId();

    };

    /**
     * Set the base layer of the map.
     * @memberof API.Map
     * @alias setBaseLayer
     * @param {object} mapId The id of the map.
     * @param {object} layerId  The id of the layer or the constant of the Google Layer.
     */
    _self.setBaseLayer = function setBaseLayer(mapId, layerId) {
        if ( typeof mapsList[mapId] === 'undefined') {
            //TODO: Error Unknown Map Id
            return;
        }

        if ((layerId + "").indexOf("-") != -1) {//It is a layer id

            var layer = getElement("layer", layerId);

            if (layer == null) {
                //TODO: Error Unknown Annotation Id on Map Id
                return;
            } else {
                mapsList[mapId].removeLayer(layer);
                mapsList[mapId].setBaseLayer(layer);
                layer = null;
            }

        } else {//It is a google layer id
            mapsList[mapId].setBaseLayer(layerId);
        }

    };

    /**
     * Gets the value of a property of a layer.
     * @memberof API.Map
     * @alias getLayerProperty
     * @param {string} layerId The layer id.
     * @param {string} propertyName String with the name of the property or array with a list of properties.
     * @return {object} The value of the property or an object with the properties and values requested in the property list.
     */
    _self.getLayerProperty = function(layerId, propertyName) {
    	
    	if(propertyName instanceof Array){
    		
    		var result = {};
    		
    		for(var x = 0; x < propertyName.length; x++){
    			var val = _self.getLayerProperty(layerId, propertyName[x]);
    			if(typeof(val) !== 'undefined'){
    				result[propertyName[x]] = val;
    			}
    		}
    		
    		return result;
    		
    	} else {
    		
    		var validProperties = ["id", "baseUrl", "type", "name", "srs", "visible", "zIndex", "opacity", "format", "style", "tyleMatrixSet"];

            if (validProperties.indexOf(propertyName) >= 0) {
                return getSetProperty("layer", layerId, propertyName);
            } else {
                //TODO: Error Getter method not found
                return;
            }
    		
    	}

    };

    /**
     * Sets the value of a property of a layer.
     * @memberof API.Map
     * @alias setLayerProperty
     * @param {string} layerId The layer id.
     * @param {string} propertyName String with the name of the property.
     * @param {*} propertyValue The value to be set for the property.
     */
    _self.setLayerProperty = function(layerId, propertyName, propertyValue) {

        var validProperties = ["baseUrl", "type", "name", "srs", "visible", "zIndex", "opacity", "format", "style", "tyleMatrixSet"];

        if (validProperties.indexOf(propertyName) >= 0) {
            getSetProperty("layer", layerId, propertyName, propertyValue);
        } else {
            //TODO: Error Setter method not found
            return;
        }
    };

    return _self;

}());

module.exports = Map;
