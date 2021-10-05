/**
 * gpxViewer  based heavily on Nitsch's "Hyperlapse"
 *
 * @overview Hyperlapse.js - JavaScript hyper-lapse utility for Google Street View.
 * @author Peter Nitsch
 * @copyright Teehan+Lax 2013
 */

Number.prototype.toRad = function() {
	return this * Math.PI / 180;
};

Number.prototype.toDeg = function() {
	return this * 180 / Math.PI;
};

// Array Remove - By John Resig (MIT Licensed)
Array.prototype.remove = function(from, to) {
  var rest = this.slice((to || from) + 1 || this.length);
  this.length = from < 0 ? this.length + from : from;
  return this.push.apply(this, rest);
};

var pointOnLine = function(t, a, b) {
	var lat1 = a.lat().toRad(), lon1 = a.lng().toRad();
	var lat2 = b.lat().toRad(), lon2 = b.lng().toRad();

	x = lat1 + t * (lat2 - lat1);
	y = lon1 + t * (lon2 - lon1);

	return new google.maps.LatLng(x.toDeg(), y.toDeg());
};

/**
 * @class
 * @classdesc Value object for a single point in a Hyperlapse sequence.
 * @constructor
 */
var HyperlapsePoint = function(location, pano_id, params ) {

	var self = this;
	var params = params || {};

	this.location = location;
	this.pano_id = pano_id;
	this.heading = params.heading || 0;
	this.reverse = params.reverse || false;
	this.pitch = params.pitch || 0;
	this.roll = params.rotation || 0;
	this.image = params.image || null;
	this.copyright = params.copyright || "© 2013 Google";
	this.image_date = params.image_date || "";
};

/*
 * Collection of hyperlapse parameters with default values
 *
 * Broken-out of the class since there will only be one Hyperlapse object anyway,
 * and this simplifies the duplication of settings and values for the viewer UI.
 */
var hlp = {
    // run-time parameters
    fov: 0, millis: 0, roll:0, position: {x:0, y:0},
    rpReset: function () {
        hlp.fov = 110;                                          // Field of view / Deg
        hlp.millis = 200;                                       // Speed / ms
        hlp.roll = 0;                                           // Camera roll / Deg
        hlp.position.x = 0; hlp.position.y = -15;               // Camera Yaw(x) and pitch (y) / Deg
    },

    // generation-time parameters
    distance_between_points:0, max_points:0,
    gpReset: function () {
        hlp.distance_between_points = 20;   // Distance between hyperlapse points / metres
        hlp.max_points = 50;                // Max no of hyperlapse points
    },

    // other ( see Hyperlapse.setSize() )
    scrn_width: 800, scrn_height: 400
}
hlp.rpReset();
hlp.gpReset();

/**
 * @class
 * @constructor
 */
