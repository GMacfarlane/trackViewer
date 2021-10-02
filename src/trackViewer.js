var start_point = new google.maps.LatLng(51.30750,-0.57285)
var end_point   = new google.maps.LatLng(51.29360,-0.60011);

var map, directions_renderer, directions_service, streetview_service;
var start_pin, end_pin, camera_pin;
var _route_markers = [];

function show(msg) {
    document.getElementById("text").innerHTML = msg;
}

function init() {

    /* Map */

    var mapOpt = {
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        center: start_point,
        zoom: 15
    };

    map = new google.maps.Map(document.getElementById("map"), mapOpt);
    var overlay = new google.maps.StreetViewCoverageLayer();
    overlay.setMap(map);

    directions_service = new google.maps.DirectionsService();
    directions_renderer = new google.maps.DirectionsRenderer({draggable:false, markerOptions:{visible: false}});
    directions_renderer.setMap(map);
    directions_renderer.setOptions({preserveViewport:true});

    camera_pin = new google.maps.Marker({
        position: start_point,
        map: map
    });

    start_pin = new google.maps.Marker({
        position: start_point,
        label: 'A',
        map: map
    });

   end_pin = new google.maps.Marker({
        position: end_point,
        label: 'B',
        map: map
    });

    /* Hyperlapse */

    var pano = document.getElementById('pano');
    var is_moving = false;
    var px, py;
    var onPointerDownPointerX=0, onPointerDownPointerY=0;

    var hyperlapse = new Hyperlapse(pano, {
        fov: 120,
        millis: 100,
        width: window.innerWidth,
        height: window.innerHeight,
        zoom: 2,
        distance_between_points: 5,
        max_points: 100
    });

    hyperlapse.onError = function(e) {
        show( "ERROR: "+ e.message );
    };

    hyperlapse.onRouteProgress = function(e) {
        _route_markers.push( new google.maps.Marker({
            position: e.point.location,
            draggable: false,
            icon: "../lib/dot_marker.png",
            map: map
            })
        );
    };

    hyperlapse.onRouteComplete = function(e) {
        directions_renderer.setDirections(e.response);
        show( "Number of Points: "+ hyperlapse.length() );
        hyperlapse.load();
    };

    hyperlapse.onLoadProgress = function(e) {
        show( "Loading: "+ (e.position+1) +" of "+ hyperlapse.length() );
    };

    hyperlapse.onLoadComplete = function(e) {
        show("Start: " + start_pin.getPosition().toString() +
            "<br>End: " + end_pin.getPosition().toString() +
            "<br>Ready." );
    };

    hyperlapse.onFrame = function(e) {
        show("Start: " + start_pin.getPosition().toString() +
            "<br>End: " + end_pin.getPosition().toString() +
            "<br>Position: "+ (e.position+1) +" of "+ hyperlapse.length() );
        camera_pin.setPosition(e.point.location);
    };

    pano.addEventListener( 'mousedown', function(e){
        e.preventDefault();

        is_moving = true;

        onPointerDownPointerX = e.clientX;
        onPointerDownPointerY = e.clientY;

        px = hyperlapse.position.x;
        py = hyperlapse.position.y;

    }, false );

    pano.addEventListener( 'mousemove', function(e){
        e.preventDefault();
        var f = hyperlapse.fov() / 500;

        if ( is_moving ) {
            var dx = ( onPointerDownPointerX - e.clientX ) * f;
            var dy = ( e.clientY - onPointerDownPointerY ) * f;
            hyperlapse.position.x = px + dx; // reversed dragging direction (thanks @mrdoob!)
            hyperlapse.position.y = py + dy;

            o.position_x = hyperlapse.position.x;
            o.position_y = hyperlapse.position.y;
        }

    }, false );

    pano.addEventListener( 'mouseup', function(){
        is_moving = false;

        hyperlapse.position.x = px;
        //hyperlapse.position.y = py;
    }, false );

    /* Dat GUI */

    var gui = new dat.GUI();

    var o = {
        distance_between_points:10,
        max_points:100,
        fov: 120,
        tilt:0,
        millis:100,
        offset_x:0,
        offset_y:0,
        offset_z:0,
        position_x:0,
        position_y:0,
        screen_width: window.innerWidth,
        screen_height: window.innerHeight,
        generate:function(){
            show( "Generating route..." );

            directions_renderer.setDirections({routes: []});

            var marker;
            while(_route_markers.length > 0) {
                marker = _route_markers.pop();
                marker.setMap(null);
            }

            request = {
                origin: start_point,
                destination: end_point,
                travelMode: google.maps.DirectionsTravelMode.DRIVING
            };

            directions_service.route(request, function(response, status) {
                if (status == google.maps.DirectionsStatus.OK) {
                    hyperlapse.generate({route: response});
                } else {
                    console.log(status);
                }
            })
        }
    };


    var scn = gui.addFolder('screen');
    scn.add(o, 'screen_width', window.innerHeight).listen();
    scn.add(o, 'screen_height', window.innerHeight).listen();

    var parameters = gui.addFolder('parameters');

    var distance_between_points_control = parameters.add(o, 'distance_between_points', 5, 100);
    distance_between_points_control.onChange(function(value) {
        hyperlapse.setDistanceBetweenPoint(value);
    });

    var max_points = parameters.add(o, 'max_points', 10, 500);
    max_points.onChange(function(value) {
        hyperlapse.setMaxPoints(value);
    });

    var fov_control = parameters.add(o, 'fov', 1, 180);
    fov_control.onChange(function(value) {
        hyperlapse.setFOV(value);
    });

    var millis_control = parameters.add(o, 'millis', 10, 300);
    millis_control.onChange(function(value) {
        hyperlapse.millis = value;
    });

    var offset_x_control = parameters.add(o, 'offset_x', -360, 360);
    offset_x_control.onChange(function(value) {
        hyperlapse.offset.x = value;
    });

    var offset_y_control = parameters.add(o, 'offset_y', -180, 180);
    offset_y_control.onChange(function(value) {
        hyperlapse.offset.y = value;
    });

    var offset_z_control = parameters.add(o, 'offset_z', -360, 360);
    offset_z_control.onChange(function(value) {
        hyperlapse.offset.z = value;
    });

    var position_x_control = parameters.add(o, 'position_x', -360, 360).listen();
    position_x_control.onChange(function(value) {
        hyperlapse.position.x = value;
    });

    var position_y_control = parameters.add(o, 'position_y', -180, 180).listen();
    position_y_control.onChange(function(value) {
        hyperlapse.position.y = value;
    });

    var tilt_control = parameters.add(o, 'tilt', -Math.PI, Math.PI);
    tilt_control.onChange(function(value) {
        hyperlapse.tilt = value;
    });

    parameters.open();

    var play_controls = gui.addFolder('play controls');
    play_controls.add(hyperlapse, 'play');
    play_controls.add(hyperlapse, 'pause');
    play_controls.add(hyperlapse, 'next');
    play_controls.add(hyperlapse, 'prev');
    play_controls.open();

    gui.add(o, 'generate');
    gui.add(hyperlapse, 'load');

    window.addEventListener('resize', function(){
        hyperlapse.setSize(window.innerWidth, window.innerHeight);
        o.screen_width = window.innerWidth;
        o.screen_height = window.innerHeight;
    }, false);

    var show_ui = true;
    document.addEventListener( 'keydown', onKeyDown, false );
    function onKeyDown ( event ) {

        switch( event.keyCode ) {
            case 72: /* H */
                show_ui = !show_ui;
                document.getElementById("controls").style.opacity = (show_ui)?1:0;
                break;

            case 190: /* > */
                hyperlapse.next();
                break;

            case 188: /* < */
                hyperlapse.prev();
                break;
        }

    };

    o.generate();
}

window.onload = init;
