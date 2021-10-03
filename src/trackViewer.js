var start_point = new google.maps.LatLng(51.30750,-0.57285)
var end_point   = new google.maps.LatLng(51.29360,-0.60011);

var map, directions_renderer, directions_service, streetview_service;
var start_pin, end_pin, camera_pin;
var _route_markers = [];

function show(msg) {
    document.getElementById("text").innerHTML = msg;
}

function init() {

    /* Map -------------------------------------------- */

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

    /* Hyperlapse ------------------------------------- */

    var pano = document.getElementById('pano');
    var is_moving = false;
    var px, py;
    var onPointerDownPointerX=0, onPointerDownPointerY=0;

    var hyperlapse = new Hyperlapse(pano, 2);
    hyperlapse.setSize(window.innerWidth, window.innerHeight);

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
            "<br>Ready. H=show/hide" );
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
        px = hlp.position.x;
        py = hlp.position.y;
    }, false );

    pano.addEventListener( 'mousemove', function(e){
        e.preventDefault();
        var f = hlp.fov / 500;
        if ( is_moving ) {
            var dx = ( onPointerDownPointerX - e.clientX ) * f;
            var dy = ( e.clientY - onPointerDownPointerY ) * f;
            hlp.position.x = px + dx; // reversed dragging direction (thanks @mrdoob!)
            hlp.position.y = py + dy;
        }
    }, false );

    pano.addEventListener( 'mouseup', function(){
        is_moving = false;
        //hlp.position.x = px; // un-comment to revert position on mouse-up
        //hlp.position.y = py; // un-comment to revert position on mouse-up
    }, false );

    /* Controls --------------------------------------- */

    var gui = new dat.GUI();

    var o = {
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
                    hyperlapse.generate(response);
                } else {
                    console.log(status);
                }
            })
        }
    };

    var scn = gui.addFolder('Screen size');
    scn.add(hlp, 'scrn_width',  window.innerWidth).listen().name("Screen Width");
    scn.add(hlp, 'scrn_height', window.innerHeight).listen().name("Screen Height");

    var rp = gui.addFolder('Run-time Parameters');
    rp.add(hlp, 'fov', 1, 180).step(1).listen().name("FOV / Deg ").onChange(hyperlapse.setFOV);
    rp.add(hlp, 'millis', 10, 500).step(1).listen().name("Play speed / ms");
    rp.add(hlp.position, 'x', -360, 360).listen().name("Offset:X / Deg");
    rp.add(hlp.position, 'y', -180, 180).listen().name("Offset:Y / Deg");
    rp.add(hlp, 'tilt', -360, 360).listen().name("Tilt / Deg");
    rp.add(hlp, 'rpReset').name("Reset");
    rp.open();

    var gp = gui.addFolder('Gen-time Parameters');
    gp.add(hlp, 'distance_between_points', 5, 100).listen().name("Dist btwn pts / m")
    gp.add(hlp, 'max_points', 10, 1000).listen().name("Max points");
    gp.add(hlp, 'gpReset').name("Reset");
    gp.add(o, 'generate').name("Generate Hyperlapse");
    gp.add(hyperlapse, 'load').name("(Re)Load Panoramas");
    gp.open();

    var play_controls = gui.addFolder('Player Controls');
    play_controls.add(hyperlapse, 'play').name("Play");
    play_controls.add(hyperlapse, 'pause').name("Pause");
    play_controls.add(hyperlapse, 'next').name("Next frame (>)");
    play_controls.add(hyperlapse, 'prev').name("Previous frame (<)");
    play_controls.open();

    window.addEventListener('resize', function(){
        hyperlapse.setSize(window.innerWidth, window.innerHeight);
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