var Hyperlapse = function(container, zoom) {

	"use strict";

	var self = this, 
		_listeners = [],
		_container = container,
		_d = 20,
		_zoom = zoom || 1,
		_lat = 0, _lon = 0,
		_is_playing = false, _is_loading = false,
		_point_index = 0,
		_forward = true,
		_canvas, _context,
		_camera, _scene, _renderer, _mesh,
		_loader, _cancel_load = false,
		_ctime = Date.now(),
		_ptime = 0, _dtime = 0,
		_prev_pano_id = null,
		_raw_points = [], _h_points = [];

	var handleError = function (e) { if (self.onError) self.onError(e); };
	var handleFrame = function (e) { if (self.onFrame) self.onFrame(e); };
	var handlePlay = function (e) { if (self.onPlay) self.onPlay(e); };
	var handlePause = function (e) { if (self.onPause) self.onPause(e); };
	var handleLoadProgress = function (e) { if (self.onLoadProgress) self.onLoadProgress(e); };
	var handleRouteProgress = function (e) { if (self.onRouteProgress) self.onRouteProgress(e); };


	var _streetview_service = new google.maps.StreetViewService();

	_canvas = document.createElement( 'canvas' );
	_context = _canvas.getContext( '2d' );

	_camera = new THREE.PerspectiveCamera( hlp.fov, hlp.scrn_width/hlp.scrn_height, 1, 1100 );
	_camera.target = new THREE.Vector3( 0, 0, 0 );

	_scene = new THREE.Scene();
	_scene.add( _camera );

    // Check if we can use webGL
    var isWebGLAvailable = function () {
        try {
            return !! window.WebGLRenderingContext && !! document.createElement( 'canvas' ).getContext( 'experimental-webgl' );
        }
        catch(e) {
            console.log('WebGL not available starting with CanvasRenderer');
            return false;
        }
    };

    _renderer = isWebGLAvailable() ? new THREE.WebGLRenderer() : new THREE.CanvasRenderer();
	_renderer.autoClearColor = false;
	_renderer.setSize( hlp.scrn_width, hlp.scrn_height );

	_mesh = new THREE.Mesh(
		new THREE.SphereGeometry( 500, 60, 40 ),
		new THREE.MeshBasicMaterial( { map: new THREE.Texture(), side: THREE.DoubleSide, overdraw: true } )
	);
	_scene.add( _mesh );

	_container.appendChild( _renderer.domElement );

	_loader = new GSVPANO.PanoLoader( {zoom: _zoom} );
	_loader.onError = function(message) {
		handleError({message:message});
	};

	_loader.onPanoramaLoad = function() {
		var canvas = document.createElement("canvas");
		var context = canvas.getContext('2d');
		canvas.setAttribute('width',this.canvas.width);
		canvas.setAttribute('height',this.canvas.height);
		context.drawImage(this.canvas, 0, 0);

		_h_points[_point_index].image = canvas;

		if(++_point_index != _h_points.length) {
			handleLoadProgress( {position:_point_index} );

			if(!_cancel_load) {
				_loader.composePanorama( _h_points[_point_index].pano_id );
			} else {
				handleLoadCanceled( {} );
			}
		} else {
			handleLoadComplete( {} );
		}
	};

	/**
	 * @event Hyperlapse#onLoadCanceled
	 */
	var handleLoadCanceled = function (e) {
		_cancel_load = false;
		_is_loading = false;
		if (self.onLoadCanceled) self.onLoadCanceled(e);
	};

	/**
	 * @event Hyperlapse#onLoadComplete
	 */
	var handleLoadComplete = function (e) {
		_is_loading = false;
		_point_index = 0;
		animate();
		if (self.onLoadComplete) self.onLoadComplete(e);
	};

    // calculate the bearing from the current (raw) point to the next, in degrees
    // based on: https://stackoverflow.com/questions/46590154/
    function direction_of_travel() {
        var a = _point_index, b = _point_index + 1;
        if (b >= _raw_points.length) { a--; b--; }

        var srcLat = _raw_points[a].lat().toRad();
        var srcLng = _raw_points[a].lng().toRad();
        var dstLat = _raw_points[b].lat().toRad();
        var dstLng = _raw_points[b].lng().toRad();

        var y = Math.sin(dstLng - srcLng) * Math.cos(dstLat);
        var x = Math.cos(srcLat) * Math.sin(dstLat) - Math.sin(srcLat) * Math.cos(dstLat) * Math.cos(dstLng - srcLng);

        return (Math.atan2(y, x).toDeg() + 360) % 360;
    }

	var parsePoints = function(response) {

		_loader.load( _raw_points[_point_index], function() {
            var complete = false;

            // The "rotation" returned from the pano jumps around because the collection
            // of pictures have been accumulated from multiple vehicles travelling in different
            // directions so it's not a reliable direction to point the camera at.
            // So, we need to compute whether to look in the opposite direction!
            var dot = direction_of_travel();

            if(_loader.id != _prev_pano_id) {
				_prev_pano_id = _loader.id;

				var hp = new HyperlapsePoint( _loader.location, _loader.id, {
					heading: _loader.rotation,
                    reverse: (Math.abs(_loader.rotation.toDeg() - dot) > 90), // true => car travelling the other way, so we need to reverse the heading
					pitch: _loader.pitch,
					roll: _loader.rotation,
					copyright: _loader.copyright,
					image_date: _loader.image_date
				} );

				_h_points.push( hp );
				handleRouteProgress( {point: hp} );
				complete = (_point_index == _raw_points.length-1);
				if (!complete) _point_index++;
			} else {
				_raw_points.splice(_point_index, 1);
				complete = (_point_index == _raw_points.length);
			}

			if (complete) {
                if (self.onRouteComplete) self.onRouteComplete({response: response, points: _h_points});
            } else {
                if(!_cancel_load) parsePoints(response);
                else handleLoadCanceled( {} );
            }

		} );
	};

	var handleDirectionsRoute = function(response) {
		if(!_is_playing) {

			var route = response.routes[0];
			var path = route.overview_path;
			var legs = route.legs;

			var total_distance = 0;
			for(var i=0; i<legs.length; ++i) {
				total_distance += legs[i].distance.value;
			}

			var segment_length = total_distance/hlp.max_points;
			_d = (segment_length < hlp.distance_between_points) ? _d = hlp.distance_between_points : _d = segment_length;

			var d = 0;
			var r = 0;
			var a, b;

			for(i=0; i<path.length; i++) {
				if(i+1 < path.length) {

					a = path[i];
					b = path[i+1];
					d = google.maps.geometry.spherical.computeDistanceBetween(a, b);

					if(r > 0 && r < d) {
						a = pointOnLine(r/d, a, b);
						d = google.maps.geometry.spherical.computeDistanceBetween(a, b);
						_raw_points.push(a);

						r = 0;
					} else if(r > 0 && r > d) {
						r -= d;
					}

					if(r === 0) {
						var segs = Math.floor(d/_d);

						if(segs > 0) {
							for(var j=0; j<segs; j++) {
								var t = j/segs;

								if( t>0 || (t+i)===0  ) { // not start point
									var way = pointOnLine(t, a, b);
									_raw_points.push(way);
								}
							}

							r = d-(_d*segs);
						} else {
							r = _d*( 1-(d/_d) );
						}
					}

				} else {
					_raw_points.push(path[i]);
				}
			}

			parsePoints(response);

		} else {
			self.pause();
			handleDirectionsRoute(response);
		}
	};

	var drawMaterial = function() {
		_mesh.material.map.image = _h_points[_point_index].image;
		_mesh.material.map.needsUpdate = true;

		handleFrame({
			position:_point_index,
			point: _h_points[_point_index]
		});
	};

	/*
	TODO list
	1. add support for reading GPX files and try various ways of diaplaying them
		- whole route in overview at a given number of points
		- first 100 points (in segment) at max detail 
		- first 2.5K (in segment) at max detail
	2. try speeding it up: 
		- can we fetch/load multiple pano points in parallel (after building the route)?
		- can we merge fetching the panoID and loading the panoID
	*/

	var render = function() {
		if(!_is_loading && self.length()>0) {
            var point = _h_points[_point_index];

			var heading = _forward ? hlp.position.x : ((hlp.position.x + 180) % 360); // correct for direction of travel along the track
			heading = point.reverse ? ((heading + 180) % 360) : heading; // correct for direction of travel by the photo car

            // todo there is a bug here. if you print a msg to the console you'll see it's spinning in a loop.

            var olon = _lon, olat = _lat;
            _lon = _lon + ( heading - olon );
            _lat = _lat + ( hlp.position.y - olat );
            _lat = Math.max( - 85, Math.min( 85, _lat ) );
            var phi = ( 90 - _lat ).toRad();
            var theta = _lon.toRad();

            _camera.target.x = 500 * Math.sin( phi ) * Math.cos( theta );
            _camera.target.y = 500 * Math.cos( phi );
            _camera.target.z = 500 * Math.sin( phi ) * Math.sin( theta );
            _camera.lookAt( _camera.target );
            _camera.rotation.z -= hlp.roll.toRad();

            _mesh.rotation.z = -point.pitch.toRad(); // confusingly, mesh z compensates for camera pitch
            _mesh.rotation.y = -point.roll.toRad(); // this compensation doesnt really seem to work, but I tried

            _renderer.render( _scene, _camera );
		}
	};

	var animate = function() {
		var ptime = _ctime;
		_ctime = Date.now();
		_dtime += _ctime - ptime;
		if(_dtime >= hlp.millis) {
			if(_is_playing) loop();
			_dtime = 0;
		}

		requestAnimationFrame( animate );
		render();
	};

	// animates the playhead forward or backward depending on direction
	var loop = function() {
		drawMaterial();

		if(_forward) {
			if(++_point_index == _h_points.length) {
				_point_index = _h_points.length-1;
				_forward = !_forward;
			}
		} else {
			if(--_point_index == -1) {
				_point_index = 0;
				_forward = !_forward;
			}
		}
	};

	this.length = function() { return _h_points.length; };

	/**
	 * @param {Number} v
	 */
	this.setFOV = function(v) {
		hlp.fov = Math.floor(v);
		_camera.projectionMatrix.makePerspective( hlp.fov, hlp.scrn_width/hlp.scrn_height, 1, 1100 );
	};

	/**
	 * @param {Number} width
	 * @param {Number} height
	 */
	this.setSize = function(width, height) {
		hlp.scrn_width = width;
		hlp.scrn_height = height;
		_renderer.setSize( hlp.scrn_width, hlp.scrn_height );
		_camera.projectionMatrix.makePerspective( hlp.fov, hlp.scrn_width/hlp.scrn_height, 1, 1100 );
	};

	/**
	 * Resets to defaults
	 */
	this.reset = function() {
		_raw_points.remove(0,-1);
		_h_points.remove(0,-1);
		_lat = 0; _lon = 0;
		_point_index = 0;
		_forward = true;
	};

	/**
	 * @param {google.maps.DirectionsResult} route
	 */
	this.generate = function( route ) {

		if(!_is_loading) {
			_is_loading = true;
			self.reset();

			if(route) {
				handleDirectionsRoute(route);
			} else {
				console.log("No route provided.");
			}
		}
	};

	/**
	 * @fires Hyperlapse#onLoadComplete
	 */
	this.load = function() {
		_point_index = 0;
		_loader.composePanorama(_h_points[_point_index].pano_id);
	};

	/**
	 * @fires Hyperlapse#onLoadCanceled
	 */
	this.cancel = function() {
		if(_is_loading) {
			_cancel_load = true;
		}
	};

	/**
	 * Animate through all frames in sequence
	 * @fires Hyperlapse#onPlay
	 */
	this.play = function() {
		if(!_is_loading) {
			_is_playing = true;
			handlePlay({});
		}
	};

	/**
	 * Pause animation
	 * @fires Hyperlapse#onPause
	 */
	this.pause = function() {
		_is_playing = false;
		handlePause({});
	};

	/**
	 * Display next frame in sequence
	 * @fires Hyperlapse#onFrame
	 */
	this.next = function() {
		self.pause();
		if(_point_index+1 != _h_points.length) {
			_point_index++;
			_forward = true;
			drawMaterial();
		}
	};

	/**
	 * Display previous frame in sequence
	 * @fires Hyperlapse#onFrame
	 */
	this.prev = function() {
		self.pause();
		if(_point_index-1 !== 0) {
			_point_index--;
			_forward = false;
			drawMaterial();
		}
	};
};
