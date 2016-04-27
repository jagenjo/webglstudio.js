//************* TOOLS *******************

/* This tool handles the node selection and the camera movement */

var cameraTool = {
	name: "cameraTool",
	enabled: true,
	control_mode: "max", //not used

	auto_select: true,
	smooth_camera: false,

	wsad_controls: false,
	last_camera: null,
	fps_speed: 100, //units per second

	settings: {
		rotate_speed: 0.2,
		orbit_speed: 0.01,
		smooth_camera_factor: 0.3,
		mouse_wheel_factor: -0.05,
		lock_angle: false
	},

	controls: {
		LEFT_MOUSE: {
			"default": "orbit",
			metakey: "panning",
			right_mouse: "frontal_panning",
		},
		MIDDLE_MOUSE: {
			"default": "panning",
			metakey: "orbit"
		},
		RIGHT_MOUSE: {
			"default": "rotate"
		}
	},
	
	collision: vec3.create(),

	onRegister: function()
	{
		RenderModule.canvas_manager.addModule(this);
	},

	keydown: function(e) {
		if(gl.mouse.right_button)
		{
			if(e.ctrlKey)
			{
				e.preventDefault();
				e.stopPropagation();
				return true;
			}
		}
	},

	mousedown: function(e) {
		this.click_pos = [e.mousex,e.mousey];
		var cam = ToolUtils.getCamera(e);
		this.last_camera = cam;
		this.in_use = true;

		//if(e.which == GL.MIDDLE_MOUSE_BUTTON)
		{
			var center = cam.getCenter();
			ToolUtils.testPerpendicularPlane( e.canvasx, gl.canvas.height - e.canvasy, center, cameraTool.collision );
		}

		if(e.which == GL.RIGHT_MOUSE_BUTTON)
		{
			e.cancelBubble = true;
		}

	},

	mouseup: function(e) {
		if(this.in_use)
		{
			this.in_use = false;
			LiteGUI.setCursor(null);
			LS.GlobalScene.refresh();
		}
		if(!this.enabled) 
			return;
	},

	mousemove: function(e) 
	{
		//Scene.getNodeAtCanvasPosition(e.x,e.y);
		if(!this.enabled) 
			return;

		if (e.dragging) {
			var r = this.onCameraDrag(e);
			LS.GlobalScene.refresh();
			return r;
		}
		else
		{
			this.in_use = false;
		}
	},

	mousewheel: function(e)
	{
		//console.log(e.wheel);
		if(e.wheel)
		{
			var amount = this.getWheelDelta(e);
			if(e.dragging)
			{
				this.fps_speed /= amount;
			}
			else
			{
				this.changeCameraDistance( amount, ToolUtils.getCamera(e) );
			}
		}
	},

	//different browsers and OSs behave different	
	//returns number around 1 (0.9 if scroll down, 1.1 if scroll up)
	getWheelDelta: function(e)
	{
		/*
		var amount = e.wheel;
		if(amount == 120 || amount == -120)
			amount = 1 + this.settings.mouse_wheel_factor * (amount > 0 ? 1 : -1);
		else
			amount = 1.0 + amount * this.settings.mouse_wheel_factor;	
		return amount;
		*/
		var delta = e.wheel !== undefined ? (e.wheel / 100) : e.delta;

		return (1 + delta * this.settings.mouse_wheel_factor);
	},

	update: function(dt)
	{
		var speed = this.fps_speed;
		if(gl.keys['SHIFT'])
			speed *= 10;
		if(gl.keys['CONTROL'])
			speed *= 0.1;

		var update_frame = false;

		if(gl.mouse.right_button || this.wsad_controls)
		{
			if( gl.keys["W"] ) { this.moveCamera([0,0,-speed*dt], true); update_frame = true; }
			else if( gl.keys["S"]  ) { this.moveCamera([0,0,speed*dt], true); update_frame = true; }
			if( gl.keys["A"]  ) { this.moveCamera([-speed*dt,0,0],true); update_frame = true; }
			else if( gl.keys["D"]  ) { this.moveCamera([speed*dt,0,0],true); update_frame = true; }
			if( gl.keys["Q"]  ) { this.moveCamera([0,speed*dt,0],false); update_frame = true; }
			else if( gl.keys["E"]  ) { this.moveCamera([0,-speed*dt,0],false); update_frame = true; }
		}

		if( gl.keys["UP"] ) { this.moveCamera([0,0,-speed*dt], true); update_frame = true; }
		else if( gl.keys["DOWN"]  ) { this.moveCamera([0,0,speed*dt], true); update_frame = true; }

		if( gl.keys["LEFT"]  ) { this.moveCamera([-speed*dt,0,0],true); update_frame = true; }
		else if( gl.keys["RIGHT"]  ) { this.moveCamera([speed*dt,0,0],true); update_frame = true; }

		//apply camera smoothing
		var cameras = RenderModule.cameras;
		for(var i = 0, l = cameras.length; i < l; ++i)
		{
			var camera = cameras[i];
			if( !camera._editor )
				continue;


			if(this.smooth_camera)
			{
				var factor = Math.clamp( this.settings.smooth_camera_factor, 0.1, 1); //clamp otherwise bad things would happend
				if(!camera._editor)
					continue;

				if(vec3.distance(camera.eye, camera._editor.destination_eye) > 0.001)
				{
					vec3.lerp( camera.eye, camera.eye, camera._editor.destination_eye, factor );
					camera._must_update_view_matrix = true; //force must_update
					update_frame = true;
				}

				if(vec3.distance(camera.center, camera._editor.destination_center) > 0.001)
				{
					vec3.lerp( camera.center, camera.center, camera._editor.destination_center, factor );
					camera._must_update_view_matrix = true; //force must_update
					update_frame = true;
				}
			}
			else
			{
				camera._editor.destination_eye.set( camera.eye );
				camera._editor.destination_center.set( camera.center );
			}
		}

		if(update_frame)
			LS.GlobalScene.refresh();
	},


	onCameraDrag: function(e)
	{
		//console.log(e);
		//console.log(e.which);
		//console.log(gl.mouse_buttons);
		var camera = this.last_camera || ToolUtils.getCamera(e);

		var controls = null;
		if (e.isButtonPressed(GL.LEFT_MOUSE_BUTTON))
			controls = this.controls[ "LEFT_MOUSE" ];
		else if (e.isButtonPressed(GL.MIDDLE_MOUSE_BUTTON))
			controls = this.controls[ "MIDDLE_MOUSE" ];
		else if (e.isButtonPressed(GL.RIGHT_MOUSE_BUTTON))
			controls = this.controls[ "RIGHT_MOUSE" ];
		if(!controls)
			return;

		var action = null;
		if( (e.altKey || e.metaKey) && controls.metakey )
			action = controls.metakey;
		else if( e.isButtonPressed(GL.RIGHT_MOUSE_BUTTON) && controls.right_mouse )
			action = controls.right_mouse;
		else if( e.isButtonPressed(GL.MIDDLE_MOUSE_BUTTON) && controls.middle_mouse )
			action = controls.middle_mouse;
		else
			action = controls["default"];

		if(!action)
			return;

		if( this.settings.lock_angle && (action == "orbit" || action == "rotate") )
			action = "panning";

		switch(action)
		{
			case "frontal_panning":
				cameraTool.moveCamera([0,0,e.deltay],true, camera);
				break;
			case "orbit":
				this.orbit(e, camera);
				break;
			case "panning":
				LiteGUI.setCursor("move");
				this.panning(e, camera);
				break;
			case "rotate":
				cameraTool.rotateCamera( e.deltax * this.settings.rotate_speed, e.deltay * -this.settings.rotate_speed, camera );
				break;
		}
	},
	
	orbit: function( e, camera )
	{
		this.orbitCamera( e.deltax *  this.settings.orbit_speed, e.deltay * -this.settings.orbit_speed, camera );
	},
	
	panning: function( e, camera )
	{
		var center = camera.getCenter();
		var collision = vec3.create();

		ToolUtils.testPerpendicularPlane( e.canvasx, gl.canvas.height - e.canvasy, center, collision, camera );
		var delta = vec3.sub( vec3.create(), cameraTool.collision, collision);
		this.moveCamera( delta, false, camera );
	},

	orbitCamera: function( yaw, pitch, camera )
	{
		if(yaw == 0 && pitch == 0)
			return;

		camera = camera || ToolUtils.getCamera();

		var front = camera.getFront();
		var up = camera.getUp();
		var problem_angle = vec3.dot( front, up );

		var eye = camera.getEye();
		var center = camera.getCenter();
		var right = camera.getLocalVector( LS.RIGHT );
		var dist = vec3.sub( vec3.create(), this.smooth_camera && camera._editor ? camera._editor.destination_eye : eye, center );

		//yaw
		vec3.rotateY( dist, dist, yaw );
		var R = quat.create();

		//pitch
		//avoid problem when rotating till front and up are aligned
		if( !(problem_angle > 0.99 && pitch > 0 || problem_angle < -0.99 && pitch < 0)) 
			quat.setAxisAngle( R, right, pitch );
		vec3.transformQuat( dist, dist, R );

		//orbitin must only change the eye of the camera
		var new_eye = vec3.add( camera._editor ? camera._editor.destination_eye : eye, dist, center );

		if(!this.smooth_camera)
		{
			if(camera._root && camera._root.transform)
			{
				camera._root.transform.lookAt( new_eye, center, LS.TOP );
			}
			else
				camera.eye = new_eye;
		}
	},

	moveCamera: function(delta, in_local_space, camera )
	{
		camera = camera || ToolUtils.getCamera();

		//var eye = this.smooth_camera ? camera._editor.destination_eye : camera.getEye();
		//var center = this.smooth_camera ? camera._editor.destination_center : camera.getCenter();

		var eye = camera.getEye();
		var center = camera.getCenter();

		if(in_local_space)
			delta = camera.getLocalVector(delta);

		var new_eye = camera._eye;
		var new_center = camera._center;

		if(camera._editor)
		{
			new_eye = camera._editor.destination_eye;
			new_center = camera._editor.destination_center;
		}

		vec3.add( new_eye, delta, eye );
		vec3.add( new_center, delta, center );

		if(!this.smooth_camera)
		{
			if(camera._root && camera._root.transform)
			{
				camera._root.transform.lookAt( new_eye, new_center, LS.TOP );
			}
			else
			{
				camera.eye = new_eye;
				camera.center = new_center;
			}
		}
	},

	rotateCamera: function(yaw, pitch, camera)
	{
		camera = camera || ToolUtils.getCamera();

		if(camera._root && camera._root.transform)
		{
			camera._root.transform.rotate( -yaw, LS.TOP );
			camera._root.transform.rotate( pitch, LS.RIGHT, true );
		}
		else
		{
			camera.rotate( -yaw, LS.TOP );
			camera.rotate( pitch, LS.RIGHT, true );
		}

		if(camera._editor)
		{
			camera._editor.destination_eye.set( camera.eye );
			camera._editor.destination_center.set( camera.center );
		}
	},

	changeCameraDistance: function(dt, camera)
	{
		camera = camera || ToolUtils.getCamera();

		var eye = camera.getEye();
		var center = camera.getCenter();
		var dist = vec3.sub( vec3.create(), eye, center );
		vec3.scale( dist, dist, dt );

		if(camera.type == LS.Camera.ORTHOGRAPHIC)
			camera.frustum_size = vec3.length(dist);

		var new_eye = vec3.create();

		if(camera._editor)
			new_eye = camera._editor.destination_eye;
		vec3.add( new_eye, dist, center );

		if(!this.smooth_camera)
		{
			if(camera._root && camera._root.transform)
			{
				camera._root.transform.lookAt( new_eye, center, LS.TOP );
				camera.focalLength = vec3.distance( new_eye, center );
			}
			else
				camera.eye = new_eye;
		}

		LS.GlobalScene.refresh();
	},

	setFocusPoint: function( point, distance ) {
		var camera = this.last_camera || ToolUtils.getCamera();

		if(!this.smooth_camera || !camera._editor)
		{
			if(camera._root && camera._root.transform)
			{
				var eye = camera.getEye();
				camera._root.transform.lookAt( eye, point, LS.TOP );
				camera.focalLength = vec3.distance( eye, point );
			}
			else
				camera.center = point;
		}
		else
			camera._editor.destination_center.set( point );

		if(distance)
			camera.setDistanceToCenter( distance, true );
	},

	onShowSettingsPanel: function(name,widgets)
	{
		if(name != "editor")
			return;

		widgets.addTitle("Interaction");
		widgets.inspectInstance( this.settings );

		//RenderModule.requestFrame();
	}
};

CORE.registerModule( cameraTool );
ToolsModule.registerTool({ name: "camera_control", display: false, module: cameraTool });


